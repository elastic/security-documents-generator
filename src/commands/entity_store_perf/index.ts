import { type Command } from 'commander';
import { type CommandModule } from '../types.ts';
import { log } from '../../utils/logger.ts';
import { parseIntBase10, promptForFileSelection, wrapAction } from '../utils/cli_utils.ts';
import {
  createPerfDataFile,
  listPerfDataFiles,
  uploadPerfDataFile,
  uploadPerfDataFileInterval,
  isValidDistributionType,
  type DistributionType,
  ENTITY_DISTRIBUTIONS,
} from './entity_store_perf.ts';

export const entityStorePerfCommands: CommandModule = {
  register(program: Command) {
    program
      .command('create-perf-data')
      .argument('<name>', 'name of the file')
      .argument('<entity-count>', 'number of entities', parseIntBase10)
      .argument('<logs-per-entity>', 'number of logs per entity', parseIntBase10)
      .argument('[start-index]', 'for sequential data, which index to start at', parseIntBase10, 0)
      .option(
        '--distribution <type>',
        'Entity distribution: equal (25% each type), standard (33/33/33/1%), absolute (requires --user-count, --host-count, --service-count, --generic-count; must sum to entity-count) (default: standard)',
        'standard',
      )
      .option(
        '--user-count <n>',
        'With --distribution absolute: number of user entities',
        parseIntBase10,
      )
      .option(
        '--host-count <n>',
        'With --distribution absolute: number of host entities',
        parseIntBase10,
      )
      .option(
        '--service-count <n>',
        'With --distribution absolute: number of service entities',
        parseIntBase10,
      )
      .option(
        '--generic-count <n>',
        'With --distribution absolute: number of generic entities',
        parseIntBase10,
      )
      .description('Create performance data')
      .action(
        wrapAction(async (name, entityCount, logsPerEntity, startIndex, options) => {
          const distributionType = options.distribution as DistributionType;
          if (!isValidDistributionType(distributionType)) {
            log.error(`❌ Invalid distribution type: ${distributionType}`);
            log.error(`   Available types: ${Object.keys(ENTITY_DISTRIBUTIONS).join(', ')}`);
            process.exit(1);
          }

          const userCount = options.userCount as number | undefined;
          const hostCount = options.hostCount as number | undefined;
          const serviceCount = options.serviceCount as number | undefined;
          const genericCount = options.genericCount as number | undefined;
          const anyCountOptionSet =
            userCount !== undefined ||
            hostCount !== undefined ||
            serviceCount !== undefined ||
            genericCount !== undefined;

          if (distributionType === 'absolute') {
            if (
              userCount === undefined ||
              hostCount === undefined ||
              serviceCount === undefined ||
              genericCount === undefined
            ) {
              log.error(
                '❌ --distribution absolute requires --user-count, --host-count, --service-count, and --generic-count',
              );
              process.exit(1);
            }
            await createPerfDataFile({
              name,
              entityCount,
              logsPerEntity,
              startIndex,
              distribution: 'absolute',
              explicitEntityCounts: {
                user: userCount,
                host: hostCount,
                service: serviceCount,
                generic: genericCount,
              },
            });
          } else {
            if (anyCountOptionSet) {
              log.error(
                '❌ --user-count, --host-count, --service-count, and --generic-count are only valid with --distribution absolute',
              );
              process.exit(1);
            }
            await createPerfDataFile({
              name,
              entityCount,
              logsPerEntity,
              startIndex,
              distribution: distributionType,
            });
          }
        }),
      );

    program
      .command('upload-perf-data')
      .argument('[file]', 'File to upload')
      .option('--index <index>', 'Destination index')
      .option('--delete', 'Delete all entities before uploading')
      .option('--metrics', 'Generate metrics logs for baseline comparison')
      .option(
        '--samplingInterval <seconds>',
        'Sampling interval in seconds for metrics collection (default: 5)',
        parseIntBase10,
        5,
      )
      .option(
        '--transformTimeout <timeout>',
        'Timeout in minutes for waiting for generic transform to complete in metrics mode (default: 30)',
        parseIntBase10,
        30,
      )
      .option('--noTransforms', 'Use Entity Store V2 / ESQL flow (no transforms)')
      .description('Upload performance data file')
      .action(
        wrapAction(async (file, options) => {
          await uploadPerfDataFile(
            file ?? (await promptForFileSelection(listPerfDataFiles())),
            options.index,
            options.delete,
            options.noTransforms,
            {
              enabled: options.metrics,
              samplingIntervalMs: options.samplingInterval * 1000,
              transformTimeoutMs: options.transformTimeout * 60 * 1000,
            },
          );
        }),
      );

    program
      .command('upload-perf-data-interval')
      .argument('[file]', 'File to upload')
      .option('--interval <interval>', 'interval in s', parseIntBase10, 30)
      .option('--count <count>', 'number of times to upload', parseIntBase10, 10)
      .option('--deleteData', 'Delete all entities before uploading')
      .option('--deleteEngines', 'Delete all entities before uploading')
      .option(
        '--transformTimeout <timeout>',
        'Timeout in minutes for waiting for generic transform to complete (default: 30)',
        parseIntBase10,
        30,
      )
      .option(
        '--samplingInterval <seconds>',
        'Sampling interval in seconds for metrics collection (default: 5)',
        parseIntBase10,
        5,
      )
      .option(
        '--noTransforms',
        'Run Entity Store V2 / ESQL flow (enable V2, install V2, no transforms, v2 indices)',
      )
      .option('--index <index>', 'Destination index')
      .description('Upload performance data file')
      .action(
        wrapAction(async (file, options) => {
          await uploadPerfDataFileInterval(
            file ?? (await promptForFileSelection(listPerfDataFiles())),
            options.interval * 1000,
            options.count,
            options.deleteData,
            options.deleteEngines,
            options.transformTimeout * 60 * 1000,
            options.samplingInterval * 1000,
            options.noTransforms,
            options.index,
          );
        }),
      );
  },
};
