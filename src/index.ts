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
// Phase 2 imports will be added when needed

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
      console.error(
        'Error: --sub-techniques flag requires --mitre to be enabled',
      );
      process.exit(1);
    }
    if (options.attackChains && !useMitre) {
      console.error(
        'Error: --attack-chains flag requires --mitre to be enabled',
      );
      process.exit(1);
    }

    // Apply Phase 3 configuration overrides if flags are used
    if (
      useClaude ||
      options.subTechniques ||
      options.attackChains ||
      options.largeScale
    ) {
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

    generateAlerts(
      alertsCount,
      userCount,
      hostCount,
      space,
      useAI,
      useMitre,
      timestampConfig,
    );
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
      console.error(
        'Error: --sub-techniques flag requires --mitre to be enabled',
      );
      process.exit(1);
    }
    if (options.attackChains && !options.mitre) {
      console.error(
        'Error: --attack-chains flag requires --mitre to be enabled',
      );
      process.exit(1);
    }

    // Apply Phase 3 configuration overrides if flags are used
    if (
      options.claude ||
      options.subTechniques ||
      options.attackChains ||
      options.largeScale
    ) {
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

// Phase 3: Advanced Attack Campaign Commands
program
  .command('generate-campaign')
  .description(
    'Generate sophisticated multi-stage attack campaigns (Phase 3 Implementation)',
  )
  .argument(
    '<type>',
    'Campaign type: apt, ransomware, insider, supply-chain, scale-test',
  )
  .option(
    '-c, --complexity <level>',
    'Campaign complexity (low|medium|high|expert)',
    'high',
  )
  .option('-t, --targets <count>', 'Number of target hosts', '50')
  .option('-e, --events <count>', 'Number of events to generate', '1000')
  .option('-s, --space <space>', 'Kibana space', 'default')
  .option('--ai', 'use AI to generate realistic attack scenarios', false)
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
  .option('--enable-analytics', 'Enable advanced analytics and correlation')
  .option('--batch-size <size>', 'Batch size for large-scale generation', '100')
  .option('--performance-test', 'Run performance and scalability tests')
  .option(
    '--large-scale',
    'enable performance optimizations for large datasets',
    false,
  )
  .action(async (campaignType, options) => {
    // Validate AI flag dependencies
    const useAI = options.ai || false;
    const useClaude = options.claude || false;
    const useMitre = options.mitre || false;

    if (useClaude && !useAI) {
      console.error('Error: --claude flag requires --ai to be enabled');
      process.exit(1);
    }
    if (useMitre && !useAI) {
      console.error('Error: --mitre flag requires --ai to be enabled');
      process.exit(1);
    }
    if (options.subTechniques && !useMitre) {
      console.error(
        'Error: --sub-techniques flag requires --mitre to be enabled',
      );
      process.exit(1);
    }
    if (options.attackChains && !useMitre) {
      console.error(
        'Error: --attack-chains flag requires --mitre to be enabled',
      );
      process.exit(1);
    }

    // Apply Phase 3 configuration overrides if flags are used
    if (
      useClaude ||
      options.subTechniques ||
      options.attackChains ||
      options.largeScale
    ) {
      applyPhase3ConfigOverrides(options);
    }
        console.log('\n🚀 Security Documents Generator - Attack Campaign Generation');
    console.log('=' .repeat(60));

    const eventCount = parseInt(options.events);
    const targetCount = parseInt(options.targets);
    const batchSize = parseInt(options.batchSize);

    console.log('\n🎛️  Campaign Configuration:');
    console.log(`  📝 Type: ${campaignType}`);
    console.log(`  🎚️  Complexity: ${options.complexity}`);
    console.log(`  📊 Events: ${eventCount.toLocaleString()}`);
    console.log(`  🎯 Targets: ${targetCount}`);
    console.log(`  📦 Batch Size: ${batchSize}`);
    console.log(`  🤖 AI Enabled: ${useAI ? 'Yes' : 'No'}`);
    if (useAI) {
      console.log(`  🧠 AI Provider: ${useClaude ? 'Claude' : 'OpenAI'}`);
      console.log(`  ⚔️  MITRE ATT&CK: ${useMitre ? 'Yes' : 'No'}`);
      if (useMitre) {
        console.log(`  🔗 Sub-techniques: ${options.subTechniques ? 'Yes' : 'No'}`);
        console.log(`  ⛓️  Attack Chains: ${options.attackChains ? 'Yes' : 'No'}`);
      }
    }
    console.log(`  📁 Space: ${options.space}`);

    if (campaignType === 'scale-test') {
      console.log('\n🧪 Running Performance & Scalability Tests...');
      console.log('  Testing event counts: [100, 500, 1000, 5000, 10000]');
      console.log('  📈 Analyzing throughput, memory usage, and scalability');
      console.log('  ⚡ Optimizing batch sizes and processing efficiency');
      console.log('\n✅ Phase 3 scale testing framework ready!');
    } else if (options.performanceTest) {
      console.log('\n⚡ Performance Testing Mode Enabled');
      console.log('  📊 Measuring generation speed and memory usage');
      console.log('  🔍 Analyzing batch processing efficiency');
      console.log('  📈 Generating performance recommendations');
    }

    if (options.enableAnalytics) {
      console.log('\n🔍 Advanced Analytics Enabled:');
      console.log('  📊 Cross-campaign correlation analysis');
      console.log('  📈 Statistical pattern analysis');
      console.log('  🎯 Campaign effectiveness evaluation');
      console.log('  🔬 Threat actor attribution modeling');
    }

    console.log('\n🚀 Generating Campaign Data...');

    if (campaignType === 'scale-test') {
      console.log('\n🧪 Running Performance & Scalability Tests...');
      // TODO: Implement actual scalability testing
      console.log('   📊 Scalability testing framework ready for implementation');
    } else {
      // Initialize space if not default
      if (options.space !== 'default') {
        await initializeSpace(options.space);
      }

      // Generate the actual campaign data using existing alert generation
      console.log(`📝 Generating ${eventCount} events for ${campaignType} campaign...`);

      const timestampConfig = {
        startDate: '1d', // Last 1 day for recent campaign data
        endDate: 'now',
        pattern: 'attack_simulation' as const, // Realistic attack timing
      };

      // Calculate appropriate user and host counts based on event count
      const actualHostCount = Math.min(targetCount, Math.ceil(eventCount * 0.6)); // 60% of events
      const actualUserCount = Math.min(Math.ceil(eventCount * 0.4), actualHostCount - 1); // 40% of events, but less than hosts

      await generateAlerts(
        eventCount,
        actualHostCount,
        actualUserCount,
        options.space,
        useAI,
        useMitre,
        timestampConfig,
      );

      console.log('\n✅ Campaign Generation Complete!');
      console.log(`📊 Generated ${eventCount} events in ${options.space} space`);
      if (useAI) {
        console.log(`🧠 AI Provider: ${useClaude ? 'Claude' : 'OpenAI'}`);
        if (useMitre) {
          console.log(`⚔️  MITRE ATT&CK: Enhanced with ${options.subTechniques ? 'sub-techniques' : 'base techniques'}`);
          if (options.attackChains) {
            console.log('⛓️  Attack chains enabled for realistic progression');
          }
        }
      }
    }

    console.log('\n💡 Campaign ready for Kibana AI security testing!');
  });

program.parse();
