#! /usr/bin/env node
import { program } from 'commander';
import {
  deleteAllAlerts,
  deleteAllEvents,
  generateAlerts,
  generateEvents,
  generateGraph,
} from './commands/documents';
import { setupEntityResolutionDemo } from './commands/entity_resolution';
import { generateLegacyRiskScore } from './commands/legacy_risk_score';
import { kibanaApi } from './utils/';
import {
  assignAssetCriticality,
  enableRiskScore,
  createRule,
  scheduleRiskEngineNow,
  uploadPrivmonCsv,
  enablePrivmon,
  initEntityEngineForEntityTypes,
} from './utils/kibana_api';
import { ASSET_CRITICALITY, AssetCriticality } from './constants';
import { resolve } from 'path';
import { getEsClient } from './commands/utils/indices';
import { chunk } from 'lodash-es';
import { BulkOperationContainer } from '@elastic/elasticsearch/lib/api/types';
import {
  cleanEntityStore,
  generateEntityStore,
  createRandomUser,
  createRandomHost,
  createRandomService,
  createRandomGenericEntity,
  createRandomEventForUser,
  createRandomEventForHost,
  createRandomEventForService,
  createRandomEventForGenericEntity,
} from './commands/entity_store';
import {
  createPerfDataFile,
  listPerfDataFiles,
  uploadPerfDataFile,
  uploadPerfDataFileInterval,
  ENTITY_DISTRIBUTIONS,
  DistributionType,
} from './commands/entity_store_perf';
import { checkbox, input, select, confirm } from '@inquirer/prompts';
import {
  ENTITY_STORE_OPTIONS,
  generateNewSeed,
  PRIVILEGED_USER_MONITORING_OPTIONS,
  PrivilegedUserMonitoringOption,
} from './constants';
import { initializeSpace } from './utils';
import { ensureSecurityDefaultDataView } from './utils/security_default_data_view';
import { generateAssetCriticality } from './commands/asset_criticality';
import { deleteAllRules, generateRulesAndAlerts } from './commands/rules';
import { createConfigFileOnFirstRun } from './utils/create_config_on_first_run';
import { promptForFileSelection } from './commands/utils/cli_utils';
import { privmonCommand } from './commands/privileged_user_monitoring/privileged_user_monitoring';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { generateInsights } from './commands/insights';
import { stressTest } from './risk_engine/esql_stress_test';

import fs from 'fs';

import * as RiskEngine from './risk_engine/generate_perf_data';
import * as RiskEngineIngest from './risk_engine/ingest';
import * as Pain from './risk_engine/scripted_metrics_stress_test';
import {
  extractBaselineMetrics,
  saveBaseline,
  loadBaseline,
  listBaselines,
  loadBaselineWithPattern,
} from './commands/utils/baseline_metrics';
import {
  compareMetrics,
  formatComparisonReport,
  buildComparisonThresholds,
} from './commands/utils/metrics_comparison';

await createConfigFileOnFirstRun();

export const parseIntBase10 = (input: string) => parseInt(input, 10);

export const srcDirectory = dirname(fileURLToPath(import.meta.url));

program
  .command('generate-alerts')
  .option('-n <n>', 'number of alerts')
  .option('-h <h>', 'number of hosts')
  .option('-u <h>', 'number of users')
  .option('-s <h>', 'space (will be created if it does not exist)')
  .description('Generate fake alerts')
  .action(async (options) => {
    const alertsCount = parseInt(options.n || '1');
    const hostCount = parseInt(options.h || '1');
    const userCount = parseInt(options.u || '1');
    const space = options.s || 'default';

    if (space !== 'default') {
      await initializeSpace(space);
    }

    await generateAlerts(alertsCount, userCount, hostCount, space);
  });

program
  .command('esql-stress-test')
  .option('-p <parallel>', 'number of parallel runs', parseIntBase10)
  .description('Run several esql queries in parallel to stress ES')
  .action(async (options) => {
    const parallel = options.p || 1;
    await stressTest(parallel, { pageSize: 3500 });

    console.log(`Completed stress test with ${parallel} parallel runs`);
  });

program
  .command('painless-stress-test')
  .option('-r <runs>', 'number of runs', parseIntBase10)
  .description('Run several scripted metric risk scoring queries in sequence')
  .action(async (options) => {
    const runs = options.r || 1;
    await Pain.stressTest(runs, { pageSize: 3500 });

    console.log(`Completed stress test with ${runs} runs`);
  });

RiskEngineIngest.getCmd(program);
program
  .command('create-risk-engine-data')
  .argument('<name>', 'name of the file')
  .argument('<entity-count>', 'number of entities', parseIntBase10)
  .argument('<alerts-per-entity>', 'number of alerts per entity', parseIntBase10)
  .description('Create performance data for the risk engine')
  .action((name, entityCount, alertsPerEntity) => {
    RiskEngine.createPerfDataFile({ name, entityCount, alertsPerEntity });
  });

program
  .command('create-risk-engine-dataset')
  .argument('<entity-magnitude>', 'entity magnitude to create: small, medium, large')
  .argument('<cardinality>', 'cardinality level: low, mid, high, extreme')
  .description('Create performance datasets for the risk engine')
  .action(async (entityMagnitude, cardinality) => {
    const entityCount =
      entityMagnitude === 'small'
        ? 100
        : entityMagnitude === 'medium'
          ? 1000
          : entityMagnitude === 'large'
            ? 10000
            : 1000;
    const alertsPerEntity =
      cardinality === 'low'
        ? 100
        : cardinality === 'mid'
          ? 1000
          : cardinality === 'high'
            ? 10000
            : cardinality === 'extreme'
              ? 100000
              : 1000;
    const name = `${entityMagnitude || 'medium'}_${cardinality || 'mid'}Cardinality`;

    await RiskEngine.createPerfDataFile({ name, entityCount, alertsPerEntity });
    console.log(`Finished ${name} dataset`);
  });

program
  .command('upload-risk-engine-dataset')
  .argument('[dir]', 'dir to upload')
  .description('Upload performance data files')
  .action(async (dataset) => {
    const BASE = process.cwd() + '/data/risk_engine/perf';

    await deleteAllAlerts();

    const datasetPath = `${BASE}/${dataset}`;
    if (!fs.existsSync(datasetPath)) {
      console.log(`Skipping ${dataset}, directory not found: ${datasetPath}`);
      return;
    }
    const files = fs
      .readdirSync(datasetPath)
      .filter((f) => f.endsWith('.json'))
      .sort();
    if (files.length === 0) {
      console.log(`No JSON files found in ${datasetPath}, skipping.`);
      return;
    }
    console.log(`Uploading dataset ${dataset} (${files.length} file(s))`);
    for (const file of files) {
      const fullName = `${dataset}/${file.replace(/\.json$/, '')}`; // remove extension for function arg expecting base name
      try {
        await RiskEngine.uploadPerfData(fullName, 0, 1);
      } catch (e) {
        console.error(`Failed uploading ${fullName}:`, e);
        process.exit(1);
      }
    }
    console.log(`Finished uploading dataset ${dataset}`);
  });

program
  .command('upload-risk-engine-data-interval')
  .argument('<file>', 'path to the file')
  .argument('<interval>', 'upload interval in ms', parseIntBase10)
  .argument('<count>', 'number of uploads', parseIntBase10)
  .description('Upload performance data for the risk engine')
  .action((file, interval, count) => {
    RiskEngine.uploadPerfData(file, interval, count);
  });

program
  .command('generate-events')
  .argument('<n>', 'integer argument', parseIntBase10)
  .description('Generate events')
  .action(generateEvents);

program.command('generate-graph').description('Generate fake graph').action(generateGraph);

program.command('delete-alerts').description('Delete all alerts').action(deleteAllAlerts);

program.command('delete-events').description('Delete all events').action(deleteAllEvents);

program
  .command('test-risk-score')
  .description('Test risk score API')
  .action(kibanaApi.fetchRiskScore);

program
  .command('create-perf-data')
  .argument('<name>', 'name of the file')
  .argument('<entity-count>', 'number of entities', parseIntBase10)
  .argument('<logs-per-entity>', 'number of logs per entity', parseIntBase10)
  .argument('[start-index]', 'for sequential data, which index to start at', parseIntBase10, 0)
  .option(
    '--distribution <type>',
    `Entity distribution type: equal (user/host/generic/service: 25% each), standard (user/host/generic/service: 33/33/33/1) (default: standard)`,
    'standard'
  )
  .description('Create performance data')
  .action(async (name, entityCount, logsPerEntity, startIndex, options) => {
    const distributionType = options.distribution as DistributionType;

    // Validate distribution type
    if (!ENTITY_DISTRIBUTIONS[distributionType]) {
      console.error(`❌ Invalid distribution type: ${distributionType}`);
      console.error(`   Available types: ${Object.keys(ENTITY_DISTRIBUTIONS).join(', ')}`);
      process.exit(1);
    }

    try {
      await createPerfDataFile({
        name,
        entityCount,
        logsPerEntity,
        startIndex,
        distribution: distributionType,
      });
    } catch (error) {
      console.error('Failed to create performance data file:', error);
      process.exit(1);
    }
  });

program
  .command('upload-perf-data')
  .argument('[file]', 'File to upload')
  .option('--index <index>', 'Destination index')
  .option('--delete', 'Delete all entities before uploading')
  .description('Upload performance data file')
  .action(async (file, options) => {
    await uploadPerfDataFile(
      file ?? (await promptForFileSelection(listPerfDataFiles())),
      options.index,
      options.delete
    );
  });

program
  .command('upload-perf-data-interval')
  .argument('[file]', 'File to upload')
  .option('--interval <interval>', 'interval in s', parseIntBase10, 30)
  .option('--count <count>', 'number of times to upload', parseIntBase10, 10)
  .option('--deleteData', 'Delete all entities before uploading')
  .option('--deleteEngines', 'Delete all entities before uploading')
  .option(
    '--transformTimeout <timeout>',
    'Timeout in minutes for waiting for generic transform to complete (default: 30)',
    parseIntBase10,
    30
  )
  .option(
    '--samplingInterval <seconds>',
    'Sampling interval in seconds for metrics collection (default: 5)',
    parseIntBase10,
    5
  )
  .option('--noTransforms', 'Skip transform-related operations (for ESQL workflows)')
  .description('Upload performance data file')
  .action(async (file, options) => {
    await uploadPerfDataFileInterval(
      file ?? (await promptForFileSelection(listPerfDataFiles())),
      options.interval * 1000,
      options.count,
      options.deleteData,
      options.deleteEngines,
      options.transformTimeout * 60 * 1000, // Convert minutes to milliseconds
      options.samplingInterval * 1000, // Convert seconds to milliseconds
      options.noTransforms // Skip transform-related operations
    );
  });

program
  .command('entity-resolution-demo')
  .option('--mini', 'Only load the mini dataset', false)
  .option('--delete', 'Delete old data', false)
  .option('--keep-emails', 'No Email variants', false)
  .option('--space', 'space to use', 'default')
  .description('Load entity resolution demo data')
  .action(({ mini, deleteData, keepEmails, space }) => {
    setupEntityResolutionDemo({ mini, deleteData, keepEmails, space });
  });

program
  .command('entity-store')
  .description('Generate entity store')
  .option('--space <space>', 'Space to create entity store in')
  .action(async (options) => {
    const entityStoreAnswers = await checkbox<keyof typeof ENTITY_STORE_OPTIONS>({
      message: 'Select options',
      choices: [
        {
          name: 'Seed (stable random data)',
          value: ENTITY_STORE_OPTIONS.seed,
          checked: true,
        },
        {
          name: 'Assign asset criticality',
          value: ENTITY_STORE_OPTIONS.criticality,
          checked: true,
        },
        {
          name: 'Enable Risk Engine',
          value: ENTITY_STORE_OPTIONS.riskEngine,
          checked: true,
        },
        {
          name: 'Create detection rule',
          value: ENTITY_STORE_OPTIONS.rule,
          checked: true,
        },
        {
          name: 'Generate fake elastic agents for hosts',
          value: ENTITY_STORE_OPTIONS.agent,
          checked: false,
        },
      ],
    });

    const userCount = await input({
      message: 'How many users',
      default: '10',
    });

    const hostCount = await input({
      message: 'How many hosts',
      default: '10',
    });

    const serviceCount = await input({
      message: 'How many services',
      default: '10',
    });

    const genericEntitiesCount = await input({
      message: 'How many generic entities',
      default: '10',
    });

    const offsetHours = await input({
      message: 'Event date offset in hours (how many hours ago events should be generated)',
      default: '1',
    });

    const seed = generateNewSeed() + '';

    let seedAnswer = seed;

    if (entityStoreAnswers.includes(ENTITY_STORE_OPTIONS.seed)) {
      seedAnswer = await input({
        message: 'Enter seed to generate stable random data or <enter> to use a new seed',
        default: seed,
      });
    }

    generateEntityStore({
      space: options.space,
      users: parseIntBase10(userCount),
      hosts: parseIntBase10(hostCount),
      services: parseIntBase10(serviceCount),
      genericEntities: parseIntBase10(genericEntitiesCount),
      seed: parseIntBase10(seedAnswer),
      options: entityStoreAnswers,
      offsetHours: parseIntBase10(offsetHours),
    });
  });

program
  .command('quick-entity-store')
  .description('Generate quick entity store')
  .option('--space <space>', 'Space to create entity store in')
  .action(async (options) => {
    const space = options.space || 'default';

    generateEntityStore({
      space,
      users: 10,
      hosts: 10,
      services: 10,
      genericEntities: 10,
      seed: generateNewSeed(),
      options: [
        ENTITY_STORE_OPTIONS.criticality,
        ENTITY_STORE_OPTIONS.riskEngine,
        ENTITY_STORE_OPTIONS.rule,
      ],
      offsetHours: 1,
    });
  });

program.command('clean-entity-store').description('clean entity store').action(cleanEntityStore);

program
  .command('generate-entity-insights')
  .description('Generate entities vulnerabilities and misconfigurations')
  .action(async (options) => {
    const users = parseInt(options.u || '10');
    const hosts = parseInt(options.h || '10');
    const space = options.s || 'default';

    generateInsights({ users, hosts, space });
  });

program
  .command('generate-asset-criticality')
  .option('-h <h>', 'number of hosts')
  .option('-u <u>', 'number of users')
  .option('-s <s>', 'space')
  .description('Generate asset criticality for entities')
  .action(async (options) => {
    const users = parseInt(options.u || '10');
    const hosts = parseInt(options.h || '10');
    const space = options.s || 'default';

    generateAssetCriticality({ users, hosts, space });
  });

program
  .command('generate-legacy-risk-score')
  .description('Install legacy risk score and generate data')
  .action(generateLegacyRiskScore);

program
  .command('rules')
  .description('Generate detection rules and events')
  .option('-r, --rules <number>', 'Number of rules to generate', '10')
  .option('-e, --events <number>', 'Number of events to generate', '50')
  .option('-i, --interval <string>', 'Rule execution interval', '5m')
  .option('-f, --from <number>', 'Generate events from last N hours', '24')
  .option('-g, --gaps <number>', 'Amount of gaps per rule', '0')
  .option('-c, --clean', 'Clean gap events before generating rules', 'false')
  .action(async (options) => {
    try {
      const ruleCount = parseInt(options.rules);
      const eventCount = parseInt(options.events);
      const fromHours = parseInt(options.from);
      const gaps = parseInt(options.gaps);

      console.log(`Generating ${ruleCount} rules and ${eventCount} events...`);
      console.log(`Using interval: ${options.interval}`);
      console.log(`Generating events from last ${fromHours} hours`);
      console.log(`Generating ${gaps} gaps per rule`);

      if (options.clean) {
        await deleteAllRules();
      }

      await generateRulesAndAlerts(ruleCount, eventCount, {
        interval: options.interval,
        from: fromHours,
        gapsPerRule: gaps,
      });

      console.log('Successfully generated rules and events');
    } catch (error) {
      console.error('Error generating rules and events:', error);
      process.exit(1);
    }
  });

program
  .command('delete-rules')
  .description('Delete all detection rules')
  .option('-s, --space <string>', 'Space to delete rules from')
  .action(async (options) => {
    try {
      await deleteAllRules(options.space);
    } catch (error) {
      console.error('Error deleting rules:', error);
      process.exit(1);
    }
  });

program
  .command('privileged-user-monitoring')
  .alias('privmon')
  .description(
    `Generate source events and anomalous source data for privileged user monitoring and the privileged access detection ML jobs.`
  )
  .option('--space <space>', 'Space to use', 'default')
  .action(async (options) => {
    const answers = await checkbox<PrivilegedUserMonitoringOption>({
      message: 'Select options',
      choices: [
        {
          name: 'Basic events',
          value: PRIVILEGED_USER_MONITORING_OPTIONS.sourceEventData,
          checked: true,
        },
        {
          name: 'Anomaly events',
          value: PRIVILEGED_USER_MONITORING_OPTIONS.anomalyData,
          checked: true,
        },
        {
          name: 'Upload CSV (skip onboarding)',
          value: PRIVILEGED_USER_MONITORING_OPTIONS.csvFile,
          checked: true,
        },
        {
          name: 'Integration data',
          value: PRIVILEGED_USER_MONITORING_OPTIONS.integrationSyncSourceEventData,
          checked: true,
        },
        {
          name: 'Enable risk engine',
          value: PRIVILEGED_USER_MONITORING_OPTIONS.riskEngineAndRule,
          checked: true,
        },
        {
          name: 'Assign asset criticality',
          value: PRIVILEGED_USER_MONITORING_OPTIONS.assetCriticality,
          checked: true,
        },
        {
          name: 'Install PAD',
          value: PRIVILEGED_USER_MONITORING_OPTIONS.installPad,
          checked: true,
        },
      ],
    });

    const userCount = Number(
      await input({
        message: 'How many users',
        default: '10',
      })
    );

    await privmonCommand({
      options: answers,
      userCount,
      space: options.space,
    });
  });

program
  .command('privmon-quick')
  .alias('privileged-user-monitoring-quick')
  .alias('quickmon')
  .option('--space <space>', 'Space to use', 'default')
  .option('--all', 'Include all options', false)
  .action(async (options) => {
    const excludeOptions: PrivilegedUserMonitoringOption[] = options.all
      ? []
      : // add to this list to exclude options from quick setup
        [
          PRIVILEGED_USER_MONITORING_OPTIONS.installPad, // takes up a lot of memory and makes your laptop hot
        ];

    const quickOptions = [...Object.values(PRIVILEGED_USER_MONITORING_OPTIONS)].filter(
      (opt) => !excludeOptions.includes(opt)
    );

    await privmonCommand({
      options: quickOptions,
      userCount: 100,
      space: options.space,
    });
  });

// Helper functions for single-entity command
const EVENT_INDEX_NAME = 'auditbeat-8.12.0-2024.01.18-000001';

const createEntityWithName = (
  entityType: 'user' | 'host' | 'service' | 'generic',
  name: string
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
  const client = getEsClient();
  if (!client) {
    throw new Error('Failed to get ES client');
  }

  const chunks = chunk(events, 10000);
  for (const chunk of chunks) {
    try {
      const ingestRequest = chunk.reduce(
        (acc: (BulkOperationContainer | unknown)[], event) => {
          acc.push({ index: { _index: EVENT_INDEX_NAME } });
          acc.push(event);
          return acc;
        },
        [] as (BulkOperationContainer | unknown)[]
      );
      await client.bulk({ operations: ingestRequest, refresh: true });
    } catch (err) {
      console.log('Error ingesting events:', err);
      throw err;
    }
  }
};

program
  .command('single-entity')
  .description(
    'Create a single entity with optional risk score, asset criticality, and privileged status'
  )
  .option('--space <space>', 'Space to use', 'default')
  .action(async (options) => {
    const space = options.space || 'default';

    // Initialize space if needed
    if (space !== 'default') {
      await initializeSpace(space);
    }

    // Prompt to enable entity store
    const enableEntityStore = await confirm({
      message: 'Do you want to enable the entity store?',
      default: true,
    });

    if (enableEntityStore) {
      console.log('Ensuring security default data view...');
      await ensureSecurityDefaultDataView(space);
      console.log('Enabling entity store engines...');
      // Enable engines for all entity types
      await initEntityEngineForEntityTypes(['user', 'host', 'service', 'generic'], space);
      console.log('✅ Entity store enabled');
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
      default:
        entityType === 'user' ? 'test-user' : entityType === 'host' ? 'test-host' : 'test-entity',
    });

    // Create entity with custom name
    const entity = createEntityWithName(entityType, entityName);

    // Generate and ingest events for the entity
    console.log(`Creating ${entityType} entity "${entityName}"...`);
    let events: unknown[] = [];
    const eventsPerEntity = 10;
    const offsetHours = 1;

    if (entityType === 'user') {
      events = Array.from({ length: eventsPerEntity }, () =>
        createRandomEventForUser(entity as ReturnType<typeof createRandomUser>, offsetHours)
      );
    } else if (entityType === 'host') {
      events = Array.from({ length: eventsPerEntity }, () =>
        createRandomEventForHost(entity as ReturnType<typeof createRandomHost>, offsetHours)
      );
    } else if (entityType === 'service') {
      events = Array.from({ length: eventsPerEntity }, () =>
        createRandomEventForService(entity as ReturnType<typeof createRandomService>, offsetHours)
      );
    } else if (entityType === 'generic') {
      events = Array.from({ length: eventsPerEntity }, () =>
        createRandomEventForGenericEntity(
          entity as ReturnType<typeof createRandomGenericEntity>,
          offsetHours
        )
      );
    }

    await ingestSingleEntityEvents(events);
    console.log(`✅ Created ${entityType} entity "${entityName}" with ${events.length} events`);

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
        console.log('Exiting...');
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
          space
        );
        assetCriticalitySet = criticality as AssetCriticality;
        console.log(`✅ Set asset criticality to ${criticality} for ${entityName}`);
      }

      if (action === 'privileged') {
        const outputDirectory = resolve(srcDirectory, `../output`);
        const csvFilePath = resolve(outputDirectory, './privileged_users.csv');
        const fsPromises = await import('fs/promises');
        await fsPromises.mkdir(outputDirectory, { recursive: true });

        if (isPrivileged) {
          // Remove privileged status by uploading an empty CSV
          console.log('Removing privileged status by uploading empty CSV...');
          const emptyCsvContent = '';
          await fsPromises.writeFile(csvFilePath, emptyCsvContent);

          console.log('Enabling Privileged User Monitoring...');
          await enablePrivmon(space);
          console.log('Uploading empty CSV file...');
          await uploadPrivmonCsv(csvFilePath, space);
          isPrivileged = false;
          console.log(`✅ Removed privileged status for ${entityName}`);
        } else {
          // Add privileged status
          const csvContent = `${entityName},admin\n`;
          await fsPromises.writeFile(csvFilePath, csvContent);

          console.log('Enabling Privileged User Monitoring...');
          await enablePrivmon(space);
          console.log('Uploading CSV file...');
          await uploadPrivmonCsv(csvFilePath, space);
          isPrivileged = true;
          console.log(`✅ Added privileged status for ${entityName}`);
        }
      }

      if (action === 'risk_score') {
        console.log('Creating match-all rule...');
        await createRule({ space });
        console.log('Rule created');

        // Generate some events to create alerts
        console.log('Generating events to create alerts...');
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
              1
            );
          }
        });
        await ingestSingleEntityEvents(riskEvents);
        console.log('Events generated');

        console.log('Enabling risk engine...');
        await enableRiskScore(space);
        console.log('Running risk engine...');
        await scheduleRiskEngineNow(space);
        riskScoreCreated = true;
        console.log('✅ Risk score setup complete and risk engine run');
      }

      if (action === 'run_engine') {
        console.log('Running risk engine...');
        await scheduleRiskEngineNow(space);
        console.log('✅ Risk engine scheduled to run');
      }
    }
  });

// Baseline metrics commands
program
  .command('create-baseline')
  .argument('<log-prefix>', 'Prefix of log files (e.g., tmp-all-2025-11-13T15:03:32)')
  .option('-e <entityCount>', 'Number of entities', parseIntBase10)
  .option('-l <logsPerEntity>', 'Number of logs per entity', parseIntBase10)
  .option('-u <uploadCount>', 'Number of uploads (for interval tests)', parseIntBase10)
  .option('-i <intervalMs>', 'Interval in milliseconds (for interval tests)', parseIntBase10)
  .option('-n <name>', 'Custom name for baseline (defaults to log-prefix)')
  .description('Extract metrics from logs and create a baseline')
  .action(async (logPrefix, options) => {
    try {
      const testConfig = {
        entityCount: options.e || 0,
        logsPerEntity: options.l || 0,
        uploadCount: options.u,
        intervalMs: options.i,
      };

      console.log(`Extracting baseline metrics from logs with prefix: ${logPrefix}`);
      const baseline = await extractBaselineMetrics(logPrefix, testConfig);

      if (options.n) {
        baseline.testName = options.n;
      }

      const filepath = saveBaseline(baseline);
      console.log(`\n✅ Baseline created successfully!`);
      console.log(`File: ${filepath}`);
      console.log(`\nSummary:`);
      console.log(`  Search Latency (avg): ${baseline.metrics.searchLatency.avg.toFixed(2)}ms`);
      console.log(`  Intake Latency (avg): ${baseline.metrics.intakeLatency.avg.toFixed(2)}ms`);
      console.log(`  CPU (avg): ${baseline.metrics.cpu.avg.toFixed(2)}%`);
      console.log(`  Memory Heap (avg): ${baseline.metrics.memory.avgHeapPercent.toFixed(2)}%`);
      console.log(
        `  Throughput (avg): ${baseline.metrics.throughput.avgDocumentsPerSecond.toFixed(2)} docs/sec`
      );
      console.log(`  Errors: ${baseline.metrics.errors.totalFailures}`);
    } catch (error) {
      console.error('❌ Failed to create baseline:', error);
      if (error instanceof Error) {
        console.error('Error:', error.message);
      }
      process.exit(1);
    }
  });

program
  .command('list-baselines')
  .description('List all available baselines')
  .action(() => {
    const baselines = listBaselines();
    if (baselines.length === 0) {
      console.log('No baselines found.');
      return;
    }

    console.log(`\nFound ${baselines.length} baseline(s):\n`);
    baselines.forEach((filepath: string, index: number) => {
      try {
        const baseline = loadBaseline(filepath);
        console.log(`${index + 1}. ${baseline.testName}`);
        console.log(`   Timestamp: ${baseline.timestamp}`);
        console.log(`   File: ${filepath}`);
        console.log('');
      } catch {
        console.log(`${index + 1}. ${filepath} (error loading)`);
      }
    });
  });

program
  .command('compare-metrics')
  .argument('<current-log-prefix>', 'Prefix of current run log files')
  .option('-b <baseline>', 'Path to baseline file (or use latest if not specified)')
  .option('-e <entityCount>', 'Number of entities for current run', parseIntBase10)
  .option('-l <logsPerEntity>', 'Number of logs per entity for current run', parseIntBase10)
  .option('-u <uploadCount>', 'Number of uploads for current run', parseIntBase10)
  .option('-i <intervalMs>', 'Interval in milliseconds for current run', parseIntBase10)
  .option('--degradation-threshold <percent>', 'Degradation threshold percentage', parseFloat)
  .option('--warning-threshold <percent>', 'Warning threshold percentage', parseFloat)
  .option('--improvement-threshold <percent>', 'Improvement threshold percentage', parseFloat)
  .description('Compare current run metrics against a baseline')
  .action(async (currentLogPrefix, options) => {
    try {
      // Load baseline
      const { baseline } = loadBaselineWithPattern(options.b);

      // Extract current metrics
      const currentTestConfig = {
        entityCount: options.e || 0,
        logsPerEntity: options.l || 0,
        uploadCount: options.u,
        intervalMs: options.i,
      };

      console.log(`Extracting metrics from current run: ${currentLogPrefix}`);
      const current = await extractBaselineMetrics(currentLogPrefix, currentTestConfig);

      // Build thresholds and compare
      const thresholds = buildComparisonThresholds({
        degradationThreshold: options.degradationThreshold,
        warningThreshold: options.warningThreshold,
        improvementThreshold: options.improvementThreshold,
      });

      const report = compareMetrics(baseline, current, thresholds);

      // Print report
      console.log(formatComparisonReport(report));

      // Exit with error code if degradations found
      if (report.summary.degradations > 0) {
        console.log(`\n⚠️  Warning: ${report.summary.degradations} metric(s) show degradation.`);
        process.exit(1);
      }
    } catch (error) {
      console.error('❌ Failed to compare metrics:', error);
      if (error instanceof Error) {
        console.error('Error:', error.message);
      }
      process.exit(1);
    }
  });

program.parse();
