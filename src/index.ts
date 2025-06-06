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
import { ENTITY_STORE_OPTIONS, generateNewSeed } from './constants';
import { initializeSpace } from './utils';
import { generateAssetCriticality } from './commands/asset_criticality';
import { deleteAllRules, generateRulesAndAlerts } from './commands/rules';
import { createConfigFileOnFirstRun } from './utils/create_config_on_first_run';
import {
  generatePrivilegedAccessDetectionData,
  SUPPORTED_PAD_JOBS,
} from './commands/privileged_access_detection_ml/privileged_access_detection_ml';
import { promptForFileSelection } from './commands/utils/cli_utils';
import { getConfig } from './get_config';

await createConfigFileOnFirstRun();

const parseIntBase10 = (input: string) => parseInt(input, 10);

// Phase 3: Apply configuration overrides for command-line flags
const applyPhase3ConfigOverrides = (options: any) => {
  const config = getConfig();

  // Override AI provider configuration based on flags
  if (options.claude) {
    (config as any).useClaudeAI = true;
    (config as any).useAzureOpenAI = false;
    console.log('Claude AI enabled for this generation');
  }

  // Override MITRE configuration based on flags
  if (options.subTechniques && config.mitre) {
    config.mitre.includeSubTechniques = true;
    console.log('Sub-techniques enabled for this generation');
  }

  if (options.attackChains && config.mitre) {
    config.mitre.enableAttackChains = true;
    config.mitre.chainProbability = 0.4; // Higher probability for CLI flag
    console.log('Attack chains enabled for this generation');
  }

  if (options.largeScale && config.generation?.performance) {
    config.generation.performance.enableLargeScale = true;
    config.generation.performance.largeScaleThreshold = 500; // Lower threshold for CLI
    console.log('Large-scale optimizations enabled for this generation');
  }
};

program
  .command('generate-alerts')
  .option('-n <n>', 'number of alerts')
  .option('-h <h>', 'number of hosts')
  .option('-u <h>', 'number of users')
  .option('-s <h>', 'space (will be created if it does not exist)')
  .option('--ai', 'use AI to generate some of the alerts', false)
  .option('--claude', 'use Claude AI instead of OpenAI (requires --ai)', false)
  .option(
    '--mitre',
    'use MITRE ATT&CK framework for realistic attack scenarios (requires --ai)',
    false,
  )
  .option(
    '--sub-techniques',
    'include MITRE sub-techniques in generated alerts (requires --mitre)',
    false,
  )
  .option(
    '--attack-chains',
    'generate realistic attack chains with multiple techniques (requires --mitre)',
    false,
  )
  .option(
    '--large-scale',
    'enable performance optimizations for large datasets (>1000)',
    false,
  )
  .option(
    '--start-date <date>',
    'start date for data generation (e.g., "7d", "1w", "2024-01-01")',
  )
  .option(
    '--end-date <date>',
    'end date for data generation (e.g., "now", "1d", "2024-01-10")',
  )
  .option(
    '--time-pattern <pattern>',
    'time distribution pattern: uniform, business_hours, random, attack_simulation, weekend_heavy',
  )
  .description(
    'Generate fake alerts (use --ai for realistic alerts, --mitre for MITRE ATT&CK scenarios)',
  )
  .action(async (options) => {
    const alertsCount = parseInt(options.n || '1');
    const hostCount = parseInt(options.h || '1');
    const userCount = parseInt(options.u || '1');
    const space = options.s || 'default';
    const useAI = options.ai || false;
    const useClaude = options.claude || false;
    const useMitre = options.mitre || false;

    // Validate flag dependencies
    if (useClaude && !useAI) {
      console.error('Error: --claude flag requires --ai to be enabled');
      process.exit(1);
    }
    if (useMitre && !useAI) {
      console.error('Error: --mitre flag requires --ai to be enabled');
      process.exit(1);
    }
    if (options.subTechniques && !useMitre) {
      console.error('Error: --sub-techniques flag requires --mitre to be enabled');
      process.exit(1);
    }
    if (options.attackChains && !useMitre) {
      console.error('Error: --attack-chains flag requires --mitre to be enabled');
      process.exit(1);
    }

    // Apply Phase 3 configuration overrides if flags are used
    if (useClaude || options.subTechniques || options.attackChains || options.largeScale) {
      applyPhase3ConfigOverrides(options);
    }

    if (space !== 'default') {
      await initializeSpace(space);
    }

    // Pass timestamp configuration options
    const timestampConfig = {
      startDate: options.startDate,
      endDate: options.endDate,
      pattern: options.timePattern,
    };

    generateAlerts(alertsCount, userCount, hostCount, space, useAI, useMitre, timestampConfig);
  });

program
  .command('generate-events')
  .argument('<n>', 'integer argument', parseIntBase10)
  .option('--ai', 'use AI to generate some of the events', false)
  .option('--claude', 'use Claude AI instead of OpenAI (requires --ai)', false)
  .option(
    '--mitre',
    'use MITRE ATT&CK framework for realistic attack scenarios (requires --ai)',
    false,
  )
  .option(
    '--sub-techniques',
    'include MITRE sub-techniques in generated alerts (requires --mitre)',
    false,
  )
  .option(
    '--attack-chains',
    'generate realistic attack chains with multiple techniques (requires --mitre)',
    false,
  )
  .option(
    '--large-scale',
    'enable performance optimizations for large datasets (>1000)',
    false,
  )
  .option(
    '--start-date <date>',
    'start date for data generation (e.g., "7d", "1w", "2024-01-01")',
  )
  .option(
    '--end-date <date>',
    'end date for data generation (e.g., "now", "1d", "2024-01-10")',
  )
  .option(
    '--time-pattern <pattern>',
    'time distribution pattern: uniform, business_hours, random, attack_simulation, weekend_heavy',
  )
  .description(
    'Generate events (use --ai for realistic events, --mitre for MITRE ATT&CK scenarios)',
  )
  .action((n, options) => {
    // Validate flag dependencies
    if (options.claude && !options.ai) {
      console.error('Error: --claude flag requires --ai to be enabled');
      process.exit(1);
    }
    if (options.mitre && !options.ai) {
      console.error('Error: --mitre flag requires --ai to be enabled');
      process.exit(1);
    }
    if (options.subTechniques && !options.mitre) {
      console.error('Error: --sub-techniques flag requires --mitre to be enabled');
      process.exit(1);
    }
    if (options.attackChains && !options.mitre) {
      console.error('Error: --attack-chains flag requires --mitre to be enabled');
      process.exit(1);
    }

    // Apply Phase 3 configuration overrides if flags are used
    if (options.claude || options.subTechniques || options.attackChains || options.largeScale) {
      applyPhase3ConfigOverrides(options);
    }

    generateEvents(n, options.ai, options.mitre);
  });

program
  .command('generate-graph')
  .description(
    'Generate fake graph (use --ai flag to generate realistic alerts in the graph with AI)',
  )
  .option('--ai', 'use AI to generate some of the alerts in the graph', false)
  .option('-u, --users <number>', 'Number of users to generate', '100')
  .option('-h, --hosts <number>', 'Max hosts per user', '3')
  .action((options) => {
    generateGraph({
      users: parseInt(options.users),
      maxHosts: parseInt(options.hosts),
      useAI: options.ai || false,
    });
  });

program
  .command('delete-alerts')
  .description('Delete all alerts')
  .action(deleteAllAlerts);

program
  .command('delete-events')
  .description('Delete all events')
  .action(deleteAllEvents);

program
  .command('test-mitre')
  .description('Test MITRE ATT&CK integration by generating sample alerts')
  .option('-n <n>', 'number of test alerts to generate', '5')
  .option('-s <space>', 'space to use', 'default')
  .action(async (options) => {
    const alertCount = parseInt(options.n || '5');
    const space = options.space || 'default';

    console.log(
      `Testing MITRE integration with ${alertCount} alerts in space '${space}'...`,
    );

    if (space !== 'default') {
      await initializeSpace(space);
    }

    generateAlerts(alertCount, 3, 2, space, true, true);
  });

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
  .command('privileged_access_detection')
  .description(
    `Generate anomalous source data for the privileged access detection ML jobs. Currently supports the following jobs: [${SUPPORTED_PAD_JOBS.join(',')}]`,
  )
  .option(
    '-u, --users <users>',
    'Number of users to generate behavioral events for',
    '10',
  )
  .option(
    '--event_multiplier <event_multiplier>',
    'Multiplier to increase number of both baseline and anomalous events',
    '1',
  )
  .action(async (options) => {
    const numberOfUsers = parseInt(options.users);
    const eventMultiplier = parseInt(options.event_multiplier);
    await generatePrivilegedAccessDetectionData({
      numberOfUsers,
      eventMultiplier,
    });
  });

program.parse();
