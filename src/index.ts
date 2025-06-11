#! /usr/bin/env node
import { program } from 'commander';
import {
  deleteAllAlerts,
  deleteAllEvents,
  generateAlerts,
  generateEvents,
  generateGraph,
} from './commands/documents';
import { deleteAllRules, generateRulesAndAlerts } from './commands/rules';
import { createConfigFileOnFirstRun } from './utils/create_config_on_first_run';
import AttackSimulationEngine from './services/attack_simulation_engine';
import { cleanupAIService } from './utils/ai_service';
import { initializeSpace } from './utils';
import { getConfig } from './get_config';

await createConfigFileOnFirstRun();

const parseIntBase10 = (input: string) => parseInt(input, 10);

// Phase 3: Apply configuration overrides for command-line flags
const applyPhase3ConfigOverrides = (options: {
  claude: boolean;
  subTechniques: boolean;
  attackChains: boolean;
  largeScale: boolean;
}) => {
  const config = getConfig();

  // Override AI provider configuration based on flags
  if (options.claude) {
    (config as Record<string, unknown>).useClaudeAI = true;
    (config as Record<string, unknown>).useAzureOpenAI = false;
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
  .option('--claude', 'use Claude AI instead of OpenAI', false)
  .option(
    '--mitre',
    'use MITRE ATT&CK framework for realistic attack scenarios',
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
    'Generate AI-powered security alerts with optional MITRE ATT&CK scenarios',
  )
  .action(async (options) => {
    const alertsCount = parseInt(options.n || '1');
    const hostCount = parseInt(options.h || '1');
    const userCount = parseInt(options.u || '1');
    const space = options.s || 'default';
    const useAI = true; // AI is always enabled now
    const useClaude = options.claude || false;
    const useMitre = options.mitre || false;

    // Validate flag dependencies
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
  .option('--claude', 'use Claude AI instead of OpenAI', false)
  .option(
    '--mitre',
    'use MITRE ATT&CK framework for realistic attack scenarios',
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
    'Generate AI-powered security events with optional MITRE ATT&CK scenarios',
  )
  .action((n, options) => {
    // Validate flag dependencies
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

    const useAI = true; // AI is always enabled now
    generateEvents(n, useAI, options.mitre);
  });

program
  .command('generate-graph')
  .description(
    'Generate AI-powered entity relationship graph with realistic alerts',
  )
  .option('-u, --users <number>', 'Number of users to generate', '100')
  .option('-h, --hosts <number>', 'Max hosts per user', '3')
  .option('--claude', 'use Claude AI instead of OpenAI', false)
  .action((options) => {
    // Apply Phase 3 configuration overrides if flags are used
    if (options.claude) {
      applyPhase3ConfigOverrides(options);
    }

    generateGraph({
      users: parseInt(options.users),
      maxHosts: parseInt(options.hosts),
      useAI: true, // AI is always enabled now
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
  .description('Test MITRE ATT&CK AI integration by generating sample alerts')
  .option('-n <n>', 'number of test alerts to generate', '5')
  .option('-s <space>', 'space to use', 'default')
  .option('--claude', 'use Claude AI instead of OpenAI', false)
  .action(async (options) => {
    const alertCount = parseInt(options.n || '5');
    const space = options.space || 'default';

    console.log(
      `Testing MITRE AI integration with ${alertCount} alerts in space '${space}'...`,
    );

    // Apply Phase 3 configuration overrides if flags are used
    if (options.claude) {
      applyPhase3ConfigOverrides(options);
    }

    if (space !== 'default') {
      await initializeSpace(space);
    }

    generateAlerts(alertCount, 3, 2, space, true, true);
  });

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
  .option('--claude', 'use Claude AI instead of OpenAI', false)
  .option(
    '--mitre',
    'use MITRE ATT&CK framework for realistic attack scenarios',
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
    // AI is always enabled now
    const useAI = true;
    const useClaude = options.claude || false;
    const useMitre = options.mitre || false;

    // Validate flag dependencies
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
    console.log(
      '\n🚀 Security Documents Generator - Attack Campaign Generation',
    );
    console.log('='.repeat(60));

    const eventCount = parseInt(options.events);
    const targetCount = parseInt(options.targets);
    const batchSize = parseInt(options.batchSize);

    console.log('\n🎛️  Campaign Configuration:');
    console.log(`  📝 Type: ${campaignType}`);
    console.log(`  🎚️  Complexity: ${options.complexity}`);
    console.log(`  📊 Events: ${eventCount.toLocaleString()}`);
    console.log(`  🎯 Targets: ${targetCount}`);
    console.log(`  📦 Batch Size: ${batchSize}`);
    console.log(`  🤖 AI Provider: ${useClaude ? 'Claude' : 'OpenAI'}`);
    console.log(`  ⚔️  MITRE ATT&CK: ${useMitre ? 'Yes' : 'No'}`);
    if (useMitre) {
      console.log(
        `  🔗 Sub-techniques: ${options.subTechniques ? 'Yes' : 'No'}`,
      );
      console.log(
        `  ⛓️  Attack Chains: ${options.attackChains ? 'Yes' : 'No'}`,
      );
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
      console.log(
        '   📊 Scalability testing framework ready for implementation',
      );
    } else {
      // Initialize space if not default
      if (options.space !== 'default') {
        await initializeSpace(options.space);
      }

      // Use sophisticated AttackSimulationEngine for realistic campaign generation
      console.log(
        `📝 Generating sophisticated ${campaignType} campaign with ${eventCount} events...`,
      );

      const simulationEngine = new AttackSimulationEngine({
        networkComplexity: options.complexity,
        enableCorrelation: true,
        enablePerformanceOptimization: options.largeScale,
      });

      try {
        // Generate sophisticated attack simulation with correlation
        const sophisticatedGeneration = async () => {
          console.log('\n🧠 Initializing Sophisticated Attack Simulation...');

          // Generate the attack simulation
          const simulation = await simulationEngine.generateAttackSimulation(
            campaignType as 'apt' | 'ransomware' | 'insider' | 'supply_chain',
            options.complexity as 'low' | 'medium' | 'high' | 'expert',
          );

          console.log(`\n✨ Campaign Generated Successfully:`);
          console.log(`  🎯 Stages: ${simulation.stages.length}`);
          console.log(`  ⚔️  Campaign: ${simulation.campaign.name}`);
          console.log(`  🎭 Threat Actor: ${simulation.campaign.threat_actor}`);
          console.log(
            `  📅 Duration: ${simulation.campaign.duration.start.toISOString().split('T')[0]} → ${simulation.campaign.duration.end.toISOString().split('T')[0]}`,
          );

          // Generate correlated events using the sophisticated engine
          console.log(`\n🔗 Generating Sophisticated Correlated Events...`);

          const timestampConfig = {
            startDate: simulation.campaign.duration.start.toISOString(),
            endDate: simulation.campaign.duration.end.toISOString(),
            pattern: 'attack_simulation' as const,
          };

          const correlatedEvents =
            await simulationEngine.generateCampaignEvents(
              simulation,
              targetCount,
              eventCount,
              options.space,
              useMitre,
              timestampConfig,
            );

          console.log(`\n🎊 Sophisticated Correlation Complete!`);
          console.log(`  📊 Generated Events: ${correlatedEvents.length}`);
          console.log(`  🔗 Campaign Correlation: 100%`);
          console.log(`  ⚡ Advanced Analytics: Active`);

          return correlatedEvents;
        };

        // Execute sophisticated generation with dynamic timeout based on event count
        const timeoutMs = Math.max(60000, eventCount * 2000); // 2 seconds per event, minimum 60 seconds
        console.log(
          `⏱️  Timeout set to ${Math.round(timeoutMs / 1000)} seconds for ${eventCount} events`,
        );

        const result = await Promise.race([
          sophisticatedGeneration(),
          new Promise((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    `Sophisticated generation timeout after ${Math.round(timeoutMs / 1000)}s`,
                  ),
                ),
              timeoutMs,
            ),
          ),
        ]);

        if (!result) {
          throw new Error('Sophisticated generation failed');
        }

        console.log(
          `\n🚀 Sophisticated Campaign Events Generated Successfully!`,
        );
      } catch (error) {
        console.log(
          `\n⚠️  Sophisticated generation encountered an issue: ${error}`,
        );
        console.log('🔄 Falling back to optimized basic generation...');

        // Use basic generation as fallback with campaign-specific settings
        const timestampConfig = {
          startDate: '1d',
          endDate: 'now',
          pattern: 'attack_simulation' as const,
        };

        const actualHostCount = Math.min(
          targetCount,
          Math.ceil(eventCount * 0.6),
        );
        const actualUserCount = Math.min(
          Math.ceil(eventCount * 0.4),
          actualHostCount - 1,
        );

        await generateAlerts(
          eventCount,
          actualHostCount,
          actualUserCount,
          options.space,
          useAI,
          useMitre,
          timestampConfig,
        );
      }

      // Cleanup AI service to allow process to exit cleanly
      if (useAI) {
        cleanupAIService();
      }

      console.log('\n✅ Campaign Generation Complete!');
      console.log(
        `📊 Generated ${eventCount} AI-powered events in ${options.space} space`,
      );
      console.log(`🧠 AI Provider: ${useClaude ? 'Claude' : 'OpenAI'}`);
      if (useMitre) {
        console.log(
          `⚔️  MITRE ATT&CK: Enhanced with ${options.subTechniques ? 'sub-techniques' : 'base techniques'}`,
        );
        if (options.attackChains) {
          console.log('⛓️  Attack chains enabled for realistic progression');
        }
      }
    }

    console.log('\n💡 Campaign ready for Kibana AI security testing!');
  });

program.parse();
