import { Command } from 'commander';
import { CommandModule } from '../types';
import { parseIntBase10, wrapAction } from '../utils/cli_utils';
import { runOrganization, runOrganizationQuick, getOrganizationHelp } from './organization';
import { getAvailableIntegrations } from './integrations';

export const organizationCommands: CommandModule = {
  register(program: Command) {
    program
      .command('organization')
      .description('Generate realistic organization security integration data')
      .option('--name <name>', 'Company name', 'Acme CRM')
      .option('--space <space>', 'Kibana space', 'default')
      .option('--seed <seed>', 'Random seed for reproducibility', parseIntBase10)
      .option(
        '--integrations <list>',
        `Comma-separated integrations to enable (available: ${getAvailableIntegrations().join(', ')})`
      )
      .option('--all', 'Generate all integrations regardless of company size')
      .option('--detection-rules', 'Include sample detection rules for applicable integrations')
      .addHelpText('after', '\n' + getOrganizationHelp())
      .action(
        wrapAction(async (options) => {
          await runOrganization({
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
      .command('organization-quick')
      .description('Quick organization generation with defaults (medium size, all integrations)')
      .option('--space <space>', 'Kibana space', 'default')
      .action(
        wrapAction(async (options) => {
          await runOrganizationQuick(options.space);
        })
      );
  },
};
