import { type Command } from 'commander';
import { type CommandModule } from '../types.ts';
import { log } from '../../utils/logger.ts';
import { kibanaApi } from '../../utils/index.ts';
import { generateAssetCriticality } from './asset_criticality.ts';
import { generateAiInsights } from './insights.ts';
import { generateLegacyRiskScore } from './legacy_risk_score.ts';
import { singleEntityCommand } from './single_entity.ts';
import { ensureSpace } from '../../utils/index.ts';
import { parseOptionInt, wrapAction } from '../utils/cli_utils.ts';
import { ENTITY_TYPES, type EntityType } from '../../types/entities.ts';

export const miscCommands: CommandModule = {
  register(program: Command) {
    program
      .command('test-risk-score')
      .description('Test risk score API')
      .action(kibanaApi.fetchRiskScore);

    program
      .command('generate-entity-ai-insights')
      .option('-s <s>', 'space', 'default')
      .option('-h <h>', 'number of hosts (default 10)')
      .option('-u <u>', 'number of users (default 10)')
      .option('-a <a>', 'number of anomaly records per job id (default 10)')
      .option(
        '--no-anomalies',
        'create entity data without generating ML jobs or anomalous behavior records',
      )
      .option(
        '--no-anomaly-data',
        'create entity data and ML modules without starting datafeeds or generating anomalous behavior records',
      )
      .option('--v2', 'generate v2 ML anomaly data with user.id, host.id, and event.module fields')
      .option(
        '--correlate-with-entity-store',
        'correlate generated anomaly data with entities from the entity store',
      )
      .description(
        'Generate vulnerabilities, misconfigurations, ML jobs, and anomalous behavior for entities.',
      )
      .action(
        wrapAction(async (options) => {
          const users = parseOptionInt(options.u, 10);
          const hosts = parseOptionInt(options.h, 10);
          const space = await ensureSpace(options.s);
          const records = parseOptionInt(options.a, 10);
          const generateAnomalies = options.anomalies;
          const generateAnomalyData = !options.anomalyData;
          await generateAiInsights({
            users,
            hosts,
            records,
            space,
            generateAnomalies,
            generateAnomalyData,
            v2: options.v2 ?? false,
            correlateWithEntityStore: Boolean(options.correlateWithEntityStore),
          });
        }),
      );

    program
      .command('generate-asset-criticality')
      .option('-h <h>', 'number of hosts')
      .option('-u <u>', 'number of users')
      .option('-s <s>', 'space')
      .description('Generate asset criticality for entities')
      .action(
        wrapAction(async (options) => {
          const users = parseOptionInt(options.u, 10);
          const hosts = parseOptionInt(options.h, 10);
          const space = await ensureSpace(options.s);
          await generateAssetCriticality({ users, hosts, space });
        }),
      );

    program
      .command('generate-legacy-risk-score')
      .description('Install legacy risk score and generate data')
      .action(generateLegacyRiskScore);

    program
      .command('single-entity')
      .description(
        'Create a single entity with optional risk score, asset criticality, and privileged status',
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
`,
      )
      .action(
        wrapAction(async (options) => {
          const entityType = options.type as EntityType | undefined;
          if (entityType && !ENTITY_TYPES.includes(entityType)) {
            log.error(`Invalid --type: ${entityType}. Must be one of: ${ENTITY_TYPES.join(', ')}`);
            process.exit(1);
          }
          await singleEntityCommand({
            space: options.space,
            entityType,
            name: options.name,
            enableEntityStore: options.entityStore,
            createRiskScore: options.riskScore,
          });
        }),
      );
  },
};
