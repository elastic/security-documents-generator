import {
  HOSTS,
  SERVICES,
  USERS,
  buildLogons,
  hostByKey,
  hostEuid,
  idpUserEuid,
  localUserEuid,
  logonTimestamp,
  serviceEuid,
  userByKey,
  type RelationshipPhase,
  type ScenarioLogon,
} from './scenario.ts';
import { SCENARIO_TAG, bulkCreate, timeAt, uuidv5 } from './utils.ts';

type Json = Record<string, unknown>;

const SSH_SOURCE_IP = '10.20.4.17';
const RDP_SOURCE_IP = '10.20.4.52';

const hostFields = (hostKey: string): Json => {
  const host = hostByKey(hostKey);
  return {
    id: host.id,
    name: host.name,
    hostname: host.name,
    os:
      host.os === 'windows'
        ? { name: 'Windows Server 2022', family: 'windows', type: 'windows', platform: 'windows' }
        : { name: 'Ubuntu', family: 'debian', type: 'linux', platform: 'ubuntu' },
  };
};

export const buildLogonDoc = (logon: ScenarioLogon, anchor: Date, space: string): Json => {
  const user = userByKey(logon.userKey);
  const timestamp = logonTimestamp(anchor, logon).toISOString();
  const common = {
    '@timestamp': timestamp,
    host: hostFields(logon.hostKey),
    user: { name: user.userName, domain: logon.kind === 'ssh' ? undefined : 'ACME' },
    tags: [SCENARIO_TAG],
  };

  if (logon.kind === 'ssh') {
    return {
      ...common,
      event: {
        kind: 'event',
        module: 'system',
        dataset: 'system.auth',
        category: ['authentication', 'session'],
        type: ['info'],
        action: 'ssh_login',
        outcome: 'success',
      },
      source: { ip: SSH_SOURCE_IP },
      system: { auth: { ssh: { method: 'publickey', event: 'Accepted' } } },
      data_stream: { type: 'logs', dataset: 'system.auth', namespace: space },
    };
  }

  return {
    ...common,
    event: {
      kind: 'event',
      module: 'system',
      dataset: 'system.security',
      provider: 'Microsoft-Windows-Security-Auditing',
      category: ['authentication'],
      type: ['start'],
      action: 'logged-in',
      code: '4624',
      outcome: 'success',
    },
    winlog: {
      channel: 'Security',
      event_id: '4624',
      logon: { type: logon.kind === 'win_rdp' ? 'RemoteInteractive' : 'Interactive', id: '0x3e7' },
    },
    ...(logon.kind === 'win_rdp' ? { source: { ip: RDP_SOURCE_IP } } : {}),
    data_stream: { type: 'logs', dataset: 'system.security', namespace: space },
  };
};

const buildIdpAssetDocs = (anchor: Date, space: string): Json[] =>
  USERS.flatMap((user) =>
    [29, 1].map((daysAgo) => ({
      '@timestamp': timeAt(anchor, daysAgo, 6).toISOString(),
      event: {
        kind: ['asset'],
        category: ['iam'],
        type: ['user'],
        module: 'okta',
        dataset: 'okta.system',
      },
      user: {
        name: user.userName,
        email: user.email,
        id: uuidv5(`okta:${user.email}`),
        domain: 'acme.example',
      },
      data_stream: { type: 'logs', dataset: 'okta.system', namespace: space },
      tags: [SCENARIO_TAG],
    })),
  );

const buildServiceDocs = (anchor: Date, space: string): Json[] =>
  SERVICES.map((service) => ({
    '@timestamp': timeAt(anchor, 5, 3).toISOString(),
    event: {
      kind: 'event',
      category: ['process'],
      outcome: 'success',
      dataset: 'exec_brief.events',
    },
    service: { name: service.name, type: 'system' },
    data_stream: { type: 'logs', dataset: 'exec_brief.events', namespace: space },
    tags: [SCENARIO_TAG],
  }));

/** Data stream each source writes to (all `create` ops, default pipelines bypassed). */
export const logonDataStream = (logon: ScenarioLogon, space: string): string =>
  logon.kind === 'ssh' ? `logs-system.auth-${space}` : `logs-system.security-${space}`;

export const indexPhaseEvents = async ({
  phase,
  anchor,
  space,
}: {
  phase: RelationshipPhase;
  anchor: Date;
  space: string;
}): Promise<{ logons: number; expectedEntityIds: string[] }> => {
  const logons = buildLogons().filter((l) => l.phase === phase);
  const operations: object[] = [];
  const expected = new Set<string>();

  for (const logon of logons) {
    const index = logonDataStream(logon, space);
    operations.push({ create: { _index: index } }, buildLogonDoc(logon, anchor, space));
    const host = hostByKey(logon.hostKey);
    expected.add(hostEuid(host));
    expected.add(localUserEuid(userByKey(logon.userKey), host));
  }

  const baseline = phase === 6;
  if (baseline) {
    for (const doc of buildIdpAssetDocs(anchor, space)) {
      operations.push({ create: { _index: `logs-okta.system-${space}` } }, doc);
    }
    for (const doc of buildServiceDocs(anchor, space)) {
      operations.push({ create: { _index: `logs-exec_brief.events-${space}` } }, doc);
    }
    USERS.forEach((user) => expected.add(idpUserEuid(user)));
    SERVICES.forEach((service) => expected.add(serviceEuid(service)));
  }

  // Bypass default ingest pipelines (the docs are already in their final ECS shape).
  await bulkCreate({ operations, label: `source events (phase D-${phase})`, pipeline: '_none' });
  return { logons: logons.length, expectedEntityIds: [...expected] };
};

export const allHostEuids = (): string[] => HOSTS.map(hostEuid);
