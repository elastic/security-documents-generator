import { Command } from 'commander';
import { checkbox, input } from '@inquirer/prompts';
import { CommandModule } from './types';
import { parseIntBase10 } from './utils/cli_utils';
import { initializeSpace } from '../utils';
import { generateNewSeed } from '../constants';
import {
  cdrCommand,
  CDR_OPTIONS,
  CdrOption,
  ATTACK_DISCOVERY_HOSTS,
} from './cdr';

export const cdrCommands: CommandModule = {
  register(program: Command) {
    program
      .command('cdr')
      .description(
        'Generate CDR (Cloud Detection and Response) misconfigurations and/or vulnerabilities'
      )
      .option('--space <space>', 'Space to use', 'default')
      .action(async (options) => {
        if (options.space !== 'default') {
          await initializeSpace(options.space);
        }
        const answers = await checkbox<CdrOption | 'attack_discovery_hosts'>({
          message: 'Select data types to generate',
          choices: [
            {
              name: 'Misconfigurations (Wiz)',
              value: CDR_OPTIONS.misconfigurations,
              checked: true,
            },
            {
              name: 'Misconfigurations (Elastic CSP)',
              value: CDR_OPTIONS.csp_misconfigurations,
              checked: true,
            },
            {
              name: 'Vulnerabilities (Wiz)',
              value: CDR_OPTIONS.vulnerabilities,
              checked: true,
            },
            {
              name: `Include Attack Discovery hosts (${ATTACK_DISCOVERY_HOSTS.join(', ')})`,
              value: 'attack_discovery_hosts' as const,
              checked: false,
            },
          ],
        });

        const useAttackDiscoveryHosts = answers.includes('attack_discovery_hosts');
        const cdrOptions = answers.filter((a): a is CdrOption => a !== 'attack_discovery_hosts');

        const countInput = await input({
          message: 'How many documents of each type to generate',
          default: '50',
        });
        const count = parseIntBase10(countInput);
        if (!Number.isFinite(count) || count <= 0) {
          throw new Error('Count must be a positive integer');
        }

        const seed = generateNewSeed() + '';
        const seedAnswer = await input({
          message: 'Enter seed for stable random data or <enter> to use a new seed',
          default: seed,
        });

        await cdrCommand({
          options: cdrOptions,
          count,
          space: options.space,
          seed: parseIntBase10(seedAnswer),
          useAttackDiscoveryHosts,
        });
      });

    program
      .command('cdr-quick')
      .description('Quickly generate CDR misconfigurations and vulnerabilities with defaults')
      .option('--space <space>', 'Space to use', 'default')
      .option('--count <count>', 'Number of documents to generate', '50')
      .option(
        '--attack-discovery-hosts',
        'Include additional documents for attack discovery hosts',
        false
      )
      .action(async (options) => {
        if (options.space && options.space !== 'default') {
          await initializeSpace(options.space);
        }
        await cdrCommand({
          options: [
            CDR_OPTIONS.misconfigurations,
            CDR_OPTIONS.csp_misconfigurations,
            CDR_OPTIONS.vulnerabilities,
          ],
          count: parseIntBase10(options.count),
          space: options.space,
          seed: generateNewSeed(),
          useAttackDiscoveryHosts: options.attackDiscoveryHosts,
        });
      });
  },
};
