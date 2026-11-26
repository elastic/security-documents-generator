import { faker } from '@faker-js/faker';
import { toolShellCommand } from './claude_code.ts';
import { cursorVersionDir, FD5_SHELL_SCRIPT } from './cursor.ts';
import {
  createProcessNode,
  createRootProcess,
  EndpointWriter,
  hostOs,
  type FileWrite,
  type HostRuntime,
  type ProcessImage,
  type ProcessNode,
} from './endpoint_events.ts';
import { runShortLived, type CommandSpec } from './linux_shell.ts';
import { type Destination } from './network_destinations.ts';
import { startAgentSession } from './session_context.ts';
import { type AgentStampState } from './stamping.ts';
import {
  CLAUDE_CODE_VERSION,
  type AiAgentName,
  type GeneratedDocument,
  type HostOs,
  type OsUser,
} from './types.ts';

/**
 * How an agent is installed, which decides its `process.name` and `process.executable`.
 * `claude_native` and `cursor_cli` on Linux are the lab's shapes. Every other shape, and those two
 * on macOS, is inferred from install layouts and from the names the GenAI rules list.
 */
export type InstallMethod =
  | 'claude_native'
  | 'claude_homebrew'
  | 'claude_npm'
  | 'claude_windows'
  | 'cursor_cli'
  | 'cursor_ide';

export const INSTALL_AGENT: Record<InstallMethod, AiAgentName> = {
  claude_native: 'claude_code',
  claude_homebrew: 'claude_code',
  claude_npm: 'claude_code',
  claude_windows: 'claude_code',
  cursor_cli: 'cursor',
  cursor_ide: 'cursor',
};

const NODE_VERSION = '26.13.0';

const nodePrefix = (user: OsUser, os: HostOs): string =>
  os === 'macos'
    ? `/opt/homebrew/Cellar/node/${NODE_VERSION}`
    : `${user.home}/.nvm/versions/node/v${NODE_VERSION}`;

const winPath = (...parts: string[]): string => parts.join('\\');

/** The agent's own image for an install method, with `args` after the program name. */
export const agentImage = (
  install: InstallMethod,
  user: OsUser,
  os: HostOs,
  args: readonly string[],
): ProcessImage => {
  switch (install) {
    case 'claude_native':
      return {
        name: CLAUDE_CODE_VERSION,
        executable: `${user.home}/.local/share/claude/versions/${CLAUDE_CODE_VERSION}`,
        args: ['claude', ...args],
      };
    case 'claude_homebrew':
      return {
        name: 'claude',
        executable: `/opt/homebrew/Caskroom/claude-code/${CLAUDE_CODE_VERSION}/claude`,
        args: ['claude', ...args],
      };
    case 'claude_npm': {
      const prefix = nodePrefix(user, os);
      return {
        name: 'node',
        executable: `${prefix}/bin/node`,
        args: ['node', `${prefix}/lib/node_modules/@anthropic-ai/claude-code/cli.js`, ...args],
      };
    }
    case 'claude_windows': {
      const executable = winPath(user.home, '.local', 'bin', 'claude.exe');
      return { name: 'claude.exe', executable, args: [executable, ...args] };
    }
    case 'cursor_cli':
      return {
        name: 'node',
        executable: `${cursorVersionDir(user)}/node`,
        args: [
          `${user.home}/.local/bin/cursor-agent`,
          '--disable-sigusr1',
          '--use-system-ca',
          `${cursorVersionDir(user)}/index.js`,
          ...args,
        ],
      };
    case 'cursor_ide':
      return {
        name: 'Cursor Helper (Plugin)',
        executable:
          '/Applications/Cursor.app/Contents/Frameworks/Cursor Helper (Plugin).app/Contents/MacOS/Cursor Helper (Plugin)',
        args: [
          '/Applications/Cursor.app/Contents/Frameworks/Cursor Helper (Plugin).app/Contents/MacOS/Cursor Helper (Plugin)',
          '--type=utility',
          '--utility-sub-type=node.mojom.NodeService',
          '--lang=en-GB',
          '--service-sandbox-type=none',
          ...args,
        ],
      };
  }
};

/** The shell an agent's tool call runs in. Claude sources its snapshot, cursor-agent reads the command from fd 5. */
const toolShellImage = (
  install: InstallMethod,
  user: OsUser,
  os: HostOs,
  command: string,
  at: number,
): ProcessImage => {
  const cwdFile = `/tmp/claude-${faker.string.hexadecimal({ length: 4, casing: 'lower', prefix: '' })}-cwd`;
  const suffix = `${at}-${faker.string.alphanumeric({ length: 6, casing: 'lower' })}`;
  if (install === 'claude_windows') {
    const posixHome = `/c/Users/${user.name}`;
    const snapshot = `${posixHome}/.claude/shell-snapshots/snapshot-bash-${suffix}.sh`;
    const executable = winPath('C:', 'Program Files', 'Git', 'usr', 'bin', 'bash.exe');
    return {
      name: 'bash.exe',
      executable,
      args: [executable, '-c', toolShellCommand(snapshot, command, cwdFile)],
    };
  }
  if (install === 'cursor_cli') {
    const shell = os === 'macos' ? 'zsh' : 'bash';
    return {
      name: shell,
      executable: os === 'macos' ? '/bin/zsh' : '/usr/bin/bash',
      args: [`/bin/${shell}`, '-O', 'extglob', '-c', FD5_SHELL_SCRIPT, '--'],
    };
  }
  if (install === 'cursor_ide') {
    return { name: 'zsh', executable: '/bin/zsh', args: ['/bin/zsh', '-c', command] };
  }
  const shell = os === 'macos' ? 'zsh' : 'bash';
  const snapshot = `${user.home}/.claude/shell-snapshots/snapshot-${shell}-${suffix}.sh`;
  return {
    name: shell,
    executable: os === 'macos' ? '/bin/zsh' : '/usr/bin/bash',
    args: [`/bin/${shell}`, '-c', toolShellCommand(snapshot, command, cwdFile)],
  };
};

/** A command an agent's tool shell or MCP server runs, with how long it takes. */
export interface MockCommand extends CommandSpec {
  readonly durationMs?: number;
}

export interface MockAgentRunOptions {
  readonly runtime: HostRuntime;
  readonly user: OsUser;
  readonly install: InstallMethod;
  /** Arguments after the program name, such as `['-p', prompt, '--dangerously-skip-permissions']`. */
  readonly args: readonly string[];
  readonly start: number;
  readonly email: string;
  readonly workingDirectory: string;
  readonly clientIp: string;
}

/**
 * A compact agent run for rule-trip and install-method scenarios: the agent's launch, then only the
 * behaviour under test. It writes no lab noise (git probes, login-shell trees, config writes), so
 * use the session builders in `claude_code.ts` and `cursor.ts` wherever the lab shape is wanted.
 */
export class MockAgentRun {
  readonly writer: EndpointWriter;
  readonly agent: ProcessNode;
  readonly options: MockAgentRunOptions;
  readonly os: HostOs;
  private readonly launcherDocuments: GeneratedDocument[] = [];
  private shellParent: ProcessNode;

  constructor(options: MockAgentRunOptions) {
    this.options = options;
    const { runtime, user, install, args, start, email, workingDirectory } = options;
    this.os = hostOs(runtime.host);
    const agentName = INSTALL_AGENT[install];
    const stamp: AgentStampState =
      agentName === 'claude_code'
        ? {
            agent: 'claude_code',
            email,
            signedInAt: start - 86_400_000,
            sessionId: faker.string.uuid(),
            sessionStartedAt: start + 450,
          }
        : { agent: 'cursor', email, signedInAt: start - 86_400_000 };
    this.writer = new EndpointWriter(runtime, stamp);
    const image = agentImage(install, user, this.os, args);
    const parent = this.launcher(image);
    this.agent = createProcessNode({
      runtime,
      parent,
      image,
      start,
      role: 'agent',
      workingDirectory,
    });
    this.shellParent = this.agent;
  }

  /** The untagged chain that starts the agent: SSH on Linux, Terminal on macOS, Windows Terminal, or the Cursor app. */
  private launcher(agent: ProcessImage): ProcessNode {
    const { runtime, user, install, start, workingDirectory, clientIp } = this.options;
    const untagged = new EndpointWriter(runtime, undefined);
    const identity = {
      user: { name: user.name, id: user.id },
      group: { name: user.name, id: user.id },
    };
    const chain = (parent: ProcessNode, images: readonly ProcessImage[], at: number): ProcessNode =>
      images.reduce((current, image, index) => {
        const node = createProcessNode({
          runtime,
          parent: current,
          image,
          start: at + index * 40,
          role: undefined,
          workingDirectory: user.home,
          ...identity,
        });
        untagged.processEvent(node, ['fork', 'exec'], at + index * 40);
        return node;
      }, parent);

    let parent: ProcessNode;
    if (this.os === 'linux') {
      const session = startAgentSession({
        runtime,
        user,
        kind: 'ssh_scripted',
        at: start - 400,
        command: `cd ${workingDirectory} && ${agent.args.join(' ')}`,
        workingDirectory,
        clientIp,
      });
      this.launcherDocuments.push(...session.documents);
      parent = session.agentParent;
    } else if (this.os === 'macos') {
      const launchd = createRootProcess(
        1,
        { name: 'launchd', executable: '/sbin/launchd', args: ['/sbin/launchd'] },
        start - 86_400_000,
      );
      parent =
        install === 'cursor_ide'
          ? chain(
              launchd,
              [
                {
                  name: 'Cursor',
                  executable: '/Applications/Cursor.app/Contents/MacOS/Cursor',
                  args: ['/Applications/Cursor.app/Contents/MacOS/Cursor'],
                },
              ],
              start - 60_000,
            )
          : chain(
              launchd,
              [
                {
                  name: 'Terminal',
                  executable: '/System/Applications/Utilities/Terminal.app/Contents/MacOS/Terminal',
                  args: ['/System/Applications/Utilities/Terminal.app/Contents/MacOS/Terminal'],
                },
                { name: 'login', executable: '/usr/bin/login', args: ['login', '-pf', user.name] },
                { name: 'zsh', executable: '/bin/zsh', args: ['-zsh'] },
              ],
              start - 30_000,
            );
    } else {
      const explorer = createRootProcess(
        faker.number.int({ min: 4_000, max: 9_000 }),
        {
          name: 'explorer.exe',
          executable: winPath('C:', 'Windows', 'explorer.exe'),
          args: [winPath('C:', 'Windows', 'explorer.exe')],
        },
        start - 86_400_000,
        { name: user.name, id: user.id },
      );
      const powershell = winPath(
        'C:',
        'Windows',
        'System32',
        'WindowsPowerShell',
        'v1.0',
        'powershell.exe',
      );
      parent = chain(
        explorer,
        [
          {
            name: 'WindowsTerminal.exe',
            executable: winPath(
              'C:',
              'Program Files',
              'WindowsApps',
              'Microsoft.WindowsTerminal_1.23.0.0_x64__8wekyb3d8bbwe',
              'WindowsTerminal.exe',
            ),
            args: ['WindowsTerminal.exe'],
          },
          { name: 'powershell.exe', executable: powershell, args: [powershell, '-NoLogo'] },
        ],
        start - 30_000,
      );
    }
    this.launcherDocuments.push(...untagged.documents);
    return parent;
  }

  get documents(): GeneratedDocument[] {
    return [...this.launcherDocuments, ...this.writer.documents];
  }

  /** The agent's exec event. */
  launch(): this {
    this.writer.processEvent(this.agent, ['fork', 'exec'], this.options.start);
    return this;
  }

  /** A file event by the agent process itself, as Claude's Read, Write and Edit tools are. */
  agentFile(at: number, write: FileWrite): this {
    this.writer.fileEvent(this.agent, at, write);
    return this;
  }

  /** A connection by the agent process itself, as Claude's WebFetch is. */
  agentConnection(
    at: number,
    destination: Destination,
    withDomainField = this.os === 'macos',
  ): this {
    if (destination.domain) {
      this.writer.dnsLookup(this.agent, at, {
        name: destination.domain,
        resolvedIps: [destination.ip],
      });
    }
    this.writer.connection(this.agent, at + 5, {
      ip: destination.ip,
      port: destination.port,
      phase: 'attempted',
      ...(withDomainField && destination.domain && { domain: destination.domain }),
    });
    return this;
  }

  /** One tool call: the tool shell, then each command as its child. Returns when the shell ends. */
  toolCall(command: string, children: readonly MockCommand[], at: number): number {
    const { runtime, user, install } = this.options;
    const shell = createProcessNode({
      runtime,
      parent: this.shellParent,
      image: toolShellImage(install, user, this.os, command, at),
      start: at,
      role: 'descendant',
      newSession: true,
    });
    this.writer.processEvent(shell, ['fork', 'exec'], at);
    let time = at + 20;
    for (const child of children) {
      const duration = child.durationMs ?? 30;
      runShortLived(this.writer, shell, child, time, time + duration);
      time += duration + 5;
    }
    this.writer.processEvent(shell, ['end'], time + 5);
    return time + 10;
  }

  /** A stdio MCP server started with `npx -y`, whose `node` then runs `spawns` directly. Returns when it exits. */
  mcpServer(
    {
      packageName,
      binName,
      spawns = [],
    }: { packageName: string; binName: string; spawns?: readonly MockCommand[] },
    at: number,
  ): number {
    const { runtime, user } = this.options;
    const prefix = nodePrefix(user, this.os);
    const npxPath = `${prefix}/bin/npx`;
    const npx = createProcessNode({
      runtime,
      parent: this.agent,
      image: {
        name: 'node',
        executable: `${prefix}/bin/node`,
        args: ['node', npxPath, '-y', packageName],
      },
      start: at,
      role: 'descendant',
    });
    this.writer.processEvent(npx, ['fork', 'exec'], at);
    const binPath = `${user.home}/.npm/_npx/${faker.string.hexadecimal({ length: 16, casing: 'lower', prefix: '' })}/node_modules/.bin/${binName}`;
    const server = createProcessNode({
      runtime,
      parent: npx,
      image: { name: 'node', executable: `${prefix}/bin/node`, args: ['node', binPath] },
      start: at + 900,
      role: 'descendant',
    });
    this.writer.processEvent(server, ['fork', 'exec'], at + 900);
    let time = at + 1_500;
    for (const spawn of spawns) {
      const duration = spawn.durationMs ?? 30;
      runShortLived(this.writer, server, spawn, time, time + duration);
      time += duration + 5;
    }
    this.writer.processEvent(server, ['end'], time + 500, { exitCode: 130 });
    this.writer.processEvent(npx, ['end'], time + 520, { exitCode: 130 });
    return time + 600;
  }

  /** The agent's end event. */
  end(at: number): this {
    this.writer.processEvent(this.agent, ['end'], at);
    return this;
  }
}
