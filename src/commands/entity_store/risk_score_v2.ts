import { faker } from '@faker-js/faker';
import auditbeatMappings from '../../mappings/auditbeat.json' with { type: 'json' };
import { bulkIngest, bulkUpsert } from '../shared/elasticsearch.ts';
import { getEsClient } from '../utils/indices.ts';
import { ensureSpace, getAlertIndex } from '../../utils/index.ts';
import { ensureSecurityDefaultDataView } from '../../utils/security_default_data_view.ts';
import {
  createWatchlist,
  enableEntityStoreV2,
  forceLogExtraction,
  forceUpdateEntityViaCrud,
  getEntityMaintainers,
  initEntityMaintainers,
  installEntityStoreV2,
  runEntityMaintainer,
} from '../../utils/kibana_api.ts';
import { log } from '../../utils/logger.ts';
import createAlerts from '../../generators/create_alerts.ts';
import { type MappingTypeMapping } from '@elastic/elasticsearch/lib/api/types';
import { getConfig } from '../../get_config.ts';
import { generateOrgData } from '../org_data/org_data_generator.ts';
import type { OrganizationSize, ProductivitySuite } from '../org_data/types.ts';

type RiskScoreV2Options = {
  users?: string;
  hosts?: string;
  services?: string;
  localUsers?: string;
  alertsPerEntity?: string;
  entityKinds?: string;
  offsetHours?: string;
  space?: string;
  setup?: boolean;
  criticality?: boolean;
  watchlists?: boolean;
  alerts?: boolean;
  perf?: boolean;
  eventIndex?: string;
  seedSource?: string;
  orgSize?: string;
  orgProductivitySuite?: string;
};

type SeededUser = { userName: string; userId: string; userEmail: string };
type SeededHost = { hostName: string; hostId: string };
type SeededLocalUser = { userName: string; hostId: string; hostName: string };
type SeededService = { serviceName: string };
type EntityKind = 'host' | 'idp_user' | 'local_user' | 'service';
type SeedSource = 'basic' | 'org';

const sleep = async (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const parseIntOption = (value: string | undefined, fallback: number): number =>
  value ? parseInt(value, 10) : fallback;

const SUPPORTED_ENTITY_KINDS: EntityKind[] = ['host', 'idp_user', 'local_user', 'service'];
const SUPPORTED_SEED_SOURCES: SeedSource[] = ['basic', 'org'];
const SUPPORTED_ORG_SIZES: OrganizationSize[] = ['john_doe', 'small', 'medium', 'enterprise'];
const SUPPORTED_PRODUCTIVITY_SUITES: ProductivitySuite[] = ['microsoft', 'google'];

const parseEntityKinds = (value?: string): EntityKind[] => {
  const rawKinds = (value ?? 'host,idp_user')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  const kinds = [...new Set(rawKinds)] as string[];
  const invalid = kinds.filter((k) => !SUPPORTED_ENTITY_KINDS.includes(k as EntityKind));
  if (invalid.length > 0) {
    throw new Error(
      `Invalid --entity-kinds value(s): ${invalid.join(', ')}. Supported kinds: ${SUPPORTED_ENTITY_KINDS.join(', ')}`,
    );
  }
  return kinds as EntityKind[];
};

const parseSeedSource = (value?: string): SeedSource => {
  const seedSource = (value ?? 'basic').trim().toLowerCase();
  if (!SUPPORTED_SEED_SOURCES.includes(seedSource as SeedSource)) {
    throw new Error(
      `Invalid --seed-source value "${value}". Supported values: ${SUPPORTED_SEED_SOURCES.join(', ')}`,
    );
  }
  return seedSource as SeedSource;
};

const parseOrgSize = (value?: string): OrganizationSize => {
  const orgSize = (value ?? 'small').trim().toLowerCase();
  if (!SUPPORTED_ORG_SIZES.includes(orgSize as OrganizationSize)) {
    throw new Error(
      `Invalid --org-size value "${value}". Supported values: ${SUPPORTED_ORG_SIZES.join(', ')}`,
    );
  }
  return orgSize as OrganizationSize;
};

const parseProductivitySuite = (value?: string): ProductivitySuite => {
  const suite = (value ?? 'microsoft').trim().toLowerCase();
  if (!SUPPORTED_PRODUCTIVITY_SUITES.includes(suite as ProductivitySuite)) {
    throw new Error(
      `Invalid --org-productivity-suite value "${value}". Supported values: ${SUPPORTED_PRODUCTIVITY_SUITES.join(', ')}`,
    );
  }
  return suite as ProductivitySuite;
};

const ensureEventTarget = async (eventIndex: string): Promise<'index' | 'create'> => {
  const client = getEsClient();
  const exists = await client.indices.exists({ index: eventIndex });
  if (exists) {
    try {
      await client.indices.getDataStream({ name: eventIndex });
      return 'create';
    } catch {
      return 'index';
    }
  }

  try {
    await client.indices.create({
      index: eventIndex,
      settings: {
        'index.mapping.total_fields.limit': 10000,
      },
      mappings: auditbeatMappings as MappingTypeMapping,
    });
    log.info(`Created event index "${eventIndex}"`);
    return 'index';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Expected when template only allows data streams
    if (
      message.includes('creates data streams only') ||
      message.includes('use create data stream api')
    ) {
      log.info(
        `Event target "${eventIndex}" is data-stream-backed; creating data stream instead of index.`,
      );
      await client.indices.createDataStream({ name: eventIndex });
      return 'create';
    }
    throw error;
  }
};

const toUserEuid = (user: SeededUser) => `user:${user.userEmail}@okta`;
const toHostEuid = (host: SeededHost) => `host:${host.hostId}`;

const compactSeedToken = (value: string, fallback: string): string => {
  const normalized = value.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return (normalized || fallback).slice(0, 4);
};

const seedUsers = (count: number): SeededUser[] =>
  Array.from({ length: count }, (_, i) => {
    const suffix = faker.string.alphanumeric(4).toLowerCase();
    const userName = `rv2u-${i}-${suffix}`;
    return {
      userName,
      userId: `risk-v2-user-id-${i}-${faker.string.alphanumeric(6)}`,
      userEmail: `${userName}@example.com`,
    };
  });

const seedHosts = (count: number): SeededHost[] =>
  Array.from({ length: count }, (_, i) => ({
    hostName: `risk-v2-host-${i}-${faker.internet.domainWord()}`,
    hostId: `risk-v2-host-id-${i}-${faker.string.alphanumeric(8).toLowerCase()}`,
  }));

const seedLocalUsers = (count: number, hosts: SeededHost[]): SeededLocalUser[] =>
  Array.from({ length: count }, (_, i) => {
    const host = hosts[i % hosts.length] ?? seedHosts(1)[0];
    return {
      userName: `risk-v2-local-user-${i}-${faker.internet.username()}`,
      hostId: host.hostId,
      hostName: host.hostName,
    };
  });

const seedServices = (count: number): SeededService[] =>
  Array.from({ length: count }, (_, i) => ({
    serviceName: `risk-v2-service-${i}-${faker.internet.domainWord()}`,
  }));

const topUpToCount = <T>(items: T[], count: number, factory: (remaining: number) => T[]): T[] => {
  if (items.length >= count) {
    return items.slice(0, count);
  }
  return [...items, ...factory(count - items.length)];
};

const seedFromOrgData = ({
  usersCount,
  hostsCount,
  localUsersCount,
  servicesCount,
  orgSize,
  productivitySuite,
}: {
  usersCount: number;
  hostsCount: number;
  localUsersCount: number;
  servicesCount: number;
  orgSize: OrganizationSize;
  productivitySuite: ProductivitySuite;
}): {
  users: SeededUser[];
  hosts: SeededHost[];
  localUsers: SeededLocalUser[];
  services: SeededService[];
} => {
  const org = generateOrgData({
    name: 'Risk Score Test Org',
    domain: 'risk-score-test.local',
    size: orgSize,
    productivitySuite,
  });

  const orgUsers: SeededUser[] = org.employees.map((employee, i) => {
    const token = compactSeedToken(employee.userName || employee.email, 'user');
    const compactUserName = `rv2u-${i}-${token}`;
    return {
      userName: compactUserName,
      userId: employee.oktaUserId,
      userEmail: `${compactUserName}@example.com`,
    };
  });
  const users = topUpToCount(orgUsers, usersCount, seedUsers);

  const orgHosts: SeededHost[] = org.hosts.map((host) => ({
    hostName: host.name,
    hostId: host.id,
  }));
  const hosts = topUpToCount(orgHosts, hostsCount, seedHosts);

  const fallbackHosts = hosts.length > 0 ? hosts : seedHosts(Math.max(1, localUsersCount));
  const orgLocalUsers: SeededLocalUser[] = org.employees.map((employee, i) => {
    const host = fallbackHosts[i % fallbackHosts.length];
    return {
      userName: employee.userName,
      hostName: host.hostName,
      hostId: host.hostId,
    };
  });
  const localUsers = topUpToCount(orgLocalUsers, localUsersCount, (remaining) =>
    seedLocalUsers(remaining, fallbackHosts),
  );

  const orgServices: SeededService[] = org.cloudIamUsers.map((iamUser) => ({
    serviceName: iamUser.userName,
  }));
  const services = topUpToCount(orgServices, servicesCount, seedServices);

  return { users, hosts, localUsers, services };
};

const buildUserEvents = (users: SeededUser[], offsetHours: number) => {
  const timestamp = new Date(Date.now() - offsetHours * 60 * 60 * 1000).toISOString();
  return users.map((user) => ({
    '@timestamp': timestamp,
    message: `Risk score v2 user event for ${user.userName}`,
    // Align with user entity definition postAggFilter for IDP path
    // (event.kind includes asset OR event.category includes iam + event.type includes user).
    'event.kind': ['asset'],
    'event.category': ['iam'],
    'event.type': ['user'],
    'event.module': 'okta',
    'event.dataset': 'okta.system',
    'service.type': 'system',
    'data_stream.type': 'logs',
    'data_stream.dataset': 'okta.system',
    'data_stream.namespace': 'default',
    'user.name': user.userName,
    'user.id': user.userId,
    'user.email': user.userEmail,
  }));
};

const buildHostEvents = (hosts: SeededHost[], offsetHours: number) => {
  const timestamp = new Date(Date.now() - offsetHours * 60 * 60 * 1000).toISOString();
  return hosts.map((host) => ({
    '@timestamp': timestamp,
    message: `Risk score v2 host event for ${host.hostName}`,
    'event.kind': 'event',
    'event.module': 'okta',
    'event.dataset': 'okta.system',
    'service.type': 'system',
    'data_stream.type': 'logs',
    'data_stream.dataset': 'okta.system',
    'data_stream.namespace': 'default',
    'host.name': host.hostName,
    'host.id': host.hostId,
  }));
};

const buildLocalUserEvents = (localUsers: SeededLocalUser[], offsetHours: number) => {
  const timestamp = new Date(Date.now() - offsetHours * 60 * 60 * 1000).toISOString();
  return localUsers.map((user) => ({
    '@timestamp': timestamp,
    message: `Risk score v2 local user event for ${user.userName}`,
    event: { kind: 'event', category: 'network', outcome: 'success', module: 'local' },
    'event.module': 'local',
    'event.dataset': 'okta.system',
    'service.type': 'system',
    'data_stream.type': 'logs',
    'data_stream.dataset': 'okta.system',
    'data_stream.namespace': 'default',
    'user.name': user.userName,
    'host.id': user.hostId,
    'host.name': user.hostName,
  }));
};

const buildServiceEvents = (services: SeededService[], offsetHours: number) => {
  const timestamp = new Date(Date.now() - offsetHours * 60 * 60 * 1000).toISOString();
  return services.map((service) => ({
    '@timestamp': timestamp,
    message: `Risk score v2 service event for ${service.serviceName}`,
    event: { kind: 'event', category: 'network', outcome: 'success' },
    'event.module': 'okta',
    'event.dataset': 'okta.system',
    'service.type': 'system',
    'service.name': service.serviceName,
    'data_stream.type': 'logs',
    'data_stream.dataset': 'okta.system',
    'data_stream.namespace': 'default',
  }));
};

const buildAlertOps = ({
  hosts,
  idpUsers,
  localUsers,
  services,
  alertsPerEntity,
  space,
}: {
  hosts: SeededHost[];
  idpUsers: SeededUser[];
  localUsers: SeededLocalUser[];
  services: SeededService[];
  alertsPerEntity: number;
  space: string;
}): unknown[] => {
  const alertIndex = getAlertIndex(space);
  const docs: unknown[] = [];

  for (const user of idpUsers) {
    for (let i = 0; i < alertsPerEntity; i++) {
      const riskScore = faker.number.int({ min: 20, max: 100 });
      const alert = createAlerts(
        {
          'kibana.alert.risk_score': riskScore,
          'kibana.alert.rule.risk_score': riskScore,
          'kibana.alert.rule.parameters': { description: 'risk v2 test', risk_score: riskScore },
          'event.kind': ['asset'],
          'event.category': ['iam'],
          'event.type': ['user'],
          'user.email': user.userEmail,
        },
        {
          userName: user.userName,
          userId: user.userId,
          hostName: `user-alert-host-${i}-${user.userId}`,
          eventModule: 'okta',
          space,
        },
      );
      const id = (alert as Record<string, unknown>)['kibana.alert.uuid'] as string;
      docs.push({ create: { _index: alertIndex, _id: id } });
      docs.push(alert);
    }
  }

  for (const user of localUsers) {
    for (let i = 0; i < alertsPerEntity; i++) {
      const riskScore = faker.number.int({ min: 20, max: 100 });
      const alert = createAlerts(
        {
          'kibana.alert.risk_score': riskScore,
          'kibana.alert.rule.risk_score': riskScore,
          'kibana.alert.rule.parameters': { description: 'risk v2 test', risk_score: riskScore },
          'event.module': 'local',
          'user.name': user.userName,
          'host.id': user.hostId,
          'host.name': user.hostName,
        },
        {
          userName: user.userName,
          hostName: user.hostName,
          hostId: user.hostId,
          eventModule: 'local',
          space,
        },
      );
      const id = (alert as Record<string, unknown>)['kibana.alert.uuid'] as string;
      docs.push({ create: { _index: alertIndex, _id: id } });
      docs.push(alert);
    }
  }

  for (const host of hosts) {
    for (let i = 0; i < alertsPerEntity; i++) {
      const riskScore = faker.number.int({ min: 20, max: 100 });
      const alert = createAlerts(
        {
          'kibana.alert.risk_score': riskScore,
          'kibana.alert.rule.risk_score': riskScore,
          'kibana.alert.rule.parameters': { description: 'risk v2 test', risk_score: riskScore },
        },
        {
          hostName: host.hostName,
          hostId: host.hostId,
          userName: `host-alert-user-${i}-${host.hostId}`,
          eventModule: 'okta',
          space,
        },
      );
      const id = (alert as Record<string, unknown>)['kibana.alert.uuid'] as string;
      docs.push({ create: { _index: alertIndex, _id: id } });
      docs.push(alert);
    }
  }

  for (const service of services) {
    for (let i = 0; i < alertsPerEntity; i++) {
      const riskScore = faker.number.int({ min: 20, max: 100 });
      const alert = createAlerts(
        {
          'kibana.alert.risk_score': riskScore,
          'kibana.alert.rule.risk_score': riskScore,
          'kibana.alert.rule.parameters': { description: 'risk v2 test', risk_score: riskScore },
          'service.name': service.serviceName,
          'event.kind': 'event',
          'event.category': 'network',
        },
        {
          userName: `service-alert-user-${i}`,
          hostName: `service-alert-host-${i}`,
          space,
        },
      );
      const id = (alert as Record<string, unknown>)['kibana.alert.uuid'] as string;
      docs.push({ create: { _index: alertIndex, _id: id } });
      docs.push(alert);
    }
  }

  return docs;
};

const waitForMaintainerRun = async (space: string, maintainerId: string = 'risk-score') => {
  let baselineRuns: number;
  try {
    const baseline = await getEntityMaintainers(space, [maintainerId]);
    const existing = baseline.maintainers.find((m) => m.id === maintainerId);
    baselineRuns = existing?.runs ?? 0;
  } catch {
    baselineRuns = 0;
  }

  log.info(
    `Triggering maintainer "${maintainerId}" in space "${space}" (baseline runs=${baselineRuns})...`,
  );
  await runEntityMaintainer(maintainerId, space);

  const deadline = Date.now() + 90_000;
  let lastHeartbeat = 0;
  while (Date.now() < deadline) {
    const response = await getEntityMaintainers(space, [maintainerId]);
    const maintainer = response.maintainers.find((m) => m.id === maintainerId);
    if (maintainer && maintainer.runs > baselineRuns) {
      log.info(
        `Maintainer "${maintainerId}" run observed (runs=${maintainer.runs}, taskStatus=${maintainer.taskStatus}).`,
      );
      const settleDeadline = Date.now() + 15_000;
      while (Date.now() < settleDeadline) {
        const settleResponse = await getEntityMaintainers(space, [maintainerId]);
        const settleMaintainer = settleResponse.maintainers.find((m) => m.id === maintainerId);
        if (!settleMaintainer || settleMaintainer.taskStatus !== 'started') {
          log.info(
            `Maintainer "${maintainerId}" appears settled (taskStatus=${settleMaintainer?.taskStatus ?? 'unknown'}).`,
          );
          return maintainer.runs;
        }
        await sleep(2000);
      }
      log.warn(
        `Maintainer "${maintainerId}" still reports taskStatus=started after short settle wait; continuing with summary.`,
      );
      return maintainer.runs;
    }
    const now = Date.now();
    if (now - lastHeartbeat >= 10_000) {
      const remainingMs = Math.max(0, deadline - now);
      log.info(
        `Waiting for maintainer "${maintainerId}" run (baseline=${baselineRuns}, current=${maintainer?.runs ?? 0}, remaining_timeout_ms=${remainingMs})...`,
      );
      lastHeartbeat = now;
    }
    await sleep(3000);
  }

  throw new Error(`Timed out waiting for maintainer "${maintainerId}" run`);
};

const applyCriticality = async (entityIds: string[], space: string) => {
  const levels = ['low_impact', 'medium_impact', 'high_impact', 'extreme_impact'] as const;
  const concurrency = 5;
  log.info(`Applying criticality to ${entityIds.length} entities (concurrency=${concurrency})...`);
  let processed = 0;
  for (let i = 0; i < entityIds.length; i += concurrency) {
    const batch = entityIds.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (entityId) => {
        const entityType = entityId.startsWith('user:') ? 'user' : 'host';
        const criticality = faker.helpers.arrayElement(levels);
        await forceUpdateEntityViaCrud({
          entityType,
          space,
          body: {
            entity: { id: entityId },
            asset: { criticality },
          },
        });
      }),
    );
    processed += batch.length;
    if (processed % 10 === 0 || processed === entityIds.length) {
      log.info(`Criticality progress: ${processed}/${entityIds.length}`);
    }
  }
  log.info('Criticality assignment complete.');
};

const createWatchlistsForRun = async (space: string) => {
  const suffix = Date.now();
  return Promise.all([
    createWatchlist({ name: `high-risk-vendors-${suffix}`, riskModifier: 1.8, space }),
    createWatchlist({ name: `departing-employees-${suffix}`, riskModifier: 1.5, space }),
    createWatchlist({ name: `insider-threat-${suffix}`, riskModifier: 2.0, space }),
  ]);
};

const applyWatchlists = async (entityIds: string[], watchlistIds: string[], space: string) => {
  const targetCount = Math.max(1, Math.floor(entityIds.length * 0.4));
  const selected = faker.helpers.arrayElements(entityIds, targetCount);
  const concurrency = 5;
  log.info(
    `Applying watchlists to ${selected.length}/${entityIds.length} entities (watchlists=${watchlistIds.length}, concurrency=${concurrency})...`,
  );

  let processed = 0;
  for (let i = 0; i < selected.length; i += concurrency) {
    const batch = selected.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (entityId) => {
        const entityType = entityId.startsWith('user:') ? 'user' : 'host';
        const memberships = faker.helpers.arrayElements(
          watchlistIds,
          faker.number.int({ min: 1, max: 2 }),
        );
        await forceUpdateEntityViaCrud({
          entityType,
          space,
          body: {
            entity: {
              id: entityId,
              attributes: {
                watchlists: memberships,
              },
            },
          },
        });
      }),
    );
    processed += batch.length;
    if (processed % 10 === 0 || processed === selected.length) {
      log.info(`Watchlist progress: ${processed}/${selected.length}`);
    }
  }
  log.info('Watchlist assignment complete.');
};

const formatCell = (value: string, width: number): string => {
  if (value.length === width) return value;
  if (value.length < width) return value.padEnd(width, ' ');
  if (width <= 3) return value.slice(0, width);
  return `${value.slice(0, width - 3)}...`;
};

const normalizeWatchlists = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  if (typeof value === 'string') {
    return [value];
  }
  return [];
};

const reportRiskSummary = async ({
  space,
  baselineRiskScoreCount,
  baselineEntityCount,
  expectedRiskDelta,
  entityIds,
}: {
  space: string;
  baselineRiskScoreCount: number;
  baselineEntityCount: number;
  expectedRiskDelta: number;
  entityIds: string[];
}) => {
  const client = getEsClient();
  const riskIndex = `risk-score.risk-score-${space}`;
  const riskSearch = await client.search({
    index: riskIndex,
    size: 1000,
    query: { match_all: {} },
    sort: [{ '@timestamp': { order: 'desc' } }],
  });

  const docs = riskSearch.hits.hits.map((hit) => hit._source as Record<string, unknown>);
  const watchlistModifierDocs = docs.filter((doc) => {
    const risk = ((doc.user as Record<string, unknown>)?.risk ??
      (doc.host as Record<string, unknown>)?.risk ??
      {}) as Record<string, unknown>;
    const modifiers = (risk.modifiers as Array<Record<string, unknown>> | undefined) ?? [];
    return modifiers.some((m) => m.type === 'watchlist');
  }).length;

  const total =
    typeof riskSearch.hits.total === 'number'
      ? riskSearch.hits.total
      : (riskSearch.hits.total?.value ?? docs.length);
  const entityCount = await getEntityStoreDocCount(space);
  const riskDelta = Math.max(0, total - baselineRiskScoreCount);
  const entityDelta = Math.max(0, entityCount - baselineEntityCount);

  log.info(
    `Run summary (${space}): entities ${baselineEntityCount} -> ${entityCount} (delta +${entityDelta})`,
  );
  log.info(
    `Run summary (${space}): risk scores ${baselineRiskScoreCount} -> ${total} (delta +${riskDelta})`,
  );
  if (riskDelta < expectedRiskDelta) {
    log.warn(
      `Risk score delta lower than expected for this run (${riskDelta}/${expectedRiskDelta}). This can happen when existing score docs are updated in-place or scoring configuration limits entity types.`,
    );
  }
  log.info(`Docs with watchlist modifiers: ${watchlistModifierDocs}`);

  const uniqueEntityIds = [...new Set(entityIds)];
  if (uniqueEntityIds.length === 0) {
    return;
  }

  const entityIndex = `.entities.v2.latest.security_${space}`;
  const entityResponse = await client.search({
    index: entityIndex,
    size: uniqueEntityIds.length,
    query: {
      terms: {
        'entity.id': uniqueEntityIds,
      },
    },
    _source: ['entity.id', 'entity.type', 'entity.attributes.watchlists', 'asset.criticality'],
  });

  const entityById = new Map<
    string,
    { entityType: string; criticality: string; watchlists: string[] }
  >();
  for (const hit of entityResponse.hits.hits) {
    const source = hit._source as
      | {
          entity?: { id?: string; type?: string; attributes?: { watchlists?: string[] } };
          asset?: { criticality?: string };
        }
      | undefined;
    const id = source?.entity?.id;
    if (!id) continue;
    const watchlists = normalizeWatchlists(source?.entity?.attributes?.watchlists);
    entityById.set(id, {
      entityType: source.entity?.type ?? 'unknown',
      criticality: source.asset?.criticality ?? '-',
      watchlists,
    });
  }

  const riskResponse = await client.search({
    index: riskIndex,
    size: Math.max(100, uniqueEntityIds.length * 4),
    sort: [{ '@timestamp': { order: 'desc' } }],
    query: {
      bool: {
        should: [
          { terms: { 'host.name': uniqueEntityIds } },
          { terms: { 'user.name': uniqueEntityIds } },
        ],
        minimum_should_match: 1,
      },
    },
    _source: ['host.name', 'host.risk', 'user.name', 'user.risk'],
  });

  const riskById = new Map<string, { score: string; level: string }>();
  for (const hit of riskResponse.hits.hits) {
    const source = hit._source as
      | {
          host?: {
            name?: string;
            risk?: { calculated_score_norm?: number; calculated_level?: string };
          };
          user?: {
            name?: string;
            risk?: { calculated_score_norm?: number; calculated_level?: string };
          };
        }
      | undefined;
    const hostId = source?.host?.name;
    const userId = source?.user?.name;
    const id = hostId ?? userId;
    const risk = source?.host?.risk ?? source?.user?.risk;
    if (!id || !risk || riskById.has(id)) continue;
    riskById.set(id, {
      score:
        typeof risk.calculated_score_norm === 'number'
          ? risk.calculated_score_norm.toFixed(2)
          : '-',
      level: risk.calculated_level ?? '-',
    });
  }

  const rows = uniqueEntityIds.map((id) => {
    const entity = entityById.get(id);
    const risk = riskById.get(id);
    return {
      id,
      score: risk?.score ?? '-',
      level: risk?.level ?? '-',
      criticality: entity?.criticality ?? '-',
      watchlistsCount: entity?.watchlists?.length ?? 0,
    };
  });

  const idWidth = 66;
  const scoreWidth = 7;
  const levelWidth = 8;
  const critWidth = 14;
  const watchWidth = 5;
  const header = [
    formatCell('Entity ID', idWidth),
    formatCell('Score', scoreWidth),
    formatCell('Lvl', levelWidth),
    formatCell('Criticality', critWidth),
    formatCell('WL', watchWidth),
  ].join(' | ');
  const separator = `${'-'.repeat(idWidth)}-+-${'-'.repeat(scoreWidth)}-+-${'-'.repeat(levelWidth)}-+-${'-'.repeat(critWidth)}-+-${'-'.repeat(watchWidth)}`;

  const maxRows = 200;
  const rowsToPrint = rows.slice(0, maxRows);
  log.info(`Risk docs matched for seeded IDs: ${riskById.size}/${rows.length}`);
  log.info(
    `Entity scorecard (${rows.length} seeded entities${rows.length > maxRows ? `, showing first ${maxRows}` : ''}):`,
  );
  const printLine = (line: string) => {
    // eslint-disable-next-line no-console
    console.log(line);
  };
  printLine(header);
  printLine(separator);
  for (const row of rowsToPrint) {
    printLine(
      [
        formatCell(row.id, idWidth),
        formatCell(row.score, scoreWidth),
        formatCell(row.level, levelWidth),
        formatCell(row.criticality, critWidth),
        formatCell(String(row.watchlistsCount), watchWidth),
      ].join(' | '),
    );
  }
  if (rows.length > maxRows) {
    log.info(`... truncated ${rows.length - maxRows} additional entities from scorecard output.`);
  }
  const missingRiskDocIds = rows
    .filter((row) => row.score === '-' && row.level === '-')
    .map((row) => row.id);
  if (missingRiskDocIds.length > 0) {
    const preview = missingRiskDocIds.slice(0, 5).join(', ');
    log.warn(
      `Missing risk score docs for ${missingRiskDocIds.length}/${rows.length} seeded entities. Missing examples: ${preview}${missingRiskDocIds.length > 5 ? ', ...' : ''}`,
    );
  } else {
    log.info(`All ${rows.length}/${rows.length} seeded entities have risk score docs.`);
  }
};

const getRiskScoreDocCount = async (space: string): Promise<number> => {
  const client = getEsClient();
  const index = `risk-score.risk-score-${space}`;
  try {
    const response = await client.count({ index });
    return response.count;
  } catch {
    return 0;
  }
};

const getEntityStoreDocCount = async (space: string): Promise<number> => {
  const client = getEsClient();
  const index = `.entities.v2.latest.security_${space}`;
  try {
    const response = await client.count({ index });
    return response.count;
  } catch {
    return 0;
  }
};

const getPresentEntityIds = async (space: string, entityIds: string[]): Promise<Set<string>> => {
  if (entityIds.length === 0) {
    return new Set();
  }

  const client = getEsClient();
  const index = `.entities.v2.latest.security_${space}`;
  const present = new Set<string>();
  const chunkSize = 500;

  for (let i = 0; i < entityIds.length; i += chunkSize) {
    const chunk = entityIds.slice(i, i + chunkSize);
    try {
      const response = await client.search({
        index,
        size: chunk.length,
        query: {
          terms: {
            'entity.id': chunk,
          },
        },
        _source: ['entity.id'],
      });

      for (const hit of response.hits.hits) {
        const source = hit._source as { entity?: { id?: string } } | undefined;
        const id = source?.entity?.id;
        if (id) {
          present.add(id);
        }
      }
    } catch {
      // Index may not exist yet; treat as no matches
    }
  }

  return present;
};

const waitForExpectedEntityIds = async ({
  space,
  expectedEntityIds,
  timeoutMs = 120000,
}: {
  space: string;
  expectedEntityIds: string[];
  timeoutMs?: number;
}) => {
  if (expectedEntityIds.length === 0) {
    return;
  }

  const deadline = Date.now() + timeoutMs;
  let lastPresent = -1;
  let lastHeartbeat = 0;
  log.info(
    `Waiting for entity extraction in space "${space}" for ${expectedEntityIds.length} expected entity IDs...`,
  );

  while (Date.now() < deadline) {
    const present = await getPresentEntityIds(space, expectedEntityIds);
    const now = Date.now();
    if (present.size !== lastPresent) {
      log.info(
        `Entity ID progress (.entities.v2.latest.security_${space}): present=${present.size}/${expectedEntityIds.length}`,
      );
      lastPresent = present.size;
      lastHeartbeat = now;
    } else if (now - lastHeartbeat >= 10_000) {
      const remainingMs = Math.max(0, deadline - now);
      log.info(
        `Still waiting for entity extraction: present=${present.size}/${expectedEntityIds.length}, remaining_timeout_ms=${remainingMs}`,
      );
      lastHeartbeat = now;
    }

    if (present.size >= expectedEntityIds.length) {
      log.info('Entity extraction stage complete.');
      return;
    }
    await sleep(3000);
  }

  const present = await getPresentEntityIds(space, expectedEntityIds);
  const missing = expectedEntityIds.filter((id) => !present.has(id));
  const sample = missing.slice(0, 10);
  throw new Error(
    `Timed out waiting for expected entity IDs in space "${space}". Missing ${missing.length}/${expectedEntityIds.length}. Sample missing IDs: ${sample.join(', ')}`,
  );
};

export const riskScoreV2Command = async (options: RiskScoreV2Options) => {
  const space = await ensureSpace(options.space ?? 'default');
  const config = getConfig();
  const perf = Boolean(options.perf);
  const seedSource = parseSeedSource(options.seedSource);
  const orgSize = parseOrgSize(options.orgSize);
  const productivitySuite = parseProductivitySuite(options.orgProductivitySuite);
  const entityKinds = parseEntityKinds(options.entityKinds);
  const usersCount = entityKinds.includes('idp_user')
    ? perf
      ? 1000
      : parseIntOption(options.users, 10)
    : 0;
  const hostsCount = entityKinds.includes('host')
    ? perf
      ? 1000
      : parseIntOption(options.hosts, 10)
    : 0;
  const localUsersCount = entityKinds.includes('local_user')
    ? perf
      ? 1000
      : parseIntOption(options.localUsers, 10)
    : 0;
  const servicesCount = entityKinds.includes('service')
    ? perf
      ? 1000
      : parseIntOption(options.services, 10)
    : 0;
  const alertsPerEntity = perf ? 50 : parseIntOption(options.alertsPerEntity, 5);
  const offsetHours = parseIntOption(options.offsetHours, 1);
  const eventIndex = options.eventIndex || config.eventIndex || 'logs-testlogs-default';

  log.info(
    `Starting risk-score-v2 in space "${space}" with seedSource=${seedSource}, kinds=${entityKinds.join(',')}, idp_users=${usersCount}, local_users=${localUsersCount}, hosts=${hostsCount}, services=${servicesCount}, alertsPerEntity=${alertsPerEntity}, eventIndex=${eventIndex}`,
  );

  if (options.setup !== false) {
    await ensureSecurityDefaultDataView(space);
    await enableEntityStoreV2(space);
    await installEntityStoreV2(space);
  }

  const baselineEntityCount = await getEntityStoreDocCount(space);
  const baselineRiskScoreCount = await getRiskScoreDocCount(space);
  log.info(
    `Baselines in space "${space}": entities=${baselineEntityCount}, risk_scores=${baselineRiskScoreCount}`,
  );

  const seeded =
    seedSource === 'org'
      ? seedFromOrgData({
          usersCount,
          hostsCount,
          localUsersCount,
          servicesCount,
          orgSize,
          productivitySuite,
        })
      : {
          users: seedUsers(usersCount),
          hosts: seedHosts(hostsCount),
          localUsers: [] as SeededLocalUser[],
          services: seedServices(servicesCount),
        };
  const users = seeded.users;
  const hosts = seeded.hosts;
  const localUsers =
    seedSource === 'org'
      ? seeded.localUsers
      : seedLocalUsers(localUsersCount, hosts.length > 0 ? hosts : seedHosts(1));
  const services = seeded.services;
  const allEntityIds = [
    ...users.map(toUserEuid),
    ...localUsers.map((user) => `user:${user.userName}@${user.hostId}@local`),
    ...hosts.map(toHostEuid),
  ];
  const uniqueEntityIds = [...new Set(allEntityIds)];
  const baselinePresentEntityIds = await getPresentEntityIds(space, uniqueEntityIds);
  const expectedNewEntityIds = uniqueEntityIds.filter((id) => !baselinePresentEntityIds.has(id));
  log.info(
    `Entity ID baseline overlap in "${space}": existing=${baselinePresentEntityIds.size}, expected_new=${expectedNewEntityIds.length}`,
  );

  const userEvents = buildUserEvents(users, offsetHours);
  const hostEvents = buildHostEvents(hosts, offsetHours);
  const localUserEvents = buildLocalUserEvents(localUsers, offsetHours);
  const serviceEvents = buildServiceEvents(services, offsetHours);
  const sourceIngestAction = await ensureEventTarget(eventIndex);
  log.info(
    `Ingesting ${userEvents.length + hostEvents.length + localUserEvents.length + serviceEvents.length} source events into "${eventIndex}" (bulk action=${sourceIngestAction})...`,
  );
  await bulkIngest({
    index: eventIndex,
    documents: [...userEvents, ...hostEvents, ...localUserEvents, ...serviceEvents],
    action: sourceIngestAction,
  });
  log.info('Source event ingest complete.');

  const fromDateISO = new Date(Date.now() - (offsetHours + 4) * 60 * 60 * 1000).toISOString();
  const toDateISO = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const extractionTypes = new Set<'user' | 'host' | 'service'>();
  if (entityKinds.includes('idp_user') || entityKinds.includes('local_user'))
    extractionTypes.add('user');
  if (entityKinds.includes('host')) extractionTypes.add('host');
  if (entityKinds.includes('service')) extractionTypes.add('service');
  log.info(
    `Forcing log extraction for [${[...extractionTypes].join(', ')}] from ${fromDateISO} to ${toDateISO}...`,
  );
  for (const extractionType of extractionTypes) {
    log.info(`Requesting force log extraction for "${extractionType}"...`);
    await forceLogExtraction(extractionType, { fromDateISO, toDateISO, space });
  }
  await waitForExpectedEntityIds({ space, expectedEntityIds: expectedNewEntityIds });

  if (options.watchlists !== false) {
    log.info('Creating watchlists...');
    const watchlists = await createWatchlistsForRun(space);
    log.info(`Created ${watchlists.length} watchlists.`);
    await applyWatchlists(
      allEntityIds,
      watchlists.map((w) => w.id),
      space,
    );
  }

  if (options.criticality !== false) {
    await applyCriticality(allEntityIds, space);
  }

  if (options.alerts !== false) {
    log.info('Generating and indexing alerts for seeded entities...');
    const ops = buildAlertOps({
      idpUsers: users,
      localUsers,
      hosts,
      services,
      alertsPerEntity,
      space,
    });
    const chunkSize = 5000 * 2;
    const totalChunks = Math.ceil(ops.length / chunkSize);
    log.info(
      `Alert bulk indexing: total_operations=${ops.length}, chunk_size=${chunkSize}, chunks=${totalChunks}`,
    );
    for (let i = 0; i < ops.length; i += chunkSize) {
      await bulkUpsert({ documents: ops.slice(i, i + chunkSize) });
      log.info(
        `Alert bulk indexing progress: chunk ${Math.floor(i / chunkSize) + 1}/${totalChunks}`,
      );
    }
    log.info('Alert indexing stage complete.');
  }

  await initEntityMaintainers(space);
  await waitForMaintainerRun(space, 'risk-score');
  log.info(
    'Maintainer run requested once. Collecting risk summary directly (without strict risk-score count gating).',
  );
  await reportRiskSummary({
    space,
    baselineRiskScoreCount,
    baselineEntityCount,
    expectedRiskDelta: Math.max(1, expectedNewEntityIds.length),
    entityIds: allEntityIds,
  });
};
