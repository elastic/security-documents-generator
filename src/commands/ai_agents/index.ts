import { type Command } from 'commander';
import { type CommandModule } from '../types.ts';
import {
  assertPositiveInt,
  parseDuration,
  parseIntBase10,
  wrapAction,
} from '../utils/cli_utils.ts';
import { DEFAULT_ENDPOINT_VERSION, generateAiAgentData, parseScenarios } from './ai_agents.ts';
import { applyStorylineContext } from './context.ts';
import { ALL_SCENARIOS, SCENARIO_GROUPS } from './scenarios.ts';

export const aiAgentsCommands: CommandModule = {
  register(program: Command) {
    program
      .command('generate-ai-agent-data')
      .alias('ai-agents')
      .description(
        'Generate Elastic Defend, osquery and (optionally) Claude Code OTel data for Claude Code and Cursor CLI, shaped from a Linux lab run',
      )
      .option(
        '--scenarios <list>',
        `Comma-separated scenarios or groups. Groups: ${Object.keys(SCENARIO_GROUPS).join(', ')} (all means the lab scenarios). Scenarios: ${ALL_SCENARIOS.join(', ')}`,
        'all',
      )
      .option(
        '--repeat <n>',
        'Copies of each scenario, each with its own synthetic users and hosts',
        parseIntBase10,
        1,
      )
      .option(
        '--time-window <duration>',
        'Scenarios run back to back from this long before now',
        '2h',
      )
      .option(
        '--claude-otel',
        'Also write Claude Code OTel events for each Claude session (extrapolated from fixtures)',
        false,
      )
      .option(
        '--cursor-audit',
        'Also write Cursor audit log events (logs-cursor.audit-*) for the Cursor users and the storyline. Tagged poc-mock',
        false,
      )
      .option(
        '--history-days <n>',
        'Back-fill quiet sessions so the data covers <n> days ending with the generated window: nightly cron runs for the storyline build server and weekday sessions on three laptop installs. 0 for none',
        parseIntBase10,
        0,
      )
      .option(
        '--map-session-id',
        'Map process.ai_agent.session_id as keyword through endpoint@custom first',
        false,
      )
      .option(
        '--no-session-data',
        'Leave out entry_leader, interactive and tty, as the default Defend policy does',
      )
      .option(
        '--no-install-packages',
        'Skip installing the Endpoint, Osquery Manager and Claude Code packages',
      )
      .option(
        '--endpoint-version <version>',
        'Endpoint package version to install, or latest. 9.6.1 leaves process.ai_agent.session_id unmapped, as in the lab',
        DEFAULT_ENDPOINT_VERSION,
      )
      .option(
        '--output-file <path>',
        'Write NDJSON ({_index, _source} per line) and do not contact any cluster',
      )
      .option('--domain <domain>', 'Email domain for the synthetic people', 'example.com')
      .option('--space <space>', 'Kibana space for package installs, created if missing', 'default')
      .option(
        '--namespace <namespace>',
        'Data stream namespace for the generated indices. Defaults to the space, so its entity maintainers read the data',
      )
      .option(
        '--seed <seed>',
        'Random seed for offline repeatability. Fixes IDs and names, not timestamps',
        parseIntBase10,
      )
      .action(
        wrapAction(
          async (options: {
            scenarios: string;
            repeat: number;
            timeWindow: string;
            claudeOtel: boolean;
            cursorAudit: boolean;
            historyDays: number;
            namespace?: string;
            mapSessionId: boolean;
            sessionData: boolean;
            installPackages: boolean;
            endpointVersion: string;
            outputFile?: string;
            domain: string;
            space: string;
            seed?: number;
          }) => {
            assertPositiveInt(options.repeat, '--repeat');
            if (!Number.isInteger(options.historyDays) || options.historyDays < 0) {
              throw new Error('--history-days must be a whole number of days, 0 or more');
            }
            await generateAiAgentData({
              scenarios: parseScenarios(options.scenarios),
              repeat: options.repeat,
              timeWindowMs: parseDuration(options.timeWindow),
              claudeOtel: options.claudeOtel,
              cursorAudit: options.cursorAudit,
              historyDays: options.historyDays,
              namespace: options.namespace ?? options.space,
              mapSessionId: options.mapSessionId,
              sessionData: options.sessionData,
              installPackages: options.installPackages,
              endpointVersion: options.endpointVersion,
              outputFile: options.outputFile,
              domain: options.domain,
              space: options.space,
              seed: options.seed,
            });
          },
        ),
      );

    program
      .command('ai-agents-context')
      .description(
        'Apply the ai-agents storyline context through Kibana APIs: high_impact criticality on the build server, the privileged person on Privileged Users, and the departing person on Departing Employees, both assigned by hand',
      )
      .option('--space <space>', 'Kibana space with the Entity Store', 'default')
      .option(
        '--namespace <namespace>',
        'Namespace the storyline was written to. Defaults to the space',
      )
      .option('--domain <domain>', 'Email domain the storyline used', 'example.com')
      .option('--criticality <level>', 'Asset criticality for the build server', 'high_impact')
      .option(
        '--install-store',
        'Install the Entity Store with all five types in the space first',
        false,
      )
      .option(
        '--extract <hours>',
        'Force host, user and ai_agent extraction over the last <hours> first',
        parseIntBase10,
      )
      .action(
        wrapAction(
          async (options: {
            space: string;
            namespace?: string;
            domain: string;
            criticality: string;
            installStore: boolean;
            extract?: number;
          }) => {
            await applyStorylineContext({
              space: options.space,
              namespace: options.namespace ?? options.space,
              domain: options.domain,
              criticality: options.criticality,
              installStore: options.installStore,
              extractHours: options.extract,
            });
          },
        ),
      );
  },
};
