import { Command } from 'commander';
import { CommandModule } from '../types';
import { parseIntBase10, wrapAction } from '../utils/cli_utils';
import { runOrgData, runOrgDataQuick, getOrgDataHelp } from './org_data';
import { getAvailableIntegrations } from './integrations';

export const orgDataCommands: CommandModule = {
  register(program: Command) {
    program
      .command('generate-correlated-organization-data')
      .alias('org-data')
      .alias('organization')
      .description('Generate correlated organization security integration data')
      .option('--name <name>', 'Company name', 'Acme CRM')
      .option('--space <space>', 'Kibana space', 'default')
      .option('--seed <seed>', 'Random seed for reproducibility', parseIntBase10)
      .option(
        '--integrations <list>',
        `Comma-separated integrations to enable (available: ${getAvailableIntegrations().join(', ')})`
      )
      .option('--all', 'Generate all integrations regardless of company size')
      .option('--detection-rules', 'Include sample detection rules for applicable integrations')
      .addHelpText('after', '\n' + getOrgDataHelp())
      .action(
        wrapAction(async (options) => {
          await runOrgData({
            size: 'medium',
            name: options.name,
            space: options.space,
            seed: options.seed,
            integrations: options.integrations,
            all: options.all,
            detectionRules: options.detectionRules,
          });
        })
      );

    program
      .command('generate-correlated-organization-data-quick')
      .alias('org-data-quick')
      .alias('organization-quick')
      .description(
        'Quick correlated organization data generation with defaults (medium size, all integrations)'
      )
      .option('--space <space>', 'Kibana space', 'default')
      .action(
        wrapAction(async (options) => {
          await runOrgDataQuick(options.space);
        })
      );
  },
};
