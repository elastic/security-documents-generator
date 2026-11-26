import { faker } from '@faker-js/faker';
import { stampAiAgent, type AgentStampState, type ProcessRole } from './stamping.ts';
import {
  ENDPOINT_AGENT_VERSION,
  ENDPOINT_FILE_INDEX,
  ENDPOINT_NETWORK_INDEX,
  ENDPOINT_PROCESS_INDEX,
  type AgentHost,
  type GeneratedDocument,
  type PosixGroup,
} from './types.ts';

const ECS_VERSION = '8.10.0';
const ANCESTRY_DEPTH = 5;

export interface PosixIdentity {
  readonly name: string;
  readonly id: number;
}

export interface ProcessImage {
  readonly name: string;
  readonly executable: string;
  readonly args: readonly string[];
}

export interface CharDevice {
  readonly major: number;
  readonly minor: number;
}

export interface EntryMeta {
  readonly type: 'sshd' | 'init';
  readonly sourceIp?: string;
}

export interface SessionLinks {
  readonly entryLeader: ProcessNode;
  readonly entryMeta: EntryMeta;
  readonly sessionLeader: ProcessNode;
  readonly groupLeader: ProcessNode;
  readonly interactive: boolean;
  readonly tty: CharDevice | undefined;
}

export interface ProcessNode {
  readonly pid: number;
  readonly entityId: string;
  image: ProcessImage;
  readonly workingDirectory: string;
  readonly start: number;
  readonly user: PosixIdentity;
  readonly group: PosixGroup;
  readonly realUser: PosixIdentity;
  readonly realGroup: PosixGroup;
  readonly supplementalGroups: readonly PosixGroup[] | undefined;
  readonly role: ProcessRole | undefined;
  readonly parent: ProcessNode | undefined;
  readonly ancestry: readonly string[];
  session: SessionLinks | undefined;
  previous: readonly ProcessImage[] | undefined;
}

export interface HostRuntime {
  readonly host: AgentHost;
  /** Defend's Linux `session_data` policy option. Off, Defend sends no leaders, `interactive` or `tty`. */
  readonly sessionData: boolean;
  nextPid: number;
  sequence: number;
  readonly eventIdPrefix: string;
  readonly hashes: Map<string, string>;
  readonly init: ProcessNode;
  readonly sshd: ProcessNode;
  readonly crond: ProcessNode;
}

const ROOT: PosixIdentity = { name: 'root', id: 0 };
const ROOT_GROUP: PosixGroup = { name: 'root', id: 0 };

export const randomEntityId = (): string =>
  Buffer.from(faker.string.hexadecimal({ length: 32, prefix: '' }), 'hex')
    .toString('base64')
    .replace(/=+$/, '');

const rootNode = (
  pid: number,
  image: ProcessImage,
  start: number,
  parent: ProcessNode | undefined,
): ProcessNode => ({
  pid,
  entityId: randomEntityId(),
  image,
  workingDirectory: '/',
  start,
  user: ROOT,
  group: ROOT_GROUP,
  realUser: ROOT,
  realGroup: ROOT_GROUP,
  supplementalGroups: undefined,
  role: undefined,
  parent,
  ancestry: parent ? [parent.entityId, ...parent.ancestry].slice(0, ANCESTRY_DEPTH) : [],
  session: undefined,
  previous: undefined,
});

/** Creates the per-host state shared by every session on that host: pids, sequence numbers and system processes. */
export const createHostRuntime = ({
  host,
  bootTime,
  sessionData = true,
}: {
  host: AgentHost;
  bootTime: number;
  sessionData?: boolean;
}): HostRuntime => {
  const init = rootNode(
    1,
    { name: 'systemd', executable: '/usr/lib/systemd/systemd', args: ['/usr/lib/systemd/systemd'] },
    bootTime,
    undefined,
  );
  const sshd = rootNode(
    faker.number.int({ min: 1500, max: 2500 }),
    { name: 'sshd', executable: '/usr/sbin/sshd', args: ['/usr/sbin/sshd', '-D'] },
    bootTime + 8_000,
    init,
  );
  const crond = rootNode(
    faker.number.int({ min: 2600, max: 3500 }),
    { name: 'crond', executable: '/usr/sbin/crond', args: ['/usr/sbin/crond', '-n'] },
    bootTime + 9_000,
    init,
  );
  return {
    host,
    sessionData,
    nextPid: faker.number.int({ min: 12_000, max: 20_000 }),
    sequence: faker.number.int({ min: 5_000, max: 15_000 }),
    eventIdPrefix: faker.string.alphanumeric(12) + 'Eq',
    hashes: new Map(),
    init,
    sshd,
    crond,
  };
};

export const allocatePid = (runtime: HostRuntime, gap = 1): number => {
  runtime.nextPid += gap;
  return runtime.nextPid;
};

/** Creates a process node without emitting anything. Session links are inherited unless overridden. */
export const createProcessNode = ({
  runtime,
  parent,
  image,
  start,
  role,
  user,
  group,
  realUser,
  realGroup,
  supplementalGroups,
  workingDirectory,
  newSession = false,
  newGroup = false,
  pid,
}: {
  runtime: HostRuntime;
  parent: ProcessNode;
  image: ProcessImage;
  start: number;
  role: ProcessRole | undefined;
  user?: PosixIdentity;
  group?: PosixGroup;
  realUser?: PosixIdentity;
  realGroup?: PosixGroup;
  supplementalGroups?: readonly PosixGroup[] | undefined;
  workingDirectory?: string;
  newSession?: boolean;
  newGroup?: boolean;
  pid?: number;
}): ProcessNode => {
  const effectiveUser = user ?? parent.user;
  const effectiveGroup = group ?? parent.group;
  const node: ProcessNode = {
    pid: pid ?? allocatePid(runtime),
    entityId: randomEntityId(),
    image,
    workingDirectory: workingDirectory ?? parent.workingDirectory,
    start,
    user: effectiveUser,
    group: effectiveGroup,
    realUser: realUser ?? user ?? parent.realUser,
    realGroup: realGroup ?? group ?? parent.realGroup,
    supplementalGroups:
      supplementalGroups === undefined && user === undefined
        ? parent.supplementalGroups
        : supplementalGroups,
    role,
    parent,
    ancestry: [parent.entityId, ...parent.ancestry].slice(0, ANCESTRY_DEPTH),
    session: undefined,
    previous: undefined,
  };
  const inherited = parent.session;
  if (inherited) {
    node.session = {
      ...inherited,
      sessionLeader: newSession ? node : inherited.sessionLeader,
      groupLeader: newSession || newGroup ? node : inherited.groupLeader,
    };
  }
  return node;
};

export type ProcessAction = 'fork' | 'exec' | 'end' | 'session_id_change';

const PROCESS_EVENT_TYPE: Record<ProcessAction, string> = {
  fork: 'start',
  exec: 'start',
  end: 'end',
  session_id_change: 'change',
};

const iso = (ms: number): string => new Date(ms).toISOString();
const isoSeconds = (ms: number): string => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

const posix = (identity: PosixIdentity) => ({ name: identity.name, id: identity.id });

const supplementalGroupsField = (groups: readonly PosixGroup[] | undefined) =>
  groups && groups.length > 0 ? { supplemental_groups: groups.map(posix) } : {};

const leaderFields = (leader: ProcessNode, node: ProcessNode, session: SessionLinks) => ({
  args: [...leader.image.args],
  args_count: leader.image.args.length,
  entity_id: leader.entityId,
  executable: leader.image.executable,
  name: leader.image.name,
  pid: leader.pid,
  start: iso(leader.start),
  working_directory: leader.workingDirectory,
  user: posix(leader.user),
  group: posix(leader.group),
  real_user: posix(leader.realUser),
  real_group: posix(leader.realGroup),
  ...supplementalGroupsField(leader.supplementalGroups),
  interactive: leader === session.entryLeader ? false : session.interactive,
  ...(session.tty && leader !== session.entryLeader && { tty: { char_device: session.tty } }),
  same_as_process: leader.entityId === node.entityId,
});

const sessionDataFields = (node: ProcessNode) => {
  const { session } = node;
  if (!session) {
    return {};
  }
  return {
    start: iso(node.start),
    user: posix(node.user),
    group: posix(node.group),
    real_user: posix(node.realUser),
    real_group: posix(node.realGroup),
    ...supplementalGroupsField(node.supplementalGroups),
    interactive: session.interactive,
    ...(session.tty && { tty: { char_device: session.tty } }),
    entry_leader: {
      ...leaderFields(session.entryLeader, node, session),
      entry_meta: {
        type: session.entryMeta.type,
        ...(session.entryMeta.sourceIp && { source: { ip: session.entryMeta.sourceIp } }),
      },
      parent: session.entryLeader.parent
        ? {
            entity_id: session.entryLeader.parent.entityId,
            pid: session.entryLeader.parent.pid,
            start: iso(session.entryLeader.parent.start),
          }
        : undefined,
    },
    session_leader: leaderFields(session.sessionLeader, node, session),
    group_leader: leaderFields(session.groupLeader, node, session),
  };
};

const leaderIds = (node: ProcessNode) => {
  const { session } = node;
  if (!session) {
    return {};
  }
  return {
    entry_leader: {
      entity_id: session.entryLeader.entityId,
      parent: { entity_id: session.entryLeader.parent?.entityId },
    },
    group_leader: { entity_id: session.groupLeader.entityId },
    session_leader: { entity_id: session.sessionLeader.entityId },
  };
};

/** Collects Endpoint documents for one agent session (or for untagged host processes when `stamp` is undefined). */
export class EndpointWriter {
  readonly documents: GeneratedDocument[] = [];
  readonly runtime: HostRuntime;
  readonly stamp: AgentStampState | undefined;

  constructor(runtime: HostRuntime, stamp: AgentStampState | undefined) {
    this.runtime = runtime;
    this.stamp = stamp;
  }

  private hashFor(executable: string): string {
    const existing = this.runtime.hashes.get(executable);
    if (existing) {
      return existing;
    }
    const hash = faker.string.hexadecimal({ length: 64, casing: 'lower', prefix: '' });
    this.runtime.hashes.set(executable, hash);
    return hash;
  }

  private base(
    at: number,
    dataset: string,
    category: string,
    actions: string[],
    types: string[],
    emittedAt: number = at,
  ) {
    const { host, sequence } = this.runtime;
    this.runtime.sequence = sequence + 1;
    return {
      '@timestamp': iso(at),
      agent: { id: host.elasticAgentId, type: 'endpoint', version: ENDPOINT_AGENT_VERSION },
      ecs: { version: ECS_VERSION },
      data_stream: { namespace: 'default', type: 'logs', dataset },
      elastic: { agent: { id: host.elasticAgentId } },
      host: { id: host.id, name: host.name, os: { type: 'linux' } },
      event: {
        agent_id_status: 'verified',
        sequence,
        ingested: isoSeconds(emittedAt + faker.number.int({ min: 4_000, max: 11_000 })),
        created: iso(emittedAt + faker.number.int({ min: 0, max: 5 })),
        kind: 'event',
        module: 'endpoint',
        action: actions,
        id: `${this.runtime.eventIdPrefix}+++++${sequence.toString(36)}`,
        category: [category],
        type: types,
        dataset,
        outcome: 'unknown',
      },
    };
  }

  private userFields(node: ProcessNode) {
    return {
      user: { Ext: { real: posix(node.realUser) }, ...posix(node.user) },
      group: { Ext: { real: posix(node.realGroup) }, ...posix(node.group) },
    };
  }

  private aiAgent(node: ProcessNode, stampAt: number) {
    if (!this.stamp || !node.role) {
      return {};
    }
    return { ai_agent: stampAiAgent({ state: this.stamp, role: node.role, timestamp: stampAt }) };
  }

  /**
   * `endAt` is for a whole process reported as one `fork,exec,end` event. Defend sends that event
   * when the process exits, so its `process.ai_agent` reflects the agent state at `endAt`.
   */
  processEvent(
    node: ProcessNode,
    actions: readonly ProcessAction[],
    at: number,
    { exitCode = 0, endAt }: { exitCode?: number; endAt?: number } = {},
  ): void {
    const ends = actions.includes('end');
    const stampAt = endAt ?? at;
    const parent = node.parent;
    const withSession = this.runtime.sessionData && node.session !== undefined;
    const base = this.base(
      at,
      'endpoint.events.process',
      'process',
      [...actions],
      actions.map((action) => PROCESS_EVENT_TYPE[action]),
      stampAt,
    );
    this.documents.push({
      index: ENDPOINT_PROCESS_INDEX,
      source: {
        ...base,
        message: 'Endpoint process event',
        process: {
          Ext: { ancestry: [...node.ancestry] },
          args: [...node.image.args],
          args_count: node.image.args.length,
          command_line: node.image.args.join(' '),
          entity_id: node.entityId,
          executable: node.image.executable,
          name: node.image.name,
          pid: node.pid,
          working_directory: node.workingDirectory,
          hash: { sha256: this.hashFor(node.image.executable) },
          ...this.aiAgent(node, stampAt),
          ...(ends && { exit_code: exitCode }),
          ...(ends && withSession && { end: iso(stampAt) }),
          ...(node.previous && {
            previous: node.previous.map((image) => ({
              args: [...image.args],
              args_count: image.args.length,
              executable: image.executable,
            })),
          }),
          ...(parent && {
            parent: {
              args: [...parent.image.args],
              args_count: parent.image.args.length,
              command_line: parent.image.args.join(' '),
              entity_id: parent.entityId,
              executable: parent.image.executable,
              name: parent.image.name,
              pid: parent.pid,
              ...(withSession && parent.session && sessionParentFields(parent)),
            },
          }),
          ...(withSession && sessionDataFields(node)),
        },
        ...this.userFields(node),
      },
    });
  }

  fileEvent(
    node: ProcessNode,
    at: number,
    {
      action,
      path,
      size = 0,
      originalPath,
      entropy,
    }: {
      action: 'creation' | 'rename' | 'deletion';
      path: string;
      size?: number;
      originalPath?: string;
      entropy?: number;
    },
  ): void {
    const type = action === 'rename' ? 'change' : action;
    const base = this.base(at, 'endpoint.events.file', 'file', [action], [type]);
    const ext: Record<string, unknown> = {};
    if (originalPath) {
      ext.original = fileNameFields(originalPath);
    }
    if (entropy !== undefined && size > 0) {
      ext.entropy = entropy;
      ext.header_bytes = faker.string.hexadecimal({ length: 32, casing: 'lower', prefix: '' });
    }
    this.documents.push({
      index: ENDPOINT_FILE_INDEX,
      source: {
        ...base,
        message: 'Endpoint file event',
        file: {
          ...fileNameFields(path),
          size,
          ...(Object.keys(ext).length > 0 && { Ext: ext }),
        },
        process: this.actingProcess(node, at, false),
        ...this.userFields(node),
      },
    });
  }

  dnsLookup(
    node: ProcessNode,
    at: number,
    { name, resolvedIps }: { name: string; resolvedIps: readonly string[] },
  ): void {
    const { host } = this.runtime;
    for (const questionType of ['A', 'AAAA'] as const) {
      const sourcePort = faker.number.int({ min: 32_768, max: 60_999 });
      const requested = this.base(
        at,
        'endpoint.events.network',
        'network',
        ['lookup_requested'],
        ['protocol', 'info'],
      );
      this.documents.push({
        index: ENDPOINT_NETWORK_INDEX,
        source: {
          ...requested,
          message: 'Endpoint DNS event',
          dns: { question: { name, type: questionType }, resolved_ip: [] },
          network: { protocol: 'dns', transport: 'udp' },
          source: { address: host.ip, ip: host.ip, port: sourcePort },
          destination: { address: host.resolverIp, ip: host.resolverIp, port: 53 },
          process: this.actingProcess(node, at, true),
          ...this.userFields(node),
        },
      });
      const result = this.base(
        at + 1,
        'endpoint.events.network',
        'network',
        ['lookup_result'],
        ['protocol', 'info'],
      );
      this.documents.push({
        index: ENDPOINT_NETWORK_INDEX,
        source: {
          ...result,
          event: { ...result.event, outcome: 'success' },
          message: 'Endpoint DNS event',
          dns: {
            question: { name, type: questionType },
            resolved_ip: questionType === 'A' ? [...resolvedIps] : [],
          },
          network: { protocol: 'dns', transport: 'udp' },
          source: { address: host.resolverIp, ip: host.resolverIp, port: 53 },
          destination: { address: host.ip, ip: host.ip, port: sourcePort },
          process: this.actingProcess(node, at + 1, true),
          ...this.userFields(node),
        },
      });
    }
  }

  connection(
    node: ProcessNode,
    at: number,
    {
      ip,
      port,
      phase = 'attempted_and_closed',
      bytes,
      openedAt,
    }: {
      ip: string;
      port: number;
      phase?: 'attempted' | 'closed' | 'attempted_and_closed';
      bytes?: { sent: number; received: number };
      /** A close event carries the agent state from when its flow opened. */
      openedAt?: number;
    },
  ): void {
    const { host } = this.runtime;
    const actions =
      phase === 'attempted'
        ? ['connection_attempted']
        : phase === 'closed'
          ? ['disconnect_received']
          : ['connection_attempted', 'disconnect_received'];
    const types = actions.map((action) => (action === 'connection_attempted' ? 'start' : 'end'));
    const base = this.base(at, 'endpoint.events.network', 'network', actions, types);
    const closes = phase !== 'attempted';
    const sourcePort = faker.number.int({ min: 32_768, max: 60_999 });
    this.documents.push({
      index: ENDPOINT_NETWORK_INDEX,
      source: {
        ...base,
        message: 'Endpoint network event',
        network: { transport: 'tcp', type: 'ipv4', direction: 'egress' },
        source: {
          address: host.ip,
          ip: host.ip,
          port: sourcePort,
          ...(closes && bytes && { bytes: bytes.sent }),
        },
        destination: {
          address: ip,
          ip,
          port,
          ...(closes && bytes && { bytes: bytes.received }),
        },
        process: this.actingProcess(node, openedAt ?? at, false),
        ...this.userFields(node),
      },
    });
  }

  private actingProcess(node: ProcessNode, at: number, withAncestry: boolean) {
    const withSession = this.runtime.sessionData && node.session !== undefined;
    return {
      ...(withAncestry && { Ext: { ancestry: [...node.ancestry] } }),
      entity_id: node.entityId,
      executable: node.image.executable,
      name: node.image.name,
      pid: node.pid,
      parent: { entity_id: node.parent?.entityId },
      ...this.aiAgent(node, at),
      ...(withSession && leaderIds(node)),
    };
  }
}

const sessionParentFields = (parent: ProcessNode) => {
  const { session } = parent;
  return {
    start: iso(parent.start),
    working_directory: parent.workingDirectory,
    user: posix(parent.user),
    group: posix(parent.group),
    real_user: posix(parent.realUser),
    real_group: posix(parent.realGroup),
    ...supplementalGroupsField(parent.supplementalGroups),
    ...(session && { interactive: session.interactive }),
    ...(session?.tty && { tty: { char_device: session.tty } }),
  };
};

const fileNameFields = (path: string) => {
  const name = path.split('/').pop() ?? path;
  const dot = name.lastIndexOf('.');
  return {
    path,
    name,
    ...(dot > 0 && dot < name.length - 1 && { extension: name.slice(dot + 1) }),
  };
};
