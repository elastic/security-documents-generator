import { faker } from '@faker-js/faker';
import { type AgentProcessSummary } from './claude_code.ts';
import {
  OSQUERY_AGENT_VERSION,
  OSQUERY_RESULT_INDEX,
  type AgentHost,
  type GeneratedDocument,
  type OsUser,
} from './types.ts';

export interface OsqueryUserInventory {
  readonly user: OsUser;
  readonly claudeCode: boolean;
  readonly cursor: boolean;
}

export interface OsqueryLiveQueryOptions {
  readonly host: AgentHost;
  readonly at: number;
  readonly users: readonly OsqueryUserInventory[];
  /** Claude processes alive when the query runs. osquery's pack doesn't match Cursor CLI, so pass only Claude. */
  readonly runningClaudeProcesses: readonly AgentProcessSummary[];
}

const PACK_PLATFORM = 'linux';
const KERNEL = '6.1.190-237.442.amzn2023.x86_64';

const iso = (ms: number): string => new Date(ms).toISOString();
const isoSeconds = (ms: number): string => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

const field = (name: string) => ({ field: name });
const value = (v: string | readonly string[]) => ({ value: v });

const QUERIES = {
  ai_processes_linux: {
    action: 'osquery.ai_processes',
    category: ['process'],
    type: ['info'],
    tags: ['osquery', 'ai_discovery', 'ai_processes', 'shadow_ai', 'linux'],
    ecsMapping: {
      'event.category': value(['process']),
      'user.name': field('username'),
      'process.parent.pid': field('ppid'),
      'process.pid': field('pid'),
      'process.working_directory': field('cwd'),
      tags: value(['osquery', 'ai_discovery', 'ai_processes', 'shadow_ai', 'linux']),
      'process.name': field('name'),
      'event.action': value('osquery.ai_processes'),
      'event.type': value(['info']),
      'process.command_line': field('cmdline'),
      'labels.process_category': field('category'),
      'process.executable': field('path'),
      'process.start': field('start_time'),
    },
  },
  ai_config_files_linux: {
    action: 'osquery.ai_config_files',
    category: ['file'],
    type: ['info'],
    tags: ['osquery', 'ai_discovery', 'ai_config_files', 'shadow_ai', 'linux'],
    ecsMapping: {
      'file.path': field('path'),
      'labels.config_kind': field('config_kind'),
      'event.action': value('osquery.ai_config_files'),
      'file.type': field('type'),
      'event.category': value(['file']),
      'file.mtime': field('modified_time'),
      'event.type': value(['info']),
      'file.accessed': field('accessed_time'),
      'user.name': field('username'),
      'file.size': field('size'),
      tags: value(['osquery', 'ai_discovery', 'ai_config_files', 'shadow_ai', 'linux']),
    },
  },
  ai_config_file_changes_linux: {
    action: 'osquery.ai_config_file_changes',
    category: ['file'],
    type: ['change'],
    tags: ['osquery', 'ai_discovery', 'config_change', 'shadow_ai', 'risk_context', 'linux'],
    ecsMapping: {
      'file.path': field('path'),
      'event.action': value('osquery.ai_config_file_changes'),
      'event.category': value(['file']),
      'file.mtime': field('modified_time'),
      'event.type': value(['change']),
      'file.name': field('filename'),
      'user.name': field('username'),
      'file.size': field('size'),
      tags: value([
        'osquery',
        'ai_discovery',
        'config_change',
        'shadow_ai',
        'risk_context',
        'linux',
      ]),
      'file.ctime': field('changed_time'),
    },
  },
} as const;

type QueryId = keyof typeof QUERIES;

const configFileRows = (inventory: OsqueryUserInventory, modified: string) => {
  const { home, name } = inventory.user;
  const rows: Array<{ path: string; config_kind: string; type: string; size: number }> = [];
  if (inventory.claudeCode) {
    rows.push(
      { path: `${home}/.claude.json`, config_kind: 'mcp_config', type: 'regular', size: 160_907 },
      {
        path: `${home}/.claude/settings.json`,
        config_kind: 'mcp_config',
        type: 'regular',
        size: 62,
      },
      { path: `${home}/.claude/`, config_kind: 'tool_directory', type: 'directory', size: 4_096 },
      {
        path: `${home}/.claude/plugins/`,
        config_kind: 'tool_directory',
        type: 'directory',
        size: 4_096,
      },
      {
        path: `${home}/.claude/skills/`,
        config_kind: 'tool_directory',
        type: 'directory',
        size: 4_096,
      },
    );
  }
  if (inventory.cursor) {
    rows.push(
      { path: `${home}/.cursor/`, config_kind: 'tool_directory', type: 'directory', size: 4_096 },
      {
        path: `${home}/.cursor/plugins/`,
        config_kind: 'tool_directory',
        type: 'directory',
        size: 4_096,
      },
      {
        path: `${home}/.cursor/skills-cursor/`,
        config_kind: 'tool_directory',
        type: 'directory',
        size: 4_096,
      },
    );
  }
  return rows.map((row) => ({
    ...row,
    username: name,
    modified_time: modified,
    accessed_time: modified,
  }));
};

/**
 * Builds result documents for one live query of the prebuilt `ai-asset-discovery-linux` pack,
 * covering the three queries that returned rows in the lab.
 */
export const buildOsqueryLiveQuery = ({
  host,
  at,
  users,
  runningClaudeProcesses,
}: OsqueryLiveQueryOptions): GeneratedDocument[] => {
  const ephemeralId = faker.string.uuid();
  const hostFields = {
    hostname: host.name,
    os: {
      kernel: KERNEL,
      codename: 'Amazon Linux',
      name: 'Amazon Linux',
      type: 'linux',
      family: 'redhat',
      version: '2023',
      platform: 'amzn',
    },
    containerized: false,
    ip: [
      host.ip,
      `fe80::${faker.string.hexadecimal({ length: 4, casing: 'lower', prefix: '' })}:ff:fe00:1`,
      '172.17.0.1',
    ],
    name: host.name,
    id: host.id,
    mac: [faker.internet.mac({ separator: '-' }).toUpperCase()],
    architecture: 'x86_64',
  };
  const modified = isoSeconds(at - 60_000);
  const actionIds = Object.fromEntries(
    (Object.keys(QUERIES) as QueryId[]).map((id) => [id, faker.string.uuid()]),
  ) as Record<QueryId, string>;

  const doc = (
    queryId: QueryId,
    offsetMs: number,
    row: Record<string, string | number>,
    mapped: Record<string, unknown>,
  ) => {
    const query = QUERIES[queryId];
    const timestamp = at + offsetMs;
    return {
      index: OSQUERY_RESULT_INDEX,
      source: {
        '@timestamp': iso(timestamp),
        agent: {
          name: host.name,
          id: host.elasticAgentId,
          ephemeral_id: ephemeralId,
          type: 'osquerybeat',
          version: OSQUERY_AGENT_VERSION,
        },
        elastic_agent: { id: host.elasticAgentId, version: OSQUERY_AGENT_VERSION, snapshot: false },
        type: host.name,
        action_data: {
          id: queryId,
          space_id: 'default',
          ecs_mapping: query.ecsMapping,
          platform: PACK_PLATFORM,
        },
        action_id: actionIds[queryId],
        tags: [...query.tags],
        ecs: { version: '8.0.0' },
        data_stream: { namespace: 'default', type: 'logs', dataset: 'osquery_manager.result' },
        host: hostFields,
        event: {
          agent_id_status: 'verified',
          ingested: isoSeconds(timestamp + 3_000),
          module: 'osquery_manager',
          action: query.action,
          category: [...query.category],
          type: [...query.type],
          dataset: 'osquery_manager.result',
        },
        osquery: row,
        ...mapped,
      },
    };
  };

  const documents: GeneratedDocument[] = [];
  for (const agentProcess of runningClaudeProcesses) {
    const startTime = isoSeconds(agentProcess.start);
    const row = {
      start_time: startTime,
      cwd: agentProcess.workingDirectory,
      path: agentProcess.executable,
      name: 'claude',
      pid: agentProcess.pid,
      category: 'agent',
      username: agentProcess.userName,
      ppid: agentProcess.parentPid,
      cmdline: agentProcess.commandLine,
    };
    documents.push(
      doc('ai_processes_linux', 2_400, row, {
        process: {
          parent: { pid: agentProcess.parentPid },
          name: 'claude',
          start: startTime,
          working_directory: agentProcess.workingDirectory,
          pid: agentProcess.pid,
          executable: agentProcess.executable,
          command_line: agentProcess.commandLine,
        },
        labels: { process_category: 'agent' },
        user: { name: agentProcess.userName },
      }),
    );
  }
  for (const inventory of users) {
    for (const row of configFileRows(inventory, modified)) {
      documents.push(
        doc('ai_config_files_linux', 24_000, row, {
          file: {
            path: row.path,
            size: row.size,
            type: row.type,
            accessed: row.accessed_time,
            mtime: row.modified_time,
          },
          labels: { config_kind: row.config_kind },
          user: { name: row.username },
        }),
      );
    }
    if (inventory.claudeCode) {
      for (const path of [
        `${inventory.user.home}/.claude.json`,
        `${inventory.user.home}/.claude/settings.json`,
      ]) {
        const filename = path.split('/').pop() ?? path;
        const size = filename === '.claude.json' ? 160_907 : 62;
        const row = {
          path,
          changed_time: modified,
          filename,
          modified_time: modified,
          size,
          username: inventory.user.name,
        };
        documents.push(
          doc('ai_config_file_changes_linux', 34_000, row, {
            file: { path, size, name: filename, ctime: modified, mtime: modified },
            user: { name: inventory.user.name },
          }),
        );
      }
    }
  }
  return documents;
};
