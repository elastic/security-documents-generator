import { type Command } from 'commander';
import { log } from '../../utils/logger.ts';
import fs from 'fs';
import { type CommandModule } from '../types.ts';
import { handleCommandError, parseIntBase10, wrapAction } from '../utils/cli_utils.ts';
import { deleteAllAlerts } from '../documents/index.ts';
import * as RiskEngine from '../../risk_engine/generate_perf_data.ts';
import * as RiskEngineIngest from '../../risk_engine/ingest.ts';
import { stressTest } from '../../risk_engine/esql_stress_test.ts';
import * as Pain from '../../risk_engine/scripted_metrics_stress_test.ts';
import { getRiskEnginePerfDataDir } from '../../utils/data_paths.ts';
import { captureAndWriteEsStats } from '../../risk_engine/capture_es_stats.ts';
import { runRiskScoringMetricsExtraction } from '../../risk_engine/extract_metrics_from_logs.ts';
import { runLeadGenMetricsExtraction } from '../../risk_engine/extract_lead_gen_metrics.ts';
import { collectResults } from '../../risk_engine/collect_results.ts';
import { compareResultFiles, printComparisonReport } from '../../risk_engine/compare_results.ts';
import { generateHostEvents } from '../../risk_engine/generate_host_events.ts';

export const riskEngineCommands: CommandModule = {
  register(program: Command) {
    program
      .command('esql-stress-test')
      .option('-p <parallel>', 'number of parallel runs', parseIntBase10)
      .description('Run several esql queries in parallel to stress ES')
      .action(
        wrapAction(async (options) => {
          const parallel = options.p || 1;
          await stressTest(parallel, { pageSize: 3500 });
          log.info(`Completed stress test with ${parallel} parallel runs`);
        }),
      );

    program
      .command('painless-stress-test')
      .option('-r <runs>', 'number of runs', parseIntBase10)
      .description('Run several scripted metric risk scoring queries in sequence')
      .action(
        wrapAction(async (options) => {
          const runs = options.r || 1;
          await Pain.stressTest(runs, { pageSize: 3500 });
          log.info(`Completed stress test with ${runs} runs`);
        }),
      );

    // Registers `risk-engine` subcommands including perf-scenario helpers
    // (`create-perf-scenario`, `upload-perf-scenario`, `create-scenario-p90-*`, …); see
    // `src/risk_engine/perf_scenario_commands.ts`.
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
      .action(
        wrapAction(async (entityMagnitude, cardinality) => {
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
          log.info(`Finished ${name} dataset`);
        }),
      );

    program
      .command('upload-risk-engine-dataset')
      .argument('[dir]', 'dir to upload')
      .description('Upload performance data files')
      .action(
        wrapAction(async (dataset) => {
          const BASE = getRiskEnginePerfDataDir();
          await deleteAllAlerts();
          const datasetPath = `${BASE}/${dataset}`;
          if (!fs.existsSync(datasetPath)) {
            log.info(`Skipping ${dataset}, directory not found: ${datasetPath}`);
            return;
          }
          const files = fs
            .readdirSync(datasetPath)
            .filter((f) => f.endsWith('.json'))
            .sort();
          if (files.length === 0) {
            log.info(`No JSON files found in ${datasetPath}, skipping.`);
            return;
          }
          log.info(`Uploading dataset ${dataset} (${files.length} file(s))`);
          for (const file of files) {
            const fullName = `${dataset}/${file.replace(/\.json$/, '')}`;
            try {
              await RiskEngine.uploadPerfData(fullName, 0, 1);
            } catch (e) {
              handleCommandError(e, `Failed uploading ${fullName}`);
            }
          }
          log.info(`Finished uploading dataset ${dataset}`);
        }),
      );

    program
      .command('upload-risk-engine-data-interval')
      .argument('<file>', 'path to the file')
      .argument('<interval>', 'upload interval in ms', parseIntBase10)
      .argument('<count>', 'number of uploads', parseIntBase10)
      .description('Upload performance data for the risk engine')
      .action((file, interval, count) => {
        RiskEngine.uploadPerfData(file, interval, count);
      });

    program
      .command('generate-host-events')
      .requiredOption('--entity-name <name>', 'host.name value for generated events')
      .requiredOption('--timestamp-start <iso>', 'start timestamp (ISO-8601)')
      .requiredOption('--timestamp-end <iso>', 'end timestamp (ISO-8601)')
      .option('--count <n>', 'number of events to generate (default: 1000)', parseIntBase10)
      .option('--index <name>', 'target index (default: logs-generic-default)')
      .option('--space <name>', 'Kibana space for security data view (default: default)')
      .description('Generate and ingest synthetic host events with configurable timestamp range')
      .action(
        wrapAction(async (options: Record<string, string | number | undefined>) => {
          await generateHostEvents({
            entityName: String(options.entityName),
            count: (options.count as number | undefined) ?? 1000,
            timestampStart: String(options.timestampStart),
            timestampEnd: String(options.timestampEnd),
            index: options.index ? String(options.index) : undefined,
            space: options.space ? String(options.space) : undefined,
          });
        }),
      );

    program
      .command('capture-es-stats')
      .argument('<output-path>', 'JSON file to write ES stats snapshot to')
      .description('Capture ES cluster health, node JVM/breaker/thread-pool stats, and index stats')
      .action(
        wrapAction(async (outputPath: string) => {
          await captureAndWriteEsStats(outputPath);
        }),
      );

    program
      .command('extract-risk-scoring-metrics')
      .argument('<log-file>', 'path to Kibana log file (use "-" for stdin)')
      .description('Parse risk_score_maintainer log lines and output structured JSON metrics')
      .action(
        wrapAction(async (logFile: string) => {
          await runRiskScoringMetricsExtraction(logFile);
        }),
      );

    program
      .command('extract-lead-gen-metrics')
      .argument('<log-file>', 'path to Kibana log file (use "-" for stdin)')
      .description(
        'Parse [LeadGeneration] / [LeadGenerationEngine] log lines and output structured JSON',
      )
      .action(
        wrapAction(async (logFile: string) => {
          await runLeadGenMetricsExtraction(logFile);
        }),
      );

    program
      .command('collect-results')
      .argument('<scenario-name>', 'name matching create-perf-scenario output directory')
      .requiredOption('--log-file <path>', 'path to Kibana log file')
      .option('--es-stats-pre <path>', 'pre-run ES stats JSON (from capture-es-stats)')
      .option('--es-stats-post <path>', 'post-run ES stats JSON (from capture-es-stats)')
      .option('--user-count <n>', 'user count parameter (for metadata)', parseIntBase10)
      .option('--host-count <n>', 'host count parameter (for metadata)', parseIntBase10)
      .option('--alerts-per-entity <n>', 'alerts per entity (for metadata)', parseIntBase10)
      .option('--resolution-pct <n>', 'resolution percentage (for metadata)', parseIntBase10)
      .description('Collect and merge log metrics + ES stats into a structured results JSON')
      .action(
        wrapAction(
          async (scenarioName: string, options: Record<string, string | number | undefined>) => {
            await collectResults({
              scenario: scenarioName,
              logFile: String(options.logFile),
              esStatsPreFile: options.esStatsPre ? String(options.esStatsPre) : undefined,
              esStatsPostFile: options.esStatsPost ? String(options.esStatsPost) : undefined,
              parameters: {
                userCount: options.userCount as number | undefined,
                hostCount: options.hostCount as number | undefined,
                alertsPerEntity: options.alertsPerEntity as number | undefined,
                resolutionPct: options.resolutionPct as number | undefined,
              },
            });
          },
        ),
      );

    program
      .command('compare-results')
      .argument('<baseline-json>', 'path to baseline results JSON')
      .argument('<current-json>', 'path to current results JSON')
      .option('--threshold <n>', 'regression threshold percentage (default: 20)', parseIntBase10)
      .description('Diff two results files and flag regressions > threshold%')
      .action(
        wrapAction(
          async (
            baselinePath: string,
            currentPath: string,
            options: Record<string, number | undefined>,
          ) => {
            const threshold = options.threshold ?? 20;
            const report = compareResultFiles(baselinePath, currentPath, threshold);
            printComparisonReport(report);
            // console.log(JSON.stringify(report, null, 2));
            if (report.hasRegressions) {
              log.error('Regressions detected — exiting with code 1');
              process.exit(1);
            }
          },
        ),
      );
  },
};
