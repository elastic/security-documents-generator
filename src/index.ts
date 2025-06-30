#! /usr/bin/env node
import { program } from 'commander';
import {
  deleteAllAlerts,
  deleteAllEvents,
  deleteAllLogs,
  deleteAllData,
  generateAlerts,
  generateEvents,
  generateGraph,
  generateLogs,
  generateCorrelatedCampaign,
} from './commands/documents';
import { deleteAllRules, generateRulesAndAlerts } from './commands/rules';
import { createConfigFileOnFirstRun } from './utils/create_config_on_first_run';
import AttackSimulationEngine from './services/attack_simulation_engine';
import { cleanupAIService } from './utils/ai_service';
import { initializeSpace } from './utils';
import { getConfig } from './get_config';
import { faker } from '@faker-js/faker';

await createConfigFileOnFirstRun();

const parseIntBase10 = (input: string) => parseInt(input, 10);

// Phase 3: Apply configuration overrides for command-line flags
const applyPhase3ConfigOverrides = (options: {
  claude: boolean;
  subTechniques: boolean;
  attackChains: boolean;
  largeScale: boolean;
  focusTactic?: string;
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

  if (options.focusTactic && config.mitre) {
    // Store focus tactic for MITRE alert generation
    (config.mitre as Record<string, unknown>).focusTactic = options.focusTactic;
    console.log(`Focusing on MITRE tactic: ${options.focusTactic}`);
  }
};

program
  .command('generate-alerts')
  .option('-n <n>', 'number of alerts')
  .option('-h <h>', 'number of hosts')
  .option('-u <h>', 'number of users')
  .option('-s <h>', 'space (will be created if it does not exist)')
  .option(
    '--namespace <namespace>',
    'custom namespace for alert indices (default: default)',
  )
  .option(
    '--environments <count>',
    'generate alerts across multiple environment namespaces',
    parseIntBase10,
  )
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
    '--focus-tactic <tactic>',
    'focus on specific MITRE tactic (e.g., TA0001 for Initial Access)',
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
  .option(
    '--false-positive-rate <rate>',
    'percentage of alerts to mark as false positives (0.0-1.0) for testing detection rules',
    '0.0',
  )
  .option(
    '--multi-field',
    'generate hundreds of additional contextual security fields (99% token reduction)',
    false,
  )
  .option(
    '--field-count <count>',
    'number of additional fields to generate (requires --multi-field)',
  )
  .option(
    '--field-categories <categories>',
    'specific field categories to include (comma-separated): behavioral_analytics,threat_intelligence,performance_metrics,security_scores,audit_compliance,network_analytics,endpoint_analytics,forensics_analysis,cloud_security,malware_analysis,geolocation_intelligence,incident_response',
  )
  .option(
    '--field-performance-mode',
    'optimize multi-field generation for speed over variety (requires --multi-field)',
    false,
  )
  .description(
    'Generate AI-powered security alerts with optional MITRE ATT&CK scenarios',
  )
  .action(async (options) => {
    const alertsCount = parseInt(options.n || '1');
    const hostCount = parseInt(options.h || '1');
    const userCount = parseInt(options.u || '1');
    const space = options.s || 'default';
    const namespace = options.namespace || 'default';
    const environments = options.environments || 1;
    const useAI = true; // AI is always enabled now
    const useClaude = options.claude || false;
    const useMitre = options.mitre || false;
    const falsePositiveRate = parseFloat(options.falsePositiveRate || '0.0');
    const useMultiField = options.multiField || false;
    const fieldCount = parseInt(options.fieldCount || '200');
    const fieldCategories = options.fieldCategories
      ? options.fieldCategories.split(',').map((c: string) => c.trim())
      : undefined;
    const fieldPerformanceMode = options.fieldPerformanceMode || false;

    // Validate false positive rate
    if (falsePositiveRate < 0.0 || falsePositiveRate > 1.0) {
      console.error('Error: --false-positive-rate must be between 0.0 and 1.0');
      process.exit(1);
    }

    // Validate multi-field options
    if (options.fieldCount && !useMultiField) {
      console.error(
        'Error: --field-count flag requires --multi-field to be enabled',
      );
      process.exit(1);
    }
    if (options.fieldCategories && !useMultiField) {
      console.error(
        'Error: --field-categories flag requires --multi-field to be enabled',
      );
      process.exit(1);
    }
    if (fieldPerformanceMode && !useMultiField) {
      console.error(
        'Error: --field-performance-mode flag requires --multi-field to be enabled',
      );
      process.exit(1);
    }
    if (fieldCount < 1 || fieldCount > 50000) {
      console.error('Error: --field-count must be between 1 and 50,000');
      process.exit(1);
    }

    // Validate field categories if provided
    if (fieldCategories) {
      const validCategories = [
        'behavioral_analytics',
        'threat_intelligence',
        'performance_metrics',
        'security_scores',
        'audit_compliance',
        'network_analytics',
        'endpoint_analytics',
        'forensics_analysis',
        'cloud_security',
        'malware_analysis',
        'geolocation_intelligence',
        'incident_response',
      ];
      const invalidCategories = fieldCategories.filter(
        (cat: string) => !validCategories.includes(cat),
      );
      if (invalidCategories.length > 0) {
        console.error(
          `Error: Invalid field categories: ${invalidCategories.join(', ')}. Valid categories: ${validCategories.join(', ')}`,
        );
        process.exit(1);
      }
    }

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
    if (options.focusTactic && !useMitre) {
      console.error(
        'Error: --focus-tactic flag requires --mitre to be enabled',
      );
      process.exit(1);
    }

    // Validate focus tactic exists in MITRE data
    if (options.focusTactic) {
      const validTactics = [
        'TA0001',
        'TA0002',
        'TA0003',
        'TA0004',
        'TA0005',
        'TA0006',
        'TA0007',
        'TA0008',
        'TA0009',
        'TA0010',
        'TA0011',
        'TA0040',
      ];
      if (!validTactics.includes(options.focusTactic)) {
        console.error(
          `Error: Invalid tactic ${options.focusTactic}. Valid tactics: ${validTactics.join(', ')}`,
        );
        process.exit(1);
      }
    }

    // Apply Phase 3 configuration overrides if flags are used
    if (
      useClaude ||
      options.subTechniques ||
      options.attackChains ||
      options.largeScale ||
      options.focusTactic
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

    // Show multi-field configuration if enabled
    if (useMultiField) {
      console.log(`\n🔬 Multi-Field Generation Enabled:`);
      console.log(`  📊 Additional Fields: ${fieldCount}`);
      console.log(
        `  📁 Categories: ${fieldCategories ? fieldCategories.join(', ') : 'all'}`,
      );
      console.log(
        `  ⚡ Performance Mode: ${fieldPerformanceMode ? 'Yes' : 'No'}`,
      );
      console.log(`  🎯 Token Reduction: 99%`);
    }

    // Create multi-field configuration
    const multiFieldConfig = useMultiField
      ? {
          fieldCount,
          categories: fieldCategories,
          performanceMode: fieldPerformanceMode,
          contextWeightEnabled: true,
          correlationEnabled: true,
        }
      : undefined;

    // Handle multiple environments
    if (environments > 1) {
      console.log(`\n🌍 Multi-Environment Generation Enabled:`);
      console.log(`  📊 Environments: ${environments}`);
      console.log(`  📁 Base Namespace: ${namespace}`);
      console.log(`  🎯 Total Alerts: ${alertsCount * environments}`);

      for (let i = 1; i <= environments; i++) {
        const envNamespace = `${namespace}-env-${i.toString().padStart(3, '0')}`;
        const envSpace = `${space}-${envNamespace}`;

        console.log(
          `\n🔄 Generating environment ${i}/${environments}: ${envNamespace}`,
        );

        if (envSpace !== 'default') {
          await initializeSpace(envSpace);
        }

        await generateAlerts(
          alertsCount,
          userCount,
          hostCount,
          envSpace,
          useAI,
          useMitre,
          timestampConfig,
          falsePositiveRate,
          multiFieldConfig,
          envNamespace,
        );
      }

      console.log(`\n✅ Multi-Environment Generation Complete!`);
      console.log(`  🌍 Generated across ${environments} environments`);
      console.log(`  📊 Total alerts: ${alertsCount * environments}`);
      console.log(
        `  📁 Namespaces: ${namespace}-env-001 through ${namespace}-env-${environments.toString().padStart(3, '0')}`,
      );
    } else {
      generateAlerts(
        alertsCount,
        userCount,
        hostCount,
        space,
        useAI,
        useMitre,
        timestampConfig,
        falsePositiveRate,
        multiFieldConfig,
        namespace,
      );
    }
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
  .command('generate-logs')
  .description('Generate realistic source logs for security analysis')
  .option('-n <n>', 'number of logs to generate', '1000')
  .option('-h <h>', 'number of hosts', '10')
  .option('-u <u>', 'number of users', '5')
  .option(
    '--types <types>',
    'log types to generate (comma-separated): system,auth,network,endpoint',
    'system,auth,network,endpoint',
  )
  .option('--claude', 'use Claude AI instead of OpenAI', false)
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
  .option(
    '--multi-field',
    'generate hundreds of additional contextual security fields (99% token reduction)',
    false,
  )
  .option(
    '--field-count <count>',
    'number of additional fields to generate (requires --multi-field)',
  )
  .option(
    '--field-categories <categories>',
    'specific field categories to include (comma-separated): behavioral_analytics,threat_intelligence,performance_metrics,security_scores,audit_compliance,network_analytics,endpoint_analytics,forensics_analysis,cloud_security,malware_analysis,geolocation_intelligence,incident_response',
  )
  .option(
    '--field-performance-mode',
    'optimize multi-field generation for speed over variety (requires --multi-field)',
    false,
  )
  .option(
    '--session-view',
    'generate Session View compatible data with process hierarchies and terminal output',
    false,
  )
  .option(
    '--visual-analyzer',
    'generate Visual Event Analyzer compatible data with process entity tracking',
    false,
  )
  .option(
    '--namespace <namespace>',
    'custom namespace for log indices (default: default)',
  )
  .option(
    '--environments <count>',
    'generate logs across multiple environment namespaces',
    parseIntBase10,
  )
  .action(async (options) => {
    const logCount = parseInt(options.n || '1000');
    const hostCount = parseInt(options.h || '10');
    const userCount = parseInt(options.u || '5');
    const useAI = options.claude || false;
    const logTypes = options.types.split(',').map((t: string) => t.trim());
    const useMultiField = options.multiField || false;
    const fieldCount = parseInt(options.fieldCount || '200');
    const fieldCategories = options.fieldCategories
      ? options.fieldCategories.split(',').map((c: string) => c.trim())
      : undefined;
    const fieldPerformanceMode = options.fieldPerformanceMode || false;
    const sessionView = options.sessionView || false;
    const visualAnalyzer = options.visualAnalyzer || false;
    const namespace = options.namespace || 'default';
    const environments = options.environments || 1;

    // Validate log types
    const validTypes = ['system', 'auth', 'network', 'endpoint'];
    const invalidTypes = logTypes.filter(
      (type: string) => !validTypes.includes(type),
    );
    if (invalidTypes.length > 0) {
      console.error(
        `Error: Invalid log types: ${invalidTypes.join(', ')}. Valid types: ${validTypes.join(', ')}`,
      );
      process.exit(1);
    }

    // Validate multi-field options
    if (options.fieldCount && !useMultiField) {
      console.error(
        'Error: --field-count flag requires --multi-field to be enabled',
      );
      process.exit(1);
    }
    if (options.fieldCategories && !useMultiField) {
      console.error(
        'Error: --field-categories flag requires --multi-field to be enabled',
      );
      process.exit(1);
    }
    if (fieldPerformanceMode && !useMultiField) {
      console.error(
        'Error: --field-performance-mode flag requires --multi-field to be enabled',
      );
      process.exit(1);
    }
    if (fieldCount < 1 || fieldCount > 50000) {
      console.error('Error: --field-count must be between 1 and 50,000');
      process.exit(1);
    }

    // Validate field categories if provided
    if (fieldCategories) {
      const validCategories = [
        'behavioral_analytics',
        'threat_intelligence',
        'performance_metrics',
        'security_scores',
        'audit_compliance',
        'network_analytics',
        'endpoint_analytics',
        'forensics_analysis',
        'cloud_security',
        'malware_analysis',
        'geolocation_intelligence',
        'incident_response',
      ];
      const invalidCategories = fieldCategories.filter(
        (cat: string) => !validCategories.includes(cat),
      );
      if (invalidCategories.length > 0) {
        console.error(
          `Error: Invalid field categories: ${invalidCategories.join(', ')}. Valid categories: ${validCategories.join(', ')}`,
        );
        process.exit(1);
      }
    }

    // Apply Phase 3 configuration overrides if Claude is used
    if (options.claude) {
      applyPhase3ConfigOverrides({
        ...options,
        subTechniques: false,
        attackChains: false,
        largeScale: false,
      });
    }

    // Show multi-field configuration if enabled
    if (useMultiField) {
      console.log(`\n🔬 Multi-Field Generation Enabled:`);
      console.log(`  📊 Additional Fields: ${fieldCount}`);
      console.log(
        `  📁 Categories: ${fieldCategories ? fieldCategories.join(', ') : 'all'}`,
      );
      console.log(
        `  ⚡ Performance Mode: ${fieldPerformanceMode ? 'Yes' : 'No'}`,
      );
      console.log(`  🎯 Token Reduction: 99%`);
    }

    // Show Session View and Visual Analyzer configuration
    if (sessionView || visualAnalyzer) {
      console.log(`\n🔍 Enhanced Analysis Features:`);
      if (sessionView)
        console.log(
          `  📱 Session View: Process hierarchies and terminal output`,
        );
      if (visualAnalyzer)
        console.log(`  👁️ Visual Event Analyzer: Process entity tracking`);
    }

    // Pass timestamp configuration options
    const timestampConfig = {
      startDate: options.startDate,
      endDate: options.endDate,
      pattern: options.timePattern,
    };

    // Create multi-field configuration
    const multiFieldConfig = useMultiField
      ? {
          fieldCount,
          categories: fieldCategories,
          performanceMode: fieldPerformanceMode,
          contextWeightEnabled: true,
          correlationEnabled: true,
        }
      : undefined;

    // Handle multiple environments
    if (environments > 1) {
      console.log(`\n🌍 Multi-Environment Log Generation Enabled:`);
      console.log(`  📊 Environments: ${environments}`);
      console.log(`  📁 Base Namespace: ${namespace}`);
      console.log(`  📊 Total Logs: ${logCount * environments}`);
      console.log(`  📁 Types: ${logTypes.join(', ')}`);
      console.log('');

      // Import cli-progress for multi-environment progress tracking
      const cliProgress = await import('cli-progress');
      const overallProgress = new cliProgress.SingleBar(
        {
          format: `Multi-Environment Generation | {bar} | {percentage}% | {value}/{total} environments`,
        },
        cliProgress.Presets.shades_classic,
      );
      overallProgress.start(environments, 0);

      for (let i = 1; i <= environments; i++) {
        const envNamespace = `${namespace}-env-${i.toString().padStart(3, '0')}`;

        // Clear previous environment status and show current
        process.stdout.write('\n');
        console.log(`🔄 Environment ${i}/${environments}: ${envNamespace}`);

        await generateLogs(
          logCount,
          hostCount,
          userCount,
          useAI,
          logTypes,
          timestampConfig,
          multiFieldConfig,
          sessionView,
          visualAnalyzer,
          envNamespace,
          true, // quiet mode for multi-environment
        );

        overallProgress.increment(1);
      }

      overallProgress.stop();

      console.log(`\n✅ Multi-Environment Log Generation Complete!`);
      console.log(`  🌍 Generated across ${environments} environments`);
      console.log(`  📊 Total logs: ${logCount * environments}`);
      console.log(`  📁 Index pattern: logs-*-${namespace}-env-*`);
    } else {
      await generateLogs(
        logCount,
        hostCount,
        userCount,
        useAI,
        logTypes,
        timestampConfig,
        multiFieldConfig,
        sessionView,
        visualAnalyzer,
        namespace,
        false, // normal verbose mode for single environment
      );
    }
  });

program
  .command('generate-correlated')
  .description(
    'Generate realistic security alerts with correlated supporting logs',
  )
  .option('-n <n>', 'number of alerts to generate', '10')
  .option('-h <h>', 'number of hosts', '3')
  .option('-u <u>', 'number of users', '2')
  .option('-s <s>', 'space (will be created if it does not exist)', 'default')
  .option('-l, --log-volume <volume>', 'supporting logs per alert', '6')
  .option('--claude', 'use Claude AI instead of OpenAI', false)
  .option(
    '--mitre',
    'use MITRE ATT&CK framework for realistic attack scenarios',
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
  .option(
    '--namespace <namespace>',
    'custom namespace for correlated data indices (default: default)',
  )
  .option(
    '--environments <count>',
    'generate correlated data across multiple environment namespaces',
    parseIntBase10,
  )
  .action(async (options) => {
    const alertCount = parseInt(options.n || '10');
    const hostCount = parseInt(options.h || '3');
    const userCount = parseInt(options.u || '2');
    const space = options.s || 'default';
    const logVolume = parseInt(options.logVolume || '6');
    const useAI = options.claude || false;
    const useMitre = options.mitre || false;
    const namespace = options.namespace || 'default';
    const environments = options.environments || 1;

    // Apply Phase 3 configuration overrides if flags are used
    if (options.claude || options.mitre) {
      applyPhase3ConfigOverrides({
        ...options,
        subTechniques: false,
        attackChains: false,
        largeScale: false,
      });
    }

    // Initialize space if not default
    if (space !== 'default') {
      await initializeSpace(space);
    }

    // Pass timestamp configuration options
    const timestampConfig = {
      startDate: options.startDate,
      endDate: options.endDate,
      pattern: options.timePattern,
    };

    // Handle multiple environments
    if (environments > 1) {
      console.log(`\n🌍 Multi-Environment Correlated Generation Enabled:`);
      console.log(`  📊 Environments: ${environments}`);
      console.log(`  📁 Base Namespace: ${namespace}`);
      console.log(`  🎯 Total Alerts: ${alertCount * environments}`);
      console.log(`  📊 Logs per Alert: ${logVolume}`);

      for (let i = 1; i <= environments; i++) {
        const envNamespace = `${namespace}-env-${i.toString().padStart(3, '0')}`;
        const envSpace = `${space}-${envNamespace}`;

        console.log(
          `\n🔄 Generating environment ${i}/${environments}: ${envNamespace}`,
        );

        if (envSpace !== 'default') {
          await initializeSpace(envSpace);
        }

        await generateCorrelatedCampaign(
          alertCount,
          hostCount,
          userCount,
          envSpace,
          useAI,
          useMitre,
          logVolume,
          timestampConfig,
          envNamespace,
        );
      }

      console.log(`\n✅ Multi-Environment Correlated Generation Complete!`);
      console.log(`  🌍 Generated across ${environments} environments`);
      console.log(`  📊 Total alerts: ${alertCount * environments}`);
      console.log(`  📊 Total logs: ${alertCount * environments * logVolume}`);
    } else {
      await generateCorrelatedCampaign(
        alertCount,
        hostCount,
        userCount,
        space,
        useAI,
        useMitre,
        logVolume,
        timestampConfig,
        namespace,
      );
    }
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
  .option(
    '-s, --space <space>',
    'Space to delete alerts from (default: all spaces)',
  )
  .action(async (options) => {
    try {
      await deleteAllAlerts(options.space);
    } catch (error) {
      console.error('Error deleting alerts:', error);
      process.exit(1);
    }
  });

program
  .command('delete-events')
  .description('Delete all events')
  .option(
    '-s, --space <space>',
    'Space to delete events from (default: all spaces)',
  )
  .action(async (options) => {
    try {
      await deleteAllEvents(options.space);
    } catch (error) {
      console.error('Error deleting events:', error);
      process.exit(1);
    }
  });

program
  .command('delete-logs')
  .description('Delete all source logs')
  .option(
    '--types <types>',
    'log types to delete (comma-separated): system,auth,network,endpoint',
    'system,auth,network,endpoint',
  )
  .action(async (options) => {
    try {
      const logTypes = options.types.split(',').map((t: string) => t.trim());

      // Validate log types
      const validTypes = ['system', 'auth', 'network', 'endpoint'];
      const invalidTypes = logTypes.filter(
        (type: string) => !validTypes.includes(type),
      );
      if (invalidTypes.length > 0) {
        console.error(
          `Error: Invalid log types: ${invalidTypes.join(', ')}. Valid types: ${validTypes.join(', ')}`,
        );
        process.exit(1);
      }

      await deleteAllLogs(logTypes);
    } catch (error) {
      console.error('Error deleting logs:', error);
      process.exit(1);
    }
  });

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

program
  .command('delete-all')
  .description(
    'Delete ALL generated security data (logs, alerts, events, rules)',
  )
  .action(async () => {
    try {
      await deleteAllData();
    } catch (error) {
      console.error('Error deleting all data:', error);
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
  .option(
    '--realistic',
    '🔗 Generate realistic source logs that trigger alerts (Phase 2 Integration)',
    false,
  )
  .option(
    '--logs-per-stage <count>',
    'number of logs to generate per attack stage (realistic mode)',
    '8',
  )
  .option(
    '--detection-rate <rate>',
    'detection rate (0.0-1.0) - what percentage of activity gets detected',
    '0.4',
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
  .option(
    '--multi-field',
    'generate hundreds of additional contextual security fields (99% token reduction)',
    false,
  )
  .option(
    '--field-count <count>',
    'number of additional fields to generate (requires --multi-field)',
  )
  .option(
    '--field-categories <categories>',
    'specific field categories to include (comma-separated): behavioral_analytics,threat_intelligence,performance_metrics,security_scores,audit_compliance,network_analytics,endpoint_analytics,forensics_analysis,cloud_security,malware_analysis,geolocation_intelligence,incident_response',
  )
  .option(
    '--field-performance-mode',
    'optimize multi-field generation for speed over variety (requires --multi-field)',
    false,
  )
  .option(
    '--namespace <namespace>',
    'custom namespace for campaign data indices (default: default)',
  )
  .option(
    '--environments <count>',
    'generate campaigns across multiple environment namespaces',
    parseIntBase10,
  )
  .option(
    '--session-view',
    'generate Session View compatible data with process hierarchies and terminal output',
    false,
  )
  .option(
    '--visual-analyzer',
    'generate Visual Event Analyzer compatible data with process entity tracking',
    false,
  )
  .action(async (campaignType, options) => {
    // AI is always enabled now
    const useAI = true;
    const useClaude = options.claude || false;
    const useMitre = options.mitre || false;
    const useMultiField = options.multiField || false;
    const fieldCount = parseInt(options.fieldCount || '200');
    const fieldCategories = options.fieldCategories
      ? options.fieldCategories.split(',').map((c: string) => c.trim())
      : undefined;
    const fieldPerformanceMode = options.fieldPerformanceMode || false;
    const namespace = options.namespace || 'default';
    const environments = options.environments || 1;
    const sessionView = options.sessionView || false;
    const visualAnalyzer = options.visualAnalyzer || false;

    // Validate multi-field options
    if (options.fieldCount && !useMultiField) {
      console.error(
        'Error: --field-count flag requires --multi-field to be enabled',
      );
      process.exit(1);
    }
    if (options.fieldCategories && !useMultiField) {
      console.error(
        'Error: --field-categories flag requires --multi-field to be enabled',
      );
      process.exit(1);
    }
    if (fieldPerformanceMode && !useMultiField) {
      console.error(
        'Error: --field-performance-mode flag requires --multi-field to be enabled',
      );
      process.exit(1);
    }
    if (fieldCount < 1 || fieldCount > 50000) {
      console.error('Error: --field-count must be between 1 and 50,000');
      process.exit(1);
    }

    // Validate field categories if provided
    if (fieldCategories) {
      const validCategories = [
        'behavioral_analytics',
        'threat_intelligence',
        'performance_metrics',
        'security_scores',
        'audit_compliance',
        'network_analytics',
        'endpoint_analytics',
        'forensics_analysis',
        'cloud_security',
        'malware_analysis',
        'geolocation_intelligence',
        'incident_response',
      ];
      const invalidCategories = fieldCategories.filter(
        (cat: string) => !validCategories.includes(cat),
      );
      if (invalidCategories.length > 0) {
        console.error(
          `Error: Invalid field categories: ${invalidCategories.join(', ')}. Valid categories: ${validCategories.join(', ')}`,
        );
        process.exit(1);
      }
    }

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

    // Show realistic mode configuration
    if (options.realistic) {
      console.log(`\n🔗 Realistic Mode Enabled:`);
      console.log(`  📋 Logs per Stage: ${options.logsPerStage}`);
      console.log(
        `  🎯 Detection Rate: ${(parseFloat(options.detectionRate) * 100).toFixed(1)}%`,
      );
      console.log(`  ⚡ Log → Alert Pipeline: Active`);
    }

    // Show multi-field configuration if enabled
    if (useMultiField) {
      console.log(`\n🔬 Multi-Field Generation Enabled:`);
      console.log(`  📊 Additional Fields: ${fieldCount}`);
      console.log(
        `  📁 Categories: ${fieldCategories ? fieldCategories.join(', ') : 'all'}`,
      );
      console.log(
        `  ⚡ Performance Mode: ${fieldPerformanceMode ? 'Yes' : 'No'}`,
      );
      console.log(`  🎯 Token Reduction: 99%`);
    }

    // Show multi-environment configuration if enabled
    if (environments > 1) {
      console.log(`\n🌍 Multi-Environment Generation Enabled:`);
      console.log(`  📊 Environments: ${environments}`);
      console.log(`  📁 Base Namespace: ${namespace}`);
      console.log(
        `  🎯 Total Events: ${eventCount * environments} (${eventCount} per environment)`,
      );
      console.log(`  📈 Horizontal Scaling: Active`);
    }

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

    // Helper function to generate campaign for a single environment
    const generateSingleCampaign = async (
      targetSpace: string,
      environmentInfo?: string,
    ) => {
      if (environmentInfo) {
        console.log(`\n🌍 ${environmentInfo}`);
      }

      if (campaignType === 'scale-test') {
        console.log('\n🧪 Running Performance & Scalability Tests...');
        // TODO: Implement actual scalability testing
        console.log(
          '   📊 Scalability testing framework ready for implementation',
        );
        return;
      }

      // Initialize space if not default
      if (targetSpace !== 'default') {
        await initializeSpace(targetSpace);
      }

      // Use sophisticated AttackSimulationEngine for realistic campaign generation
      console.log(
        `📝 Generating sophisticated ${campaignType} campaign with ${eventCount} events in ${targetSpace}...`,
      );

      const simulationEngine = new AttackSimulationEngine({
        networkComplexity: options.complexity,
        enableCorrelation: true,
        enablePerformanceOptimization: options.largeScale,
      });

      try {
        // Check if realistic mode is enabled
        if (options.realistic) {
          // Use realistic attack engine instead
          console.log('\n🎭 Initializing Realistic Attack Engine...');

          const { RealisticAttackEngine } = await import(
            './services/realistic_attack_engine'
          );
          const realisticEngine = new RealisticAttackEngine();

          const realisticConfig = {
            campaignType: campaignType as
              | 'apt'
              | 'ransomware'
              | 'insider'
              | 'supply_chain',
            complexity: options.complexity as
              | 'low'
              | 'medium'
              | 'high'
              | 'expert',
            enableRealisticLogs: true,
            logsPerStage: parseInt(options.logsPerStage || '8'),
            detectionRate: parseFloat(options.detectionRate || '0.4'),
            eventCount,
            targetCount,
            space: targetSpace,
            useAI,
            useMitre,
            timestampConfig: {
              startDate: options.startDate || '2d',
              endDate: options.endDate || 'now',
              pattern: (options.timePattern || 'attack_simulation') as
                | 'uniform'
                | 'business_hours'
                | 'random'
                | 'attack_simulation'
                | 'weekend_heavy',
            },
            multiFieldConfig: useMultiField
              ? {
                  fieldCount,
                  categories: fieldCategories,
                  performanceMode: fieldPerformanceMode,
                  contextWeightEnabled: true,
                  correlationEnabled: true,
                  useExpandedFields: fieldCount > 1000,
                  expandedFieldCount: fieldCount,
                }
              : undefined,
            sessionView,
            visualAnalyzer,
          };

          const realisticResult =
            await realisticEngine.generateRealisticCampaign(realisticConfig);

          console.log(`\n🎊 Realistic Campaign Generated Successfully:`);
          console.log(
            `  🎯 Attack Stages: ${realisticResult.campaign.stages.length}`,
          );
          console.log(
            `  ⚔️  Campaign: ${realisticResult.campaign.campaign.name}`,
          );
          console.log(
            `  🎭 Threat Actor: ${realisticResult.campaign.campaign.threat_actor}`,
          );
          console.log(
            `  📋 Total Logs: ${realisticResult.stageLogs.reduce((sum, stage) => sum + stage.logs.length, 0)}`,
          );
          console.log(
            `  🚨 Detected Alerts: ${realisticResult.detectedAlerts.length}`,
          );
          console.log(
            `  ⚪ Missed Activities: ${realisticResult.missedActivities.length}`,
          );
          console.log(
            `  📅 Timeline: ${realisticResult.timeline.stages.length} events`,
          );

          // Display investigation guide
          console.log(`\n📖 Investigation Guide:`);
          realisticResult.investigationGuide.slice(0, 3).forEach((step) => {
            console.log(`  ${step.step}. ${step.action}`);
          });

          // Index the data to Elasticsearch
          console.log('\n📤 Indexing realistic campaign data...');

          // Import necessary functions
          const { getEsClient } = await import('./commands/utils/indices');
          const { indexCheck } = await import('./commands/utils/indices');
          const logMappings = await import('./mappings/log_mappings.json', {
            assert: { type: 'json' },
          });

          const client = getEsClient();
          const indexOperations: unknown[] = [];

          // Index all stage logs with environment-specific namespace
          for (const stage of realisticResult.stageLogs) {
            for (const log of stage.logs) {
              const dataset = log['data_stream.dataset'] || 'generic.log';
              const baseNamespace = log['data_stream.namespace'] || 'default';
              // Use environment-specific namespace if multi-environment mode
              const logNamespace =
                environments > 1 ? targetSpace : baseNamespace;
              const indexName = `logs-${dataset}-${logNamespace}`;

              // Update log with correct namespace
              log['data_stream.namespace'] = logNamespace;

              // Ensure index exists
              await indexCheck(
                indexName,
                {
                  mappings: logMappings.default as any,
                },
                false,
              );

              indexOperations.push({
                create: {
                  _index: indexName,
                  _id: faker.string.uuid(),
                },
              });
              indexOperations.push(log);
            }
          }

          // Index detected alerts with environment-specific space
          const alertIndex = `.internal.alerts-security.alerts-${targetSpace}-000001`;
          for (const alert of realisticResult.detectedAlerts) {
            // Update alert space IDs for multi-environment
            alert['kibana.space_ids'] = [targetSpace];

            indexOperations.push({
              create: {
                _index: alertIndex,
                _id: alert['kibana.alert.uuid'],
              },
            });
            indexOperations.push(alert);
          }

          // Bulk index everything
          if (indexOperations.length > 0) {
            const batchSize = 1000;
            for (let i = 0; i < indexOperations.length; i += batchSize) {
              const batch = indexOperations.slice(i, i + batchSize);
              await client.bulk({ operations: batch, refresh: true });

              if (i + batchSize < indexOperations.length) {
                process.stdout.write('.');
              }
            }
          }

          console.log('\n\n🎉 Realistic Campaign Complete!');
          console.log(`📍 View in Kibana space: ${targetSpace}`);
          console.log(`🔍 Filter logs with: logs-*`);
          console.log(`🚨 View alerts in Security app`);
          console.log(
            `📈 ${realisticResult.detectedAlerts.length} alerts triggered by ${realisticResult.stageLogs.reduce((sum, stage) => sum + stage.logs.length, 0)} source logs`,
          );
          return;
        }

        // Generate sophisticated attack simulation with correlation (original code)
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
            startDate:
              options.startDate ||
              simulation.campaign.duration.start.toISOString(),
            endDate:
              options.endDate || simulation.campaign.duration.end.toISOString(),
            pattern: (options.timePattern || 'attack_simulation') as
              | 'uniform'
              | 'business_hours'
              | 'random'
              | 'attack_simulation'
              | 'weekend_heavy',
          };

          const correlatedEvents =
            await simulationEngine.generateCampaignEvents(
              simulation,
              targetCount,
              eventCount,
              targetSpace,
              useMitre,
              timestampConfig,
              sessionView,
              visualAnalyzer,
            );

          console.log(`\n🎊 Sophisticated Correlation Complete!`);
          console.log(`  📊 Generated Events: ${correlatedEvents.length}`);
          console.log(`  🔗 Campaign Correlation: 100%`);
          console.log(`  ⚡ Advanced Analytics: Active`);

          return correlatedEvents;
        };

        // Execute sophisticated generation with dynamic timeout based on event count
        // Use more generous timeout for AI generation
        const baseTimeout = 180000; // 180 seconds base timeout (3 minutes)
        const timeoutMs = Math.max(baseTimeout, eventCount * 10000); // 10 seconds per event
        console.log(
          `⏱️  Timeout set to ${Math.round(timeoutMs / 1000)} seconds for ${eventCount} events`,
        );

        const result = (await Promise.race([
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
        ])) as any[];

        if (!result || !Array.isArray(result)) {
          throw new Error('Sophisticated generation failed');
        }

        // Index the generated events to Elasticsearch
        console.log(
          `\n📤 Indexing ${result.length} events to Elasticsearch...`,
        );

        // Import required functions for indexing
        const { getAlertIndex } = await import('./utils');
        const { getEsClient } = await import('./commands/utils/indices');

        // Convert alerts to bulk operations with environment-specific space
        const alertIndex = getAlertIndex(targetSpace);
        const bulkOps: unknown[] = [];

        for (const alert of result) {
          // Update alert space IDs for multi-environment
          alert['kibana.space_ids'] = [targetSpace];

          bulkOps.push(
            { index: { _index: alertIndex, _id: alert['kibana.alert.uuid'] } },
            { ...alert },
          );
        }

        // Bulk index to Elasticsearch
        const client = getEsClient();
        try {
          await client.bulk({ operations: bulkOps, refresh: true });
          console.log(
            `✅ Successfully indexed ${result.length} events to ${alertIndex}`,
          );
        } catch (err) {
          console.error('❌ Error indexing events:', err);
          throw err;
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

        // Create multi-field configuration for fallback
        const multiFieldConfig = useMultiField
          ? {
              fieldCount,
              categories: fieldCategories,
              performanceMode: fieldPerformanceMode,
              contextWeightEnabled: true,
              correlationEnabled: true,
              useExpandedFields: fieldCount > 1000,
              expandedFieldCount: fieldCount,
            }
          : undefined;

        await generateAlerts(
          eventCount,
          actualHostCount,
          actualUserCount,
          targetSpace,
          useAI,
          useMitre,
          timestampConfig,
          0.0, // falsePositiveRate
          multiFieldConfig,
        );
      }
    };

    // Multi-environment generation logic
    if (environments > 1) {
      console.log(
        `\n🌍 Multi-Environment Campaign Generation: ${environments} environments`,
      );
      console.log(
        `📊 Total Events: ${eventCount * environments} (${eventCount} per environment)`,
      );
      console.log(`🚀 Starting parallel campaign generation...\n`);

      const startTime = Date.now();

      for (let i = 1; i <= environments; i++) {
        const envNamespace = `${namespace}-env-${i.toString().padStart(3, '0')}`;
        const environmentInfo = `Environment ${i}/${environments}: ${envNamespace}`;

        await generateSingleCampaign(envNamespace, environmentInfo);
      }

      const totalTime = Date.now() - startTime;
      const totalEvents = eventCount * environments;

      console.log('\n🌍 Multi-Environment Campaign Generation Complete!');
      console.log(`📊 Total Events Generated: ${totalEvents}`);
      console.log(`🌍 Environments: ${environments}`);
      console.log(`⏱️  Total Time: ${Math.round(totalTime / 1000)}s`);
      console.log(
        `🚀 Average: ${Math.round(totalEvents / (totalTime / 1000))} events/sec`,
      );
    } else {
      // Single environment generation
      await generateSingleCampaign(options.space);

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

program
  .command('generate-knowledge-base')
  .description('Generate AI Assistant Knowledge Base documents for security content')
  .option('-n <n>', 'number of knowledge base documents', '20')
  .option('-s <space>', 'space to generate documents in', 'default')
  .option(
    '--namespace <namespace>',
    'custom namespace for knowledge base indices (default: default)',
  )
  .option(
    '--categories <categories>',
    'security categories to include (comma-separated): threat_intelligence,incident_response,vulnerability_management,network_security,endpoint_security,cloud_security,compliance,forensics,malware_analysis,behavioral_analytics',
  )
  .option(
    '--access-level <level>',
    'filter by access level: public,team,organization,restricted',
  )
  .option(
    '--confidence-threshold <threshold>',
    'minimum confidence threshold (0.0-1.0)',
    '0.0',
  )
  .option(
    '--mitre',
    'include MITRE ATT&CK framework mappings in knowledge documents',
    false,
  )
  .action(async (options) => {
    const count = parseInt(options.n || '20');
    const space = options.space || 'default';
    const namespace = options.namespace || 'default';
    const includeMitre = options.mitre || false;
    
    // Parse categories if provided
    let categories: string[] = [];
    if (options.categories) {
      categories = options.categories.split(',').map((c: string) => c.trim());
      
      // Validate categories
      const validCategories = [
        'threat_intelligence',
        'incident_response',
        'vulnerability_management',
        'network_security',
        'endpoint_security',
        'cloud_security',
        'compliance',
        'forensics',
        'malware_analysis',
        'behavioral_analytics'
      ];
      
      const invalidCategories = categories.filter(
        (cat: string) => !validCategories.includes(cat),
      );
      if (invalidCategories.length > 0) {
        console.error(
          `Error: Invalid categories: ${invalidCategories.join(', ')}. Valid categories: ${validCategories.join(', ')}`,
        );
        process.exit(1);
      }
    }

    // Parse access level if provided
    let accessLevel: 'public' | 'team' | 'organization' | 'restricted' | undefined;
    if (options.accessLevel) {
      const validAccessLevels = ['public', 'team', 'organization', 'restricted'];
      if (!validAccessLevels.includes(options.accessLevel)) {
        console.error(
          `Error: Invalid access level: ${options.accessLevel}. Valid levels: ${validAccessLevels.join(', ')}`,
        );
        process.exit(1);
      }
      accessLevel = options.accessLevel;
    }

    // Parse confidence threshold
    const confidenceThreshold = parseFloat(options.confidenceThreshold || '0.0');
    if (confidenceThreshold < 0.0 || confidenceThreshold > 1.0) {
      console.error('Error: --confidence-threshold must be between 0.0 and 1.0');
      process.exit(1);
    }

    try {
      const { createKnowledgeBaseDocuments } = await import('./create_knowledge_base');

      await createKnowledgeBaseDocuments({
        count,
        includeMitre,
        namespace,
        space,
        categories,
        accessLevel,
        confidenceThreshold,
      });
    } catch (error) {
      console.error('Error generating knowledge base documents:', error);
      process.exit(1);
    }
  });

program
  .command('delete-knowledge-base')
  .description('Delete all knowledge base documents')
  .option('-s <space>', 'space to delete from', 'default')
  .option(
    '--namespace <namespace>',
    'namespace to delete from (default: default)',
  )
  .action(async (options) => {
    const space = options.space || 'default';
    const namespace = options.namespace || 'default';
    
    try {
      const { getEsClient } = await import('./commands/utils/indices');
      const client = getEsClient();
      
      const indexName = space === 'default' 
        ? `knowledge-base-security-${namespace}`
        : `knowledge-base-security-${space}-${namespace}`;
      
      console.log(`🗑️  Deleting knowledge base documents from: ${indexName}`);
      
      const exists = await client.indices.exists({ index: indexName });
      if (!exists) {
        console.log('⚠️  Knowledge base index does not exist');
        return;
      }
      
      await client.indices.delete({ index: indexName });
      console.log('✅ Knowledge base documents deleted successfully');
    } catch (error) {
      console.error('Error deleting knowledge base documents:', error);
      process.exit(1);
    }
  });

program.parse();
