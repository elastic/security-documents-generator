import { type Command } from 'commander';

import { recordRun } from '../../ea_perf/runs/record_run.ts';
import {
  measureExplorePerf,
  SCENARIOS,
  type ScenarioName,
} from '../../ea_perf/ui/measure_explore_perf.ts';
import { recordExploreResults } from '../../ea_perf/ui/record_explore_results.ts';
import { generateEaPerfReport } from '../../ea_perf/report/generate_report.ts';
import { runEaPerfPreflight } from '../../ea_perf/preflight.ts';
import { writeNormalizedEnvFile } from '../../ea_perf/normalized_env.ts';
import { validateEntityStoreSeed } from '../../ea_perf/entity_store_validation.ts';
import { runMeasureSuite } from '../../ea_perf/ui/measure_suite.ts';
import { initResultsRun } from '../../ea_perf/results/init_results_run.ts';
import { triggerLeadGeneration } from '../../ea_perf/lead_generation.ts';
import { triggerRiskScoringMaintainer } from '../../ea_perf/risk_scoring.ts';
import { type CommandModule } from '../types.ts';
import { parseIntBase10, wrapAction } from '../utils/cli_utils.ts';

export const eaPerfCommands: CommandModule = {
  register(program: Command) {
    const defaultLeadConnectorId = 'Anthropic-Claude-Haiku-4-5';
    const eaPerf = program
      .command('ea-perf')
      .description('Entity Analytics performance orchestration utilities');

    eaPerf
      .command('preflight')
      .requiredOption(
        '--env-path <path>',
        'path to env file with Kibana and Elasticsearch credentials',
      )
      .option('--fix', 'apply safe deterministic fixes for missing prerequisites')
      .option('--space <space>', 'Kibana space', 'default')
      .option('--lead-connector-id <id>', 'connector ID to validate', defaultLeadConnectorId)
      .option(
        '--watchlist-source-index <name>',
        'watchlist source index to validate',
        'perf-watchlist-source',
      )
      .option(
        '--watchlist-identifier-field <field>',
        'watchlist identifier field to validate',
        'user.name',
      )
      .description('Run validation readiness checks for EA performance environments')
      .action(
        wrapAction(async (options: Record<string, string | boolean | undefined>) => {
          const result = await runEaPerfPreflight({
            envPath: options.envPath as string,
            fix: options.fix === true,
            space: options.space as string,
            leadConnectorId: options.leadConnectorId as string | undefined,
            watchlistSourceIndex: options.watchlistSourceIndex as string | undefined,
            watchlistIdentifierField: options.watchlistIdentifierField as string | undefined,
          });
          process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
          if (!result.ok) {
            throw new Error(`Preflight failed with ${result.summary.fail} failing check(s)`);
          }
        }),
      );

    const env = eaPerf.command('env').description('Environment file helpers');
    env
      .command('write-dotenv')
      .requiredOption('--env-path <path>', 'source env file path')
      .requiredOption('--output-path <path>', 'destination dotenv file path')
      .description(
        'Write a normalized dotenv file with quotes stripped and duplicate keys resolved',
      )
      .action(
        wrapAction(async (options: Record<string, string | undefined>) => {
          const result = await writeNormalizedEnvFile({
            envPath: String(options.envPath),
            outputPath: String(options.outputPath),
          });
          process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        }),
      );

    const entityStore = eaPerf
      .command('entity-store')
      .description('Entity store validation helpers');
    entityStore
      .command('validate-seed')
      .requiredOption(
        '--env-path <path>',
        'path to env file with Kibana and Elasticsearch credentials',
      )
      .requiredOption(
        '--prefix <name>',
        'seed prefix used by create-perf-data, e.g. small-baseline',
      )
      .option('--space <space>', 'Kibana space', 'default')
      .option('--expected-count <n>', 'expected number of matched entity docs', parseIntBase10)
      .description(
        'Validate seeded entity-store docs via the canonical entity alias and return diagnostics',
      )
      .action(
        wrapAction(async (options: Record<string, string | number | undefined>) => {
          const result = await validateEntityStoreSeed({
            envPath: String(options.envPath),
            prefix: String(options.prefix),
            space: options.space ? String(options.space) : 'default',
            expectedCount:
              typeof options.expectedCount === 'number' ? options.expectedCount : undefined,
          });
          process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
          if (!result.ok) {
            process.exitCode = 1;
          }
        }),
      );

    const run = eaPerf.command('run').description('Run bookkeeping helpers');
    run
      .command('record')
      .argument('<feature>', 'feature directory, e.g. explore_flyout')
      .argument('<scenario>', 'scenario directory, e.g. flyout-comparison')
      .option('--note <text>', 'note stored in params.json')
      .option('--env-path <path>', 'env file path recorded in params.json')
      .option('--results-root <path>', 'override results root directory')
      .option('--print-run-dir-only', 'print only the created run dir path')
      .description('Create the next sequential run-N directory and write params.json')
      .action(
        wrapAction(
          async (
            feature: string,
            scenario: string,
            options: Record<string, string | boolean | undefined>,
          ) => {
            const result = await recordRun({
              feature,
              scenario,
              note: options.note as string | undefined,
              envFile: options.envPath as string | undefined,
              resultsRoot: options.resultsRoot as string | undefined,
            });

            if (options.printRunDirOnly) {
              process.stdout.write(`${result.runDir}\n`);
              return;
            }

            process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
          },
        ),
      );

    const leadGeneration = eaPerf
      .command('lead-generation')
      .description('Lead generation validation helpers');
    leadGeneration
      .command('trigger')
      .requiredOption('--env-path <path>', 'path to env file with Kibana credentials')
      .option('--space <space>', 'Kibana space', 'default')
      .option(
        '--connector-id <id>',
        'connector token/body value to send to Kibana',
        defaultLeadConnectorId,
      )
      .description(
        'Trigger lead generation using the explicit connector token required for validation',
      )
      .action(
        wrapAction(async (options: Record<string, string | undefined>) => {
          const result = await triggerLeadGeneration({
            envPath: options.envPath,
            space: options.space,
            connectorId: options.connectorId ?? defaultLeadConnectorId,
          });
          process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        }),
      );

    const riskScoring = eaPerf
      .command('risk-scoring')
      .description('Risk scoring validation helpers');
    riskScoring
      .command('trigger')
      .requiredOption('--env-path <path>', 'path to env file with Kibana credentials')
      .option('--space <space>', 'Kibana space', 'default')
      .option('--maintainer-id <id>', 'maintainer ID to trigger', 'risk-score')
      .description('Post one non-sync maintainer trigger and classify already-running responses')
      .action(
        wrapAction(async (options: Record<string, string | undefined>) => {
          const result = await triggerRiskScoringMaintainer({
            envPath: options.envPath,
            space: options.space,
            maintainerId: options.maintainerId,
          });
          process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
          if (!result.ok) {
            throw new Error(result.message);
          }
        }),
      );

    const ui = eaPerf.command('ui').description('Browser-based Entity Analytics perf measurements');
    ui.command('measure-explore')
      .requiredOption('--env-path <path>', 'path to .env file containing Kibana credentials')
      .option('--scenario <name>', `scenario to run: ${SCENARIOS.join(', ')}`, 'all')
      .option('--runs <n>', 'measured runs per scenario', parseIntBase10, 3)
      .option(
        '--store-entity <name>',
        'store-backed host for flyout-comparison',
        'perf-store-host-1',
      )
      .option(
        '--observed-entity <name>',
        'observed-only host for flyout-comparison',
        'perf-observed-host-1',
      )
      .option('--capture-query-stats', 'capture parsed query stats')
      .option('--output <path>', 'output directory for raw benchmark JSON')
      .option('--headed', 'run browser headed')
      .description('Run the Explore/Flyout Playwright benchmark scenarios')
      .action(
        wrapAction(async (options: Record<string, string | boolean | undefined>) => {
          const scenario = options.scenario as ScenarioName;
          if (!SCENARIOS.includes(scenario)) {
            throw new Error(
              `Invalid --scenario "${String(options.scenario)}". Expected one of: ${SCENARIOS.join(', ')}`,
            );
          }

          const result = await measureExplorePerf({
            envFile: options.envPath as string,
            scenario,
            runs: typeof options.runs === 'number' ? options.runs : undefined,
            storeEntity: options.storeEntity as string,
            observedEntity: options.observedEntity as string,
            captureQueryStats: options.captureQueryStats === true,
            outputDir: options.output as string | undefined,
            headed: options.headed === true,
          });

          process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        }),
      );

    ui.command('measure-suite')
      .requiredOption('--env-path <path>', 'path to .env file containing Kibana credentials')
      .option('--runs <n>', 'measured runs per scenario', parseIntBase10, 1)
      .option('--output-root <path>', 'root output directory for per-scenario outputs')
      .option(
        '--store-entity <name>',
        'store-backed host for flyout-comparison',
        'perf-store-host-1',
      )
      .option(
        '--observed-entity <name>',
        'observed-only host for flyout-comparison',
        'perf-observed-host-1',
      )
      .option('--no-continue-on-error', 'stop on first scenario failure')
      .option(
        '--scenario-timeout-ms <n>',
        'optional timeout per scenario in milliseconds',
        parseIntBase10,
      )
      .option(
        '--scenarios <list>',
        'comma-separated scenarios (default: hosts-list,host-detail,flyout,users-list,user-detail,flyout-user,flyout-comparison)',
      )
      .option('--headed', 'run browser headed')
      .description('Run Explore/Flyout scenarios one-at-a-time with partial progress preservation')
      .action(
        wrapAction(async (options: Record<string, string | number | boolean | undefined>) => {
          const scenarios =
            typeof options.scenarios === 'string'
              ? options.scenarios
                  .split(',')
                  .map((part) => part.trim())
                  .filter(Boolean)
              : undefined;
          const summary = await runMeasureSuite({
            envPath: options.envPath as string,
            runs: typeof options.runs === 'number' ? options.runs : 1,
            outputRoot: options.outputRoot as string | undefined,
            storeEntity: options.storeEntity as string | undefined,
            observedEntity: options.observedEntity as string | undefined,
            continueOnError: options.continueOnError !== false,
            scenarioTimeoutMs:
              typeof options.scenarioTimeoutMs === 'number' ? options.scenarioTimeoutMs : undefined,
            scenarios,
            headed: options.headed === true,
          });
          process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
          if (summary.scenariosFailed.length > 0) {
            process.exitCode = 1;
          }
        }),
      );

    ui.command('record-explore-results')
      .requiredOption('--input <path>', 'input JSON from ea-perf ui measure-explore')
      .option('--output <path>', 'path for merged summary JSON (default: overwrite input)')
      .description('Append summary statistics to a raw benchmark JSON file')
      .action(
        wrapAction(async (options: Record<string, string | undefined>) => {
          const result = await recordExploreResults({
            input: options.input as string,
            output: options.output,
          });

          process.stdout.write(result.markdownTable);
          process.stderr.write(`\nWrote ${result.outputPath}\n`);
        }),
      );

    const report = eaPerf.command('report').description('Generate performance analysis reports');
    report
      .command('generate')
      .requiredOption('--input <path>', 'input directory containing tier subdirectories')
      .requiredOption('--output <path>', 'output HTML file path')
      .option('--findings <path>', 'optional markdown file to embed in findings section')
      .description('Generate standalone HTML report from EA performance artifacts')
      .action(
        wrapAction(async (options: Record<string, string | undefined>) => {
          const result = await generateEaPerfReport({
            input: options.input as string,
            output: options.output as string,
            findings: options.findings,
          });
          process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        }),
      );

    const results = eaPerf.command('results').description('Result directory helpers');
    results
      .command('init')
      .requiredOption('--tier <name>', 'results tier, e.g. small')
      .requiredOption('--feature <name>', 'feature directory, e.g. risk_scoring')
      .requiredOption('--scenario <name>', 'scenario directory, e.g. baseline')
      .requiredOption('--run <n>', 'run number', parseIntBase10)
      .option('--output-root <path>', 'override results root directory')
      .description('Create an expected run directory and initialize params/notes/raw logs files')
      .action(
        wrapAction(async (options: Record<string, string | number | undefined>) => {
          const result = await initResultsRun({
            tier: String(options.tier),
            feature: String(options.feature),
            scenario: String(options.scenario),
            run: Number(options.run),
            outputRoot: options.outputRoot ? String(options.outputRoot) : undefined,
          });
          process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        }),
      );
  },
};
