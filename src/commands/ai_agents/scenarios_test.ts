import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { faker } from '@faker-js/faker';
import { buildAiAgentDocuments } from './ai_agents.ts';
import { AI_AGENT_SCENARIOS, type AiAgentScenario } from './scenarios.ts';
import {
  CLAUDE_CODE_OTEL_INDEX,
  ENDPOINT_FILE_INDEX,
  ENDPOINT_PROCESS_INDEX,
  OSQUERY_RESULT_INDEX,
} from '../../generators/ai_agents/index.ts';

type Source = Record<string, unknown>;

interface AiAgent {
  name: string;
  is_descendant: boolean;
  email?: string;
  session_id?: string;
}

interface ProcessFields {
  pid: number;
  name: string;
  args: string[];
  executable: string;
  ai_agent?: AiAgent;
  parent?: { pid: number; name: string; args: string[] };
  entry_leader?: { name: string; entry_meta: { type: string } };
  interactive?: boolean;
  tty?: unknown;
  previous?: unknown[];
}

const NOW = Date.parse('2026-11-26T12:00:00.000Z');

const processOf = (source: Source): ProcessFields => source.process as ProcessFields;
const actionsOf = (source: Source): string[] => (source.event as { action: string[] }).action;
const argsOf = (source: Source): string => processOf(source).args.join(' ');
const timestampOf = (source: Source): number => Date.parse(String(source['@timestamp']));

const generate = (
  scenarios: readonly AiAgentScenario[],
  options: { claudeOtel?: boolean; sessionData?: boolean } = {},
) => {
  faker.seed(1234);
  return buildAiAgentDocuments(
    {
      scenarios,
      repeat: 1,
      timeWindowMs: 3 * 60 * 60 * 1000,
      claudeOtel: options.claudeOtel ?? false,
      sessionData: options.sessionData ?? true,
      domain: 'example.com',
    },
    NOW,
  );
};

const sourcesFor = (
  built: ReturnType<typeof generate>,
  scenario?: AiAgentScenario,
  index?: string,
): Source[] =>
  built
    .filter((entry) => scenario === undefined || entry.scenario === scenario)
    .flatMap((entry) => entry.documents)
    .filter((doc) => index === undefined || doc.index === index)
    .map((doc) => doc.source);

const tagged = (sources: Source[]): Source[] =>
  sources.filter((source) => processOf(source)?.ai_agent);

describe('generated AI agent scenarios', () => {
  let all: ReturnType<typeof generate>;

  before(() => {
    all = generate(AI_AGENT_SCENARIOS, { claudeOtel: true });
  });

  it('writes no document after now', () => {
    for (const source of sourcesFor(all)) {
      assert.ok(timestampOf(source) <= NOW);
    }
  });

  it('never puts the email on a descendant event', () => {
    const descendants = tagged(sourcesFor(all)).filter(
      (source) => processOf(source).ai_agent?.is_descendant,
    );
    assert.ok(descendants.length > 1_000);
    assert.equal(descendants.filter((source) => processOf(source).ai_agent?.email).length, 0);
  });

  it('never gives Cursor a session ID and never sets api_key_auth', () => {
    for (const source of tagged(sourcesFor(all))) {
      const aiAgent = processOf(source).ai_agent as AiAgent;
      if (aiAgent.name === 'cursor') {
        assert.equal(aiAgent.session_id, undefined);
      }
      assert.equal('api_key_auth' in aiAgent, false);
    }
  });

  it('keeps the session ID off the agent exec event unless the whole run is one fork,exec,end event', () => {
    const agentExecs = tagged(sourcesFor(all, undefined, ENDPOINT_PROCESS_INDEX)).filter(
      (source) => {
        const { ai_agent: aiAgent, args } = processOf(source);
        return (
          aiAgent?.name === 'claude_code' &&
          !aiAgent.is_descendant &&
          args[0] === 'claude' &&
          actionsOf(source).includes('exec')
        );
      },
    );
    assert.ok(agentExecs.length >= 10);
    for (const source of agentExecs) {
      const merged = actionsOf(source).includes('end');
      assert.equal(processOf(source).ai_agent?.session_id !== undefined, merged);
    }
  });

  it('starts the email at the credential file write when the user signs in mid-session', () => {
    const sources = tagged(sourcesFor(all, 'developer_claude')).sort(
      (a, b) => timestampOf(a) - timestampOf(b),
    );
    const firstWithEmail = sources.find((source) => processOf(source).ai_agent?.email);
    assert.ok(firstWithEmail);
    assert.match(
      String((firstWithEmail.file as { path: string }).path),
      /\/\.claude\/\.credentials\.json\.tmp\./,
    );
    const before = sources.filter((source) => timestampOf(source) < timestampOf(firstWithEmail));
    assert.ok(before.some((source) => !processOf(source).ai_agent?.is_descendant));
  });

  it('runs the Bash preamble once per Claude session and one snapshot shell per Bash call', () => {
    const processes = tagged(sourcesFor(all, 'agent_commit', ENDPOINT_PROCESS_INDEX)).filter(
      (source) => actionsOf(source).includes('exec'),
    );
    const preambles = processes.filter((source) =>
      argsOf(source).startsWith('/bin/bash -c -l SNAPSHOT_FILE='),
    );
    const toolShells = processes.filter((source) =>
      /^\/bin\/bash -c source .*shell-snapshots/.test(argsOf(source)),
    );
    assert.equal(preambles.length, 1);
    assert.equal(toolShells.length, 2);
  });

  it('scans for IDEs only in interactive Claude sessions', () => {
    const scans = (scenario: AiAgentScenario) =>
      tagged(sourcesFor(all, scenario, ENDPOINT_PROCESS_INDEX)).filter((source) =>
        argsOf(source).startsWith('/bin/sh -c ps aux'),
      );
    assert.equal(scans('developer_claude').length, 1);
    assert.equal(scans('shared_email_two_users').length, 2);
    for (const scenario of [
      'mcp_server',
      'agent_commit',
      'unattended_cron',
      'curl_and_secret_read',
    ] as const) {
      assert.equal(scans(scenario).length, 0);
    }
  });

  it('tags Claude re-execs as the agent even under a tool shell', () => {
    const reexecs = tagged(sourcesFor(all, 'developer_claude', ENDPOINT_PROCESS_INDEX)).filter(
      (source) => processOf(source).args[0] === 'bfs',
    );
    assert.equal(reexecs.length, 1);
    const [bfs] = reexecs;
    assert.equal(processOf(bfs).ai_agent?.is_descendant, false);
    assert.ok(processOf(bfs).ai_agent?.email);
    assert.equal(processOf(bfs).name, '2.1.332');
    assert.equal(processOf(bfs).parent?.name, 'bash');
  });

  it('builds the stdio MCP server tree as descendants', () => {
    const processes = tagged(sourcesFor(all, 'mcp_server', ENDPOINT_PROCESS_INDEX));
    const npx = processes.filter((source) =>
      argsOf(source).includes('npx -y @modelcontextprotocol/server-memory'),
    );
    const server = processes.filter((source) => argsOf(source).includes('mcp-server-memory'));
    assert.ok(npx.length >= 2);
    assert.ok(server.some((source) => argsOf(source) === "sh -c 'mcp-server-memory'"));
    for (const source of [...npx, ...server]) {
      assert.equal(processOf(source).ai_agent?.is_descendant, true);
    }
  });

  it('records an edit as a tmp file renamed over the target by the agent, and a commit with the trailer', () => {
    const files = tagged(sourcesFor(all, 'agent_commit', ENDPOINT_FILE_INDEX));
    const renames = files.filter((source) => {
      const file = source.file as { path: string; Ext?: { original?: { path: string } } };
      return (
        file.path.endsWith('/main.py') &&
        /main\.py\.tmp\.\d+\.[0-9a-f]{12}$/.test(file.Ext?.original?.path ?? '')
      );
    });
    assert.equal(renames.length, 2);
    for (const source of renames) {
      assert.equal(processOf(source).ai_agent?.is_descendant, false);
      assert.ok(processOf(source).ai_agent?.email);
    }
    const commit = tagged(sourcesFor(all, 'agent_commit', ENDPOINT_PROCESS_INDEX)).find(
      (source) => processOf(source).args[1] === 'commit',
    );
    assert.ok(commit);
    assert.match(argsOf(commit), /Co-Authored-By: Claude .+ <noreply@anthropic\.com>/);
    assert.equal(processOf(commit).ai_agent?.is_descendant, true);
    assert.ok(processOf(commit).ai_agent?.session_id);
    const gitFiles = files.filter((source) =>
      (source.file as { path: string }).path.includes('/.git/'),
    );
    assert.ok(gitFiles.length > 5);
    assert.equal(gitFiles.filter((source) => processOf(source).ai_agent?.email).length, 0);
  });

  it('runs Cursor commands in an fd-5 shell that is a child of the agent', () => {
    const processes = tagged(sourcesFor(all, 'developer_cursor', ENDPOINT_PROCESS_INDEX));
    const agentExec = processes.find(
      (source) =>
        !processOf(source).ai_agent?.is_descendant &&
        processOf(source).name === 'node' &&
        actionsOf(source).includes('exec') &&
        argsOf(source).includes('-p'),
    );
    assert.ok(agentExec);
    const fd5Shells = processes.filter(
      (source) =>
        argsOf(source).includes('__cursor_command <&5') && actionsOf(source).includes('exec'),
    );
    assert.equal(fd5Shells.length, 6);
    for (const shell of fd5Shells) {
      assert.equal(processOf(shell).parent?.pid, processOf(agentExec).pid);
      assert.equal(argsOf(shell).includes('unittest'), false);
    }
    const command = processes.find((source) => argsOf(source).startsWith('python3 -m unittest'));
    assert.ok(command);
    assert.ok(fd5Shells.some((shell) => processOf(shell).pid === processOf(command).parent?.pid));
  });

  it('reports cron, scripted SSH and interactive sessions with the observed context', () => {
    const agentExec = (scenario: AiAgentScenario) =>
      tagged(sourcesFor(all, scenario, ENDPOINT_PROCESS_INDEX)).filter(
        (source) =>
          !processOf(source).ai_agent?.is_descendant &&
          processOf(source).args[0] === 'claude' &&
          actionsOf(source).includes('exec'),
      );
    const [ssh, cron] = agentExec('unattended_cron').sort(
      (a, b) => timestampOf(a) - timestampOf(b),
    );
    assert.equal(processOf(ssh).entry_leader?.name, 'sshd-session');
    assert.equal(processOf(ssh).entry_leader?.entry_meta.type, 'sshd');
    assert.equal(processOf(ssh).interactive, false);
    assert.equal(processOf(cron).entry_leader?.name, 'crond');
    assert.equal(processOf(cron).entry_leader?.entry_meta.type, 'init');
    assert.equal(processOf(cron).interactive, false);
    const [interactive] = agentExec('developer_claude');
    assert.equal(processOf(interactive).interactive, true);
    assert.ok(processOf(interactive).tty);
    assert.deepEqual(processOf(interactive).args, ['claude']);
  });

  it('leaves session context out when session data is off', () => {
    const withoutSessionData = generate(['unattended_cron'], { sessionData: false });
    for (const source of sourcesFor(withoutSessionData, undefined, ENDPOINT_PROCESS_INDEX)) {
      assert.equal(processOf(source).entry_leader, undefined);
      assert.equal(processOf(source).interactive, undefined);
    }
  });

  it('stamps the OAuth email on an API key run that exits with an error', () => {
    const [agent] = tagged(sourcesFor(all, 'api_key_session', ENDPOINT_PROCESS_INDEX)).filter(
      (source) => processOf(source).args[0] === 'claude',
    );
    assert.deepEqual(actionsOf(agent), ['fork', 'exec', 'end']);
    assert.ok(processOf(agent).ai_agent?.email);
    assert.equal(processOf(agent).parent?.name, 'timeout');
  });

  it('gives two OS users signed in with one email two agent identities on one host', () => {
    const agentEvents = tagged(sourcesFor(all, 'shared_email_two_users')).filter(
      (source) => !processOf(source).ai_agent?.is_descendant,
    );
    const users = new Set(agentEvents.map((source) => (source.user as { name: string }).name));
    const hosts = new Set(agentEvents.map((source) => (source.host as { id: string }).id));
    const emails = new Set(
      agentEvents.map((source) => processOf(source).ai_agent?.email).filter(Boolean),
    );
    assert.equal(users.size, 2);
    assert.equal(hosts.size, 1);
    assert.equal(emails.size, 1);
  });

  it('names Claude claude in osquery and never returns Cursor processes', () => {
    const processRows = sourcesFor(all, undefined, OSQUERY_RESULT_INDEX).filter(
      (source) => (source.action_data as { id: string }).id === 'ai_processes_linux',
    );
    assert.ok(processRows.length >= 1);
    for (const row of processRows) {
      assert.equal((row.osquery as { name: string }).name, 'claude');
    }
    assert.equal(
      sourcesFor(all, 'developer_cursor', OSQUERY_RESULT_INDEX).filter(
        (source) => (source.action_data as { id: string }).id === 'ai_processes_linux',
      ).length,
      0,
    );
  });

  it('joins Claude Code OTel to Defend by session ID, with no host fields', () => {
    const otel = sourcesFor(all, 'mcp_server', CLAUDE_CODE_OTEL_INDEX);
    const defendSessions = new Set(
      tagged(sourcesFor(all, 'mcp_server'))
        .map((source) => processOf(source).ai_agent?.session_id)
        .filter(Boolean),
    );
    assert.ok(otel.length > 0);
    for (const source of otel) {
      const sessionId = (source.claude_code as { events: { session: { id: string } } }).events
        .session.id;
      assert.ok(defendSessions.has(sessionId));
      assert.equal(source.host, undefined);
    }
  });
});
