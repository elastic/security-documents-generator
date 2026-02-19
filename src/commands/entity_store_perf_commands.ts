import { Command } from 'commander';
import { CommandModule } from './types';
import { parseIntBase10, promptForFileSelection, wrapAction } from './utils/cli_utils';
import {
  createPerfDataFile,
  listPerfDataFiles,
  uploadPerfDataFile,
  uploadPerfDataFileInterval,
  ENTITY_DISTRIBUTIONS,
  DistributionType,
} from './entity_store_perf';

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
        `Entity distribution type: equal (user/host/generic/service: 25% each), standard (user/host/generic/service: 33/33/33/1) (default: standard)`,
        'standard'
      )
      .description('Create performance data')
      .action(wrapAction(async (name, entityCount, logsPerEntity, startIndex, options) => {
        const distributionType = options.distribution as DistributionType;
        if (!ENTITY_DISTRIBUTIONS[distributionType]) {
          console.error(`❌ Invalid distribution type: ${distributionType}`);
          console.error(`   Available types: ${Object.keys(ENTITY_DISTRIBUTIONS).join(', ')}`);
          process.exit(1);
        }
        await createPerfDataFile({
          name,
          entityCount,
          logsPerEntity,
          startIndex,
          distribution: distributionType,
        });
      }));

    program
      .command('upload-perf-data')
      .argument('[file]', 'File to upload')
      .option('--index <index>', 'Destination index')
      .option('--delete', 'Delete all entities before uploading')
      .description('Upload performance data file')
      .action(wrapAction(async (file, options) => {
        await uploadPerfDataFile(
          file ?? (await promptForFileSelection(listPerfDataFiles())),
          options.index,
          options.delete
        );
      }));

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
        30
      )
      .option(
        '--samplingInterval <seconds>',
        'Sampling interval in seconds for metrics collection (default: 5)',
        parseIntBase10,
        5
      )
      .option('--noTransforms', 'Skip transform-related operations (for ESQL workflows)')
      .option('--index <index>', 'Destination index')
      .description('Upload performance data file')
      .action(wrapAction(async (file, options) => {
        await uploadPerfDataFileInterval(
          file ?? (await promptForFileSelection(listPerfDataFiles())),
          options.interval * 1000,
          options.count,
          options.deleteData,
          options.deleteEngines,
          options.transformTimeout * 60 * 1000,
          options.samplingInterval * 1000,
          options.noTransforms,
          options.index
        );
      }));
  },
};
