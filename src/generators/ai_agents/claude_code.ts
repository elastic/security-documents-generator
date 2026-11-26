import { faker } from '@faker-js/faker';
import {
  createProcessNode,
  EndpointWriter,
  execImage,
  type HostRuntime,
  type PosixIdentity,
  type ProcessImage,
  type ProcessNode,
} from './endpoint_events.ts';
import { bin, claudePreambleTree, emitShellTree, runShortLived } from './linux_shell.ts';
import { DESTINATIONS, type Destination } from './network_destinations.ts';
import { startAgentSession } from './session_context.ts';
import { type ClaudeStampState, type ProcessRole } from './stamping.ts';
import {
  CLAUDE_CODE_VERSION,
  type AgentIdentity,
  type GeneratedDocument,
  type OsUser,
  type PosixGroup,
  type SessionKind,
} from './types.ts';

export interface FileWrite {
  readonly action: 'creation' | 'rename' | 'deletion';
  readonly path: string;
  readonly size?: number;
  readonly originalPath?: string;
  readonly entropy?: number;
}

export interface ClaudeToolCommand {
  readonly image: ProcessImage;
  readonly exitCode?: number;
  readonly durationMs?: number;
  /** The shell snapshot's `grep` and `find` functions re-exec Claude as `ugrep` and `bfs`, which Defend tags as the agent. */
  readonly selfReexec?: boolean;
  readonly files?: readonly FileWrite[];
  readonly connections?: readonly Destination[];
  readonly children?: readonly ClaudeToolCommand[];
  /** Forks a detached copy of itself, as `git maintenance run --detach` does. */
  readonly detaches?: boolean;
  /** The user a setuid command such as `sudo` switches to. Its children inherit it (extrapolated). */
  readonly runAs?: { readonly user: PosixIdentity; readonly group: PosixGroup };
}

export type ClaudeStep =
  | {
      readonly type: 'bash';
      readonly command: string;
      readonly children: readonly ClaudeToolCommand[];
    }
  | { readonly type: 'edit'; readonly path: string; readonly size: number }
  /** Reads and MCP tool calls leave no Defend event on Linux, so they only take time. */
  | { readonly type: 'read'; readonly path: string }
  | { readonly type: 'mcp_tool'; readonly server: string; readonly tool: string };

export interface McpServerSpec {
  readonly name: string;
  readonly packageName: string;
  readonly binName: string;
  /** The first `npx -y` run downloads the package, which Defend sees as file creations under `~/.npm/_npx`. */
  readonly firstInstall: boolean;
}

export interface ClaudeCodeSessionOptions {
  readonly runtime: HostRuntime;
  readonly user: OsUser;
  readonly identity: AgentIdentity;
  readonly kind: SessionKind;
  readonly start: number;
  readonly sessionId: string;
  readonly workingDirectory: string;
  /** Print mode (`claude -p <prompt>`) when set, which puts the prompt in `process.args`. */
  readonly prompt?: string;
  readonly printArgs?: readonly string[];
  /** The first interactive launch for this OS user, which syncs the official plugin marketplace. */
  readonly firstRun?: boolean;
  readonly steps: readonly ClaudeStep[];
  readonly mcpServers?: readonly McpServerSpec[];
  /** The org's OTel collector, which managed settings point Claude at. */
  readonly telemetryCollector?: Destination;
  readonly clientIp: string;
  readonly sudoFrom?: OsUser;
  /** An inline `ANTHROPIC_API_KEY=` before the command. Claude uses it, fails auth and exits. */
  readonly apiKey?: string;
  /** The shell command for scripted SSH and cron sessions. */
  readonly sessionCommand?: string;
}

export interface AgentProcessSummary {
  readonly pid: number;
  readonly parentPid: number;
  readonly start: number;
  readonly end: number;
  readonly executable: string;
  readonly commandLine: string;
  readonly workingDirectory: string;
  readonly userName: string;
}

export interface ClaudeCodeSessionResult {
  readonly documents: GeneratedDocument[];
  readonly sessionId: string;
  readonly process: AgentProcessSummary;
  readonly signedInAt: number | undefined;
  readonly sessionStartedAt: number;
  readonly firstPromptAt: number;
  /** Started without `-p`, so the session has a terminal. */
  readonly interactive: boolean;
  readonly steps: readonly ClaudeStep[];
  readonly mcpServers: readonly McpServerSpec[];
}

const INTERACTIVE_SIGN_IN_DELAY_MS = 34_000;
const INTERACTIVE_STARTUP_AFTER_SIGN_IN_MS = 20_000;
const INTERACTIVE_SESSION_AFTER_STARTUP_MS = 6_600;
const INTERACTIVE_PROMPT_AFTER_SESSION_MS = 25_000;
const PRINT_SESSION_START_MS = 450;
const PLUGIN_MARKETPLACE_FILES = 925;
const NPX_INSTALL_FILES = 1_600;
const IDE_SCAN =
  'ps aux | grep -E "code|cursor|windsurf|devin-desktop|idea|pycharm|webstorm|phpstorm|rubymine|clion|goland|rider|datagrip|dataspell|aqua|gateway|fleet|android-studio" | grep -v grep';

const CLAUDE_GIT_SAFE_CONFIG = [
  '-c',
  'core.askPass=',
  '-c',
  'protocol.ext.allow=never',
  '-c',
  `core.alternateRefsCommand=f() { git --git-dir="$1" for-each-ref --format='%(objectname)'; }; f`,
  '-c',
  'submodule.recurse=false',
  '-c',
  'log.showSignature=false',
  '-c',
  'format.pretty=medium',
  '-c',
  'gc.auto=0',
  '-c',
  'maintenance.auto=false',
  '-c',
  'diff.autoRefreshIndex=false',
  ...[
    'applypatch-msg',
    'pre-applypatch',
    'post-applypatch',
    'pre-commit',
    'pre-merge-commit',
    'prepare-commit-msg',
    'commit-msg',
    'post-commit',
    'pre-rebase',
    'post-checkout',
    'post-merge',
    'pre-push',
    'pre-receive',
    'update',
    'proc-receive',
    'post-receive',
    'post-update',
    'reference-transaction',
    'push-to-checkout',
    'pre-auto-gc',
    'post-rewrite',
    'sendemail-validate',
    'fsmonitor-watchman',
    'p4-changelist',
    'p4-prepare-changelist',
    'p4-post-changelist',
    'p4-pre-submit',
    'post-index-change',
  ].flatMap((hook) => ['-c', `hook.${hook}.enabled=false`]),
  '-c',
  'core.hooksPath=/dev/null',
  '-c',
  'core.fsmonitor=',
];

const SETTINGS_LOCAL_PROBE: ProcessImage = bin('git', [
  'git',
  '-c',
  'core.hooksPath=/dev/null',
  '-c',
  'core.fsmonitor=',
  '-c',
  'safe.bareRepository=explicit',
  '-c',
  'protocol.file.allow=never',
  'ls-files',
  '--error-unmatch',
  '--',
  ':(icase).claude/settings.local.json',
]);

const safeGit = (subcommand: readonly string[]): ProcessImage =>
  bin('git', ['/usr/bin/git', ...CLAUDE_GIT_SAFE_CONFIG, ...subcommand]);

/** Claude's repo probes in print mode, in the order and with the exit codes of the lab runs (repo with no remote). */
const PRINT_GIT_PROBES: ReadonlyArray<{ image: ProcessImage; exitCode: number }> = [
  { image: safeGit(['config', '--local', '--includes', '-z', '--list']), exitCode: 0 },
  { image: safeGit(['rev-parse', '--is-inside-work-tree', '--show-cdup']), exitCode: 0 },
  { image: safeGit(['--no-optional-locks', 'log', '--oneline', '-n', '5']), exitCode: 0 },
  { image: safeGit(['config', 'user.name']), exitCode: 0 },
  { image: safeGit(['config', '--worktree', '--includes', '-z', '--list']), exitCode: 0 },
  {
    image: safeGit(['--no-optional-locks', 'status', '--short', '--ignore-submodules=dirty']),
    exitCode: 0,
  },
  { image: SETTINGS_LOCAL_PROBE, exitCode: 1 },
  { image: safeGit(['remote', 'get-url', 'origin']), exitCode: 2 },
  { image: safeGit(['remote']), exitCode: 0 },
];

/** The verbatim start of the script Claude passes to `bash -c -l` to write its shell snapshot. */
const snapshotScript = (snapshotPath: string, home: string): string =>
  `SNAPSHOT_FILE=${snapshotPath}
      
      source "${home}/.bashrc" < /dev/null
      
      

      # First, create/clear the snapshot file
      echo "# Snapshot file" >| "$SNAPSHOT_FILE"

      # When this file is sourced, we first unalias to avoid conflicts
      # This is necessary because aliases get "frozen" inside function definitions at definition time,
      # which can cause unexpected behavior when functions use commands that conflict with aliases
      echo "# Unset all aliases to avoid conflicts with functions" >> "$SNAPSHOT_FILE"
      echo "unalias -a 2>/dev/null || true" >> "$SNAPSHOT_FILE"

      
      # shopt before functions: a body using extglob/globstar syntax only
      # re-parses with the option on.
      echo "# Shopt" >> "$SNAPSHOT_FILE"
      shopt -p >> "$SNAPSHOT_FILE"

      echo "# Functions" >> "$SNAPSHOT_FILE"

      # Force autoload all functions first
      declare -f > /dev/null 2>&1
`;

/** The lab's one multi-line command (a commit message) had no `< /dev/null`, and every single-line one did. */
const toolShellCommand = (snapshotPath: string, command: string, cwdFile: string): string =>
  `source ${snapshotPath} 2>/dev/null || true && \\builtin shopt -u extglob 2>/dev/null || true && { \\builtin unalias -- 'which'; \\builtin unset -f -- 'which'; } >/dev/null 2>&1 || true && { \\builtin unalias -- 'unsetenv'; \\builtin unset -f -- 'unsetenv'; } >/dev/null 2>&1 || true && eval '${command.replace(/'/g, `'"'"'`)}'${command.includes('\n') ? '' : ' < /dev/null'} && pwd -P >| ${cwdFile}`;

const hex = (length: number): string =>
  faker.string.hexadecimal({ length, casing: 'lower', prefix: '' });

export const projectSlug = (path: string): string => path.replace(/[/.]/g, '-');

export const claudeExecutable = (user: OsUser): string =>
  `${user.home}/.local/share/claude/versions/${CLAUDE_CODE_VERSION}`;

export const nodeBinDir = (user: OsUser): string =>
  user.shellProfile === 'nvm'
    ? `${user.home}/.nvm/versions/node/v${user.nodeVersion}/bin`
    : '/usr/bin';

const NPX_PACKAGE_DIRS = [
  'zod/v4/core',
  'zod/v3/types',
  'hono/dist/cjs',
  'hono/dist/types',
  '@modelcontextprotocol/sdk/dist/esm',
  '@modelcontextprotocol/sdk/dist/cjs',
  '@hono/node-server/dist',
];

const PLUGIN_MARKETPLACE_DIRS = [
  'plugins/claude-security/scripts',
  'plugins/security-guidance/tests',
  'plugins/plugin-dev/skills',
  'plugins/skill-creator/skills',
  'plugins/mcp-server-dev/skills',
  'plugins/code-modernization/hooks',
  'external_plugins',
];

class ClaudeSessionBuilder {
  readonly writer: EndpointWriter;
  readonly options: ClaudeCodeSessionOptions;
  readonly agent: ProcessNode;
  readonly stamp: ClaudeStampState;
  /** Interactive only: the IDE scan and helper re-execs after sign-in, before the first prompt. */
  readonly startupAt: number;
  readonly firstPromptAt: number;
  private snapshotPath: string | undefined;
  private sessionKeyPath: string | undefined;
  private readonly tmpDir: string;
  private readonly sessionTmpDir: string;

  constructor(
    options: ClaudeCodeSessionOptions,
    agentParent: ProcessNode,
    agentLeadsGroup: boolean,
  ) {
    this.options = options;
    const { runtime, user, identity, start, sessionId, prompt, printArgs = [] } = options;
    const interactive = prompt === undefined;
    const signsInDuring = identity.signIn === 'during' && interactive;
    const signInDuringAt = start + INTERACTIVE_SIGN_IN_DELAY_MS;
    const signedInAt =
      identity.signIn === 'never' ? undefined : signsInDuring ? signInDuringAt : start - 86_400_000;
    this.startupAt = interactive
      ? (signsInDuring ? signInDuringAt : start) + INTERACTIVE_STARTUP_AFTER_SIGN_IN_MS
      : start;
    const sessionStartedAt = interactive
      ? this.startupAt + INTERACTIVE_SESSION_AFTER_STARTUP_MS
      : start + PRINT_SESSION_START_MS;
    this.stamp = {
      agent: 'claude_code',
      email: identity.email,
      signedInAt,
      sessionId,
      sessionStartedAt,
    };
    this.firstPromptAt = interactive
      ? sessionStartedAt + INTERACTIVE_PROMPT_AFTER_SESSION_MS
      : start;
    this.writer = new EndpointWriter(runtime, this.stamp);
    this.agent = createProcessNode({
      runtime,
      parent: agentParent,
      image: {
        name: CLAUDE_CODE_VERSION,
        executable: claudeExecutable(user),
        args: interactive ? ['claude'] : ['claude', '-p', prompt, ...printArgs],
      },
      start,
      role: 'agent',
      workingDirectory: options.workingDirectory,
      newGroup: agentLeadsGroup,
    });
    this.tmpDir = `/tmp/claude-${user.id}`;
    this.sessionTmpDir = `${this.tmpDir}/${projectSlug(options.workingDirectory)}/${sessionId}`;
  }

  private child(
    parent: ProcessNode,
    image: ProcessImage,
    at: number,
    role: ProcessRole = 'descendant',
  ) {
    return createProcessNode({ runtime: this.writer.runtime, parent, image, start: at, role });
  }

  private agentFile(at: number, write: FileWrite): void {
    this.writer.fileEvent(this.agent, at, write);
  }

  private atomicAgentWrite(at: number, path: string, size: number, tmpSuffix: string): void {
    const tmp = `${path}${tmpSuffix}`;
    this.agentFile(at, { action: 'creation', path: tmp });
    this.agentFile(at + 3, { action: 'rename', path, size, originalPath: tmp, entropy: 4.2 });
  }

  private claudeJsonWrite(at: number): void {
    this.atomicAgentWrite(
      at,
      `${this.options.user.home}/.claude.json`,
      160_900,
      `.tmp.${this.agent.pid}.${hex(12)}`,
    );
  }

  private lookup(node: ProcessNode, at: number, destination: Destination): void {
    this.writer.dnsLookup(node, at, {
      name: destination.domain,
      resolvedIps: [destination.ip],
    });
  }

  private gitProbe(at: number, image: ProcessImage, exitCode: number): void {
    runShortLived(this.writer, this.agent, { image, exitCode }, at);
  }

  private selfReexec(parent: ProcessNode, args: readonly string[], at: number, exitCode = 0) {
    const node = this.child(
      parent,
      { name: CLAUDE_CODE_VERSION, executable: claudeExecutable(this.options.user), args },
      at,
      'agent',
    );
    this.writer.processEvent(node, ['fork', 'exec', 'end'], at, { exitCode, endAt: at + 40 });
    return node;
  }

  private localStateFiles(at: number): void {
    const { user } = this.options;
    const locks = `${user.home}/.local/state/claude/locks/${CLAUDE_CODE_VERSION}`;
    this.atomicAgentWrite(at, `${locks}#${this.agent.pid}.lock`, 142, `.tmp.${hex(8)}`);
    this.atomicAgentWrite(at + 2, `${locks}.lock`, 142, `.tmp.${hex(8)}`);
    const sessionKey = `${user.home}/.claude/sessions/${this.agent.pid}.${hex(64)}.key`;
    this.atomicAgentWrite(at + 440, sessionKey, 139, `.tmp.${hex(8)}`);
    this.agentFile(at + 580, {
      action: 'creation',
      path: `${user.home}/.claude/sessions/${this.agent.pid}.json`,
    });
    this.agentFile(at + 690, {
      action: 'creation',
      path: `${user.home}/.claude/backups/.claude.json.backup.${at + 690}`,
    });
    this.agentFile(at + 760, {
      action: 'deletion',
      path: `${user.home}/.claude/backups/.claude.json.backup.${at - 4_000_000}`,
      size: 84,
    });
    const probe = `${this.tmpDir}/fswatch-probe-${faker.string.alphanumeric(6)}/probe`;
    this.agentFile(at + 690, { action: 'creation', path: probe });
    this.claudeJsonWrite(at + 815);
    this.atomicAgentWrite(
      at + 1_350,
      `${user.home}/.claude/policy-limits.json.stamp.json`,
      223,
      `.tmp.${hex(8)}`,
    );
    this.agentFile(at + 1_440, {
      action: 'creation',
      path: `${user.home}/.claude/projects/${projectSlug(this.options.workingDirectory)}/${this.options.sessionId}.jsonl`,
    });
    this.atomicAgentWrite(
      at + 1_480,
      `${user.home}/.claude/plugins/store/cc-plugin-agents-md_builtin-${hex(12)}.json`,
      92,
      `.tmp.${hex(8)}`,
    );
    this.agentFile(at + 1_820, { action: 'deletion', path: probe, size: 1 });
    this.claudeJsonWrite(at + 1_840);
    this.sessionKeyPath = sessionKey;
  }

  private startNetwork(at: number): number {
    this.lookup(this.agent, at, DESTINATIONS.anthropicApi);
    this.writer.connection(this.agent, at + 10, {
      ip: DESTINATIONS.anthropicApi.ip,
      port: 443,
      phase: 'attempted',
    });
    return at + 10;
  }

  private signIn(at: number): void {
    const { user } = this.options;
    this.claudeJsonWrite(at - 8);
    this.atomicAgentWrite(at, `${user.home}/.claude/.credentials.json`, 471, `.tmp.${hex(8)}`);
    this.claudeJsonWrite(at + 15);
    this.atomicAgentWrite(at + 22, `${user.home}/.claude/.credentials.json`, 471, `.tmp.${hex(8)}`);
    this.claudeJsonWrite(at + 190);
    this.agentFile(at + 206, {
      action: 'creation',
      path: `${user.home}/.claude/policy-limits.json`,
    });
    this.atomicAgentWrite(
      at + 204,
      `${user.home}/.claude/policy-limits.json.stamp.json`,
      223,
      `.tmp.${hex(8)}`,
    );
    this.agentFile(at + 208, {
      action: 'creation',
      path: `${user.home}/.claude/policy-limits.json.signature.json`,
    });
  }

  private interactiveStartup(at: number): void {
    const { user, firstRun } = this.options;
    for (let probe = 0; probe < 2; probe++) {
      this.gitProbe(
        at + probe * 10,
        safeGit(['rev-parse', '--is-inside-work-tree', '--show-cdup']),
        128,
      );
    }
    runShortLived(
      this.writer,
      this.agent,
      { image: bin('rpm', ['rpm', '-qf', claudeExecutable(user)]), exitCode: 1 },
      at + 5_600,
    );
    const scan = this.child(this.agent, bin('bash', ['/bin/sh', '-c', IDE_SCAN]), at + 5_630);
    this.writer.processEvent(scan, ['fork', 'exec', 'end'], at + 5_630, { endAt: at + 5_660 });
    runShortLived(this.writer, scan, { image: bin('ps', ['ps', 'aux']) }, at + 5_640);
    runShortLived(
      this.writer,
      scan,
      { image: bin('grep', ['grep', '-E', IDE_SCAN.split('"')[1]]) },
      at + 5_640,
    );
    runShortLived(this.writer, scan, { image: bin('grep', ['grep', '-v', 'grep']) }, at + 5_640);
    this.selfReexec(this.agent, ['rg', '--version'], at + 5_980);
    this.selfReexec(
      this.agent,
      [
        'rg',
        '--no-config',
        '--files',
        '--follow',
        '--hidden',
        ...['.git', '.svn', '.hg', '.bzr', '.jj', '.sl'].flatMap((dir) => ['--glob', `!${dir}/`]),
        user.home,
      ],
      at + 5_980,
    );
    if (firstRun) {
      this.pluginMarketplaceSync(at + 6_500);
    }
  }

  private pluginMarketplaceSync(at: number): void {
    const root = `${this.options.user.home}/.claude/plugins/marketplaces/claude-plugins-official`;
    const staging = `${root}.staging`;
    for (let index = 0; index < PLUGIN_MARKETPLACE_FILES; index++) {
      const dir = PLUGIN_MARKETPLACE_DIRS[index % PLUGIN_MARKETPLACE_DIRS.length];
      this.agentFile(at + Math.floor((index * 2_000) / PLUGIN_MARKETPLACE_FILES), {
        action: 'creation',
        path: `${staging}/${dir}/${faker.system.fileName()}`,
      });
    }
    this.agentFile(at + 2_010, { action: 'rename', path: root, originalPath: staging });
  }

  private startMcpServer(
    server: McpServerSpec,
    at: number,
  ): { npx: ProcessNode; server: ProcessNode } {
    const { user } = this.options;
    const nodeDir = nodeBinDir(user);
    const npxPath = `${nodeDir}/npx`;
    const npx = this.child(
      this.agent,
      bin('env', ['/usr/bin/env', 'node', npxPath, '-y', server.packageName]),
      at,
    );
    this.writer.processEvent(npx, ['fork', 'exec'], at);
    execImage(npx, {
      name: 'node',
      executable: `${nodeDir}/node`,
      args: ['node', npxPath, '-y', server.packageName],
    });
    this.writer.processEvent(npx, ['exec'], at + 11);
    const cacheDir = `${user.home}/.npm/_npx/${hex(16)}`;
    if (server.firstInstall) {
      this.lookup(npx, at + 200, DESTINATIONS.npmRegistry);
      this.writer.connection(npx, at + 210, {
        ip: DESTINATIONS.npmRegistry.ip,
        port: 443,
        phase: 'attempted',
      });
      for (let index = 0; index < NPX_INSTALL_FILES; index++) {
        const dir = NPX_PACKAGE_DIRS[index % NPX_PACKAGE_DIRS.length];
        this.writer.fileEvent(npx, at + 400 + Math.floor((index * 2_400) / NPX_INSTALL_FILES), {
          action: 'creation',
          path: `${cacheDir}/node_modules/${dir}/${faker.system.fileName({ extensionCount: 1 })}`,
        });
      }
      this.writer.fileEvent(npx, at + 2_820, {
        action: 'creation',
        path: `${cacheDir}/package.json`,
      });
      this.writer.fileEvent(npx, at + 2_821, {
        action: 'creation',
        path: `${cacheDir}/package-lock.json`,
      });
    }
    const binPath = `${cacheDir}/node_modules/.bin/${server.binName}`;
    const serverNode = this.child(
      npx,
      bin('bash', ['sh', '-c', `'${server.binName}'`]),
      at + 2_880,
    );
    this.writer.processEvent(serverNode, ['fork', 'exec'], at + 2_880);
    execImage(serverNode, bin('env', ['/usr/bin/env', 'node', binPath]));
    this.writer.processEvent(serverNode, ['exec'], at + 2_896);
    execImage(serverNode, { name: 'node', executable: `${nodeDir}/node`, args: ['node', binPath] });
    this.writer.processEvent(serverNode, ['exec'], at + 2_897);
    return { npx, server: serverNode };
  }

  private bashPreamble(at: number): number {
    const { user } = this.options;
    const envShell = this.child(this.agent, bin('bash', ['/bin/bash', '-c', 'env']), at);
    this.writer.processEvent(envShell, ['fork', 'exec'], at);
    execImage(envShell, bin('env', ['env']));
    this.writer.processEvent(envShell, ['exec', 'end'], at + 8);

    const snapshotPath = `${user.home}/.claude/shell-snapshots/snapshot-bash-${at}-${faker.string.alphanumeric({ length: 6, casing: 'lower' })}.sh`;
    const preamble = this.child(
      this.agent,
      bin('bash', ['/bin/bash', '-c', '-l', snapshotScript(snapshotPath, user.home)]),
      at + 10,
    );
    this.writer.fileEvent(preamble, at + 12, { action: 'creation', path: snapshotPath });
    const time = emitShellTree(this.writer, preamble, user, claudePreambleTree(user), at + 12);
    this.writer.processEvent(preamble, ['fork', 'exec', 'end'], at + 10, { endAt: time + 5 });
    this.snapshotPath = snapshotPath;
    return time + 10;
  }

  private bashStep(step: Extract<ClaudeStep, { type: 'bash' }>, at: number): number {
    let time = at;
    if (!this.snapshotPath) {
      time = this.bashPreamble(time);
    }
    const snapshotPath = this.snapshotPath ?? '';
    const taskOutput = `${this.sessionTmpDir}/tasks/${faker.string.alpha({ length: 9, casing: 'lower' })}.output`;
    this.agentFile(time + 100, { action: 'creation', path: taskOutput });
    const cwdFile = `/tmp/claude-${hex(4)}-cwd`;
    const shell = createProcessNode({
      runtime: this.writer.runtime,
      parent: this.agent,
      image: this.agent.image,
      start: time,
      role: 'descendant',
      newSession: true,
    });
    this.writer.processEvent(shell, ['fork'], time);
    this.writer.processEvent(shell, ['session_id_change'], time + 3);
    execImage(
      shell,
      bin('bash', ['/bin/bash', '-c', toolShellCommand(snapshotPath, step.command, cwdFile)]),
    );
    let childTime = time + 50;
    for (const command of step.children) {
      childTime = this.toolCommand(shell, command, childTime, true);
    }
    this.writer.fileEvent(shell, childTime + 5, { action: 'creation', path: cwdFile });
    this.writer.processEvent(shell, ['exec', 'end'], time + 4, { endAt: childTime + 6 });
    this.agentFile(childTime + 7, { action: 'deletion', path: taskOutput, size: 31 });
    this.agentFile(childTime + 8, { action: 'deletion', path: cwdFile, size: 28 });
    return childTime + 20;
  }

  private toolCommand(
    parent: ProcessNode,
    command: ClaudeToolCommand,
    at: number,
    direct: boolean,
  ): number {
    const duration = command.durationMs ?? 30;
    const node = createProcessNode({
      runtime: this.writer.runtime,
      parent,
      image: command.selfReexec
        ? {
            ...command.image,
            name: CLAUDE_CODE_VERSION,
            executable: claudeExecutable(this.options.user),
          }
        : command.image,
      start: at,
      role: command.selfReexec ? 'agent' : 'descendant',
      newGroup: direct,
      user: command.runAs?.user,
      group: command.runAs?.group,
    });
    let time = at + 2;
    for (const destination of command.connections ?? []) {
      this.lookup(node, time, destination);
      this.writer.connection(node, time + 20, {
        ip: destination.ip,
        port: destination.port,
        bytes: {
          sent: faker.number.int({ min: 130, max: 900 }),
          received: faker.number.int({ min: 230, max: 6_000 }),
        },
      });
      time += 30;
    }
    for (const file of command.files ?? []) {
      this.writer.fileEvent(node, time, file);
      time += 1;
    }
    for (const child of command.children ?? []) {
      time = this.toolCommand(node, child, time + 2, false);
    }
    const end = Math.max(time, at + duration);
    this.writer.processEvent(node, ['fork', 'exec', 'end'], at, {
      exitCode: command.exitCode ?? 0,
      endAt: end,
    });
    if (command.detaches) {
      const detached = createProcessNode({
        runtime: this.writer.runtime,
        parent: node,
        image: node.image,
        start: end,
        role: 'descendant',
        newSession: true,
      });
      this.writer.processEvent(detached, ['fork'], end);
      this.writer.processEvent(detached, ['session_id_change'], end + 15);
      this.writer.processEvent(detached, ['end'], end + 15);
    }
    return end + 5;
  }

  private editStep(step: Extract<ClaudeStep, { type: 'edit' }>, at: number): number {
    this.atomicAgentWrite(at, step.path, step.size, `.tmp.${this.agent.pid}.${hex(12)}`);
    return at + 600;
  }

  build(): ClaudeCodeSessionResult {
    const { start, prompt, steps, mcpServers = [], telemetryCollector, apiKey } = this.options;
    const interactive = prompt === undefined;
    const shortRun = apiKey !== undefined;

    if (shortRun) {
      return this.buildFailedApiKeyRun();
    }

    this.writer.processEvent(this.agent, ['fork', 'exec'], start);
    const apiFlowOpenedAt = this.startNetwork(start + 360);
    let time: number;

    if (interactive) {
      if (this.options.identity.signIn === 'during' && this.stamp.signedInAt !== undefined) {
        this.signIn(this.stamp.signedInAt);
      }
      this.interactiveStartup(this.startupAt);
      const sessionStart = this.stamp.sessionStartedAt;
      this.localStateFiles(sessionStart + 60);
      PRINT_GIT_PROBES.forEach(({ image, exitCode }, index) =>
        this.gitProbe(sessionStart + 100 + index * 15, image, exitCode),
      );
      time = this.firstPromptAt;
    } else {
      this.gitProbe(start + 400, SETTINGS_LOCAL_PROBE, 1);
      this.localStateFiles(start + 553);
      PRINT_GIT_PROBES.forEach(({ image, exitCode }, index) =>
        this.gitProbe(start + 560 + index * 210, image, exitCode),
      );
      time = start + PRINT_SESSION_START_MS;
    }

    for (let lookup = 0; lookup < 4; lookup++) {
      this.lookup(this.agent, time + 20 + lookup * 150, DESTINATIONS.anthropicApi);
    }
    this.lookup(this.agent, time + 1_350, DESTINATIONS.anthropicMcpProxy);

    const servers = mcpServers.map((server) => this.startMcpServer(server, time + 380));
    if (!interactive) {
      this.selfReexec(
        this.agent,
        ['rg', '--no-config', '--files', '--hidden', this.options.workingDirectory],
        time + 1_990,
      );
    }

    time += 4_000;
    if (telemetryCollector) {
      this.lookup(this.agent, time, telemetryCollector);
      this.writer.connection(this.agent, time + 20, {
        ip: telemetryCollector.ip,
        port: telemetryCollector.port,
        bytes: { sent: 40_959, received: 6_275 },
      });
    }

    for (const step of steps) {
      time += 800;
      if (step.type === 'bash') {
        time = this.bashStep(step, time);
      } else if (step.type === 'edit') {
        time = this.editStep(step, time);
      } else {
        time += 400;
      }
    }

    const end = time + (interactive ? 8_000 : 1_600);
    servers.forEach(({ npx, server }) => {
      this.writer.processEvent(server, ['end'], end - 640, { exitCode: 130 });
      this.writer.processEvent(npx, ['end'], end - 620, { exitCode: 130 });
    });
    this.lookup(this.agent, end - 320, DESTINATIONS.claudeLogIntake);
    this.writer.connection(this.agent, end - 310, {
      ip: DESTINATIONS.claudeLogIntake.ip,
      port: 443,
      bytes: { sent: 158_444, received: 5_397 },
    });
    this.endFiles(end - 560);
    this.writer.connection(this.agent, end, {
      ip: DESTINATIONS.anthropicApi.ip,
      port: 443,
      phase: 'closed',
      bytes: { sent: 40_121, received: 17_840 },
      openedAt: apiFlowOpenedAt,
    });
    this.writer.processEvent(this.agent, ['end'], end + 5);
    return this.result(end + 5);
  }

  private endFiles(at: number): void {
    const { user } = this.options;
    this.agentFile(at, {
      action: 'deletion',
      path: `/run/user/${user.id}/cc-socks/${this.agent.pid}.sock`,
    });
    this.agentFile(at + 1, {
      action: 'deletion',
      path: `${user.home}/.claude/sessions/${this.agent.pid}.json`,
      size: 608,
    });
    if (this.snapshotPath) {
      this.agentFile(at + 4, { action: 'deletion', path: this.snapshotPath, size: 194_843 });
    }
    if (this.sessionKeyPath) {
      this.agentFile(at + 21, { action: 'deletion', path: this.sessionKeyPath, size: 139 });
    }
    const locks = `${user.home}/.local/state/claude/locks/${CLAUDE_CODE_VERSION}`;
    this.agentFile(at + 540, {
      action: 'deletion',
      path: `${locks}#${this.agent.pid}.lock`,
      size: 142,
    });
    this.agentFile(at + 540, { action: 'deletion', path: `${locks}.lock`, size: 142 });
  }

  /** Run 6: Claude picks the inline API key over the OAuth login, fails auth and exits in about 2 s. */
  private buildFailedApiKeyRun(): ClaudeCodeSessionResult {
    const { start, user } = this.options;
    const end = start + 1_933;
    this.lookup(this.agent, start + PRINT_SESSION_START_MS + 50, DESTINATIONS.anthropicApi);
    this.writer.connection(this.agent, start + PRINT_SESSION_START_MS + 70, {
      ip: DESTINATIONS.anthropicApi.ip,
      port: 443,
      bytes: { sent: 2_100, received: 5_400 },
    });
    this.localStateFiles(start + 520);
    this.gitProbe(start + 400, SETTINGS_LOCAL_PROBE, 1);
    PRINT_GIT_PROBES.forEach(({ image, exitCode }, index) =>
      this.gitProbe(start + 560 + index * 120, image, exitCode),
    );
    this.selfReexec(
      this.agent,
      ['rg', '--no-config', '--files', '--hidden', this.options.workingDirectory],
      start + 900,
    );
    this.agentFile(end - 40, {
      action: 'deletion',
      path: `${user.home}/.claude/sessions/${this.agent.pid}.json`,
      size: 608,
    });
    this.writer.processEvent(this.agent, ['fork', 'exec', 'end'], start, {
      exitCode: 1,
      endAt: end,
    });
    return this.result(end);
  }

  private result(end: number): ClaudeCodeSessionResult {
    const { sessionId, steps, mcpServers = [], user } = this.options;
    return {
      documents: this.writer.documents,
      sessionId,
      process: {
        pid: this.agent.pid,
        parentPid: this.agent.parent?.pid ?? 0,
        start: this.options.start,
        end,
        executable: this.agent.image.executable,
        commandLine: this.agent.image.args.join(' '),
        workingDirectory: this.agent.workingDirectory,
        userName: user.name,
      },
      signedInAt: this.stamp.signedInAt,
      sessionStartedAt: this.stamp.sessionStartedAt,
      firstPromptAt: this.firstPromptAt,
      interactive: this.options.prompt === undefined,
      steps,
      mcpServers,
    };
  }
}

/** Builds every Defend event for one Claude Code session, including the untagged shell chain that starts it. */
export const buildClaudeCodeSession = (
  options: ClaudeCodeSessionOptions,
): ClaudeCodeSessionResult => {
  const { runtime, user, kind, start, prompt, printArgs = [], apiKey, workingDirectory } = options;
  const agentArgs = prompt === undefined ? ['claude'] : ['claude', '-p', prompt, ...printArgs];
  const defaultCommand = `cd ${workingDirectory} && ${apiKey ? `ANTHROPIC_API_KEY=${apiKey} timeout 120 ` : ''}${agentArgs.join(' ')}`;
  const chainStart =
    kind === 'interactive' ? start - (options.sudoFrom ? 25_000 : 11_000) : start - 400;
  const session = startAgentSession({
    runtime,
    user,
    kind,
    at: chainStart,
    command: options.sessionCommand ?? defaultCommand,
    workingDirectory,
    clientIp: options.clientIp,
    sudoFrom: options.sudoFrom,
    viaTimeout: apiKey ? { seconds: 120, agentArgs } : undefined,
  });
  const builder = new ClaudeSessionBuilder(options, session.agentParent, session.agentLeadsGroup);
  const result = builder.build();
  return { ...result, documents: [...session.documents, ...result.documents] };
};

/** Shell commands Claude's Bash tool runs in the lab scenarios. */
export const claudeCommands = {
  python: (script: string): ClaudeToolCommand => ({
    image: bin('python3.9', ['python3', script]),
    durationMs: 50,
  }),
  ls: (): ClaudeToolCommand => ({ image: bin('ls', ['ls']), durationMs: 5 }),
  /** `sudo <command>`: sudo and the command run as root. Not seen in the lab, so extrapolated. */
  sudo: (command: ClaudeToolCommand): ClaudeToolCommand => ({
    image: bin('sudo', ['sudo', ...command.image.args]),
    durationMs: (command.durationMs ?? 30) + 20,
    runAs: { user: { name: 'root', id: 0 }, group: { name: 'root', id: 0 } },
    children: [command],
  }),
  systemctlRestart: (unit: string): ClaudeToolCommand => ({
    image: bin('systemctl', ['systemctl', 'restart', unit]),
    durationMs: 120,
  }),
  curlHead: (destination: Destination): ClaudeToolCommand => ({
    image: bin('curl', ['curl', '-sI', `https://${destination.domain}`]),
    durationMs: 400,
    connections: [destination],
  }),
  find: (dir: string, name: string): ClaudeToolCommand => ({
    image: {
      name: 'bfs',
      executable: '',
      args: [
        'bfs',
        '-S',
        'dfs',
        '-regextype',
        'findutils-default',
        dir,
        '-name',
        name,
        '-not',
        '-path',
        '*/node_modules/*',
        '-not',
        '-path',
        '*/.git/*',
      ],
    },
    selfReexec: true,
    durationMs: 20,
  }),
  grep: (pattern: string, file: string): ClaudeToolCommand => ({
    image: {
      name: 'ugrep',
      executable: '',
      args: [
        'ugrep',
        '-G',
        '--ignore-files',
        '--hidden',
        '-I',
        '--encoding=UTF-8',
        '--exclude-dir=.git',
        '--exclude-dir=.svn',
        '--exclude-dir=.hg',
        pattern,
        file,
      ],
    },
    selfReexec: true,
    durationMs: 20,
  }),
  gitAdd: (repo: string, path: string): ClaudeToolCommand => ({
    image: bin('git', ['git', 'add', path]),
    durationMs: 6,
    files: [
      { action: 'creation', path: `${repo}/.git/index.lock` },
      {
        action: 'creation',
        path: `${repo}/.git/objects/${hex(2)}/tmp_obj_${faker.string.alphanumeric(6)}`,
      },
      {
        action: 'rename',
        path: `${repo}/.git/index`,
        originalPath: `${repo}/.git/index.lock`,
        size: 262,
      },
    ],
  }),
  gitCommit: (repo: string, branch: string, message: string, model: string): ClaudeToolCommand => ({
    image: bin('git', [
      'git',
      'commit',
      '-m',
      `${message}\n\nCo-Authored-By: Claude ${model} <noreply@anthropic.com>`,
    ]),
    durationMs: 12,
    files: [
      { action: 'creation', path: `${repo}/.git/index.lock` },
      {
        action: 'rename',
        path: `${repo}/.git/index`,
        originalPath: `${repo}/.git/index.lock`,
        size: 281,
        entropy: 6.0,
      },
      {
        action: 'creation',
        path: `${repo}/.git/objects/${hex(2)}/tmp_obj_${faker.string.alphanumeric(6)}`,
      },
      { action: 'creation', path: `${repo}/.git/HEAD.lock` },
      { action: 'creation', path: `${repo}/.git/refs/heads/${branch}.lock` },
      {
        action: 'rename',
        path: `${repo}/.git/refs/heads/${branch}`,
        originalPath: `${repo}/.git/refs/heads/${branch}.lock`,
        size: 41,
        entropy: 3.6,
      },
      { action: 'deletion', path: `${repo}/.git/HEAD.lock` },
      { action: 'creation', path: `${repo}/.git/AUTO_MERGE.lock` },
      { action: 'creation', path: `${repo}/.git/packed-refs.lock` },
      { action: 'deletion', path: `${repo}/.git/AUTO_MERGE.lock` },
      { action: 'deletion', path: `${repo}/.git/packed-refs.lock` },
    ],
    children: [
      {
        image: {
          name: 'git',
          executable: '/usr/bin/git',
          args: [
            '/usr/libexec/git-core/git',
            'maintenance',
            'run',
            '--auto',
            '--no-quiet',
            '--detach',
          ],
        },
        durationMs: 6,
        files: [
          { action: 'creation', path: `${repo}/.git/objects/maintenance.lock` },
          { action: 'deletion', path: `${repo}/.git/objects/maintenance.lock` },
        ],
        detaches: true,
      },
    ],
  }),
};
