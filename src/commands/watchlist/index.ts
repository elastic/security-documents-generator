import { type Command } from 'commander';
import { type CommandModule } from '../types.ts';
import { parseOptionInt, wrapAction } from '../utils/cli_utils.ts';
import { log } from '../../utils/logger.ts';
import { generateAndUploadWatchlistSourceData } from '../../watchlist/generate_source_data.ts';
import {
  setupWatchlistScenario,
  teardownWatchlistScenario,
  triggerWatchlistSync,
  waitForWatchlistSync,
  INDEX_BROAD_SCENARIO,
  INDEX_SELECTIVE_SCENARIO,
  MULTI_WATCHLIST_SCENARIO,
  DELETION_STRESS_SCENARIO,
} from '../../watchlist/setup_scenario.ts';

export const watchlistCommands: CommandModule = {
  register(program: Command) {
    const watchlist = program
      .command('watchlist')
      .description('Watchlist performance testing utilities');

    // -----------------------------------------------------------------------
    // watchlist create-source-data
    // -----------------------------------------------------------------------
    watchlist
      .command('create-source-data')
      .argument('<name>', 'label for this dataset (used in log messages)')
      .option('--index <name>', 'ES index to write into', 'perf-watchlist-source')
      .option('--identifier-field <field>', 'field holding the entity identifier', 'user.name')
      .option('--doc-count <n>', 'total documents to generate', '100000')
      .option('--entity-count <n>', 'distinct entity values in the pool', '10000')
      .option(
        '--prefix <s>',
        'entity name prefix matching create-perf-data naming (e.g. "p90-baseline")',
      )
      .option('--entity-type <t>', 'pool type to sample: user or host', 'user')
      .option(
        '--match-rate <f>',
        'fraction of docs matching event.outcome="success" (0–1). 0.02 = 2% success rate',
        '1.0',
      )
      .option('--no-extra-fields', 'omit extra ECS fields (source.ip, agent.id)')
      .description(
        'Generate and stream watchlist source index documents directly into ES. ' +
          'Uses the shared identity pool so entity names match entity store entities.',
      )
      .action(
        wrapAction(async (name: string, options: Record<string, string | boolean | undefined>) => {
          const result = await generateAndUploadWatchlistSourceData({
            name,
            indexName: options.index as string,
            identifierField: options.identifierField as string,
            docCount: parseOptionInt(options.docCount as string, 100_000),
            entityCount: parseOptionInt(options.entityCount as string, 10_000),
            prefix: options.prefix as string | undefined,
            entityType: (options.entityType as 'user' | 'host') ?? 'user',
            matchRate: parseFloat((options.matchRate as string) ?? '1.0'),
            extraFields: options.extraFields !== false,
          });
          log.info(
            `Done: ${result.docCount} docs uploaded, ${result.distinctEntities} distinct entities.`,
          );
        }),
      );

    // -----------------------------------------------------------------------
    // watchlist setup-scenario
    // -----------------------------------------------------------------------
    watchlist
      .command('setup-scenario')
      .argument(
        '<scenario>',
        'pre-defined scenario: index-broad | index-selective | multi-watchlist | deletion-stress',
      )
      .option('--space <s>', 'Kibana space', 'default')
      .description(
        'Create watchlist(s) and entity source(s) for a pre-defined performance scenario.',
      )
      .action(
        wrapAction(async (scenario: string, options: Record<string, string | undefined>) => {
          const space = options.space ?? 'default';

          switch (scenario) {
            case 'index-broad': {
              const result = await setupWatchlistScenario({ ...INDEX_BROAD_SCENARIO, space });
              log.info(`Scenario "${scenario}" ready: watchlistId=${result.watchlistId}`);
              process.stdout.write(JSON.stringify(result, null, 2) + '\n');
              break;
            }
            case 'index-selective': {
              const result = await setupWatchlistScenario({ ...INDEX_SELECTIVE_SCENARIO, space });
              log.info(`Scenario "${scenario}" ready: watchlistId=${result.watchlistId}`);
              process.stdout.write(JSON.stringify(result, null, 2) + '\n');
              break;
            }
            case 'multi-watchlist': {
              const results = [];
              for (const config of MULTI_WATCHLIST_SCENARIO) {
                const result = await setupWatchlistScenario({ ...config, space });
                results.push(result);
                log.info(`  Created watchlist: ${result.watchlistName} (${result.watchlistId})`);
              }
              process.stdout.write(JSON.stringify(results, null, 2) + '\n');
              break;
            }
            case 'deletion-stress': {
              const result = await setupWatchlistScenario({ ...DELETION_STRESS_SCENARIO, space });
              log.info(`Scenario "${scenario}" ready: watchlistId=${result.watchlistId}`);
              log.info(
                'Next steps:\n' +
                  '  1. Seed source index: yarn start watchlist create-source-data deletion-initial --index perf-watchlist-deletion-source --doc-count 50000 --entity-count 50000\n' +
                  `  2. Trigger sync:       yarn start watchlist sync ${result.watchlistId}\n` +
                  '  3. Wait for sync to complete (watch [WatchlistSync] logs)\n' +
                  '  4. Delete 80% of source docs via ES delete-by-query\n' +
                  `  5. Trigger sync again: yarn start watchlist sync ${result.watchlistId}`,
              );
              process.stdout.write(JSON.stringify(result, null, 2) + '\n');
              break;
            }
            default:
              log.error(
                `Unknown scenario "${scenario}". Valid: index-broad, index-selective, multi-watchlist, deletion-stress`,
              );
              process.exit(1);
          }
        }),
      );

    // -----------------------------------------------------------------------
    // watchlist teardown-scenario
    // -----------------------------------------------------------------------
    watchlist
      .command('teardown-scenario')
      .argument('<watchlist-id>', 'watchlist ID returned by setup-scenario')
      .option('--space <s>', 'Kibana space', 'default')
      .description('Delete a watchlist created by setup-scenario.')
      .action(
        wrapAction(async (watchlistId: string, options: Record<string, string | undefined>) => {
          await teardownWatchlistScenario(watchlistId, options.space ?? 'default');
        }),
      );

    // -----------------------------------------------------------------------
    // watchlist sync
    // -----------------------------------------------------------------------
    watchlist
      .command('sync')
      .argument('<watchlist-id>', 'watchlist ID to sync')
      .option('--space <s>', 'Kibana space', 'default')
      .description('Trigger an ad-hoc sync for a watchlist.')
      .action(
        wrapAction(async (watchlistId: string, options: Record<string, string | undefined>) => {
          await triggerWatchlistSync(watchlistId, options.space ?? 'default');
        }),
      );

    watchlist
      .command('wait-for-sync')
      .argument('<watchlist-id>', 'watchlist ID to monitor')
      .option('--space <s>', 'Kibana space', 'default')
      .option('--timeout-ms <n>', 'maximum wait time in ms', '1800000')
      .option('--poll-interval-ms <n>', 'poll interval in ms', '10000')
      .option('--stable-polls <n>', 'stable poll count threshold before completion', '3')
      .description('Poll watchlist sync progress until complete or member count is stable')
      .action(
        wrapAction(async (watchlistId: string, options: Record<string, string | undefined>) => {
          const result = await waitForWatchlistSync({
            watchlistId,
            space: options.space ?? 'default',
            timeoutMs: parseOptionInt(options.timeoutMs, 1_800_000),
            pollIntervalMs: parseOptionInt(options.pollIntervalMs, 10_000),
            stablePollsRequired: parseOptionInt(options.stablePolls, 3),
          });
          process.stdout.write(JSON.stringify(result, null, 2) + '\n');
        }),
      );
  },
};
