import { kibanaApi } from '.';
import { getAlertIndex } from '.';
import { getEsClient } from '../commands/utils';
const DUMMY_RULE_ID = 'dummy-rule';

export const initializeSpace = async (space: string) => {
  await ensureSpaceExists(space);

  if (await alertIndexExistsInSpace(space)) {
    console.log('Skipping space initialization.');
    return;
  }
  console.log(`Initializing space ${space}`);
  console.log(`Creating dummy rule to initialize alerts index in ${space}`);
  await kibanaApi.createRule({ space, id: DUMMY_RULE_ID });
  await waitForAlertIndexMapping(space);
  console.log('Deleting dummy rule');
  await kibanaApi.deleteRule(DUMMY_RULE_ID, space);
  console.log('Dummy rule deleted. Space initialized');
};

const alertIndexExistsInSpace = async (space: string): Promise<boolean> => {
  const client = getEsClient();
  const index = getAlertIndex(space);
  console.log(`Checking if index ${index} exists`);
  const exists = await client.indices.exists({ index });

  console.log(
    exists ? `Index ${index} exists` : `Index ${index} does not exist`,
  );
  return exists;
};

const waitForAlertIndexMapping = async (
  space: string,
  attempts: number = 5,
  waitSeconds = 5,
) => {
  const client = getEsClient();
  const index = getAlertIndex(space);
  const backingIndex = '.internal' + index + '-000001';

  console.log(`Waiting for index ${index} to have the correct mapping`);

  let attempt = 0;

  while (attempt < attempts) {
    try {
      const res = await client.indices.getMapping({ index });
      console.log(
        `Got mapping for index ${index} (backing index ${backingIndex})`,
      );
      if (res[backingIndex]?.mappings?.properties) {
        const mapping = res[backingIndex].mappings.properties;
        // I use @timestamp to detect if the mapping is correct, if it has beem automatically created it will be long
        if (mapping['@timestamp'] && mapping['@timestamp'].type === 'date') {
          console.log(
            `Index ${index} has the correct date field mapping: ${JSON.stringify(mapping['@timestamp'])}`,
          );
          return;
        } else {
          throw new Error(`Index ${index} does not have the correct mapping`);
        }
      }

      console.log(`Index ${index} does not have the correct mapping.`);
    } catch (e) {
      if (JSON.stringify(e).includes('index_not_found_exception')) {
        console.log(`Index ${index} does not exist yet.`);
      } else {
        throw e;
      }
    }

    if (attempt === attempts - 1) {
      throw new Error(
        `Index ${index} does not have the correct mapping after ${attempts} attempts`,
      );
    }

    console.log(`Waiting ${waitSeconds} seconds before trying again`);
    await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
    attempt++;
  }
};

const ensureSpaceExists = async (space: string) => {
  console.log(`Checking if space ${space} exists`);
  if (await kibanaApi.doesSpaceExist(space)) {
    console.log(`Space ${space} exists`);
    return;
  }

  console.log(`Space ${space} does not exist. Creating space ${space}`);
  await kibanaApi.createSpace(space);
  console.log(`Space ${space} created`);
};
