import { faker } from '@faker-js/faker';
import {
  buildClaudeCodeOtelEvents,
  buildClaudeCodeSession,
  buildCursorSession,
  buildOsqueryLiveQuery,
  bin,
  claudeCommands,
  DESTINATIONS,
  orgTelemetryCollector,
  type ClaudeCodeSessionOptions,
  type ClaudeCodeSessionResult,
  type GeneratedDocument,
  type HostRuntime,
  type OsqueryUserInventory,
  type OsUser,
} from '../../generators/ai_agents/index.ts';
import {
  cloudDefaultUser,
  createPerson,
  createRuntime,
  personalUser,
  sshClientIp,
  type Person,
} from './synthetic_identities.ts';

export const AI_AGENT_SCENARIOS = [
  'developer_claude',
  'developer_cursor',
  'cursor_plugin_sync',
  'mcp_server',
  'agent_commit',
  'curl_and_secret_read',
  'unattended_cron',
  'api_key_session',
  'shared_email_two_users',
  'shared_email_two_hosts',
] as const;

export type AiAgentScenario = (typeof AI_AGENT_SCENARIOS)[number];

export const EXTRAPOLATED_SCENARIOS: ReadonlySet<AiAgentScenario> = new Set([
  'shared_email_two_hosts',
]);

export interface ScenarioContext {
  readonly start: number;
  readonly domain: string;
  readonly organizationId: string;
  readonly claudeOtel: boolean;
  readonly sessionData: boolean;
}

export interface ScenarioOutput {
  readonly documents: GeneratedDocument[];
  readonly end: number;
}

const CLAUDE_MODEL_ID = 'claude-sonnet-5-5';
const CLAUDE_MODEL_NAME = 'Sonnet 5.5';
const DEMO_REPO = 'demo-app';

const repoPath = (user: OsUser): string => `${user.home}/src/${DEMO_REPO}`;

interface ClaudeRun {
  readonly options: Omit<
    ClaudeCodeSessionOptions,
    'runtime' | 'clientIp' | 'sessionId' | 'telemetryCollector'
  >;
  readonly person: Person;
  /** The typed prompt for interactive sessions, used only for Claude Code OTel. */
  readonly typedPrompt?: string;
}

class ScenarioBuilder {
  readonly documents: GeneratedDocument[] = [];
  readonly context: ScenarioContext;
  private readonly inventories = new Map<HostRuntime, Map<string, OsqueryUserInventory>>();
  end: number;

  constructor(context: ScenarioContext) {
    this.context = context;
    this.end = context.start;
  }

  runtime(): HostRuntime {
    return createRuntime(this.context.start, this.context.sessionData);
  }

  private remember(runtime: HostRuntime, user: OsUser, agent: 'claudeCode' | 'cursor'): void {
    const perHost = this.inventories.get(runtime) ?? new Map<string, OsqueryUserInventory>();
    const existing = perHost.get(user.name) ?? { user, claudeCode: false, cursor: false };
    perHost.set(user.name, { ...existing, [agent]: true });
    this.inventories.set(runtime, perHost);
  }

  claude(
    runtime: HostRuntime,
    { options, person, typedPrompt }: ClaudeRun,
  ): ClaudeCodeSessionResult {
    const session = buildClaudeCodeSession({
      ...options,
      runtime,
      clientIp: sshClientIp(),
      sessionId: faker.string.uuid(),
      telemetryCollector: orgTelemetryCollector(this.context.domain),
    });
    this.documents.push(...session.documents);
    this.remember(runtime, options.user, 'claudeCode');
    if (this.context.claudeOtel) {
      this.documents.push(
        ...buildClaudeCodeOtelEvents({
          session,
          account: person.account,
          prompt: options.prompt ?? typedPrompt ?? '',
          model: CLAUDE_MODEL_ID,
        }),
      );
    }
    this.end = Math.max(this.end, session.process.end);
    return session;
  }

  cursor(
    runtime: HostRuntime,
    options: Omit<Parameters<typeof buildCursorSession>[0], 'runtime' | 'clientIp'>,
  ) {
    const session = buildCursorSession({ ...options, runtime, clientIp: sshClientIp() });
    this.documents.push(...session.documents);
    this.remember(runtime, options.user, 'cursor');
    this.end = Math.max(this.end, session.process.end);
    return session;
  }

  /** One live query of the AI asset discovery pack per host, after everything else unless `at` is given. */
  osquery(
    runtime: HostRuntime,
    at = this.end + 30_000,
    running: readonly ClaudeCodeSessionResult[] = [],
  ): void {
    const users = [...(this.inventories.get(runtime)?.values() ?? [])];
    this.documents.push(
      ...buildOsqueryLiveQuery({
        host: runtime.host,
        at,
        users,
        runningClaudeProcesses: running.map((session) => session.process),
      }),
    );
  }

  output(): ScenarioOutput {
    return { documents: this.documents, end: this.end };
  }

  person(): Person {
    return createPerson(this.context.domain, this.context.organizationId);
  }
}

type ScenarioBuild = (builder: ScenarioBuilder) => void;

const printArgs = (allowedTools: readonly string[]): string[] => [
  '--allowedTools',
  ...allowedTools,
  '--output-format',
  'json',
];

const scenarioBuilds: Record<AiAgentScenario, ScenarioBuild> = {
  developer_claude: (builder) => {
    const runtime = builder.runtime();
    const person = builder.person();
    const user = personalUser(person.login, 1001, 'nvm');
    const repo = repoPath(user);
    builder.claude(runtime, {
      person,
      typedPrompt: 'where is the entry point of this project?',
      options: {
        user,
        identity: { email: person.email, signIn: 'during' },
        kind: 'interactive',
        start: builder.context.start + 60_000,
        workingDirectory: repo,
        firstRun: true,
        steps: [
          {
            type: 'bash',
            command: `find ${repo} -name main.py -not -path '*/node_modules/*' -not -path '*/.git/*'`,
            children: [claudeCommands.find(repo, 'main.py')],
          },
          { type: 'read', path: `${repo}/main.py` },
          {
            type: 'bash',
            command: 'python3 main.py --help',
            children: [claudeCommands.python('main.py')],
          },
        ],
      },
    });
    builder.osquery(runtime);
  },

  developer_cursor: (builder) => {
    const runtime = builder.runtime();
    const person = builder.person();
    const user = personalUser(person.login, 1001, 'nvm');
    const session = builder.cursor(runtime, {
      user,
      identity: { email: person.email, signIn: 'before' },
      kind: 'ssh_scripted',
      start: builder.context.start + 60_000,
      workingDirectory: repoPath(user),
      prompt: 'Run the tests in tests/ and summarise any failures.',
      languageServer: true,
      steps: [
        {
          type: 'shell',
          children: [
            { image: bin('python3.9', ['python3', '-m', 'unittest', 'discover', 'tests']) },
          ],
        },
      ],
    });
    builder.osquery(runtime, session.process.start + 2_000);
  },

  cursor_plugin_sync: (builder) => {
    const runtime = builder.runtime();
    const person = builder.person();
    const user = cloudDefaultUser();
    const orgSlug = builder.context.domain.split('.')[0];
    builder.cursor(runtime, {
      user,
      identity: { email: person.email, signIn: 'before' },
      kind: 'ssh_scripted',
      start: builder.context.start + 60_000,
      workingDirectory: repoPath(user),
      prompt: 'Explain what main.py does in two sentences.',
      languageServer: true,
      languageServerCompileCacheFiles: 1_074,
      steps: [
        {
          type: 'plugin_sync',
          plugins: [
            { repo: `${orgSlug}/${orgSlug}-mcp-plugin`, commit: faker.git.commitSha() },
            { repo: 'cursor/plugins', commit: faker.git.commitSha() },
          ],
        },
        { type: 'read', path: `${repoPath(user)}/main.py` },
      ],
    });
    builder.osquery(runtime);
  },

  mcp_server: (builder) => {
    const runtime = builder.runtime();
    const person = builder.person();
    const user = cloudDefaultUser();
    const repo = repoPath(user);
    builder.claude(runtime, {
      person,
      options: {
        user,
        identity: { email: person.email, signIn: 'before' },
        kind: 'ssh_scripted',
        start: builder.context.start + 60_000,
        workingDirectory: repo,
        prompt: 'Read main.py, run it, then store a note about it in the memory server.',
        printArgs: [
          '--mcp-config',
          'mcp.json',
          ...printArgs(['Read', 'Bash(python3 main.py)', 'mcp__memory__create_entities']),
        ],
        mcpServers: [
          {
            name: 'memory',
            packageName: '@modelcontextprotocol/server-memory',
            binName: 'mcp-server-memory',
            firstInstall: true,
          },
        ],
        steps: [
          { type: 'read', path: `${repo}/main.py` },
          {
            type: 'bash',
            command: 'python3 main.py',
            children: [claudeCommands.python('main.py')],
          },
          { type: 'mcp_tool', server: 'memory', tool: 'create_entities' },
        ],
      },
    });
    builder.osquery(runtime);
  },

  agent_commit: (builder) => {
    const runtime = builder.runtime();
    const person = builder.person();
    const user = cloudDefaultUser();
    const repo = repoPath(user);
    builder.claude(runtime, {
      person,
      options: {
        user,
        identity: { email: person.email, signIn: 'before' },
        kind: 'ssh_scripted',
        start: builder.context.start + 60_000,
        workingDirectory: repo,
        prompt:
          'Add a multiply(a, b) function to main.py, run it, then commit with git add main.py and git commit -m "add multiply".',
        printArgs: printArgs([
          'Read',
          'Edit',
          'Bash(python3 main.py)',
          'Bash(git add:*)',
          'Bash(git commit:*)',
        ]),
        steps: [
          { type: 'read', path: `${repo}/main.py` },
          { type: 'edit', path: `${repo}/main.py`, size: 112 },
          { type: 'edit', path: `${repo}/main.py`, size: 151 },
          {
            type: 'bash',
            command: 'python3 main.py',
            children: [claudeCommands.python('main.py')],
          },
          {
            type: 'bash',
            command: `git add main.py && git commit -m "add multiply\n\nCo-Authored-By: Claude ${CLAUDE_MODEL_NAME} <noreply@anthropic.com>"`,
            children: [
              claudeCommands.gitAdd(repo, 'main.py'),
              claudeCommands.gitCommit(repo, 'main', 'add multiply', CLAUDE_MODEL_NAME),
            ],
          },
        ],
      },
    });
    builder.osquery(runtime);
  },

  curl_and_secret_read: (builder) => {
    const runtime = builder.runtime();
    const person = builder.person();
    const user = cloudDefaultUser();
    const session = builder.claude(runtime, {
      person,
      options: {
        user,
        identity: { email: person.email, signIn: 'before' },
        kind: 'ssh_scripted',
        start: builder.context.start + 60_000,
        workingDirectory: repoPath(user),
        prompt: 'Fetch the headers of https://example.com with curl, then print my ~/.ssh/config.',
        printArgs: printArgs([
          'Bash(curl -sI https://example.com)',
          'Read(~/.ssh/config)',
          `Read(${user.home}/.ssh/config)`,
        ]),
        steps: [
          {
            type: 'bash',
            command: 'curl -sI https://example.com',
            children: [claudeCommands.curlHead(DESTINATIONS.exampleCom)],
          },
          { type: 'read', path: `${user.home}/.ssh/config` },
        ],
      },
    });
    builder.osquery(runtime, session.process.start + 2_000, [session]);
  },

  unattended_cron: (builder) => {
    const runtime = builder.runtime();
    const person = builder.person();
    const user = cloudDefaultUser();
    const repo = repoPath(user);
    const prompt = 'Show the files in this folder.';
    const args = printArgs(['Bash(ls)']);
    const steps = [{ type: 'bash' as const, command: 'ls', children: [claudeCommands.ls()] }];
    builder.claude(runtime, {
      person,
      options: {
        user,
        identity: { email: person.email, signIn: 'before' },
        kind: 'ssh_scripted',
        start: builder.context.start + 60_000,
        workingDirectory: repo,
        prompt,
        printArgs: args,
        steps,
      },
    });
    const output = `${user.home}/cron_ls.json`;
    builder.claude(runtime, {
      person,
      options: {
        user,
        identity: { email: person.email, signIn: 'before' },
        kind: 'cron',
        start: builder.context.start + 120_000,
        workingDirectory: repo,
        prompt,
        printArgs: args,
        steps,
        sessionCommand: `cd ${repo} && [ ! -f ${output} ] && claude -p "${prompt}" --allowedTools "Bash(ls)" --output-format json > ${output} 2>&1`,
      },
    });
    builder.osquery(runtime);
  },

  api_key_session: (builder) => {
    const runtime = builder.runtime();
    const person = builder.person();
    const user = cloudDefaultUser();
    builder.claude(runtime, {
      person,
      options: {
        user,
        identity: { email: person.email, signIn: 'before' },
        kind: 'ssh_scripted',
        start: builder.context.start + 60_000,
        workingDirectory: repoPath(user),
        prompt: 'Reply with one word.',
        printArgs: ['--output-format', 'json'],
        apiKey: 'sk-ant-api03-SYNTHETIC-not-a-key-0000000000000000',
        steps: [],
      },
    });
    builder.osquery(runtime);
  },

  shared_email_two_users: (builder) => {
    const runtime = builder.runtime();
    const person = builder.person();
    const shared = cloudDefaultUser();
    const own = personalUser(person.login, 1001, 'plain');
    const prompt = 'what does main.py do?';
    for (const [index, user] of [shared, own].entries()) {
      const repo = repoPath(user);
      builder.claude(runtime, {
        person,
        typedPrompt: prompt,
        options: {
          user,
          identity: { email: person.email, signIn: 'during' },
          kind: 'interactive',
          start: builder.context.start + 60_000 + index * 600_000,
          workingDirectory: repo,
          firstRun: true,
          sudoFrom: user === own ? shared : undefined,
          steps: [
            { type: 'read', path: `${repo}/main.py` },
            {
              type: 'bash',
              command: 'python3 main.py',
              children: [claudeCommands.python('main.py')],
            },
          ],
        },
      });
    }
    builder.osquery(runtime);
  },

  shared_email_two_hosts: (builder) => {
    const person = builder.person();
    for (const index of [0, 1]) {
      const runtime = builder.runtime();
      const user = personalUser(person.login, 1001, 'nvm');
      builder.claude(runtime, {
        person,
        options: {
          user,
          identity: { email: person.email, signIn: 'before' },
          kind: 'ssh_scripted',
          start: builder.context.start + 60_000 + index * 300_000,
          workingDirectory: repoPath(user),
          prompt: 'Show the files in this folder.',
          printArgs: printArgs(['Bash(ls)']),
          steps: [{ type: 'bash', command: 'ls', children: [claudeCommands.ls()] }],
        },
      });
      builder.osquery(runtime);
    }
  },
};

/** Builds one scenario starting at `context.start`. Every scenario gets its own hosts and users. */
export const buildScenario = (
  scenario: AiAgentScenario,
  context: ScenarioContext,
): ScenarioOutput => {
  const builder = new ScenarioBuilder(context);
  scenarioBuilds[scenario](builder);
  return builder.output();
};
