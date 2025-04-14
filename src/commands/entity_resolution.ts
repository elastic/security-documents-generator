import { getEsClient, getFileLineCount } from './utils';
import {
  installPackage,
  createRule,
  getRule,
  createComponentTemplate,
  buildKibanaUrl,
} from '../utils/kibana_api';
import pMap from 'p-map';
import cliProgress from 'cli-progress';
import readline from 'readline';
import fs from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const directoryName = dirname(fileURLToPath(import.meta.url));
const BATCH_SIZE = 1000;
const CONCURRENCY = 10;
const RULE_ID = 'er-demo-match-all';
const ECS_USER_MAPPINGS = {
  properties: {
    'user.name': {
      fields: {
        text: {
          type: 'match_only_text',
        },
      },
      type: 'keyword',
    },
    'user.email': {
      fields: {
        text: {
          type: 'match_only_text',
        },
      },
      type: 'keyword',
    },
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const addMetaToLine = (line: any) => {
  line._meta = {
    is_demo_data: true,
  };
  return line;
};

const clearData = async () => {
  const client = getEsClient();
  try {
    const res = await client.deleteByQuery({
      index: '*',
      body: {
        query: {
          match: {
            '_meta.is_demo_data': true,
          },
        },
      },
      ignore_unavailable: true,
      refresh: true,
    });

    console.log('Deleted log documents: ', res.deleted, '❌');
  } catch (err) {
    console.log('Error: ', err);
    process.exit(1);
  }

  try {
    const res1 = await client.deleteByQuery({
      index: '.entities.v1.latest.secsol-ea-entity-store',
      body: {
        query: {
          match_all: {},
        },
      },
      ignore_unavailable: true,
      refresh: true,
    });

    console.log('Deleted entity store documents: ', res1.deleted, '❌');
  } catch (err) {
    console.log('Error: ', err);
    process.exit(1);
  }

  try {
    const res2 = await client.deleteByQuery({
      index: '.entities.v1.history.secsol-ea-entity-store*',
      body: {
        query: {
          match_all: {},
        },
      },
      ignore_unavailable: true,
      refresh: true,
    });

    console.log('Deleted entity store history documents: ', res2.deleted, '❌');
  } catch (err) {
    console.log('Error: ', err);
    process.exit(1);
  }

  // delete alerts where the rule_id is the one we created
  try {
    const res3 = await client.deleteByQuery({
      index: '.alerts-security.alerts-*',
      refresh: true,
      body: {
        query: {
          match: {
            'kibana.alert.rule.parameters.rule_id': RULE_ID,
          },
        },
      },
    });

    console.log('Deleted alerts: ', res3.deleted, '❌');
  } catch (err) {
    console.log('Error: ', err);
    process.exit(1);
  }
};

const VARIANT_TYPES = {
  DO_NOTHING: 'DO_NOTHING',
  INITIAL_FIRSTNAME: 'INITIAL_FIRSTNAME',
  INITIAL_LASTNAME: 'INITIAL_LASTNAME',
  REMOVE_LASTNAME: 'REMOVE_LASTNAME',
};

const VARIANT_TYPE_ORDER = [
  VARIANT_TYPES.DO_NOTHING,
  VARIANT_TYPES.DO_NOTHING,
  VARIANT_TYPES.INITIAL_FIRSTNAME,
  VARIANT_TYPES.INITIAL_LASTNAME,
  VARIANT_TYPES.REMOVE_LASTNAME,
];

const getVariantType = (index: number) => {
  return VARIANT_TYPE_ORDER[index % VARIANT_TYPE_ORDER.length];
};
type MaybeStringArray = string | string[];

const getEmailVariant = (
  email: string | string[],
  index: number,
): MaybeStringArray => {
  try {
    if (Array.isArray(email)) {
      // this means there are already variants
      return email;
    }
    const [name, domain] = email.split('@');
    const [first, last] = name.split('.');

    if (!first || !last || !domain) {
      console.log('Unexpected email format: ', email);
      return email;
    }
    switch (getVariantType(index)) {
      case VARIANT_TYPES.DO_NOTHING:
        return email;
      case VARIANT_TYPES.INITIAL_FIRSTNAME:
        return `${first[0]}.${last}@${domain}`;
      case VARIANT_TYPES.INITIAL_LASTNAME:
        return `${first}.${last[0]}@${domain}`;
      case VARIANT_TYPES.REMOVE_LASTNAME:
        return `${first}@${domain}`;
    }
    console.log('Unexpected variant type: ', getVariantType(index));
    return email;
  } catch (err) {
    console.log(`Error creating email variant ${email}: `, err);
    process.exit(1);
  }
};

const dataStreamFieldsToIndexName = (dataStreamFields: {
  dataset: string;
  namespace: string;
  type: string;
}) => {
  return `${dataStreamFields.type}-${dataStreamFields.dataset}-${dataStreamFields.namespace}`;
};

const getTimeStamp = () => {
  // last minute
  // const now = new Date();
  // const randomOffset = Math.floor(Math.random() * 60);
  // return new Date(now.getTime() - randomOffset * 60 * 1000).toISOString();

  return new Date().toISOString();
};

const bulkUpsert = async (docs: unknown[]) => {
  const client = getEsClient();

  try {
    return client.bulk({ body: docs, refresh: true });
  } catch (err) {
    console.log('Error: ', err);
    process.exit(1);
  }
};

const PACKAGES_TO_INSTALL = [
  'entityanalytics_okta',
  'okta',
  'system',
  'entityanalytics_entra_id',
];

const installPackages = async (space: string) => {
  console.log('Installing packages...');
  const progress = new cliProgress.SingleBar(
    {
      clearOnComplete: true,
    },
    cliProgress.Presets.shades_classic,
  );
  progress.start(PACKAGES_TO_INSTALL.length, 0);
  await pMap(
    PACKAGES_TO_INSTALL,
    async (packageName) => {
      await installPackage({ packageName, space });
      progress.increment();
    },
    { concurrency: 1 },
  );
  progress.stop();
};

// take a jsonl file and return a generator which yields batches of operations
const jsonlFileToBatchGenerator = (
  filePath: string,
  batchSize: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lineToOperation: (line: any, index: number) => [any, any],
): AsyncGenerator<unknown[], void, void> => {
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
  });

  const generator = async function* () {
    let batch: unknown[] = [];
    let i = 0;
    for await (const line of rl) {
      const lineJson = JSON.parse(line);
      const lineWithMeta = addMetaToLine(lineJson);
      const [index, doc] = lineToOperation(lineWithMeta, i);
      batch.push(index);
      batch.push(doc);
      if (batch.length / 2 >= batchSize) {
        yield batch;
        batch = [];
      }
      i++;
    }
    if (batch.length > 0) {
      yield batch;
    }
  };

  return generator();
};

const getFilePath = (fileName: string, mini: boolean) => {
  return (
    directoryName +
    `/../../data/entity_resolution_data/${mini ? 'mini_' : ''}${fileName}`
  );
};

const importLogData = async ({
  mini = false,
  keepEmails = false,
}: {
  mini: boolean;
  keepEmails: boolean;
}) => {
  const filePath = getFilePath('generated_logs.jsonl', mini);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lineToOperation = (line: any, i: number): [any, any] => {
    if (
      line.data_stream &&
      line.data_stream.dataset &&
      line.data_stream.namespace &&
      line.data_stream.type
    ) {
      const index = dataStreamFieldsToIndexName(line.data_stream);
      line['@timestamp'] = getTimeStamp();
      if (line.user && line.user.email) {
        line.user.email = keepEmails
          ? line.user.email
          : getEmailVariant(line.user.email, i);
      }
      return [{ create: { _index: index } }, line];
    } else {
      throw new Error(`Invalid log data line ${JSON.stringify(line)}`);
    }
  };

  console.log('Importing log data...');
  await importFile(filePath, lineToOperation);
};

const createOktaSystemComponentTemplate = async () => {
  console.log('Creating okta system custom component template...');
  await createComponentTemplate({
    name: 'logs-okta.system@custom',
    mappings: ECS_USER_MAPPINGS,
  });
};

const importOktaSystemData = async ({
  mini = false,
  keepEmails = false,
}: {
  mini: boolean;
  keepEmails: boolean;
}) => {
  const filePath = getFilePath('okta_system_generated.jsonl', mini);
  const index = 'logs-okta.system-default';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lineToOperation = (line: any, i: number): [any, any] => {
    line['@timestamp'] = getTimeStamp();
    line.user = {
      name: line.actor.display_name,
      email: keepEmails
        ? line.actor.alternate_id
        : getEmailVariant(line.actor.alternate_id, i),
    };
    return [{ create: { _index: index } }, line];
  };
  console.log('Importing Okta system data...');
  await importFile(filePath, lineToOperation);
};

const createOktaUserComponentTemplate = async () => {
  console.log('Creating okta user custom component template...');
  await createComponentTemplate({
    name: 'logs-entityanalytics_okta.user@custom',
    mappings: ECS_USER_MAPPINGS,
  });
};

const createEntraIdUserComponentTemplate = async () => {
  console.log('Creating entra id user custom component template...');
  await createComponentTemplate({
    name: 'logs-entityanalytics_entra_id.user@custom',
    mappings: ECS_USER_MAPPINGS,
  });
};

const importOktaUserData = async ({
  mini = false,
  keepEmails = false,
}: {
  mini: boolean;
  keepEmails: boolean;
}) => {
  const filePath = getFilePath('okta_user_generated.jsonl', mini);
  const index = 'logs-entityanalytics_okta.user-default';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lineToOperation = (line: any, i: number): [any, any] => {
    line['@timestamp'] = getTimeStamp();
    line.user = {
      name: line.profile.first_name + ' ' + line.profile.last_name,
      email: keepEmails ? line.email : getEmailVariant(line.email, i),
    };
    return [{ create: { _index: index } }, line];
  };
  console.log('Importing Okta user data...');
  await importFile(filePath, lineToOperation);
};

const importEntraIdUserData = async ({
  mini = false,
  keepEmails = false,
}: {
  mini: boolean;
  keepEmails: boolean;
}) => {
  const filePath = getFilePath('entra_id_user_generated.jsonl', mini);
  const index = 'logs-entityanalytics_entra_id.user-default';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lineToOperation = (line: any, i: number): [any, any] => {
    line['@timestamp'] = getTimeStamp();
    line.user = {
      name: line.azure_ad.displayName,
      email: keepEmails
        ? line.azure_ad.mail
        : getEmailVariant(line.azure_ad.mail, i),
    };
    return [{ create: { _index: index } }, line];
  };
  console.log('Importing Entra ID user data...');
  await importFile(filePath, lineToOperation);
};

const importFile = async (
  filePath: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lineToOperation: (line: any, index: number) => [any, any],
) => {
  const lineCountInFile = await getFileLineCount(filePath);
  const batchGenerator = jsonlFileToBatchGenerator(
    filePath,
    BATCH_SIZE,
    lineToOperation,
  );
  await batchIndexDocsWithProgress(batchGenerator, lineCountInFile);
};

const createMatchAllRule = async (space: string) => {
  const rule = await getRule(RULE_ID, space);

  if (rule) {
    console.log('Match all rule already exists.');
    return;
  }

  await createRule({
    id: RULE_ID,
    space,
  });
  console.log('Match all rule created.');
};

const batchIndexDocsWithProgress = async (
  generator: AsyncGenerator<unknown[], void, void>,
  docCount: number,
) => {
  const progress = new cliProgress.SingleBar(
    {
      clearOnComplete: true,
    },
    cliProgress.Presets.shades_classic,
  );
  progress.start(docCount, 0);
  await pMap(
    generator,
    async (operations) => {
      const res = await bulkUpsert(operations);
      if (res.errors) {
        progress.stop();
        console.log('Failed to index documents' + JSON.stringify(res));
        process.exit(1);
      }
      progress.increment(operations.length / 2);
    },
    { concurrency: CONCURRENCY },
  );

  progress.stop();
  console.log('Indexed ', docCount, '✅');
};

export const setupEntityResolutionDemo = async ({
  mini = false,
  deleteData = false,
  keepEmails = false,
  space,
}: {
  mini: boolean;
  deleteData: boolean;
  keepEmails: boolean;
  space: string;
}) => {
  if (deleteData) {
    console.log('Deleting existing demo data first...');
    await clearData();
  }

  console.log(`Setting up${mini ? ' mini' : ''} entity resolution demo...`);
  // create a rule which matches everything, handy for exploring all the different entity views
  await createMatchAllRule(space);
  // install the packages to get the mappings in place
  await installPackages(space);
  // create @custom component templates to get user.name and user.email field mappings
  // which the inttegrations don't provide
  // we will eventually have to release a new version of the integrations to include these mappings
  await createOktaSystemComponentTemplate();
  await createOktaUserComponentTemplate();
  await createEntraIdUserComponentTemplate();
  // now load all the data
  await importLogData({ mini, keepEmails });
  await importOktaSystemData({ mini, keepEmails });
  await importOktaUserData({ mini, keepEmails });
  await importEntraIdUserData({ mini, keepEmails });
  console.log(`
Entity resolution demo setup complete. 

Now go and install the model!

    CLICK HERE ---->> ${buildKibanaUrl({ path: '/app/security/entity_analytics_management', space })} <<---- CLICK HERE

Once installed, ${mini ? 'Mark Hopkin should have matches' : 'See here:\n\n https://github.com/elastic/security-ml/blob/gus/entity_resoluton_data_generation/projects/entity_resolution_poc_2024/test_data_generation/seed_data_with_name_variations_and_user_agent_gen_and_groups.json \n\nfor all the seed data names'}
  `);
};
