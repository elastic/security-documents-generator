import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { faker } from '@faker-js/faker';
import { applyNamespace, buildAiAgentDocuments, parseScenarios } from './ai_agents.ts';
import { RULE_TRIP_EXPECTATIONS, RULE_TRIP_SCENARIOS } from './rule_trip_scenarios.ts';
import {
  AI_AGENT_SCENARIOS,
  POC_MOCK_SCENARIOS,
  SCENARIO_GROUPS,
  type AiAgentScenario,
} from './scenarios.ts';
import { STORYLINE_HOSTS } from './storyline.ts';
import {
  CURSOR_AUDIT_INDEX,
  ENDPOINT_ALERTS_INDEX,
  ENDPOINT_FILE_INDEX,
  ENDPOINT_NETWORK_INDEX,
  ENDPOINT_PROCESS_INDEX,
  ENTRA_USER_INDEX,
  OKTA_USER_INDEX,
  POC_MOCK_TAG,
  seedClaudeCodeOtel,
  seedIdentityContext,
} from '../../generators/ai_agents/index.ts';

type Source = Record<string, unknown>;

interface ProcessFields {
  entity_id: string;
  name: string;
  executable: string;
  args: string[];
  command_line: string;
  Ext: { ancestry: string[] };
  ai_agent?: { name: string; is_descendant: boolean; email?: string };
  parent?: { name: string; command_line: string; entity_id: string };
  entry_leader?: { entry_meta: { type: string } };
}

const NOW = Date.parse('2026-11-26T12:00:00.000Z');

const processOf = (source: Source): ProcessFields => source.process as ProcessFields;
const actionsOf = (source: Source): string[] => (source.event as { action: string[] }).action;
const labelsOf = (source: Source) =>
  source.labels as { poc_scenario: string; poc_install_shape?: string };
const tagsOf = (source: Source): string[] => (source.tags as string[] | undefined) ?? [];
const hostOf = (source: Source) =>
  source.host as { id: string; name: string; os: { type: string } };

const generate = (scenarios: readonly AiAgentScenario[], cursorAudit: boolean) => {
  faker.seed(4321);
  seedClaudeCodeOtel(4321);
  seedIdentityContext(4321);
  return buildAiAgentDocuments(
    {
      scenarios,
      repeat: 1,
      timeWindowMs: 3 * 60 * 60 * 1000,
      claudeOtel: false,
      sessionData: true,
      domain: 'example.com',
      cursorAudit,
    },
    NOW,
  );
};

describe('demo scenarios', () => {
  let demo: ReturnType<typeof generate>;
  const sources = (scenario?: AiAgentScenario, index?: string): Source[] =>
    demo
      .filter((entry) => scenario === undefined || entry.scenario === scenario)
      .flatMap((entry) => entry.documents)
      .filter((doc) => index === undefined || doc.index === index)
      .map((doc) => doc.source);
  const execs = (scenario: AiAgentScenario): Source[] =>
    sources(scenario, ENDPOINT_PROCESS_INDEX).filter((source) =>
      actionsOf(source).includes('exec'),
    );
  const agentExec = (scenario: AiAgentScenario): ProcessFields => {
    const exec = execs(scenario).find(
      (source) => processOf(source).ai_agent?.is_descendant === false,
    );
    assert.ok(exec, `no agent exec in ${scenario}`);
    return processOf(exec);
  };

  before(() => {
    demo = generate(SCENARIO_GROUPS.demo, true);
  });

  it('expands groups, keeps all as the lab scenarios and rejects unknown names', () => {
    assert.deepEqual(parseScenarios('all'), [...AI_AGENT_SCENARIOS]);
    assert.deepEqual(parseScenarios('storyline,storyline'), ['storyline']);
    assert.equal(parseScenarios('demo').length, SCENARIO_GROUPS.demo.length);
    assert.throws(() => parseScenarios('nope'), /Unknown scenario/);
  });

  it('writes no document after now', () => {
    for (const source of sources()) {
      assert.ok(Date.parse(String(source['@timestamp'])) <= NOW);
    }
  });

  it('labels every document with its scenario, and Endpoint documents with one install shape', () => {
    for (const { scenario, documents } of demo) {
      for (const { index, source } of documents) {
        assert.equal(labelsOf(source).poc_scenario, scenario);
        if (scenario in RULE_TRIP_EXPECTATIONS && index.startsWith('logs-endpoint.')) {
          const { install, os } =
            RULE_TRIP_EXPECTATIONS[scenario as keyof typeof RULE_TRIP_EXPECTATIONS];
          assert.equal(labelsOf(source).poc_install_shape, `${install} (${os})`);
        }
      }
    }
  });

  it('tags inferred documents poc-mock and leaves observed shapes untagged', () => {
    for (const { scenario, documents } of demo) {
      for (const { index, source } of documents) {
        const mock = tagsOf(source).includes(POC_MOCK_TAG);
        if (POC_MOCK_SCENARIOS.has(scenario)) {
          assert.ok(mock, `${scenario} ${index}`);
        }
        if (
          [ENDPOINT_ALERTS_INDEX, CURSOR_AUDIT_INDEX, OKTA_USER_INDEX, ENTRA_USER_INDEX].includes(
            index,
          )
        ) {
          assert.ok(mock, `${scenario} ${index}`);
        }
        if (hostOf(source)?.os?.type && hostOf(source).os.type !== 'linux') {
          assert.ok(mock, `${scenario} non-Linux ${index}`);
        }
      }
    }
    const storylineDefend = sources('storyline').filter(
      (source) => (source.event as { kind?: string }).kind === 'event' && source.process,
    );
    assert.ok(storylineDefend.length > 1_000);
    assert.equal(
      storylineDefend.filter((source) => tagsOf(source).includes(POC_MOCK_TAG)).length,
      0,
    );
  });

  it('gives each install method the process name and executable the rules see', () => {
    const cases: Array<[AiAgentScenario, string, RegExp]> = [
      [
        'rule_permission_bypass_native',
        '2.1.332',
        /\/\.local\/share\/claude\/versions\/2\.1\.332$/,
      ],
      [
        'install_claude_brew',
        'claude',
        /^\/opt\/homebrew\/Caskroom\/claude-code\/2\.1\.332\/claude$/,
      ],
      ['install_claude_npm', 'node', /\/bin\/node$/],
      ['install_claude_windows', 'claude.exe', /^C:\\Users\\.+\\\.local\\bin\\claude\.exe$/],
      [
        'rule_secret_imds_cursor_cli_macos',
        'node',
        /\/\.local\/share\/cursor-agent\/versions\/.+\/node$/,
      ],
      [
        'install_cursor_ide',
        'Cursor Helper (Plugin)',
        /Cursor Helper \(Plugin\)\.app\/Contents\/MacOS\/Cursor Helper \(Plugin\)$/,
      ],
    ];
    for (const [scenario, name, executable] of cases) {
      const agent = agentExec(scenario);
      assert.equal(agent.name, name, scenario);
      assert.match(agent.executable, executable, scenario);
    }
    assert.ok(
      agentExec('install_claude_npm').args.some((arg) =>
        arg.includes('@anthropic-ai/claude-code/cli.js'),
      ),
    );
  });

  it('starts native Claude and npm Claude with the permission bypass flags, and cursor-agent with --force', () => {
    assert.ok(
      agentExec('rule_permission_bypass_native').args.includes('--dangerously-skip-permissions'),
    );
    const npm = agentExec('rule_permission_bypass_npm').args;
    assert.equal(npm[npm.indexOf('--permission-mode') + 1], 'bypassPermissions');
    assert.ok(agentExec('rule_permission_bypass_cursor_cli').args.includes('--force'));
  });

  it("runs destructive aws under Claude's snapshot shell, and under Cursor's fd-5 shell", () => {
    const awsParent = (scenario: AiAgentScenario) =>
      processOf(execs(scenario).find((source) => processOf(source).name === 'aws') as Source)
        .parent;
    assert.match(
      awsParent('rule_destructive_aws_native')?.command_line ?? '',
      /\/\.claude\/shell-snapshots\//,
    );
    assert.doesNotMatch(
      awsParent('rule_destructive_aws_cursor_cli')?.command_line ?? '',
      /shell-snapshots/,
    );
    assert.ok(awsParent('rule_destructive_aws_native')?.name === 'bash');
  });

  it('puts the injected prompt on the parent of every Claude and Cursor tool shell', () => {
    for (const scenario of [
      'rule_prompt_injection_native',
      'rule_prompt_injection_cursor_cli',
    ] as const) {
      const shells = execs(scenario).filter(
        (source) =>
          processOf(source).name === 'bash' &&
          (processOf(source).parent?.command_line ?? '').includes('Ignore previous instructions'),
      );
      assert.ok(shells.length >= 1, scenario);
    }
  });

  it("starts gcc and a base64 upload directly from the MCP server's node", () => {
    const children = execs('rule_mcp_server_child_native').filter((source) =>
      (processOf(source).parent?.command_line ?? '').includes('.bin/mcp-server-build-helper'),
    );
    assert.deepEqual(children.map((source) => processOf(source).name).sort(), ['gcc', 'python3.9']);
    const python = children.find((source) => processOf(source).name === 'python3.9') as Source;
    const upload = sources('rule_mcp_server_child_native', ENDPOINT_NETWORK_INDEX).find(
      (source) =>
        processOf(source).entity_id === processOf(python).entity_id &&
        actionsOf(source).includes('connection_attempted'),
    );
    assert.ok(upload);
    assert.match(String((upload.destination as { ip: string }).ip), /^2001:db8:/);
  });

  it('reads a secret then calls IMDS from the same process on macOS', () => {
    for (const scenario of [
      'rule_secret_imds_npm_macos',
      'rule_secret_imds_native_macos',
    ] as const) {
      const open = sources(scenario, ENDPOINT_FILE_INDEX).find((source) =>
        (source.file as { path: string }).path.endsWith('/.ssh/id_ed25519'),
      ) as Source;
      const imds = sources(scenario, ENDPOINT_NETWORK_INDEX).find(
        (source) => (source.destination as { ip: string }).ip === '169.254.169.254',
      ) as Source;
      assert.deepEqual(actionsOf(open), ['open']);
      assert.equal((open.event as { outcome: string }).outcome, 'success');
      assert.equal(processOf(open).entity_id, processOf(imds).entity_id);
    }
  });

  it('keeps Linux file events on outcome unknown with no open events, as the lab had', () => {
    const files = sources('rule_sensitive_files_native', ENDPOINT_FILE_INDEX);
    assert.ok(files.length > 0);
    for (const source of files) {
      assert.equal((source.event as { outcome: string }).outcome, 'unknown');
      assert.notDeepEqual(actionsOf(source), ['open']);
    }
  });

  it('writes CLAUDE.md into Downloads from tar and from curl', () => {
    const writers = sources('rule_instruction_file_native', ENDPOINT_FILE_INDEX)
      .filter((source) =>
        /\/home\/[^/]+\/Downloads\/.*CLAUDE\.md$/.test((source.file as { path: string }).path),
      )
      .map((source) => processOf(source).name)
      .sort();
    assert.deepEqual(writers, ['curl', 'tar']);
  });

  it('gives macOS agent network events destination.domain and Windows ones DNS only', () => {
    const domain = (scenario: AiAgentScenario) =>
      sources(scenario, ENDPOINT_NETWORK_INDEX)
        .map((source) => (source.destination as { domain?: string }).domain)
        .filter(Boolean);
    assert.deepEqual(domain('rule_suspicious_domain_brew'), ['setup.agentkit-notes.xyz']);
    assert.deepEqual(domain('rule_suspicious_domain_windows'), []);
    assert.ok(
      sources('rule_suspicious_domain_windows', ENDPOINT_NETWORK_INDEX).some((source) =>
        (source.dns as { question?: { name: string } } | undefined)?.question?.name?.endsWith(
          '.xyz',
        ),
      ),
    );
  });

  it('writes Defend alerts on agent descendants with process.ai_agent and the agent in the ancestry', () => {
    for (const scenario of ['defend_alerts_native', 'defend_alerts_brew'] as const) {
      const alerts = sources(scenario, ENDPOINT_ALERTS_INDEX);
      const agentId = agentExec(scenario).entity_id;
      assert.deepEqual(alerts.map((source) => (source.event as { code: string }).code).sort(), [
        'behavior',
        'malicious_file',
        'memory_signature',
      ]);
      for (const source of alerts) {
        assert.equal((source.event as { kind: string }).kind, 'alert');
        assert.equal(processOf(source).ai_agent?.is_descendant, true);
        assert.equal(processOf(source).ai_agent?.email, undefined);
        assert.ok(processOf(source).Ext.ancestry.includes(agentId));
      }
      const detections = new Set(
        alerts.map(
          (source) =>
            (source.rule as { name?: string } | undefined)?.name ??
            (source.event as { code: string }).code,
        ),
      );
      assert.equal(detections.size, 3);
    }
  });

  it('builds the storyline: the person on three installs, two agents on the build server, IdP context', () => {
    const storyline = sources('storyline', ENDPOINT_PROCESS_INDEX);
    const email = 'avery.quinn@example.com';
    const installs = new Set(
      storyline
        .filter((source) => processOf(source).ai_agent?.email === email)
        .map((source) => `${hostOf(source).name}@${(source.user as { name: string }).name}`),
    );
    assert.deepEqual([...installs].sort(), [
      `${STORYLINE_HOSTS.buildServer}@ec2-user`,
      `${STORYLINE_HOSTS.devVm}@aquinn`,
      `${STORYLINE_HOSTS.jumpHost}@ec2-user`,
    ]);
    const buildAgents = new Set(
      storyline
        .filter(
          (source) =>
            hostOf(source).name === STORYLINE_HOSTS.buildServer &&
            processOf(source).ai_agent?.is_descendant === false,
        )
        .map((source) => (source.user as { name: string }).name),
    );
    assert.deepEqual([...buildAgents].sort(), ['ec2-user', 'jblake']);
    const bot = storyline.find(
      (source) =>
        processOf(source).args.includes('--dangerously-skip-permissions') &&
        actionsOf(source).includes('exec'),
    ) as Source;
    assert.equal(processOf(bot).entry_leader?.entry_meta.type, 'init');
    assert.match(processOf(bot).command_line, /Ignore previous instructions/);
    assert.ok(storyline.some((source) => processOf(source).name === 'aws'));

    const okta = sources('storyline', OKTA_USER_INDEX).find(
      (source) => (source.user as { email: string }).email === email,
    ) as Source;
    assert.equal(
      (okta.user as { account: { status: { deprovisioned: boolean } } }).account.status
        .deprovisioned,
      true,
    );
    const entra = sources('storyline', ENTRA_USER_INDEX)[0];
    assert.equal(
      (entra.entityanalytics_entra_id as { user: { account_enabled: boolean } }).user
        .account_enabled,
      true,
    );
    assert.ok(
      [...sources('storyline', OKTA_USER_INDEX), entra].every(
        (source) => (source.user as { entity?: unknown }).entity === undefined,
      ),
    );
    assert.deepEqual(
      sources('storyline', ENDPOINT_ALERTS_INDEX)
        .map((source) => (source.event as { code: string }).code)
        .sort(),
      ['behavior', 'malicious_file'],
    );
  });

  it('gives every employee one active Okta user, and leaves three contractors and two personal accounts without one', () => {
    const scenarioOf = new Map<string, string>();
    for (const source of sources(undefined, ENDPOINT_PROCESS_INDEX)) {
      const email = processOf(source).ai_agent?.email;
      if (email) {
        scenarioOf.set(email, labelsOf(source).poc_scenario);
      }
    }
    const oktaUsers = sources(undefined, OKTA_USER_INDEX).map(
      (source) => source.user as { email: string; full_name: string; profile: { status: string } },
    );
    const oktaEmails = oktaUsers.map(({ email }) => email);
    assert.equal(new Set(oktaEmails).size, oktaEmails.length);
    assert.ok(oktaEmails.every((email) => scenarioOf.has(email)));
    assert.equal(oktaUsers.length, scenarioOf.size - 5);
    for (const { email, full_name: fullName, profile } of oktaUsers) {
      assert.match(fullName, /^\S+ \S+/);
      if (email !== 'avery.quinn@example.com') {
        assert.equal(profile.status, 'ACTIVE', email);
      }
    }
    assert.ok(!JSON.stringify(sources(undefined, OKTA_USER_INDEX)).includes('mfa'));

    const withoutIdp = [...scenarioOf.keys()].filter((email) => !oktaEmails.includes(email));
    assert.deepEqual(
      withoutIdp
        .filter((email) => email.endsWith('@example.com'))
        .map((email) => scenarioOf.get(email))
        .sort(),
      ['install_claude_windows', 'rule_compile_brew', 'rule_llm_endpoint_native'],
    );
    const personal = withoutIdp.filter((email) => email.endsWith('@example.net'));
    assert.deepEqual(personal.map((email) => scenarioOf.get(email)).sort(), [
      'rule_prompt_injection_cursor_cli',
      'rule_sensitive_files_brew',
    ]);
    assert.ok(
      [...scenarioOf.keys()].every(
        (email) => email.endsWith('@example.com') || email.endsWith('@example.net'),
      ),
    );
    assert.ok(!JSON.stringify(sources(undefined, CURSOR_AUDIT_INDEX)).includes('@example.net'));
  });

  it('leaves the dev-aquinn-01 session running: no end event for Claude, ends for its tool commands', () => {
    const storyline = sources('storyline', ENDPOINT_PROCESS_INDEX);
    const dev = storyline.filter((source) => hostOf(source).name === STORYLINE_HOSTS.devVm);
    const root = dev.find(
      (source) =>
        processOf(source).ai_agent?.is_descendant === false &&
        processOf(source).args.join(' ') === 'claude',
    );
    assert.ok(root);
    const rootId = processOf(root).entity_id;
    const rootEvents = dev.filter((source) => processOf(source).entity_id === rootId);
    assert.deepEqual(
      rootEvents.map((source) => actionsOf(source)),
      [['fork', 'exec']],
    );
    assert.ok(
      dev.some(
        (source) =>
          processOf(source).Ext.ancestry.includes(rootId) &&
          processOf(source).name === 'ls' &&
          actionsOf(source).includes('end'),
      ),
    );
    const latest = (events: Source[]) =>
      Math.max(...events.map((source) => Date.parse(String(source['@timestamp']))));
    assert.equal(latest(dev), latest(storyline));

    const otherRoots = storyline.filter(
      (source) =>
        hostOf(source).name !== STORYLINE_HOSTS.devVm &&
        processOf(source).ai_agent?.is_descendant === false &&
        processOf(source).args[0] === 'claude',
    );
    for (const id of new Set(otherRoots.map((source) => processOf(source).entity_id))) {
      assert.ok(
        storyline.some(
          (source) => processOf(source).entity_id === id && actionsOf(source).includes('end'),
        ),
      );
    }
  });

  it('writes Cursor audit events only with the flag, without changing anything else for a seed', () => {
    const lab = ['developer_cursor', 'storyline'] as const;
    const withAudit = generate(lab, true).flatMap((entry) => entry.documents);
    const without = generate(lab, false).flatMap((entry) => entry.documents);
    assert.ok(withAudit.some((doc) => doc.index === CURSOR_AUDIT_INDEX));
    assert.equal(without.filter((doc) => doc.index === CURSOR_AUDIT_INDEX).length, 0);
    const ids = (docs: typeof without) =>
      docs
        .filter((doc) => doc.index === ENDPOINT_PROCESS_INDEX)
        .map((doc) => processOf(doc.source).entity_id);
    assert.deepEqual(ids(withAudit), ids(without));
    const removal = withAudit.find(
      (doc) => (doc.source.event as { action: string }).action === 'remove_user',
    );
    assert.equal(
      (removal?.source.user as { target: { email: string } }).target.email,
      'avery.quinn@example.com',
    );
  });

  it('moves documents to another namespace', () => {
    const [doc] = sources('install_claude_npm', ENDPOINT_PROCESS_INDEX);
    const moved = applyNamespace(
      { index: ENDPOINT_PROCESS_INDEX, source: structuredClone(doc) },
      'gen-demo',
    );
    assert.equal(moved.index, 'logs-endpoint.events.process-gen-demo');
    assert.equal((moved.source.data_stream as { namespace: string }).namespace, 'gen-demo');
    assert.equal(
      applyNamespace({ index: 'plain-index', source: {} }, 'gen-demo').index,
      'plain-index',
    );
  });

  it('has an expectation for every rule-trip scenario', () => {
    assert.deepEqual(Object.keys(RULE_TRIP_EXPECTATIONS).sort(), [...RULE_TRIP_SCENARIOS].sort());
  });
});
