import { confirm, input, select } from '@inquirer/prompts';
import { resolve } from 'path';
import { log } from '../../utils/logger.ts';
import {
  createRandomUser,
  createRandomHost,
  createRandomService,
  createRandomGenericEntity,
  createRandomEventForUser,
  createRandomEventForHost,
  createRandomEventForService,
  createRandomEventForGenericEntity,
} from '../entity_store/entity_store.ts';
import { bulkIngest } from '../shared/elasticsearch.ts';
import {
  assignAssetCriticality,
  enableRiskScore,
  createRule,
  scheduleRiskEngineNow,
  uploadPrivmonCsv,
  enablePrivmon,
  initEntityEngineForEntityTypes,
} from '../../utils/kibana_api.ts';
import {
  ASSET_CRITICALITY,
  type AssetCriticality,
  DEFAULT_CHUNK_SIZE,
  EVENT_INDEX_NAME,
} from '../../constants.ts';
import { ensureSpace } from '../../utils/index.ts';
import { ensureSecurityDefaultDataView } from '../../utils/security_default_data_view.ts';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const srcDirectory = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

export type SingleEntityCommandOptions = {
  space?: string;
  entityType?: 'user' | 'host' | 'service' | 'generic';
  name?: string;
  enableEntityStore?: boolean;
  createRiskScore?: boolean;
};

const DEFAULT_ENTITY_NAMES: Record<'user' | 'host' | 'service' | 'generic', string> = {
  user: 'test-user',
  host: 'test-host',
  service: 'test-service',
  generic: 'test-entity',
};

const getDefaultEntityName = (entityType: 'user' | 'host' | 'service' | 'generic'): string =>
  DEFAULT_ENTITY_NAMES[entityType];

const createEntityWithName = (
  entityType: 'user' | 'host' | 'service' | 'generic',
  name: string,
) => {
  switch (entityType) {
    case 'user': {
      const user = createRandomUser();
      user.name = name;
      return user;
    }
    case 'host': {
      const host = createRandomHost();
      host.name = name;
      return host;
    }
    case 'service': {
      const service = createRandomService();
      service.name = name;
      return service;
    }
    case 'generic': {
      const generic = createRandomGenericEntity();
      generic.name = name;
      return generic;
    }
  }
};

const ingestSingleEntityEvents = async (events: unknown[]) => {
  await bulkIngest({
    index: EVENT_INDEX_NAME,
    documents: events as object[],
    chunkSize: DEFAULT_CHUNK_SIZE,
    action: 'index',
  });
};

const createAndIngestEntity = async (
  entityType: 'user' | 'host' | 'service' | 'generic',
  entityName: string,
  eventsPerEntity: number,
  offsetHours: number,
) => {
  const entity = createEntityWithName(entityType, entityName);
  let events: unknown[] = [];

  if (entityType === 'user') {
    events = Array.from({ length: eventsPerEntity }, () =>
      createRandomEventForUser(entity as ReturnType<typeof createRandomUser>, offsetHours),
    );
  } else if (entityType === 'host') {
    events = Array.from({ length: eventsPerEntity }, () =>
      createRandomEventForHost(entity as ReturnType<typeof createRandomHost>, offsetHours),
    );
  } else if (entityType === 'service') {
    events = Array.from({ length: eventsPerEntity }, () =>
      createRandomEventForService(entity as ReturnType<typeof createRandomService>, offsetHours),
    );
  } else if (entityType === 'generic') {
    events = Array.from({ length: eventsPerEntity }, () =>
      createRandomEventForGenericEntity(
        entity as ReturnType<typeof createRandomGenericEntity>,
        offsetHours,
      ),
    );
  }

  await ingestSingleEntityEvents(events);
  return entity;
};

export const singleEntityCommand = async (options: SingleEntityCommandOptions = {}) => {
  const space = await ensureSpace(options.space);

  // Non-interactive mode: --type was provided
  if (options.entityType) {
    const entityType = options.entityType;
    const entityName = options.name ?? getDefaultEntityName(entityType);

    if (options.enableEntityStore !== false) {
      log.info('Ensuring security default data view...');
      await ensureSecurityDefaultDataView(space);
      log.info('Enabling entity store engines...');
      await initEntityEngineForEntityTypes(['user', 'host', 'service', 'generic'], space);
      log.info('✅ Entity store enabled');
    }

    log.info(`Creating ${entityType} entity "${entityName}"...`);
    const eventsPerEntity = 10;
    const offsetHours = 1;
    const entity = await createAndIngestEntity(
      entityType,
      entityName,
      eventsPerEntity,
      offsetHours,
    );
    log.info(`✅ Created ${entityType} entity "${entityName}" with ${eventsPerEntity} events`);

    if (options.createRiskScore !== false) {
      log.info('Creating match-all rule...');
      await createRule({ space });
      log.info('Rule created');

      log.info('Generating events to create alerts...');
      const riskEvents = Array.from({ length: 20 }, () => {
        if (entityType === 'user') {
          return createRandomEventForUser(entity as ReturnType<typeof createRandomUser>, 1);
        } else if (entityType === 'host') {
          return createRandomEventForHost(entity as ReturnType<typeof createRandomHost>, 1);
        } else if (entityType === 'service') {
          return createRandomEventForService(entity as ReturnType<typeof createRandomService>, 1);
        } else {
          return createRandomEventForGenericEntity(
            entity as ReturnType<typeof createRandomGenericEntity>,
            1,
          );
        }
      });
      await ingestSingleEntityEvents(riskEvents);
      log.info('Events generated');

      log.info('Enabling risk engine...');
      await enableRiskScore(space);
      log.info('Running risk engine...');
      await scheduleRiskEngineNow(space);
      log.info('✅ Risk score setup complete and risk engine run');
    }

    return;
  }

  // Interactive mode: prompt for options
  const enableEntityStore = await confirm({
    message: 'Do you want to enable the entity store?',
    default: true,
  });

  if (enableEntityStore) {
    log.info('Ensuring security default data view...');
    await ensureSecurityDefaultDataView(space);
    log.info('Enabling entity store engines...');
    // Enable engines for all entity types
    await initEntityEngineForEntityTypes(['user', 'host', 'service', 'generic'], space);
    log.info('✅ Entity store enabled');
  }

  // Prompt for entity type
  const entityType = (await select({
    message: 'Select entity type',
    choices: [
      { name: 'User', value: 'user' },
      { name: 'Host', value: 'host' },
      { name: 'Service', value: 'service' },
      { name: 'Generic', value: 'generic' },
    ],
  })) as 'user' | 'host' | 'service' | 'generic';

  // Prompt for entity name
  const entityName = await input({
    message: 'Enter entity name',
    default: getDefaultEntityName(entityType),
  });

  // Create entity with custom name and ingest events
  log.info(`Creating ${entityType} entity "${entityName}"...`);
  const eventsPerEntity = 10;
  const offsetHours = 1;
  const entity = await createAndIngestEntity(entityType, entityName, eventsPerEntity, offsetHours);
  log.info(`✅ Created ${entityType} entity "${entityName}" with ${eventsPerEntity} events`);

  // Track state
  let assetCriticalitySet: AssetCriticality | null = null;
  let isPrivileged = false;
  let riskScoreCreated = false;

  // Interactive loop
  while (true) {
    const action = await select({
      message: 'What would you like to do?',
      choices: [
        ...(entityType === 'user' || entityType === 'host'
          ? [
              {
                name: assetCriticalitySet
                  ? `Change asset criticality (currently: ${assetCriticalitySet})`
                  : 'Set asset criticality',
                value: 'asset_criticality',
              },
            ]
          : []),
        ...(entityType === 'user'
          ? [
              {
                name: isPrivileged ? 'Remove privileged status' : 'Add privileged status',
                value: 'privileged',
              },
            ]
          : []),
        {
          name: riskScoreCreated ? 'Risk score already created' : 'Create risk score',
          value: 'risk_score',
          disabled: riskScoreCreated,
        },
        {
          name: 'Run risk engine',
          value: 'run_engine',
        },
        {
          name: 'Exit',
          value: 'exit',
        },
      ],
    });

    if (action === 'exit') {
      log.info('Exiting...');
      break;
    }

    if (action === 'asset_criticality') {
      const criticality = await select({
        message: 'Select asset criticality level',
        choices: ASSET_CRITICALITY.filter((c) => c !== 'unknown').map((c) => ({
          name: c.replace('_', ' '),
          value: c,
        })),
      });

      const field = entityType === 'user' ? 'user.name' : 'host.name';
      await assignAssetCriticality(
        [
          {
            id_field: field,
            id_value: entityName,
            criticality_level: criticality,
          },
        ],
        space,
      );
      assetCriticalitySet = criticality as AssetCriticality;
      log.info(`✅ Set asset criticality to ${criticality} for ${entityName}`);
    }

    if (action === 'privileged') {
      const outputDirectory = resolve(srcDirectory, `../output`);
      const csvFilePath = resolve(outputDirectory, './privileged_users.csv');
      const fsPromises = await import('fs/promises');
      await fsPromises.mkdir(outputDirectory, { recursive: true });

      if (isPrivileged) {
        // Remove privileged status by uploading an empty CSV
        log.info('Removing privileged status by uploading empty CSV...');
        const emptyCsvContent = '';
        await fsPromises.writeFile(csvFilePath, emptyCsvContent);

        log.info('Enabling Privileged User Monitoring...');
        await enablePrivmon(space);
        log.info('Uploading empty CSV file...');
        await uploadPrivmonCsv(csvFilePath, space);
        isPrivileged = false;
        log.info(`✅ Removed privileged status for ${entityName}`);
      } else {
        // Add privileged status
        const csvContent = `${entityName},admin\n`;
        await fsPromises.writeFile(csvFilePath, csvContent);

        log.info('Enabling Privileged User Monitoring...');
        await enablePrivmon(space);
        log.info('Uploading CSV file...');
        await uploadPrivmonCsv(csvFilePath, space);
        isPrivileged = true;
        log.info(`✅ Added privileged status for ${entityName}`);
      }
    }

    if (action === 'risk_score') {
      log.info('Creating match-all rule...');
      await createRule({ space });
      log.info('Rule created');

      // Generate some events to create alerts
      log.info('Generating events to create alerts...');
      const riskEvents = Array.from({ length: 20 }, () => {
        if (entityType === 'user') {
          return createRandomEventForUser(entity as ReturnType<typeof createRandomUser>, 1);
        } else if (entityType === 'host') {
          return createRandomEventForHost(entity as ReturnType<typeof createRandomHost>, 1);
        } else if (entityType === 'service') {
          return createRandomEventForService(entity as ReturnType<typeof createRandomService>, 1);
        } else {
          return createRandomEventForGenericEntity(
            entity as ReturnType<typeof createRandomGenericEntity>,
            1,
          );
        }
      });
      await ingestSingleEntityEvents(riskEvents);
      log.info('Events generated');

      log.info('Enabling risk engine...');
      await enableRiskScore(space);
      log.info('Running risk engine...');
      await scheduleRiskEngineNow(space);
      riskScoreCreated = true;
      log.info('✅ Risk score setup complete and risk engine run');
    }

    if (action === 'run_engine') {
      log.info('Running risk engine...');
      await scheduleRiskEngineNow(space);
      log.info('✅ Risk engine scheduled to run');
    }
  }
};
