import { type Command } from 'commander';
import { type CommandModule } from '../types.ts';
import {
  assertPositiveInt,
  parseDuration,
  parseIntBase10,
  wrapAction,
} from '../utils/cli_utils.ts';
import { DEFAULT_ENDPOINT_VERSION, generateAiAgentData, parseScenarios } from './ai_agents.ts';
import { AI_AGENT_SCENARIOS } from './scenarios.ts';

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
        `Comma-separated scenarios, or all (${AI_AGENT_SCENARIOS.join(', ')})`,
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
      .option('--space <space>', 'Kibana space for package installs', 'default')
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
            await generateAiAgentData({
              scenarios: parseScenarios(options.scenarios),
              repeat: options.repeat,
              timeWindowMs: parseDuration(options.timeWindow),
              claudeOtel: options.claudeOtel,
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
  },
};
