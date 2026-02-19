import { Command } from 'commander';
import fs from 'fs';
import { CommandModule } from '../types';
import { handleCommandError, parseIntBase10, wrapAction } from '../utils/cli_utils';
import { deleteAllAlerts } from '../documents';
import * as RiskEngine from '../../risk_engine/generate_perf_data';
import * as RiskEngineIngest from '../../risk_engine/ingest';
import { stressTest } from '../../risk_engine/esql_stress_test';
import * as Pain from '../../risk_engine/scripted_metrics_stress_test';

export const riskEngineCommands: CommandModule = {
  register(program: Command) {
    program
      .command('esql-stress-test')
      .option('-p <parallel>', 'number of parallel runs', parseIntBase10)
      .description('Run several esql queries in parallel to stress ES')
      .action(wrapAction(async (options) => {
        const parallel = options.p || 1;
        await stressTest(parallel, { pageSize: 3500 });
        console.log(`Completed stress test with ${parallel} parallel runs`);
      }));

    program
      .command('painless-stress-test')
      .option('-r <runs>', 'number of runs', parseIntBase10)
      .description('Run several scripted metric risk scoring queries in sequence')
      .action(wrapAction(async (options) => {
        const runs = options.r || 1;
        await Pain.stressTest(runs, { pageSize: 3500 });
        console.log(`Completed stress test with ${runs} runs`);
      }));

    RiskEngineIngest.getCmd(program);

    program
      .command('create-risk-engine-data')
      .argument('<name>', 'name of the file')
      .argument('<entity-count>', 'number of entities', parseIntBase10)
      .argument('<alerts-per-entity>', 'number of alerts per entity', parseIntBase10)
      .description('Create performance data for the risk engine')
      .action((name, entityCount, alertsPerEntity) => {
        RiskEngine.createPerfDataFile({ name, entityCount, alertsPerEntity });
      });

    program
      .command('create-risk-engine-dataset')
      .argument('<entity-magnitude>', 'entity magnitude to create: small, medium, large')
      .argument('<cardinality>', 'cardinality level: low, mid, high, extreme')
      .description('Create performance datasets for the risk engine')
      .action(wrapAction(async (entityMagnitude, cardinality) => {
        const entityCount =
          entityMagnitude === 'small'
            ? 100
            : entityMagnitude === 'medium'
              ? 1000
              : entityMagnitude === 'large'
                ? 10000
                : 1000;
        const alertsPerEntity =
          cardinality === 'low'
            ? 100
            : cardinality === 'mid'
              ? 1000
              : cardinality === 'high'
                ? 10000
                : cardinality === 'extreme'
                  ? 100000
                  : 1000;
        const name = `${entityMagnitude || 'medium'}_${cardinality || 'mid'}Cardinality`;
        await RiskEngine.createPerfDataFile({ name, entityCount, alertsPerEntity });
        console.log(`Finished ${name} dataset`);
      }));

    program
      .command('upload-risk-engine-dataset')
      .argument('[dir]', 'dir to upload')
      .description('Upload performance data files')
      .action(wrapAction(async (dataset) => {
        const BASE = process.cwd() + '/data/risk_engine/perf';
        await deleteAllAlerts();
        const datasetPath = `${BASE}/${dataset}`;
        if (!fs.existsSync(datasetPath)) {
          console.log(`Skipping ${dataset}, directory not found: ${datasetPath}`);
          return;
        }
        const files = fs
          .readdirSync(datasetPath)
          .filter((f) => f.endsWith('.json'))
          .sort();
        if (files.length === 0) {
          console.log(`No JSON files found in ${datasetPath}, skipping.`);
          return;
        }
        console.log(`Uploading dataset ${dataset} (${files.length} file(s))`);
        for (const file of files) {
          const fullName = `${dataset}/${file.replace(/\.json$/, '')}`;
          try {
            await RiskEngine.uploadPerfData(fullName, 0, 1);
          } catch (e) {
            handleCommandError(e, `Failed uploading ${fullName}`);
          }
        }
        console.log(`Finished uploading dataset ${dataset}`);
      }));

    program
      .command('upload-risk-engine-data-interval')
      .argument('<file>', 'path to the file')
      .argument('<interval>', 'upload interval in ms', parseIntBase10)
      .argument('<count>', 'number of uploads', parseIntBase10)
      .description('Upload performance data for the risk engine')
      .action((file, interval, count) => {
        RiskEngine.uploadPerfData(file, interval, count);
      });
  },
};
