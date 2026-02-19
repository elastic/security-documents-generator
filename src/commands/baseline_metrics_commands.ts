import { Command } from 'commander';
import { CommandModule } from './types';
import { parseIntBase10, wrapAction } from './utils/cli_utils';
import {
  extractBaselineMetrics,
  saveBaseline,
  loadBaseline,
  listBaselines,
  loadBaselineWithPattern,
} from './utils/baseline_metrics';
import {
  compareMetrics,
  formatComparisonReport,
  buildComparisonThresholds,
} from './utils/metrics_comparison';

export const baselineMetricsCommands: CommandModule = {
  register(program: Command) {
    program
      .command('create-baseline')
      .argument('<log-prefix>', 'Prefix of log files (e.g., tmp-all-2025-11-13T15:03:32)')
      .option('-e <entityCount>', 'Number of entities', parseIntBase10)
      .option('-l <logsPerEntity>', 'Number of logs per entity', parseIntBase10)
      .option('-u <uploadCount>', 'Number of uploads (for interval tests)', parseIntBase10)
      .option('-i <intervalMs>', 'Interval in milliseconds (for interval tests)', parseIntBase10)
      .option('-n <name>', 'Custom name for baseline (defaults to log-prefix)')
      .description('Extract metrics from logs and create a baseline')
      .action(
        wrapAction(async (logPrefix, options) => {
          const testConfig = {
            entityCount: options.e || 0,
            logsPerEntity: options.l || 0,
            uploadCount: options.u,
            intervalMs: options.i,
          };
          console.log(`Extracting baseline metrics from logs with prefix: ${logPrefix}`);
          const baseline = await extractBaselineMetrics(logPrefix, testConfig);
          if (options.n) {
            baseline.testName = options.n;
          }
          const filepath = saveBaseline(baseline);
          console.log(`\n✅ Baseline created successfully!`);
          console.log(`File: ${filepath}`);
          console.log(`\nSummary:`);
          console.log(`  Search Latency (avg): ${baseline.metrics.searchLatency.avg.toFixed(2)}ms`);
          console.log(`  Intake Latency (avg): ${baseline.metrics.intakeLatency.avg.toFixed(2)}ms`);
          console.log(`  CPU (avg): ${baseline.metrics.cpu.avg.toFixed(2)}%`);
          console.log(`  Memory Heap (avg): ${baseline.metrics.memory.avgHeapPercent.toFixed(2)}%`);
          console.log(
            `  Throughput (avg): ${baseline.metrics.throughput.avgDocumentsPerSecond.toFixed(2)} docs/sec`
          );
          console.log(`  Errors: ${baseline.metrics.errors.totalFailures}`);
        })
      );

    program
      .command('list-baselines')
      .description('List all available baselines')
      .action(() => {
        const baselines = listBaselines();
        if (baselines.length === 0) {
          console.log('No baselines found.');
          return;
        }
        console.log(`\nFound ${baselines.length} baseline(s):\n`);
        baselines.forEach((filepath: string, index: number) => {
          try {
            const baseline = loadBaseline(filepath);
            console.log(`${index + 1}. ${baseline.testName}`);
            console.log(`   Timestamp: ${baseline.timestamp}`);
            console.log(`   File: ${filepath}`);
            console.log('');
          } catch {
            console.log(`${index + 1}. ${filepath} (error loading)`);
          }
        });
      });

    program
      .command('compare-metrics')
      .argument('<current-log-prefix>', 'Prefix of current run log files')
      .option('-b <baseline>', 'Path to baseline file (or use latest if not specified)')
      .option('-e <entityCount>', 'Number of entities for current run', parseIntBase10)
      .option('-l <logsPerEntity>', 'Number of logs per entity for current run', parseIntBase10)
      .option('-u <uploadCount>', 'Number of uploads for current run', parseIntBase10)
      .option('-i <intervalMs>', 'Interval in milliseconds for current run', parseIntBase10)
      .option('--degradation-threshold <percent>', 'Degradation threshold percentage', parseFloat)
      .option('--warning-threshold <percent>', 'Warning threshold percentage', parseFloat)
      .option('--improvement-threshold <percent>', 'Improvement threshold percentage', parseFloat)
      .description('Compare current run metrics against a baseline')
      .action(
        wrapAction(async (currentLogPrefix, options) => {
          const { baseline } = loadBaselineWithPattern(options.b);
          const currentTestConfig = {
            entityCount: options.e || 0,
            logsPerEntity: options.l || 0,
            uploadCount: options.u,
            intervalMs: options.i,
          };
          console.log(`Extracting metrics from current run: ${currentLogPrefix}`);
          const current = await extractBaselineMetrics(currentLogPrefix, currentTestConfig);
          const thresholds = buildComparisonThresholds({
            degradationThreshold: options.degradationThreshold,
            warningThreshold: options.warningThreshold,
            improvementThreshold: options.improvementThreshold,
          });
          const report = compareMetrics(baseline, current, thresholds);
          console.log(formatComparisonReport(report));
          if (report.summary.degradations > 0) {
            console.log(
              `\n⚠️  Warning: ${report.summary.degradations} metric(s) show degradation.`
            );
            process.exit(1);
          }
        })
      );
  },
};
