import { Command } from 'commander';
import { CommandModule } from './types';
import { kibanaApi } from '../utils';
import { generateAssetCriticality } from './asset_criticality';
import { generateInsights } from './insights';
import { generateLegacyRiskScore } from './legacy_risk_score';
import { singleEntityCommand } from './single_entity';

export const miscCommands: CommandModule = {
  register(program: Command) {
    program
      .command('test-risk-score')
      .description('Test risk score API')
      .action(kibanaApi.fetchRiskScore);

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

    const ENTITY_TYPES = ['user', 'host', 'service', 'generic'] as const;

    program
      .command('single-entity')
      .description(
        'Create a single entity with optional risk score, asset criticality, and privileged status'
      )
      .option('-s, --space <space>', 'Space', 'default')
      .option('-t, --type <type>', 'Entity type: user | host | service | generic (non-interactive)')
      .option('-n, --name <name>', 'Entity name')
      .option('--no-entity-store', 'Disable entity store & security data view (default: enabled)')
      .option('--no-risk-score', 'Skip create risk score flow (default: run)')
      .addHelpText(
        'after',
        `
Examples:
  ${program.name()} single-entity -t user                    # minimal: type only (default name, entity store & risk score)
  ${program.name()} single-entity -t host -n my-server       # custom name
  ${program.name()} single-entity -t service -s my-space     # different space
  ${program.name()} single-entity -t user --no-risk-score    # skip risk score flow
  ${program.name()} single-entity -t host --no-entity-store  # skip entity store & data view
  ${program.name()} single-entity -t generic -n x -s foo --no-risk-score   # combine options
`
      )
      .action(async (options) => {
        const entityType = options.type as (typeof ENTITY_TYPES)[number] | undefined;
        if (entityType && !ENTITY_TYPES.includes(entityType)) {
          console.error(
            `Invalid --type: ${entityType}. Must be one of: ${ENTITY_TYPES.join(', ')}`
          );
          process.exit(1);
        }
        await singleEntityCommand({
          space: options.space,
          entityType,
          name: options.name,
          enableEntityStore: options.entityStore,
          createRiskScore: options.riskScore,
        });
      });
  },
};
