import { faker } from '@faker-js/faker';
import { type AgentProcessSummary } from './claude_code.ts';
import {
  createProcessNode,
  EndpointWriter,
  execImage,
  type HostRuntime,
  type ProcessImage,
  type ProcessNode,
} from './endpoint_events.ts';
import {
  bin,
  cursorCommandShellTree,
  cursorStateDumpTree,
  emitShellTree,
  runShortLived,
  type CommandSpec,
} from './linux_shell.ts';
import { DESTINATIONS, type Destination } from './network_destinations.ts';
import { startAgentSession } from './session_context.ts';
import { type CursorStampState } from './stamping.ts';
import {
  CURSOR_AGENT_VERSION,
  type AgentIdentity,
  type GeneratedDocument,
  type OsUser,
  type SessionKind,
} from './types.ts';

export interface CursorPluginRepo {
  /** `owner/name` on GitHub. */
  readonly repo: string;
  readonly commit: string;
}

export type CursorStep =
  /** A shell tool call. Cursor passes the command on file descriptor 5, so only the children show it. */
  | { readonly type: 'shell'; readonly children: readonly CommandSpec[] }
  /** Cursor syncs team and marketplace plugins with a shallow sparse clone, trying SSH then HTTPS. */
  | { readonly type: 'plugin_sync'; readonly plugins: readonly CursorPluginRepo[] }
  | { readonly type: 'read'; readonly path: string };

export interface CursorSessionOptions {
  readonly runtime: HostRuntime;
  readonly user: OsUser;
  readonly identity: AgentIdentity;
  readonly kind: SessionKind;
  readonly start: number;
  readonly workingDirectory: string;
  readonly prompt: string;
  readonly steps: readonly CursorStep[];
  /** Start `typescript-language-server` through `npx` from the worker, as run 8 did. */
  readonly languageServer?: boolean;
  /** Files the language server writes to its compile cache after the task ends (run 3). */
  readonly languageServerCompileCacheFiles?: number;
  readonly clientIp: string;
  readonly sessionCommand?: string;
}

export interface CursorSessionResult {
  readonly documents: GeneratedDocument[];
  readonly process: AgentProcessSummary;
  readonly signedInAt: number | undefined;
}

const CURSOR_GIT_SAFE_CONFIG = [
  '-c',
  'safe.bareRepository=explicit',
  '-c',
  'core.fsmonitor=false',
  '-c',
  'core.hooksPath=/dev/null',
  '-c',
  'core.attributesFile=/dev/null',
  '-c',
  'submodule.recurse=false',
  '-c',
  'fetch.recurseSubmodules=false',
  '-c',
  'diff.submodule=short',
  '-c',
  'status.submoduleSummary=false',
  '-c',
  'log.showSignature=false',
  '-c',
  'log.diffMerges=separate',
  '-c',
  'gpg.openpgp.program=/dev/null',
  '-c',
  'gpg.x509.program=/dev/null',
  '-c',
  'gpg.ssh.program=/dev/null',
];

const safeGit = (subcommand: readonly string[], noLocks = false): ProcessImage =>
  bin('git', [
    'git',
    ...(noLocks ? ['--no-optional-locks'] : []),
    ...CURSOR_GIT_SAFE_CONFIG,
    ...subcommand,
  ]);

const plainGit = (subcommand: readonly string[]): ProcessImage =>
  bin('git', ['git', ...subcommand]);

const pluginGit = (subcommand: readonly string[]): ProcessImage =>
  bin('git', [
    '/usr/bin/git',
    '-c',
    'credential.interactive=false',
    '-c',
    'core.fsmonitor=false',
    ...subcommand,
  ]);

const FD5_SHELL_SCRIPT =
  'IFS= builtin read -r -d \'\' __cursor_command <&5 2>/dev/null || { builtin printf \'%s\\n\' \'The command did not run: a shell startup file ($BASH_ENV or .zshenv) closed or replaced file descriptor 5, which carries the command. Run it again; this shell now passes commands as arguments.\' >&2; builtin exit 126; }; exec 5<&-; builtin set -- "$__cursor_command"; builtin unset __cursor_command; snap=$(command cat <&3) && builtin shopt -s extglob && builtin eval -- "$snap"; { builtin set +u 2>/dev/null || true; builtin eval "${__CURSOR_SANDBOX_ENV_RESTORE:-}" 2>/dev/null; builtin eval "${__CURSOR_SANDBOX_TEMP_RESTORE:-}" 2>/dev/null; builtin export NODE_DISABLE_COMPILE_CACHE=1; builtin unset NODE_COMPILE_CACHE; builtin export PWD="$(builtin pwd)"; builtin shopt -s expand_aliases 2>/dev/null; builtin eval "$1" 3<&- 4>&-; }; COMMAND_EXIT_CODE=$?; dump_bash_state >&4; builtin exit $COMMAND_EXIT_CODE';

/** The verbatim start of the state-dump script Cursor runs in an interactive login shell. */
const DUMP_BASH_STATE_SCRIPT = `#!/usr/bin/env bash

# Usage:
#   source dump_bash_state.bash
#   dump_bash_state OUTPUT_FILE
# Or execute directly (captures a subshell's state):
#   ./dump_bash_state.bash OUTPUT_FILE

dump_bash_state() {
  set -euo pipefail
`;

const PLUGIN_GIT_INTERNAL_FILES = 110;
const PLUGIN_CHECKOUT_FILES = 60;
const PLUGIN_TREE_DIRS = ['.github/workflows', 'tests', 'skills', 'commands', 'third_party'];
/** How long before `node` the launcher's pid is forked by `timeout` and runs `env bash` and `bash`. */
const LAUNCHER_FORK_LEAD_MS = 13;
/** Per clone, the agent deleted between 65 and 128 files of the temporary checkout when it finished. */
const PLUGIN_CLONE_DELETIONS = 96;

const hex = (length: number): string =>
  faker.string.hexadecimal({ length, casing: 'lower', prefix: '' });

export const cursorVersionDir = (user: OsUser): string =>
  `${user.home}/.local/share/cursor-agent/versions/${CURSOR_AGENT_VERSION}`;

export const cursorAgentArgs = (user: OsUser, prompt: string): string[] => [
  `${user.home}/.local/bin/cursor-agent`,
  '--disable-sigusr1',
  '--use-system-ca',
  `${cursorVersionDir(user)}/index.js`,
  '-p',
  '--trust',
  prompt,
  '--output-format',
  'json',
];

class CursorSessionBuilder {
  readonly writer: EndpointWriter;
  readonly options: CursorSessionOptions;
  readonly agent: ProcessNode;
  readonly stamp: CursorStampState;
  private readonly versionDir: string;
  private readonly nodeImage: ProcessImage;

  constructor(options: CursorSessionOptions, agentParent: ProcessNode) {
    this.options = options;
    const { runtime, user, identity, start, prompt } = options;
    this.stamp = {
      agent: 'cursor',
      email: identity.email,
      signedInAt: identity.signIn === 'never' ? undefined : start - 86_400_000,
    };
    this.writer = new EndpointWriter(runtime, this.stamp);
    this.versionDir = cursorVersionDir(user);
    this.nodeImage = {
      name: 'node',
      executable: `${this.versionDir}/node`,
      args: cursorAgentArgs(user, prompt),
    };
    this.agent = createProcessNode({
      runtime,
      parent: agentParent,
      image: agentParent.image,
      start: start - LAUNCHER_FORK_LEAD_MS,
      role: 'agent',
      workingDirectory: options.workingDirectory,
    });
  }

  private child(
    parent: ProcessNode,
    image: ProcessImage,
    at: number,
    role: 'agent' | 'descendant' = 'descendant',
  ) {
    return createProcessNode({ runtime: this.writer.runtime, parent, image, start: at, role });
  }

  private lookup(node: ProcessNode, at: number, destination: Destination): void {
    this.writer.dnsLookup(node, at, {
      name: destination.answerName ?? destination.domain,
      resolvedIps: [destination.ip],
    });
  }

  private agentConfigWrite(at: number, file: string, size: number): void {
    const { home } = this.options.user;
    const tmp = `${home}/.cursor/${file}.${this.agent.pid}.${faker.string.uuid()}.tmp`;
    this.writer.fileEvent(this.agent, at, { action: 'creation', path: tmp });
    this.writer.fileEvent(this.agent, at + 1, {
      action: 'rename',
      path: `${home}/.cursor/${file}`,
      size,
      originalPath: tmp,
      entropy: 4.9,
    });
  }

  private rg(at: number, args: readonly string[]): void {
    runShortLived(
      this.writer,
      this.agent,
      {
        image: {
          name: 'rg',
          executable: `${this.versionDir}/rg`,
          args: [`${this.versionDir}/rg`, ...args],
        },
      },
      at,
    );
  }

  private gitProbes(at: number): number {
    const probes: Array<{ image: ProcessImage; exitCode?: number; at: number }> = [
      { image: safeGit(['rev-parse', '--show-toplevel']), at: 757 },
      { image: plainGit(['rev-parse', '--is-inside-work-tree']), at: 1_207 },
      { image: plainGit(['rev-parse', '--is-inside-work-tree']), at: 1_217 },
      { image: plainGit(['rev-parse', '--show-prefix']), at: 1_217 },
      { image: plainGit(['check-ignore', '-z', '--stdin']), exitCode: 1, at: 1_227 },
      { image: plainGit(['ls-files', '-co', '--exclude-standard', '-z', '--', '.']), at: 1_227 },
      { image: plainGit(['config', '--get', 'remote.origin.url']), exitCode: 1, at: 1_327 },
      { image: safeGit(['rev-parse', '--show-toplevel']), at: 1_807 },
      { image: safeGit(['rev-parse', '--show-toplevel']), at: 3_217 },
      { image: safeGit(['config', '--get', 'remote.origin.url']), exitCode: 1, at: 3_237 },
      { image: plainGit(['rev-parse', '--is-inside-work-tree']), at: 3_637 },
      { image: safeGit(['config', '--list', '--show-scope', '--includes', '-z'], true), at: 4_327 },
      { image: safeGit(['rev-parse', '--abbrev-ref', 'HEAD']), at: 4_337 },
      {
        image: safeGit(['status', '--ignore-submodules=dirty', '--short', '--branch'], true),
        at: 4_367,
      },
    ];
    for (const probe of probes) {
      runShortLived(
        this.writer,
        this.agent,
        { image: probe.image, exitCode: probe.exitCode },
        at + probe.at,
      );
    }
    this.rg(at + 1_197, [
      '--files',
      '--max-depth',
      '16',
      '--no-messages',
      '--follow',
      this.options.workingDirectory,
    ]);
    this.rg(at + 1_827, [
      '--files',
      '--hidden',
      '--no-require-git',
      '--no-config',
      '--color=never',
      '--threads',
      '2',
      '--follow',
      this.options.workingDirectory,
    ]);
    this.rg(at + 1_837, [
      '--files',
      '--hidden',
      '--no-require-git',
      '--no-config',
      '--color=never',
      '--threads',
      '2',
      '--iglob',
      '!.git',
      this.options.workingDirectory,
    ]);
    this.rg(at + 2_197, [
      '--files',
      '--hidden',
      '--no-require-git',
      '--no-config',
      '--color=never',
      '--threads',
      '2',
      '--follow',
      this.options.workingDirectory,
    ]);
    return at + 4_400;
  }

  private sandboxPreflight(at: number): void {
    const { home } = this.options.user;
    const policy = `${home}/.cursor/sandbox-policies/sandbox-policy-${hex(16)}`;
    this.writer.fileEvent(this.agent, at - 5, { action: 'creation', path: policy });
    const sandbox = this.child(
      this.agent,
      {
        name: 'cursorsandbox',
        executable: `${this.versionDir}/cursorsandbox`,
        args: [
          `${this.versionDir}/cursorsandbox`,
          '--policy',
          policy,
          '--preflight-only',
          '--',
          '/bin/true',
        ],
      },
      at,
    );
    const namespaceInit = this.child(sandbox, sandbox.image, at);
    this.writer.processEvent(namespaceInit, ['fork', 'end'], at);
    const mapper = this.child(namespaceInit, sandbox.image, at + 10);
    this.writer.processEvent(mapper, ['fork', 'end'], at + 10);
    runShortLived(
      this.writer,
      mapper,
      {
        image: bin('newuidmap', [
          '/usr/bin/newuidmap',
          String(namespaceInit.pid),
          '0',
          String(this.options.user.id),
          '1',
        ]),
      },
      at + 10,
    );
    runShortLived(
      this.writer,
      mapper,
      {
        image: bin('newgidmap', [
          '/usr/bin/newgidmap',
          String(namespaceInit.pid),
          '0',
          String(this.options.user.id),
          '1',
        ]),
      },
      at + 10,
    );
    for (const device of ['null', 'zero', 'full', 'random', 'urandom', 'tty']) {
      this.writer.fileEvent(sandbox, at + 12, {
        action: 'creation',
        path: `/tmp/.cursor_dev_${namespaceInit.pid}/${device}`,
      });
    }
    this.writer.fileEvent(sandbox, at + 13, {
      action: 'creation',
      path: `/tmp/.cursor_run_${namespaceInit.pid}_1/systemd/resolve`,
    });
    this.writer.processEvent(sandbox, ['fork', 'exec', 'end'], at, { endAt: at + 15 });
  }

  private startWorker(at: number): ProcessNode {
    const worker = this.child(
      this.agent,
      {
        name: 'node',
        executable: `${this.versionDir}/node`,
        args: [`${this.versionDir}/node`, `${this.versionDir}/index.js`, 'worker-server'],
      },
      at,
      'agent',
    );
    this.writer.processEvent(worker, ['fork', 'exec'], at);
    return worker;
  }

  /** A shell Cursor forks from `node` in a new session, then execs into `image` and runs `template` under it. */
  private forkedShell(
    image: ProcessImage,
    template: string,
    at: number,
    commands: readonly CommandSpec[] = [],
  ) {
    const shell = createProcessNode({
      runtime: this.writer.runtime,
      parent: this.agent,
      image: this.agent.image,
      start: at,
      role: 'descendant',
      newSession: true,
    });
    this.writer.processEvent(shell, ['fork'], at);
    this.writer.processEvent(shell, ['session_id_change'], at + 5);
    execImage(shell, image);
    const end = emitShellTree(this.writer, shell, this.options.user, template, at + 8, commands);
    this.writer.processEvent(shell, ['exec', 'end'], at + 7, { endAt: end + 5 });
    return end + 10;
  }

  /** Run 3 (no command) has one state dump and run 8 (one command) two, the second just before the command. */
  private shellStateDump(at: number): number {
    return this.forkedShell(
      bin('bash', ['/bin/bash', '-O', 'extglob', '-ilc', DUMP_BASH_STATE_SCRIPT]),
      cursorStateDumpTree(this.options.user),
      at,
    );
  }

  /** The fd-5 shell for one shell tool call. Without team-managed hooks, Cursor starts no others. */
  private fd5Shell(commands: readonly CommandSpec[], at: number): number {
    return this.forkedShell(
      bin('bash', ['/bin/bash', '-O', 'extglob', '-c', FD5_SHELL_SCRIPT, '--']),
      cursorCommandShellTree(),
      at,
      commands,
    );
  }

  private pluginSync(step: Extract<CursorStep, { type: 'plugin_sync' }>, at: number): number {
    let time = at;
    runShortLived(
      this.writer,
      this.agent,
      { image: bin('git', ['/usr/bin/git', '--version']) },
      time,
    );
    runShortLived(this.writer, this.agent, { image: pluginGit(['--version']) }, time);
    for (const plugin of step.plugins) {
      const dir = `/tmp/backend-plugin-${faker.string.alphanumeric(6)}`;
      const clonedFiles: string[] = [];
      for (const transport of ['ssh', 'https'] as const) {
        const remote =
          transport === 'ssh'
            ? `git@github.com:${plugin.repo}.git`
            : `https://github.com/${plugin.repo}`;
        const init = runShortLived(
          this.writer,
          this.agent,
          { image: pluginGit(['init']) },
          time + 10,
        );
        this.writer.fileEvent(init, time + 11, {
          action: 'creation',
          path: `${dir}/.git/config.lock`,
        });
        this.writer.fileEvent(init, time + 12, {
          action: 'rename',
          path: `${dir}/.git/config`,
          originalPath: `${dir}/.git/config.lock`,
          size: 92,
          entropy: 4.5,
        });
        runShortLived(
          this.writer,
          this.agent,
          { image: pluginGit(['remote', 'add', 'origin', remote]) },
          time + 20,
        );
        runShortLived(
          this.writer,
          this.agent,
          {
            image: pluginGit([
              'sparse-checkout',
              'set',
              '--cone',
              '--',
              '.cursor-plugin',
              '.claude-plugin',
            ]),
          },
          time + 30,
        );
        const fetch = this.child(
          this.agent,
          pluginGit(['fetch', '--depth', '1', '--filter=blob:none', 'origin', plugin.commit]),
          time + 40,
        );
        if (transport === 'ssh') {
          const sshShell = this.child(
            fetch,
            bin('bash', [
              '/bin/sh',
              '-c',
              'ssh -oBatchMode=yes "$@"',
              'ssh -oBatchMode=yes',
              '-o',
              'SendEnv=GIT_PROTOCOL',
              'git@github.com',
              `git-upload-pack '${plugin.repo}.git'`,
            ]),
            time + 40,
          );
          this.writer.processEvent(sshShell, ['fork', 'exec'], time + 40);
          execImage(
            sshShell,
            bin('ssh', [
              'ssh',
              '-oBatchMode=yes',
              '-o',
              'SendEnv=GIT_PROTOCOL',
              'git@github.com',
              `git-upload-pack '${plugin.repo}.git'`,
            ]),
          );
          this.lookup(sshShell, time + 50, DESTINATIONS.githubSsh);
          this.writer.connection(sshShell, time + 60, {
            ip: DESTINATIONS.githubSsh.ip,
            port: 22,
            bytes: { sent: 1_900, received: 2_600 },
          });
          this.writer.processEvent(sshShell, ['exec', 'end'], time + 48, {
            exitCode: 255,
            endAt: time + 300,
          });
          this.writer.processEvent(fetch, ['fork', 'exec', 'end'], time + 40, {
            exitCode: 128,
            endAt: time + 310,
          });
        } else {
          const remoteHttps = this.child(
            fetch,
            bin('git', ['/usr/libexec/git-core/git', 'remote-https', 'origin', remote]),
            time + 50,
          );
          this.writer.processEvent(remoteHttps, ['fork', 'exec', 'end'], time + 50, {
            endAt: time + 300,
          });
          const helper = this.child(
            remoteHttps,
            {
              name: 'git-remote-http',
              executable: '/usr/libexec/git-core/git-remote-http',
              args: ['/usr/libexec/git-core/git-remote-https', 'origin', remote],
            },
            time + 50,
          );
          this.lookup(helper, time + 55, DESTINATIONS.github);
          this.writer.connection(helper, time + 70, {
            ip: DESTINATIONS.github.ip,
            port: 443,
            bytes: { sent: 3_400, received: 41_000 },
          });
          this.writer.processEvent(helper, ['fork', 'exec', 'end'], time + 50, {
            endAt: time + 290,
          });
          for (let file = 0; file < PLUGIN_GIT_INTERNAL_FILES; file++) {
            const path = `${dir}/.git/objects/${hex(2)}/tmp_obj_${faker.string.alphanumeric(6)}`;
            clonedFiles.push(path);
            this.writer.fileEvent(fetch, time + 300 + Math.floor(file / 4), {
              action: 'creation',
              path,
            });
          }
          this.writer.processEvent(fetch, ['fork', 'exec', 'end'], time + 40, {
            endAt: time + 330,
          });
          const checkout = runShortLived(
            this.writer,
            this.agent,
            { image: pluginGit(['checkout', 'FETCH_HEAD']) },
            time + 340,
          );
          const checkoutPaths = [
            '.cursor-plugin/plugin.json',
            '.claude-plugin/plugin.json',
            ...Array.from(
              { length: PLUGIN_CHECKOUT_FILES },
              () => `${faker.helpers.arrayElement(PLUGIN_TREE_DIRS)}/${faker.system.fileName()}`,
            ),
          ];
          checkoutPaths.forEach((path, index) => {
            clonedFiles.push(`${dir}/${path}`);
            this.writer.fileEvent(checkout, time + 345 + Math.floor(index / 8), {
              action: 'creation',
              path: `${dir}/${path}`,
            });
          });
          const pluginCache = `${this.options.user.home}/.cursor/plugins/cache/${plugin.repo.replace('/', '-')}`;
          checkoutPaths.forEach((path, index) => {
            this.writer.fileEvent(this.agent, time + 360 + Math.floor(index / 8), {
              action: 'creation',
              path: `${pluginCache}/${path}`,
            });
          });
        }
        time += transport === 'ssh' ? 340 : 420;
      }
      clonedFiles.slice(-PLUGIN_CLONE_DELETIONS).forEach((path, index) => {
        this.writer.fileEvent(this.agent, time + Math.floor(index / 8), {
          action: 'deletion',
          path,
        });
      });
      time += 20;
    }
    return time;
  }

  private startLanguageServer(worker: ProcessNode, at: number): ProcessNode {
    const { user, languageServerCompileCacheFiles } = this.options;
    const nodeDir =
      user.shellProfile === 'nvm'
        ? `${user.home}/.nvm/versions/node/v${user.nodeVersion}/bin`
        : '/usr/bin';
    const npx = this.child(
      worker,
      bin('env', [
        '/usr/bin/env',
        'node',
        `${nodeDir}/npx`,
        '-y',
        'typescript-language-server',
        '--stdio',
      ]),
      at,
    );
    this.writer.processEvent(npx, ['fork', 'exec'], at);
    execImage(npx, {
      name: 'node',
      executable: `${nodeDir}/node`,
      args: ['node', `${nodeDir}/npx`, '-y', 'typescript-language-server', '--stdio'],
    });
    this.writer.processEvent(npx, ['exec'], at + 20);
    this.lookup(npx, at + 100, DESTINATIONS.npmRegistry);
    this.writer.connection(npx, at + 120, {
      ip: DESTINATIONS.npmRegistry.ip,
      port: 443,
      phase: 'attempted',
    });
    const cacheDir = `${user.home}/.npm/_npx/${hex(16)}`;
    const server = this.child(
      npx,
      bin('bash', ['sh', '-c', "'typescript-language-server'", '--stdio']),
      at + 1_010,
    );
    this.writer.processEvent(server, ['fork', 'exec'], at + 1_010);
    execImage(
      server,
      bin('env', [
        '/usr/bin/env',
        'node',
        `${cacheDir}/node_modules/.bin/typescript-language-server`,
        '--stdio',
      ]),
    );
    this.writer.processEvent(server, ['exec'], at + 1_017);
    execImage(server, {
      name: 'node',
      executable: `${nodeDir}/node`,
      args: ['node', `${cacheDir}/node_modules/.bin/typescript-language-server`, '--stdio'],
    });
    this.writer.processEvent(server, ['exec'], at + 1_018);
    if (languageServerCompileCacheFiles) {
      const later = at + 305_000;
      const compileCache = `${user.home}/.cache/cursor-compile-cache/v${user.nodeVersion}-x64-${hex(8)}-${user.id}`;
      for (let file = 0; file + 1 < languageServerCompileCacheFiles; file += 2) {
        const path = `${compileCache}/${hex(8)}`;
        const tmp = `${path}.${faker.string.alphanumeric(6)}`;
        const at = later + Math.floor(file / 4);
        this.writer.fileEvent(server, at, { action: 'creation', path: tmp });
        this.writer.fileEvent(server, at, {
          action: 'rename',
          path,
          originalPath: tmp,
          size: 4_096,
          entropy: 5.1,
        });
      }
    }
    return server;
  }

  /** `~/.local/bin/cursor-agent` is a bash launcher, so the agent's pid runs `env bash` and `bash` (untagged) before `node`. */
  private launch(start: number): void {
    const { user, prompt } = this.options;
    const launcherArgs = [
      `${user.home}/.local/bin/cursor-agent`,
      '-p',
      '--trust',
      prompt,
      '--output-format',
      'json',
    ];
    const envImage = bin('env', ['/usr/bin/env', 'bash', ...launcherArgs]);
    const bashImage = bin('bash', ['bash', ...launcherArgs]);
    const untagged = new EndpointWriter(this.writer.runtime, undefined);
    execImage(this.agent, envImage);
    untagged.processEvent(this.agent, ['fork', 'exec'], start - LAUNCHER_FORK_LEAD_MS);
    execImage(this.agent, bashImage);
    untagged.processEvent(this.agent, ['exec'], start - LAUNCHER_FORK_LEAD_MS + 1);
    this.writer.documents.push(...untagged.documents);
    execImage(this.agent, this.nodeImage);
    this.writer.processEvent(this.agent, ['exec'], start);
  }

  build(): CursorSessionResult {
    const { start, steps, user, languageServer } = this.options;
    this.launch(start);
    const running = `${this.versionDir}/.running/${this.agent.pid}`;
    this.writer.fileEvent(this.agent, start + 120, { action: 'creation', path: running });
    this.writer.fileEvent(this.agent, start + 130, {
      action: 'deletion',
      path: `/tmp/cursor-agent-logs-${user.id}/latest.log`,
    });
    for (let lookup = 0; lookup < 8; lookup++) {
      this.lookup(this.agent, start + 200 + lookup * 400, DESTINATIONS.cursorApi2);
      this.writer.connection(this.agent, start + 220 + lookup * 400, {
        ip: DESTINATIONS.cursorApi2.ip,
        port: 443,
        bytes: {
          sent: faker.number.int({ min: 2_000, max: 30_000 }),
          received: faker.number.int({ min: 4_000, max: 90_000 }),
        },
      });
    }
    this.lookup(this.agent, start + 600, DESTINATIONS.cursorApi);
    this.lookup(this.agent, start + 900, DESTINATIONS.cursorAgent);
    this.agentConfigWrite(start + 300, 'statsig-cache.json', 18_400);
    this.writer.fileEvent(this.agent, start + 700, {
      action: 'rename',
      path: `${user.home}/.cursor/projects/${this.options.workingDirectory.slice(1).replace(/\//g, '-')}/mcp-auth.json`,
      size: 2,
    });

    let time = this.gitProbes(start);
    this.sandboxPreflight(start + 1_857);
    const worker = this.startWorker(start + 3_227);
    time = Math.max(time, this.shellStateDump(start + 3_262));
    if (languageServer) {
      this.startLanguageServer(worker, start + 4_947);
    }
    for (const step of steps) {
      time += 300;
      if (step.type === 'shell') {
        time = this.fd5Shell(step.children, this.shellStateDump(time));
      } else if (step.type === 'plugin_sync') {
        time = this.pluginSync(step, time);
      } else {
        time += 500;
      }
    }
    const chat = `${user.home}/.cursor/chats/${hex(32)}/${faker.string.uuid()}`;
    this.writer.fileEvent(this.agent, time + 200, { action: 'creation', path: chat });
    this.agentConfigWrite(time + 300, 'statsig-cache.json', 18_400);
    const end = time + 3_000;
    this.writer.processEvent(worker, ['end'], end - 20, { exitCode: 0 });
    this.writer.fileEvent(this.agent, end - 10, { action: 'deletion', path: running });
    this.writer.processEvent(this.agent, ['end'], end);
    return {
      documents: this.writer.documents,
      process: {
        pid: this.agent.pid,
        parentPid: this.agent.parent?.pid ?? 0,
        start,
        end,
        executable: this.agent.image.executable,
        commandLine: this.agent.image.args.join(' '),
        workingDirectory: this.agent.workingDirectory,
        userName: user.name,
      },
      signedInAt: this.stamp.signedInAt,
    };
  }
}

/** Builds every Defend event for one `cursor-agent -p --trust` task run through `timeout`, as in runs 3 and 8. */
export const buildCursorSession = (options: CursorSessionOptions): CursorSessionResult => {
  const { runtime, user, kind, start, prompt, workingDirectory } = options;
  const agentArgs = ['cursor-agent', '-p', '--trust', prompt, '--output-format', 'json'];
  const session = startAgentSession({
    runtime,
    user,
    kind,
    at: start - 400,
    command:
      options.sessionCommand ?? `cd ${workingDirectory} && timeout 180 ${agentArgs.join(' ')}`,
    workingDirectory,
    clientIp: options.clientIp,
    viaTimeout: { seconds: 180, agentArgs },
  });
  const builder = new CursorSessionBuilder(options, session.agentParent);
  const result = builder.build();
  return { ...result, documents: [...session.documents, ...result.documents] };
};
