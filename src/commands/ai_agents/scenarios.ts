import { faker } from '@faker-js/faker';
import {
  buildClaudeCodeOtelEvents,
  buildClaudeCodeSession,
  buildCursorAuditEvents,
  buildCursorSession,
  buildDefendAlert,
  buildOktaUser,
  buildOsqueryLiveQuery,
  bin,
  claudeCommands,
  DESTINATIONS,
  MockAgentRun,
  orgTelemetryCollector,
  POC_MOCK_TAG,
  randomJob,
  type ClaudeCodeSessionOptions,
  type ClaudeCodeSessionResult,
  type CursorAuditEvent,
  type DefendAlertDetails,
  type GeneratedDocument,
  type HostRuntime,
  type MockAgentRunOptions,
  type OsqueryUserInventory,
  type OsUser,
} from '../../generators/ai_agents/index.ts';
import {
  INSTALL_VARIANT_BUILDS,
  INSTALL_VARIANT_SCENARIOS,
  INSTALL_VARIANT_SHAPES,
} from './install_variant_scenarios.ts';
import {
  RULE_TRIP_BUILDS,
  RULE_TRIP_EXPECTATIONS,
  RULE_TRIP_MOCK_SCENARIOS,
  RULE_TRIP_SCENARIOS,
} from './rule_trip_scenarios.ts';
import { CLAUDE_MODEL_NAME, DEMO_REPO, printArgs, repoPath } from './scenario_helpers.ts';
import { historyStart } from './history.ts';
import { STORYLINE_BUILDS, STORYLINE_SCENARIOS } from './storyline.ts';
import {
  cloudDefaultUser,
  createPerson,
  createRuntime,
  PERSONAL_EMAIL_DOMAIN,
  personalUser,
  rootUser,
  serviceUser,
  sshClientIp,
  type AccountKind,
  type HostOptions,
  type Person,
} from './synthetic_identities.ts';

/** The lab-grounded scenarios. `--scenarios all` still means these, so seeded reloads don't change. */
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
  'shared_os_user_two_emails',
  'sudo_to_root',
  'service_accounts',
] as const;

export type LabScenario = (typeof AI_AGENT_SCENARIOS)[number];

export const ALL_SCENARIOS = [
  ...AI_AGENT_SCENARIOS,
  ...RULE_TRIP_SCENARIOS,
  ...INSTALL_VARIANT_SCENARIOS,
  ...STORYLINE_SCENARIOS,
] as const;

export type AiAgentScenario = (typeof ALL_SCENARIOS)[number];

/** Names that expand to several scenarios in `--scenarios`. */
export const SCENARIO_GROUPS: Readonly<Record<string, readonly AiAgentScenario[]>> = {
  all: AI_AGENT_SCENARIOS,
  lab: AI_AGENT_SCENARIOS,
  rule_trips: RULE_TRIP_SCENARIOS,
  defend_alerts: RULE_TRIP_SCENARIOS.filter((name) => name.startsWith('defend_alerts_')),
  install_variants: INSTALL_VARIANT_SCENARIOS,
  demo: [...RULE_TRIP_SCENARIOS, ...INSTALL_VARIANT_SCENARIOS, ...STORYLINE_SCENARIOS],
};

export const EXTRAPOLATED_SCENARIOS: ReadonlySet<AiAgentScenario> = new Set<AiAgentScenario>([
  'shared_email_two_hosts',
  'shared_os_user_two_emails',
  'sudo_to_root',
  'service_accounts',
  ...RULE_TRIP_SCENARIOS,
  ...INSTALL_VARIANT_SCENARIOS,
  ...STORYLINE_SCENARIOS,
]);

/** Scenarios whose every document is `poc-mock`. Others mark only their inferred documents. */
export const POC_MOCK_SCENARIOS: ReadonlySet<AiAgentScenario> = new Set<AiAgentScenario>([
  ...RULE_TRIP_MOCK_SCENARIOS,
  ...INSTALL_VARIANT_SCENARIOS,
]);

/** `labels.poc_install_shape` for scenarios with one install shape, as `<install method> (<os>)`. */
export const SCENARIO_INSTALL_SHAPES: Readonly<Partial<Record<AiAgentScenario, string>>> =
  Object.fromEntries(
    Object.entries({ ...RULE_TRIP_EXPECTATIONS, ...INSTALL_VARIANT_SHAPES }).map(
      ([name, { install, os }]) => [name, `${install} (${os})`],
    ),
  );

export interface ScenarioContext {
  readonly start: number;
  readonly domain: string;
  readonly organizationId: string;
  readonly claudeOtel: boolean;
  readonly sessionData: boolean;
  /** Also write Cursor audit events for the scenario's Cursor users. */
  readonly cursorAudit: boolean;
  /** Days of quiet history ending with the scenario's own day (`history.ts`). 0 writes none. */
  readonly historyDays: number;
}

export interface ScenarioOutput {
  readonly documents: GeneratedDocument[];
  readonly end: number;
}

const CLAUDE_MODEL_ID = 'claude-sonnet-5-5';

interface ClaudeRun {
  readonly options: Omit<
    ClaudeCodeSessionOptions,
    'runtime' | 'clientIp' | 'sessionId' | 'telemetryCollector'
  >;
  readonly person: Person;
  /** The typed prompt for interactive sessions, used only for Claude Code OTel. */
  readonly typedPrompt?: string;
}

export class ScenarioBuilder {
  readonly documents: GeneratedDocument[] = [];
  readonly context: ScenarioContext;
  private readonly inventories = new Map<HostRuntime, Map<string, OsqueryUserInventory>>();
  private readonly mockDocuments = new Set<GeneratedDocument>();
  private readonly cursorUsers: Array<{ email: string; at: number }> = [];
  private readonly historyBuilds: Array<() => void> = [];
  end: number;

  constructor(context: ScenarioContext) {
    this.context = context;
    this.end = context.start;
  }

  runtime(options: HostOptions = {}): HostRuntime {
    return createRuntime(
      historyStart(this.context.start, this.context.historyDays),
      this.context.sessionData,
      options,
    );
  }

  /**
   * Back-fills quiet history with `--history-days`. It runs after every scenario's live sessions,
   * so the live data is the same for a seed with or without history.
   */
  history(build: () => void): void {
    if (this.context.historyDays > 0) {
      this.historyBuilds.push(build);
    }
  }

  writeHistory(): void {
    this.historyBuilds.splice(0).forEach((build) => build());
  }

  /** Adds documents, marking them `poc-mock` when `mock` is set. */
  push(documents: readonly GeneratedDocument[], { mock = false }: { mock?: boolean } = {}): void {
    this.documents.push(...documents);
    if (mock) {
      documents.forEach((doc) => this.mockDocuments.add(doc));
    }
    for (const doc of documents) {
      this.end = Math.max(this.end, Date.parse(String(doc.source['@timestamp'])));
    }
  }

  /** A compact agent run on `runtime`. Call `finish` when its behaviour is written. */
  mockRun(options: Omit<MockAgentRunOptions, 'clientIp'>): MockAgentRun {
    return new MockAgentRun({ ...options, clientIp: sshClientIp() });
  }

  finish(run: MockAgentRun, end: number, { mock = true }: { mock?: boolean } = {}): void {
    run.end(end);
    this.push(run.documents, { mock });
  }

  /** A Defend alert on the process of the first matching process event so far. Always `poc-mock`. */
  alertOn(
    match: (process: { name?: string; executable?: string; args?: string[] }) => boolean,
    details: DefendAlertDetails,
  ): void {
    const processEvent = this.documents.find(
      (doc) =>
        doc.index.startsWith('logs-endpoint.events.process') &&
        (doc.source.event as { action: string[] }).action.includes('exec') &&
        match(doc.source.process as { name?: string; executable?: string; args?: string[] }),
    );
    if (!processEvent) {
      throw new Error(`No process event matches the alert for ${details.signatureName}`);
    }
    this.push([buildDefendAlert(processEvent, details)], { mock: true });
  }

  cursorAuditEvents(events: readonly CursorAuditEvent[]): void {
    if (this.context.cursorAudit) {
      this.push(buildCursorAuditEvents(events), { mock: true });
    }
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
    if (options.identity.email.endsWith(`@${this.context.domain}`)) {
      this.cursorUsers.push({ email: options.identity.email, at: options.start });
    }
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

  /** Cursor audit for every Cursor user in the scenario: a web login before the run and an MCP server config. */
  private cursorUserAudit(): void {
    if (!this.context.cursorAudit) {
      return;
    }
    this.cursorAuditEvents(
      this.cursorUsers.flatMap(({ email, at }) => [
        { action: 'login' as const, at: at - 3_600_000, email },
        { action: 'mcp_server_config' as const, at: at - 3_000_000, email },
      ]),
    );
  }

  output(scenario: AiAgentScenario): ScenarioOutput {
    this.cursorUserAudit();
    const allMock = POC_MOCK_SCENARIOS.has(scenario);
    const installShape = SCENARIO_INSTALL_SHAPES[scenario];
    for (const doc of this.documents) {
      const source = doc.source as { labels?: Record<string, unknown>; tags?: string[] };
      source.labels = {
        ...source.labels,
        poc_scenario: scenario,
        ...(installShape &&
          doc.index.startsWith('logs-endpoint.') && { poc_install_shape: installShape }),
      };
      if ((allMock || this.mockDocuments.has(doc)) && !source.tags?.includes(POC_MOCK_TAG)) {
        source.tags = [...(source.tags ?? []), POC_MOCK_TAG];
      }
    }
    return { documents: this.documents, end: this.end };
  }

  /** A new person. Employees also get an active Okta user, so their installs resolve to them. */
  person(kind: AccountKind = 'employee'): Person {
    const { domain, organizationId, start } = this.context;
    const person = createPerson(
      kind === 'personal' ? PERSONAL_EMAIL_DOMAIN : domain,
      organizationId,
    );
    if (kind === 'employee') {
      this.push([buildOktaUser({ ...person, ...randomJob() }, { at: start, status: 'ACTIVE' })], {
        mock: true,
      });
    }
    return person;
  }
}

export type ScenarioBuild = (builder: ScenarioBuilder) => void;

const labScenarioBuilds: Record<LabScenario, ScenarioBuild> = {
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
            command: 'grep -n "def main" main.py',
            children: [claudeCommands.grep('def main', 'main.py')],
          },
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

  // A jump box: two people sign in to Claude Code, one after the other, under the shared OS user.
  shared_os_user_two_emails: (builder) => {
    const runtime = builder.runtime();
    const user = cloudDefaultUser();
    const repo = repoPath(user);
    for (const [index, person] of [builder.person(), builder.person()].entries()) {
      builder.claude(runtime, {
        person,
        typedPrompt: 'what does main.py do?',
        options: {
          user,
          identity: { email: person.email, signIn: 'during' },
          kind: 'interactive',
          start: builder.context.start + 60_000 + index * 600_000,
          workingDirectory: repo,
          firstRun: index === 0,
          steps: [{ type: 'read', path: `${repo}/main.py` }],
        },
      });
    }
    builder.osquery(runtime);
  },

  // Claude runs `sudo` as a descendant, then an admin starts Claude itself as root.
  sudo_to_root: (builder) => {
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
        prompt: 'Restart nginx and check it came back.',
        printArgs: printArgs(['Bash(sudo systemctl restart nginx)']),
        steps: [
          {
            type: 'bash',
            command: 'sudo systemctl restart nginx',
            children: [claudeCommands.sudo(claudeCommands.systemctlRestart('nginx'))],
          },
        ],
      },
    });
    const root = rootUser();
    builder.claude(runtime, {
      person,
      typedPrompt: 'why is the disk full?',
      options: {
        user: root,
        identity: { email: person.email, signIn: 'during' },
        kind: 'interactive',
        start: builder.context.start + 600_000,
        workingDirectory: root.home,
        firstRun: true,
        sudoFrom: user,
        steps: [{ type: 'bash', command: 'ls', children: [claudeCommands.ls()] }],
      },
    });
    builder.osquery(runtime);
  },

  // A Jenkins job that runs Claude with an API key, and a dev container whose user is `node`.
  service_accounts: (builder) => {
    const ciRuntime = builder.runtime();
    const ciUser = serviceUser('jenkins', 995, '/var/lib/jenkins');
    builder.claude(ciRuntime, {
      person: builder.person(),
      options: {
        user: ciUser,
        identity: { email: '', signIn: 'never' },
        kind: 'ssh_scripted',
        start: builder.context.start + 60_000,
        workingDirectory: `${ciUser.home}/workspace/${DEMO_REPO}`,
        prompt: 'Review the diff in this workspace and list risky changes.',
        printArgs: printArgs(['Read', 'Bash(git diff:*)']),
        steps: [{ type: 'read', path: `${ciUser.home}/workspace/${DEMO_REPO}/main.py` }],
      },
    });
    builder.osquery(ciRuntime);

    const containerRuntime = builder.runtime();
    const person = builder.person();
    const containerUser = serviceUser('node', 1000, '/home/node');
    builder.claude(containerRuntime, {
      person,
      typedPrompt: 'add a test for main.py',
      options: {
        user: containerUser,
        identity: { email: person.email, signIn: 'during' },
        kind: 'interactive',
        start: builder.context.start + 300_000,
        workingDirectory: `/workspace/${DEMO_REPO}`,
        firstRun: true,
        steps: [{ type: 'read', path: `/workspace/${DEMO_REPO}/main.py` }],
      },
    });
    builder.osquery(containerRuntime);
  },
};

const scenarioBuilds: Record<AiAgentScenario, ScenarioBuild> = {
  ...labScenarioBuilds,
  ...RULE_TRIP_BUILDS,
  ...INSTALL_VARIANT_BUILDS,
  ...STORYLINE_BUILDS,
};

/**
 * Builds one scenario's live sessions starting at `context.start`. Every scenario gets its own hosts
 * and users. Call `writeHistory` once every scenario is started, then `output`, which gives every
 * document `labels.poc_scenario`, because rules read all Endpoint namespaces.
 */
export const startScenario = (
  scenario: AiAgentScenario,
  context: ScenarioContext,
): ScenarioBuilder => {
  const builder = new ScenarioBuilder(context);
  scenarioBuilds[scenario](builder);
  return builder;
};
