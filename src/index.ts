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
import { cleanEntityStore, generateEntityStore } from './commands/entity_store';
import {
  createPerfDataFile,
  listPerfDataFiles,
  uploadPerfDataFile,
  uploadPerfDataFileInterval,
} from './commands/entity_store_perf';
import { checkbox, input } from '@inquirer/prompts';
import {
  ENTITY_STORE_OPTIONS,
  generateNewSeed,
  PRIVILEGED_USER_INTEGRATIONS_SYNC_OPTIONS,
  PRIVILEGED_USER_MONITORING_OPTIONS,
} from './constants';
import { initializeSpace } from './utils';
import { generateAssetCriticality } from './commands/asset_criticality';
import { deleteAllRules, generateRulesAndAlerts } from './commands/rules';
import { createConfigFileOnFirstRun } from './utils/create_config_on_first_run';
import { generatePrivilegedAccessDetectionData } from './commands/privileged_access_detection_ml/privileged_access_detection_ml';
import { promptForFileSelection } from './commands/utils/cli_utils';
import { UserGenerator } from './commands/privileged_access_detection_ml/event_generator';
import { generatePrivilegedUserIntegrationsSyncData, generatePrivilegedUserMonitoringData } from './commands/privileged_user_monitoring/privileged_user_monitoring';
import { generateCSVFile } from './commands/privileged_user_monitoring/generate_csv_file';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

await createConfigFileOnFirstRun();

const parseIntBase10 = (input: string) => parseInt(input, 10);

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

    generateAlerts(alertsCount, userCount, hostCount, space);
  });

program
  .command('generate-events')
  .argument('<n>', 'integer argument', parseIntBase10)
  .description('Generate events')
  .action(generateEvents);

program
  .command('generate-graph')
  .description('Generate fake graph')
  .action(generateGraph);

program
  .command('delete-alerts')
  .description('Delete all alerts')
  .action(deleteAllAlerts);

program
  .command('delete-events')
  .description('Delete all events')
  .action(deleteAllEvents);

program
  .command('test-risk-score')
  .description('Test risk score API')
  .action(kibanaApi.fetchRiskScore);

program
  .command('create-perf-data')
  .argument('<name>', 'name of the file')
  .argument('<entity-count>', 'number of entities', parseIntBase10)
  .argument('<logs-per-entity>', 'number of logs per entity', parseIntBase10)
  .argument(
    '[start-index]',
    'for sequential data, which index to start at',
    parseIntBase10,
    0,
  )
  .description('Create performance data')
  .action((name, entityCount, logsPerEntity, startIndex) => {
    createPerfDataFile({ name, entityCount, logsPerEntity, startIndex });
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
      options.delete,
    );
  });

program
  .command('upload-perf-data-interval')
  .argument('[file]', 'File to upload')
  .option('--interval <interval>', 'interval in s', parseIntBase10, 30)
  .option('--count <count>', 'number of times to upload', parseIntBase10, 10)
  .option('--deleteData', 'Delete all entities before uploading')
  .option('--deleteEngines', 'Delete all entities before uploading')
  .description('Upload performance data file')
  .action(async (file, options) => {
    await uploadPerfDataFileInterval(
      file ?? (await promptForFileSelection(listPerfDataFiles())),
      options.interval * 1000,
      options.count,
      options.deleteData,
      options.deleteEngines,
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
    const entityStoreAnswers = await checkbox<
      keyof typeof ENTITY_STORE_OPTIONS
    >({
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
      message:
        'Event date offset in hours (how many hours ago events should be generated)',
      default: '1',
    });

    const seed = generateNewSeed() + '';

    let seedAnswer = seed;

    if (entityStoreAnswers.includes(ENTITY_STORE_OPTIONS.seed)) {
      seedAnswer = await input({
        message:
          'Enter seed to generate stable random data or <enter> to use a new seed',
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

program
  .command('clean-entity-store')
  .description('clean entity store')
  .action(cleanEntityStore);

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
  .description(
    `Generate source events and anomalous source data for privileged user monitoring and the privileged access detection ML jobs.`,
  )
  .action(async () => {
    const privilegedUserMonitoringAnswers = await checkbox<
      keyof typeof PRIVILEGED_USER_MONITORING_OPTIONS
    >({
      message: 'Select options',
      choices: [
        {
          name: 'Whether to generate basic source events for users',
          value: PRIVILEGED_USER_MONITORING_OPTIONS.sourceEventData,
          checked: true,
        },
        {
          name: 'Whether to generate anomalous source events for users, matching the privileged access detection jobs',
          value: PRIVILEGED_USER_MONITORING_OPTIONS.anomalyData,
          checked: true,
        },
        {
          name: 'Whether to create a CSV file with the user names, in order to upload during onboarding.',
          value: PRIVILEGED_USER_MONITORING_OPTIONS.csvFile,
          checked: true,
        },
        {
          name: 'Whether to create integrations source events for okta users - AD coming soon.',
          value: PRIVILEGED_USER_INTEGRATIONS_SYNC_OPTIONS.sourceEventData,
          checked: true,
        },
      ],
    });

    const userCount = Number(
      await input({
        message: 'How many users',
        default: '10',
      }),
    );

    const users = UserGenerator.getUsers(userCount);    
    if (
      privilegedUserMonitoringAnswers.includes(
        PRIVILEGED_USER_INTEGRATIONS_SYNC_OPTIONS.sourceEventData,
      )
    ) {      
            
      await generatePrivilegedUserIntegrationsSyncData({
        usersCount: userCount
      });
    }

    if (
      privilegedUserMonitoringAnswers.includes(
        PRIVILEGED_USER_MONITORING_OPTIONS.sourceEventData,
      )
    )
      await generatePrivilegedUserMonitoringData({ users });
    if (
      privilegedUserMonitoringAnswers.includes(
        PRIVILEGED_USER_MONITORING_OPTIONS.anomalyData,
      )
    )
      await generatePrivilegedAccessDetectionData({ users });
    if (
      privilegedUserMonitoringAnswers.includes(
        PRIVILEGED_USER_MONITORING_OPTIONS.csvFile,
      )
    )
      await generateCSVFile({ users }); 
  });

program.parse();
