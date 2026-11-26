import { faker } from '@faker-js/faker';
import {
  createProcessNode,
  type EndpointWriter,
  type ProcessImage,
  type ProcessNode,
} from './endpoint_events.ts';
import {
  CLAUDE_PREAMBLE_NVM,
  CLAUDE_PREAMBLE_PLAIN,
  CURSOR_COMMAND_SHELL,
  CURSOR_STATE_DUMP_NVM,
} from './shell_trees.ts';
import { CURSOR_AGENT_VERSION, type OsUser } from './types.ts';

export interface CommandSpec {
  readonly image: ProcessImage;
  readonly exitCode?: number;
}

export const bin = (name: string, args: readonly string[], dir = '/usr/bin'): ProcessImage => ({
  name,
  executable: `${dir}/${name}`,
  args,
});

/**
 * How long a short-lived process or subshell runs. Defend sends its merged event at exit, and in
 * the lab about 37% of those arrived more than 10 ms after the process started.
 */
const shortDuration = (): number =>
  faker.number.float() < 0.25
    ? faker.number.int({ min: 11, max: 40 })
    : faker.number.int({ min: 1, max: 6 });

/** Emits one short-lived child as a single `fork,exec,end` event, as Defend reports them. */
export const runShortLived = (
  writer: EndpointWriter,
  parent: ProcessNode,
  { image, exitCode = 0 }: CommandSpec,
  at: number,
  endAt: number = at + shortDuration(),
): ProcessNode => {
  const node = createProcessNode({
    runtime: writer.runtime,
    parent,
    image,
    start: at,
    role: parent.role === undefined ? undefined : 'descendant',
  });
  writer.processEvent(node, ['fork', 'exec', 'end'], at, { exitCode, endAt });
  return node;
};

/** Emits a subshell that only runs builtins, which Defend reports as one `fork,end` event. */
export const forkSubshell = (
  writer: EndpointWriter,
  shell: ProcessNode,
  at: number,
  { exitCode = 0, endAt = at + shortDuration() }: { exitCode?: number; endAt?: number } = {},
): ProcessNode => {
  const subshell = createProcessNode({
    runtime: writer.runtime,
    parent: shell,
    image: shell.image,
    start: at,
    role: shell.role === undefined ? undefined : 'descendant',
  });
  writer.processEvent(subshell, ['fork', 'end'], at, { exitCode, endAt });
  return subshell;
};

interface ShellTreeNode {
  readonly kind: 'subshell' | 'exec' | 'command';
  readonly exitCode: number;
  readonly image?: ProcessImage;
  readonly children: ShellTreeNode[];
}

const parseShellTree = (
  template: string,
  substitutions: Record<string, string>,
): ShellTreeNode[] => {
  const roots: ShellTreeNode[] = [];
  const stack: Array<{ depth: number; children: ShellTreeNode[] }> = [
    { depth: -1, children: roots },
  ];
  for (const rawLine of template.split('\n')) {
    if (rawLine.trim() === '') {
      continue;
    }
    const depth = (rawLine.length - rawLine.trimStart().length) / 2;
    let line = rawLine.trimStart();
    for (const [placeholder, value] of Object.entries(substitutions)) {
      line = line.replaceAll(placeholder, value);
    }
    let node: ShellTreeNode;
    if (line === 'command') {
      node = { kind: 'command', exitCode: 0, children: [] };
    } else {
      const [kind, exit, ...rest] = line.split(' ');
      const exitCode = Number(exit);
      if (kind === 's') {
        node = { kind: 'subshell', exitCode, children: [] };
      } else {
        const [name, executable, args] = JSON.parse(rest.join(' ')) as [string, string, string[]];
        node = { kind: 'exec', exitCode, image: { name, executable, args }, children: [] };
      }
    }
    while (stack[stack.length - 1].depth >= depth) {
      stack.pop();
    }
    stack[stack.length - 1].children.push(node);
    stack.push({ depth, children: node.children });
  }
  return roots;
};

const emitTreeNodes = (
  writer: EndpointWriter,
  parent: ProcessNode,
  nodes: readonly ShellTreeNode[],
  at: number,
  commands: readonly CommandSpec[],
): number => {
  let time = at;
  for (const node of nodes) {
    time += faker.number.int({ min: 0, max: 2 });
    if (node.kind === 'command') {
      for (const command of commands) {
        runShortLived(writer, parent, command, time, time + 40);
        time += 41;
      }
      continue;
    }
    const start = time;
    const processNode = createProcessNode({
      runtime: writer.runtime,
      parent,
      image: node.kind === 'exec' && node.image ? node.image : parent.image,
      start,
      role: parent.role === undefined ? undefined : 'descendant',
    });
    const childrenEnd = emitTreeNodes(writer, processNode, node.children, start + 1, commands);
    const endAt = Math.max(childrenEnd, start + shortDuration());
    writer.processEvent(
      processNode,
      node.kind === 'exec' ? ['fork', 'exec', 'end'] : ['fork', 'end'],
      start,
      {
        exitCode: node.exitCode,
        endAt,
      },
    );
    time = node.children.length > 0 ? childrenEnd : start + 1;
  }
  return time;
};

const substitutionsFor = (user: OsUser, shell: ProcessNode): Record<string, string> => ({
  '{home}': user.home,
  '{node}': user.nodeVersion,
  '{cursor_version}': CURSOR_AGENT_VERSION,
  '{pid}': String(shell.pid),
});

/**
 * Emits a lab-derived process tree under `shell` and returns the time its last process ends.
 * `commands` run where the template has its `command` slot.
 */
export const emitShellTree = (
  writer: EndpointWriter,
  shell: ProcessNode,
  user: OsUser,
  template: string,
  at: number,
  commands: readonly CommandSpec[] = [],
): number =>
  emitTreeNodes(
    writer,
    shell,
    parseShellTree(template, substitutionsFor(user, shell)),
    at,
    commands,
  );

/** The Amazon Linux `/etc/profile.d` part of a login shell, which ends by reading the shell's own `comm`. */
const amazonLinuxProfile = (): string => {
  const lines = CLAUDE_PREAMBLE_PLAIN.split('\n');
  const end = lines.findIndex((line) => line.includes('/proc/{pid}/comm'));
  return lines.slice(0, end + 1).join('\n');
};

export const claudePreambleTree = (user: OsUser): string =>
  user.shellProfile === 'nvm' ? CLAUDE_PREAMBLE_NVM : CLAUDE_PREAMBLE_PLAIN;

/** Cursor's state dump was only observed for a user with nvm. Without nvm, only the OS profile part is used (extrapolated). */
export const cursorStateDumpTree = (user: OsUser): string =>
  user.shellProfile === 'nvm' ? CURSOR_STATE_DUMP_NVM : amazonLinuxProfile();

export const cursorCommandShellTree = (): string => CURSOR_COMMAND_SHELL;
