import { faker } from '@faker-js/faker';
import {
  createProcessNode,
  EndpointWriter,
  type HostRuntime,
  type ProcessImage,
  type ProcessNode,
} from './endpoint_events.ts';
import { type GeneratedDocument, type OsUser, type SessionKind } from './types.ts';

export interface SessionStart {
  /** The process that starts the agent: a login shell, a `bash -c` or `timeout`. */
  readonly agentParent: ProcessNode;
  /** The agent is its own process group leader only in an interactive shell with job control. */
  readonly agentLeadsGroup: boolean;
  readonly documents: readonly GeneratedDocument[];
}

const userIdentity = (user: OsUser) => ({
  user: { name: user.name, id: user.id },
  group: { name: user.name, id: user.id },
  supplementalGroups: user.supplementalGroups,
});

const sshEntryLeader = (runtime: HostRuntime, at: number, clientIp: string): ProcessNode => {
  const node = createProcessNode({
    runtime,
    parent: runtime.sshd,
    image: {
      name: 'sshd-session',
      executable: '/usr/libexec/openssh/sshd-session',
      args: ['/usr/libexec/openssh/sshd-session', '-D', '-R'],
    },
    start: at,
    role: undefined,
    workingDirectory: '/',
  });
  node.session = {
    entryLeader: node,
    entryMeta: { type: 'sshd', sourceIp: clientIp },
    sessionLeader: node,
    groupLeader: node,
    interactive: false,
    tty: undefined,
  };
  return node;
};

const cronEntryLeader = (runtime: HostRuntime): ProcessNode => {
  const { crond } = runtime;
  crond.session = {
    entryLeader: crond,
    entryMeta: { type: 'init' },
    sessionLeader: crond,
    groupLeader: crond,
    interactive: false,
    tty: undefined,
  };
  return crond;
};

const startShell = ({
  runtime,
  parent,
  user,
  image,
  at,
  interactive,
  workingDirectory,
}: {
  runtime: HostRuntime;
  parent: ProcessNode;
  user: OsUser;
  image: ProcessImage;
  at: number;
  interactive: boolean;
  workingDirectory: string;
}): ProcessNode => {
  const shell = createProcessNode({
    runtime,
    parent,
    image,
    start: at,
    role: undefined,
    workingDirectory,
    newSession: true,
    ...userIdentity(user),
  });
  if (shell.session) {
    shell.session = {
      ...shell.session,
      interactive,
      tty: interactive ? { major: 136, minor: faker.number.int({ min: 0, max: 4 }) } : undefined,
    };
  }
  return shell;
};

/**
 * Builds the untagged process chain that starts an agent, with the session context Defend reports
 * for it: `sshd-session` and a TTY for interactive SSH, `sshd-session` without one for scripted
 * SSH, and `crond` (entry meta `init`) for cron.
 */
export const startAgentSession = ({
  runtime,
  user,
  kind,
  at,
  command,
  workingDirectory,
  clientIp,
  sudoFrom,
  viaTimeout,
}: {
  runtime: HostRuntime;
  user: OsUser;
  kind: SessionKind;
  at: number;
  /** The command line the scripted SSH or cron shell runs. Ignored for interactive sessions. */
  command: string;
  workingDirectory: string;
  clientIp: string;
  /** For an interactive session reached with `sudo -iu <user>` from another account. */
  sudoFrom?: OsUser;
  /** Start the agent through `timeout`, which leads its own process group. */
  viaTimeout?: { seconds: number; agentArgs: readonly string[] };
}): SessionStart => {
  const writer = new EndpointWriter(runtime, undefined);
  let parent: ProcessNode;
  let agentLeadsGroup = false;

  if (kind === 'cron') {
    const crond = cronEntryLeader(runtime);
    parent = startShell({
      runtime,
      parent: crond,
      user,
      image: { name: 'bash', executable: '/usr/bin/bash', args: ['/bin/bash', '-c', command] },
      at,
      interactive: false,
      workingDirectory: user.home,
    });
    writer.processEvent(parent, ['fork', 'exec'], at);
  } else {
    const entry = sshEntryLeader(runtime, at, clientIp);
    writer.processEvent(entry, ['fork', 'exec'], at);
    if (kind === 'interactive') {
      const loginUser = sudoFrom ?? user;
      const login = startShell({
        runtime,
        parent: entry,
        user: loginUser,
        image: { name: 'bash', executable: '/usr/bin/bash', args: ['-bash'] },
        at: at + 400,
        interactive: true,
        workingDirectory: loginUser.home,
      });
      writer.processEvent(login, ['fork', 'exec'], at + 400);
      parent = login;
      if (sudoFrom) {
        const sudo = startShell({
          runtime,
          parent: login,
          user: sudoFrom,
          image: { name: 'sudo', executable: '/usr/bin/sudo', args: ['sudo', '-iu', user.name] },
          at: at + 20_000,
          interactive: true,
          workingDirectory: sudoFrom.home,
        });
        if (sudo.session && login.session) {
          sudo.session = { ...sudo.session, tty: login.session.tty };
        }
        writer.processEvent(sudo, ['fork', 'exec'], at + 20_000);
        const targetShell = createProcessNode({
          runtime,
          parent: sudo,
          image: { name: 'bash', executable: '/usr/bin/bash', args: ['-bash'] },
          start: at + 20_200,
          role: undefined,
          workingDirectory: user.home,
          ...userIdentity(user),
        });
        writer.processEvent(targetShell, ['fork', 'exec'], at + 20_200);
        parent = targetShell;
      }
      agentLeadsGroup = true;
    } else {
      parent = startShell({
        runtime,
        parent: entry,
        user,
        image: { name: 'bash', executable: '/usr/bin/bash', args: ['bash', '-c', command] },
        at: at + 300,
        interactive: false,
        workingDirectory: user.home,
      });
      writer.processEvent(parent, ['fork', 'exec'], at + 300);
    }
  }

  if (viaTimeout !== undefined) {
    const timeout = createProcessNode({
      runtime,
      parent,
      image: {
        name: 'timeout',
        executable: '/usr/bin/timeout',
        args: ['timeout', String(viaTimeout.seconds), ...viaTimeout.agentArgs],
      },
      start: at + 350,
      role: undefined,
      workingDirectory,
      newGroup: true,
    });
    writer.processEvent(timeout, ['fork', 'exec'], at + 350);
    parent = timeout;
  }

  return { agentParent: parent, agentLeadsGroup, documents: writer.documents };
};
