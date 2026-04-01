import { faker } from '@faker-js/faker';
import auditbeatMappings from '../../mappings/auditbeat.json' with { type: 'json' };
import { bulkIngest, bulkUpsert } from '../shared/elasticsearch.ts';
import { getEsClient } from '../utils/indices.ts';
import { ensureSpace, getAlertIndex } from '../../utils/index.ts';
import fs from 'fs/promises';
import path from 'path';
import { ensureSecurityDefaultDataView } from '../../utils/security_default_data_view.ts';
import {
  createWatchlist,
  enableEntityStoreV2,
  forceLogExtraction,
  forceBulkUpdateEntitiesViaCrud,
  getResolutionGroup,
  getEntityMaintainers,
  initEntityMaintainers,
  installEntityStoreV2,
  linkResolutionEntities,
  runEntityMaintainer,
  unlinkResolutionEntities,
} from '../../utils/kibana_api.ts';
import { log } from '../../utils/logger.ts';
import { sleep } from '../../utils/sleep.ts';
import createAlerts from '../../generators/create_alerts.ts';
import { type MappingTypeMapping } from '@elastic/elasticsearch/lib/api/types';
import { getConfig } from '../../get_config.ts';
import { generateOrgData } from '../org_data/org_data_generator.ts';
import type { OrganizationSize, ProductivitySuite } from '../org_data/types.ts';
import { parseOptionInt } from '../utils/cli_utils.ts';
import { checkbox, input, select } from '@inquirer/prompts';

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
  followOn?: boolean;
  phase2?: boolean;
  resolution?: boolean;
  propagation?: boolean;
  resolutionGroupRate?: string;
  avgAliasesPerTarget?: string;
  ownershipEdgeRate?: string;
  tablePageSize?: string;
  dangerousClean?: boolean;
  debugResolution?: boolean;
};

type SeededUser = { userName: string; userId: string; userEmail: string };
type SeededHost = { hostName: string; hostId: string };
type SeededLocalUser = { userName: string; hostId: string; hostName: string };
type SeededService = { serviceName: string };
type EntityKind = 'host' | 'idp_user' | 'local_user' | 'service';
type SeedSource = 'basic' | 'org';
type RiskSummaryRow = {
  id: string;
  score: string;
  level: string;
  scoreType: string;
  criticality: string;
  watchlistsCount: number;
  resolutionTarget: string;
  resolutionAliases: number;
  ownershipLinks: number;
  relatedEntities: number;
};
type RiskSnapshot = {
  rows: RiskSummaryRow[];
  resolutionRows: ResolutionScoreRow[];
  totalRiskDocs: number;
  totalEntityDocs: number;
  riskDocsMatched: number;
  watchlistModifierDocs: number;
};
type ResolutionScoreRow = {
  resolutionKey: string;
  targetEntityId: string;
  score: string;
  level: string;
  relatedEntities: number;
  calculationRunId: string;
  timestamp: string;
};
type ResolutionGroupAssignment = {
  targetId: string;
  aliasIds: string[];
};
type OwnershipEdge = {
  sourceId: string;
  targetId: string;
};
type RelationshipGraphState = {
  resolutionGroups: ResolutionGroupAssignment[];
  ownershipEdges: OwnershipEdge[];
};

const buildResolutionKey = ({
  targetEntityId,
  calculationRunId,
}: {
  targetEntityId: string;
  calculationRunId: string;
}): string => `${targetEntityId}#${calculationRunId || 'no-run-id'}`;

const getRelationshipGraphStats = (graph: RelationshipGraphState) => {
  const resolutionTargetCount = graph.resolutionGroups.length;
  const resolutionAliasCount = graph.resolutionGroups.reduce(
    (count, group) => count + group.aliasIds.length,
    0,
  );
  return {
    resolutionTargetCount,
    resolutionAliasCount,
    resolutionEdgeCount: resolutionAliasCount,
    ownershipEdgeCount: graph.ownershipEdges.length,
  };
};

const summarizeList = (items: string[], max: number = 6): string => {
  if (items.length === 0) return '-';
  if (items.length <= max) return items.join(', ');
  return `${items.slice(0, max).join(', ')}, ... (+${items.length - max} more)`;
};

const printGraphSummaryViews = ({
  graph,
  maxRows = 20,
}: {
  graph: RelationshipGraphState;
  maxRows?: number;
}) => {
  const token = (text: string, color: 'green' | 'yellow' | 'cyan') => {
    if (!process.stdout.isTTY) return text;
    const code = color === 'green' ? '\x1b[32m' : color === 'yellow' ? '\x1b[33m' : '\x1b[36m';
    return `${code}${text}\x1b[0m`;
  };
  const resolutionLabel = token('resolution', 'yellow');
  const ownsLabel = token('owns', 'green');
  const leftArrow = token('<-', 'yellow');
  const rightArrow = token('->', 'green');
  const contributesArrow = token('<=', 'cyan');
  const plusToken = token('+', 'cyan');

  // eslint-disable-next-line no-console
  console.log(colorize('🕸️ Relationships only', 'cyan'));
  if (graph.resolutionGroups.length === 0) {
    // eslint-disable-next-line no-console
    console.log('  resolution links: none');
  } else {
    // eslint-disable-next-line no-console
    console.log(`  resolution groups: ${graph.resolutionGroups.length}`);
    for (const [index, group] of graph.resolutionGroups.slice(0, maxRows).entries()) {
      // eslint-disable-next-line no-console
      console.log(
        `    [${index + 1}] ${group.targetId} ${leftArrow} ${summarizeList(group.aliasIds, 4)}`,
      );
    }
    if (graph.resolutionGroups.length > maxRows) {
      // eslint-disable-next-line no-console
      console.log(
        `    ... ${graph.resolutionGroups.length - maxRows} additional resolution groups hidden`,
      );
    }
  }

  if (graph.ownershipEdges.length === 0) {
    // eslint-disable-next-line no-console
    console.log('  ownership edges: none');
  } else {
    // eslint-disable-next-line no-console
    console.log(`  ownership edges: ${graph.ownershipEdges.length}`);
    for (const [index, edge] of graph.ownershipEdges.slice(0, maxRows).entries()) {
      // eslint-disable-next-line no-console
      console.log(`    [${index + 1}] ${edge.sourceId} ${rightArrow} ${edge.targetId}`);
    }
    if (graph.ownershipEdges.length > maxRows) {
      // eslint-disable-next-line no-console
      console.log(
        `    ... ${graph.ownershipEdges.length - maxRows} additional ownership edges hidden`,
      );
    }
  }

  // eslint-disable-next-line no-console
  console.log(colorize('🧮 Scoring view (resolution + ownership)', 'cyan'));
  if (graph.resolutionGroups.length === 0 && graph.ownershipEdges.length === 0) {
    // eslint-disable-next-line no-console
    console.log('  no relationship data available');
    return;
  }

  const resolutionByTarget = new Map<string, string[]>();
  for (const group of graph.resolutionGroups) {
    resolutionByTarget.set(group.targetId, group.aliasIds);
  }
  const groupTargets = [...resolutionByTarget.keys()];

  if (groupTargets.length === 0) {
    // eslint-disable-next-line no-console
    console.log('  no resolution groups; scoring uses direct ownership edges only');
    const uniqueOwnershipTargets = [...new Set(graph.ownershipEdges.map((edge) => edge.targetId))];
    for (const targetId of uniqueOwnershipTargets.slice(0, maxRows)) {
      const contributors = graph.ownershipEdges
        .filter((edge) => edge.targetId === targetId)
        .map((edge) => edge.sourceId);
      // eslint-disable-next-line no-console
      console.log(
        `    ${targetId} ${contributesArrow} ${ownsLabel}(${summarizeList(
          [...new Set(contributors)],
          4,
        )})`,
      );
    }
    return;
  }

  for (const [index, targetId] of groupTargets.slice(0, maxRows).entries()) {
    const aliases = resolutionByTarget.get(targetId) ?? [];
    const members = new Set([targetId, ...aliases]);
    const ownershipContributors = [
      ...new Set(
        graph.ownershipEdges
          .filter((edge) => members.has(edge.targetId))
          .map((edge) => edge.sourceId),
      ),
    ];
    // eslint-disable-next-line no-console
    console.log(
      `    [${index + 1}] ${targetId} ${contributesArrow} ${resolutionLabel}(${aliases.length} aliases: ${summarizeList(aliases, 3)}) ${plusToken} ${ownsLabel}(${ownershipContributors.length}: ${summarizeList(ownershipContributors, 3)})`,
    );
  }
  if (groupTargets.length > maxRows) {
    // eslint-disable-next-line no-console
    console.log(`    ... ${groupTargets.length - maxRows} additional scoring groups hidden`);
  }
};
type RiskDocSummary = {
  entityId: string;
  timestamp: string;
  score: number | null;
  level: string;
  scoreType: string;
  calculationRunId: string;
  source: Record<string, unknown>;
};

const SUPPORTED_ENTITY_KINDS: EntityKind[] = ['host', 'idp_user', 'local_user', 'service'];
const SUPPORTED_SEED_SOURCES: SeedSource[] = ['basic', 'org'];
const SUPPORTED_ORG_SIZES: OrganizationSize[] = ['john_doe', 'small', 'medium', 'enterprise'];
const SUPPORTED_PRODUCTIVITY_SUITES: ProductivitySuite[] = ['microsoft', 'google'];

const parseEntityKinds = (value?: string): EntityKind[] => {
  const rawKinds = (value ?? 'host,idp_user,local_user,service')
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
const toServiceEuid = (service: SeededService) => `service:${service.serviceName}`;

const compactSeedToken = (value: string, fallback: string): string => {
  const normalized = value.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return (normalized || fallback).slice(0, 4);
};

const seedUsers = (count: number, startAt: number = 0): SeededUser[] =>
  Array.from({ length: count }, (_, i) => {
    const index = startAt + i;
    const suffix = faker.string.alphanumeric(4).toLowerCase();
    const userName = `rv2u-${index}-${suffix}`;
    return {
      userName,
      userId: `risk-v2-user-id-${index}-${faker.string.alphanumeric(6)}`,
      userEmail: `${userName}@example.com`,
    };
  });

const seedHosts = (count: number, startAt: number = 0): SeededHost[] =>
  Array.from({ length: count }, (_, i) => ({
    hostName: `risk-v2-host-${startAt + i}-${faker.internet.domainWord()}`,
    hostId: `risk-v2-host-id-${startAt + i}-${faker.string.alphanumeric(8).toLowerCase()}`,
  }));

const seedLocalUsers = (
  count: number,
  hosts: SeededHost[],
  startAt: number = 0,
): SeededLocalUser[] =>
  Array.from({ length: count }, (_, i) => {
    const host = hosts[i % hosts.length] ?? seedHosts(1)[0];
    return {
      userName: `rv2lu-${startAt + i}-${faker.string.alphanumeric(4).toLowerCase()}`,
      hostId: host.hostId,
      hostName: host.hostName,
    };
  });

const seedServices = (count: number, startAt: number = 0): SeededService[] =>
  Array.from({ length: count }, (_, i) => ({
    serviceName: `risk-v2-service-${startAt + i}-${faker.internet.domainWord()}`,
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
    const token = compactSeedToken(employee.userName || employee.email, 'user');
    return {
      userName: `rv2lu-${i}-${token}`,
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

const getAllEntityIds = ({
  users,
  localUsers,
  hosts,
  services,
}: {
  users: SeededUser[];
  localUsers: SeededLocalUser[];
  hosts: SeededHost[];
  services: SeededService[];
}): string[] => [
  ...users.map(toUserEuid),
  ...localUsers.map((user) => `user:${user.userName}@${user.hostId}@local`),
  ...hosts.map(toHostEuid),
  ...services.map(toServiceEuid),
];

const groupByEntityType = (entityIds: string[]): Record<ModifierEntityType, string[]> => {
  const grouped: Record<ModifierEntityType, string[]> = { user: [], host: [], service: [] };
  for (const entityId of entityIds) {
    const type = toModifierEntityType(entityId);
    if (type) {
      grouped[type].push(entityId);
    }
  }
  return grouped;
};

const chunk = <T>(items: T[], size: number): T[][] => {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const buildRelationshipGraph = ({
  entityIds,
  enableResolution,
  enablePropagation,
  resolutionGroupRate,
  avgAliasesPerTarget,
  ownershipEdgeRate,
}: {
  entityIds: string[];
  enableResolution: boolean;
  enablePropagation: boolean;
  resolutionGroupRate: number;
  avgAliasesPerTarget: number;
  ownershipEdgeRate: number;
}): RelationshipGraphState => {
  const grouped = groupByEntityType(entityIds);
  const resolutionGroups: ResolutionGroupAssignment[] = [];
  if (enableResolution) {
    for (const ids of Object.values(grouped)) {
      if (ids.length < 2) continue;
      const shuffled = faker.helpers.shuffle(ids);
      const targetCount = Math.max(1, Math.floor(shuffled.length * resolutionGroupRate));
      const targets = shuffled.slice(0, Math.min(targetCount, shuffled.length));
      const aliasesPool = shuffled.slice(targets.length);
      let aliasCursor = 0;
      for (const targetId of targets) {
        if (aliasCursor >= aliasesPool.length) break;
        const aliasesPerTarget = Math.max(1, Math.floor(avgAliasesPerTarget));
        const aliasIds = aliasesPool.slice(aliasCursor, aliasCursor + aliasesPerTarget);
        aliasCursor += aliasIds.length;
        if (aliasIds.length > 0) {
          resolutionGroups.push({ targetId, aliasIds });
        }
      }
    }
  }

  const ownershipEdges: OwnershipEdge[] = [];
  if (enablePropagation) {
    const candidateSources = [...grouped.host, ...grouped.service];
    if (candidateSources.length > 0 && grouped.user.length > 0) {
      const targetUsers = faker.helpers.shuffle(grouped.user);
      for (const sourceId of candidateSources) {
        if (faker.number.float({ min: 0, max: 1, fractionDigits: 4 }) > ownershipEdgeRate) continue;
        const targetId = targetUsers[faker.number.int({ min: 0, max: targetUsers.length - 1 })];
        ownershipEdges.push({ sourceId, targetId });
      }
    }
  }

  return { resolutionGroups, ownershipEdges };
};

const applyRelationshipGraph = async ({
  graph,
  space,
}: {
  graph: RelationshipGraphState;
  space: string;
}) => {
  const maxResolutionBatchSize = 1000;
  for (const group of graph.resolutionGroups) {
    for (const aliases of chunk(group.aliasIds, maxResolutionBatchSize)) {
      if (aliases.length === 0) continue;
      const response = await linkResolutionEntities({
        targetId: group.targetId,
        entityIds: aliases,
        space,
      });
      if (response.linked.length < aliases.length || response.skipped.length > 0) {
        log.warn(
          `Resolution link validation: requested=${aliases.length}, linked=${response.linked.length}, skipped=${response.skipped.length} for target=${group.targetId}`,
        );
      }
      log.info(
        `Resolution link: target=${group.targetId}, linked=${response.linked.length}, skipped=${response.skipped.length}`,
      );
    }
  }

  if (graph.ownershipEdges.length === 0) {
    return;
  }

  const bySource = new Map<string, string[]>();
  for (const edge of graph.ownershipEdges) {
    bySource.set(edge.sourceId, [...(bySource.get(edge.sourceId) ?? []), edge.targetId]);
  }

  const entities: Array<{ type: ModifierEntityType; doc: Record<string, unknown> }> = [];
  for (const [sourceId, targets] of bySource.entries()) {
    const type = toModifierEntityType(sourceId);
    if (!type) continue;
    entities.push({
      type,
      doc: {
        entity: {
          id: sourceId,
          relationships: {
            owns: [...new Set(targets)],
          },
        },
      },
    });
  }

  for (const entityBatch of chunk(entities, 200)) {
    await forceBulkUpdateEntitiesViaCrud({ entities: entityBatch, space });
  }
};

const clearRelationshipGraph = async ({
  entityIds,
  space,
}: {
  entityIds: string[];
  space: string;
}) => {
  for (const ids of chunk(entityIds, 1000)) {
    if (ids.length === 0) continue;
    const response = await unlinkResolutionEntities({ entityIds: ids, space });
    if (response.unlinked.length < ids.length || response.skipped.length > 0) {
      log.warn(
        `Resolution unlink validation: requested=${ids.length}, unlinked=${response.unlinked.length}, skipped=${response.skipped.length}`,
      );
    }
    log.info(
      `Resolution unlink: unlinked=${response.unlinked.length}, skipped=${response.skipped.length}`,
    );
  }

  const entities: Array<{ type: ModifierEntityType; doc: Record<string, unknown> }> = [];
  for (const id of entityIds) {
    const type = toModifierEntityType(id);
    if (!type) continue;
    entities.push({
      type,
      doc: {
        entity: {
          id,
          relationships: {
            owns: [],
          },
        },
      },
    });
  }

  for (const entityBatch of chunk(entities, 200)) {
    await forceBulkUpdateEntitiesViaCrud({ entities: entityBatch, space });
  }
};

type RelationshipStateSnapshot = {
  fetched: number;
  expectedTargetCount: number;
  expectedAliasCount: number;
  aliasesWithResolvedTo: number;
  expectedAliasMatches: number;
  ownershipSources: number;
  ownershipLinks: number;
  expectedOwnershipEdges: number;
  mismatches: string[];
  unexpectedAliases: string[];
};

const collectEntityRelationshipState = async ({
  space,
  entityIds,
  graph,
}: {
  space: string;
  entityIds: string[];
  graph: RelationshipGraphState;
}): Promise<RelationshipStateSnapshot> => {
  const uniqueEntityIds = [...new Set(entityIds)];
  if (uniqueEntityIds.length === 0) {
    return {
      fetched: 0,
      expectedTargetCount: graph.resolutionGroups.length,
      expectedAliasCount: 0,
      aliasesWithResolvedTo: 0,
      expectedAliasMatches: 0,
      ownershipSources: 0,
      ownershipLinks: 0,
      expectedOwnershipEdges: graph.ownershipEdges.length,
      mismatches: [],
      unexpectedAliases: [],
    };
  }

  const client = getEsClient();
  const entityIndex = `.entities.v2.latest.security_${space}`;
  const entityResponse = await client.search({
    index: entityIndex,
    size: uniqueEntityIds.length,
    query: {
      terms: {
        'entity.id': uniqueEntityIds,
      },
    },
    _source: [
      'entity.id',
      'entity.relationships.resolution.resolved_to',
      'entity.relationships.owns',
    ],
  });

  const expectedAliasToTarget = new Map<string, string>();
  for (const group of graph.resolutionGroups) {
    for (const aliasId of group.aliasIds) {
      expectedAliasToTarget.set(aliasId, group.targetId);
    }
  }

  let aliasesWithResolvedTo = 0;
  let ownershipSources = 0;
  let ownershipLinks = 0;
  let expectedAliasMatches = 0;
  const mismatches: string[] = [];
  const unexpectedAliases: string[] = [];

  for (const hit of entityResponse.hits.hits) {
    const source = hit._source as
      | {
          entity?: {
            id?: string;
            relationships?: { resolution?: { resolved_to?: unknown }; owns?: unknown };
          };
        }
      | undefined;
    const id = source?.entity?.id;
    if (!id) continue;

    const resolvedTo =
      normalizeWatchlists(
        getFromNestedOrDotted(
          source as Record<string, unknown> | undefined,
          'entity.relationships.resolution.resolved_to',
        ),
      )[0] ?? '-';
    const owns = normalizeWatchlists(
      getFromNestedOrDotted(
        source as Record<string, unknown> | undefined,
        'entity.relationships.owns',
      ),
    );

    if (resolvedTo !== '-') {
      aliasesWithResolvedTo += 1;
    }
    if (owns.length > 0) {
      ownershipSources += 1;
      ownershipLinks += owns.length;
    }

    const expectedTarget = expectedAliasToTarget.get(id);
    if (expectedTarget) {
      if (resolvedTo === expectedTarget) {
        expectedAliasMatches += 1;
      } else {
        mismatches.push(`${id} -> ${resolvedTo} (expected ${expectedTarget})`);
      }
    } else if (resolvedTo !== '-') {
      unexpectedAliases.push(`${id} -> ${resolvedTo}`);
    }
  }

  return {
    fetched: entityResponse.hits.hits.length,
    expectedTargetCount: graph.resolutionGroups.length,
    expectedAliasCount: expectedAliasToTarget.size,
    aliasesWithResolvedTo,
    expectedAliasMatches,
    ownershipSources,
    ownershipLinks,
    expectedOwnershipEdges: graph.ownershipEdges.length,
    mismatches,
    unexpectedAliases,
  };
};

const logEntityRelationshipState = async ({
  space,
  entityIds,
  graph,
  context,
}: {
  space: string;
  entityIds: string[];
  graph: RelationshipGraphState;
  context: string;
}): Promise<RelationshipStateSnapshot> => {
  const uniqueEntityIds = [...new Set(entityIds)];
  const snapshot = await collectEntityRelationshipState({
    space,
    entityIds: uniqueEntityIds,
    graph,
  });
  log.info(
    `[rel-state:${context}] fetched=${snapshot.fetched}/${uniqueEntityIds.length}, expected_targets=${snapshot.expectedTargetCount}, expected_aliases=${snapshot.expectedAliasCount}, aliases_with_resolved_to=${snapshot.aliasesWithResolvedTo}, expected_alias_matches=${snapshot.expectedAliasMatches}, ownership_sources=${snapshot.ownershipSources}, ownership_links=${snapshot.ownershipLinks}, expected_ownership_edges=${snapshot.expectedOwnershipEdges}`,
  );
  if (snapshot.mismatches.length > 0) {
    log.warn(
      `[rel-state:${context}] resolution mismatches (${snapshot.mismatches.length}): ${summarizeList(snapshot.mismatches, 6)}`,
    );
  }
  if (snapshot.unexpectedAliases.length > 0) {
    log.warn(
      `[rel-state:${context}] unexpected alias mappings (${snapshot.unexpectedAliases.length}): ${summarizeList(snapshot.unexpectedAliases, 6)}`,
    );
  }
  return snapshot;
};

const waitForEntityRelationshipState = async ({
  space,
  entityIds,
  graph,
  context,
  timeoutMs = 15_000,
}: {
  space: string;
  entityIds: string[];
  graph: RelationshipGraphState;
  context: string;
  timeoutMs?: number;
}): Promise<void> => {
  const expectedAliasCount = graph.resolutionGroups.reduce(
    (count, group) => count + group.aliasIds.length,
    0,
  );
  if (expectedAliasCount === 0) {
    await logEntityRelationshipState({ space, entityIds, graph, context });
    return;
  }

  const deadline = Date.now() + timeoutMs;
  let lastMatches = -1;
  let lastResolved = -1;
  while (Date.now() < deadline) {
    const snapshot = await collectEntityRelationshipState({ space, entityIds, graph });
    if (
      snapshot.expectedAliasMatches !== lastMatches ||
      snapshot.aliasesWithResolvedTo !== lastResolved
    ) {
      log.info(
        `[rel-sync:${context}] alias_matches=${snapshot.expectedAliasMatches}/${expectedAliasCount}, aliases_with_resolved_to=${snapshot.aliasesWithResolvedTo}`,
      );
      lastMatches = snapshot.expectedAliasMatches;
      lastResolved = snapshot.aliasesWithResolvedTo;
    }
    if (snapshot.expectedAliasMatches >= expectedAliasCount && snapshot.mismatches.length === 0) {
      break;
    }
    await sleep(1000);
  }

  await logEntityRelationshipState({ space, entityIds, graph, context });
};

const forceExtractExpectedEntities = async ({
  space,
  entityKinds,
  expectedEntityIds,
  offsetHours,
}: {
  space: string;
  entityKinds: EntityKind[];
  expectedEntityIds: string[];
  offsetHours: number;
}) => {
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
  await Promise.all(
    [...extractionTypes].map(async (extractionType) => {
      log.info(`Requesting force log extraction for "${extractionType}"...`);
      await forceLogExtraction(extractionType, { fromDateISO, toDateISO, space });
    }),
  );
  await waitForExpectedEntityIds({ space, expectedEntityIds });
};

const appendAlertOp = (ops: unknown[], alertIndex: string, alert: unknown) => {
  const id = (alert as Record<string, unknown>)['kibana.alert.uuid'] as string;
  ops.push({ create: { _index: alertIndex, _id: id } });
  ops.push(alert);
};

const ALERT_TARGET_ENTITY_ID_FIELD = 'labels.risk_v2_target_entity_id';

function* buildAlertOpChunks({
  hosts,
  idpUsers,
  localUsers,
  services,
  alertsPerEntity,
  space,
  maxOperationsPerChunk,
}: {
  hosts: SeededHost[];
  idpUsers: SeededUser[];
  localUsers: SeededLocalUser[];
  services: SeededService[];
  alertsPerEntity: number;
  space: string;
  maxOperationsPerChunk: number;
}): Generator<unknown[]> {
  const alertIndex = getAlertIndex(space);
  let ops: unknown[] = [];

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
          [ALERT_TARGET_ENTITY_ID_FIELD]: toUserEuid(user),
        },
        {
          userName: user.userName,
          userId: user.userId,
          hostName: `user-alert-host-${i}-${user.userId}`,
          eventModule: 'okta',
          space,
        },
      );
      appendAlertOp(ops, alertIndex, alert);
      if (ops.length >= maxOperationsPerChunk) {
        yield ops;
        ops = [];
      }
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
          [ALERT_TARGET_ENTITY_ID_FIELD]: `user:${user.userName}@${user.hostId}@local`,
        },
        {
          userName: user.userName,
          hostName: user.hostName,
          hostId: user.hostId,
          eventModule: 'local',
          space,
        },
      );
      appendAlertOp(ops, alertIndex, alert);
      if (ops.length >= maxOperationsPerChunk) {
        yield ops;
        ops = [];
      }
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
          [ALERT_TARGET_ENTITY_ID_FIELD]: toHostEuid(host),
        },
        {
          hostName: host.hostName,
          hostId: host.hostId,
          userName: `host-alert-user-${i}-${host.hostId}`,
          eventModule: 'okta',
          space,
        },
      );
      appendAlertOp(ops, alertIndex, alert);
      if (ops.length >= maxOperationsPerChunk) {
        yield ops;
        ops = [];
      }
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
          [ALERT_TARGET_ENTITY_ID_FIELD]: toServiceEuid(service),
        },
        {
          userName: `service-alert-user-${i}`,
          hostName: `service-alert-host-${i}`,
          space,
        },
      );
      appendAlertOp(ops, alertIndex, alert);
      if (ops.length >= maxOperationsPerChunk) {
        yield ops;
        ops = [];
      }
    }
  }

  if (ops.length > 0) {
    yield ops;
  }
}

const waitForMaintainerRun = async (
  space: string,
  maintainerId: string = 'risk-score',
): Promise<{ runs: number; taskStatus: string; settled: boolean }> => {
  const settleWaitMs = 8_000;
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
      const settleDeadline = Date.now() + settleWaitMs;
      while (Date.now() < settleDeadline) {
        const settleResponse = await getEntityMaintainers(space, [maintainerId]);
        const settleMaintainer = settleResponse.maintainers.find((m) => m.id === maintainerId);
        if (!settleMaintainer || settleMaintainer.taskStatus !== 'started') {
          log.info(
            `Maintainer "${maintainerId}" appears settled (taskStatus=${settleMaintainer?.taskStatus ?? 'unknown'}).`,
          );
          return {
            runs: settleMaintainer?.runs ?? maintainer.runs,
            taskStatus: settleMaintainer?.taskStatus ?? maintainer.taskStatus,
            settled: true,
          };
        }
        await sleep(2000);
      }
      log.warn(
        `Maintainer "${maintainerId}" still reports taskStatus=started after ${formatDurationMs(settleWaitMs)} settle wait.`,
      );
      return { runs: maintainer.runs, taskStatus: maintainer.taskStatus, settled: false };
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

const waitForResolutionDocs = async ({
  space,
  entityIds,
  minDocs = 1,
  timeoutMs = 45000,
}: {
  space: string;
  entityIds: string[];
  minDocs?: number;
  timeoutMs?: number;
}) => {
  const deadline = Date.now() + timeoutMs;
  let lastCount = -1;
  while (Date.now() < deadline) {
    const snapshot = await collectRiskSnapshot({ space, entityIds });
    const count = snapshot.resolutionRows.length;
    if (count !== lastCount) {
      log.info(`Resolution doc wait: found=${count}, target>=${minDocs}`);
      lastCount = count;
    }
    if (count >= minDocs) {
      return;
    }
    await sleep(2000);
  }
  log.warn(
    `Timed out waiting for resolution docs (target>=${minDocs}) after ${formatDurationMs(timeoutMs)}; continuing with current snapshot.`,
  );
};

const createWatchlistsForRun = async (space: string) => {
  const suffix = Date.now();
  return Promise.all([
    createWatchlist({ name: `high-risk-vendors-${suffix}`, riskModifier: 1.8, space }),
    createWatchlist({ name: `departing-employees-${suffix}`, riskModifier: 1.5, space }),
    createWatchlist({ name: `insider-threat-${suffix}`, riskModifier: 2.0, space }),
  ]);
};

const CRITICALITY_LEVELS = [
  'low_impact',
  'medium_impact',
  'high_impact',
  'extreme_impact',
] as const;
type CriticalityLevel = (typeof CRITICALITY_LEVELS)[number];
type EntityModifierAssignment = { criticality?: CriticalityLevel; watchlists?: string[] };
type ModifierEntityType = 'user' | 'host' | 'service';
const toModifierEntityType = (entityId: string): ModifierEntityType | null => {
  if (entityId.startsWith('user:')) return 'user';
  if (entityId.startsWith('host:')) return 'host';
  if (entityId.startsWith('service:')) return 'service';
  return null;
};

const buildEntityModifierAssignments = ({
  entityIds,
  watchlistIds,
  applyCriticality: applyCriticalityFlag,
}: {
  entityIds: string[];
  watchlistIds: string[];
  applyCriticality: boolean;
}): Map<string, EntityModifierAssignment> => {
  const assignments = new Map<string, EntityModifierAssignment>();
  if (applyCriticalityFlag) {
    for (const entityId of entityIds) {
      assignments.set(entityId, {
        criticality: faker.helpers.arrayElement(CRITICALITY_LEVELS),
      });
    }
  }

  if (watchlistIds.length > 0) {
    const targetCount = Math.max(1, Math.floor(entityIds.length * 0.4));
    const selected = faker.helpers.arrayElements(entityIds, targetCount);
    for (const entityId of selected) {
      const memberships = faker.helpers.arrayElements(
        watchlistIds,
        faker.number.int({ min: 1, max: 2 }),
      );
      assignments.set(entityId, {
        ...(assignments.get(entityId) ?? {}),
        watchlists: memberships,
      });
    }
  }

  return assignments;
};

const applyEntityModifiers = async ({
  assignments,
  totalEntities,
  space,
  batchSize,
}: {
  assignments: Map<string, EntityModifierAssignment>;
  totalEntities: number;
  space: string;
  batchSize: number;
}) => {
  if (assignments.size === 0) {
    return;
  }

  const entries = [...assignments.entries()];
  const withCriticality = entries.filter(([, assignment]) => assignment.criticality).length;
  const withWatchlists = entries.filter(([, assignment]) => assignment.watchlists?.length).length;
  log.info(
    `Applying entity modifiers to ${entries.length}/${totalEntities} entities (criticality=${withCriticality}, watchlists=${withWatchlists}, bulk_batch_size=${batchSize})...`,
  );

  let processed = 0;
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    const entities: Array<{ type: ModifierEntityType; doc: Record<string, unknown> }> = [];
    for (const [entityId, assignment] of batch) {
      const entityType = toModifierEntityType(entityId);
      if (!entityType) {
        continue;
      }
      entities.push({
        type: entityType,
        doc: {
          entity: {
            id: entityId,
            ...(assignment.watchlists ? { attributes: { watchlists: assignment.watchlists } } : {}),
          },
          ...(assignment.criticality ? { asset: { criticality: assignment.criticality } } : {}),
        },
      });
    }

    if (entities.length > 0) {
      const response = await forceBulkUpdateEntitiesViaCrud({ entities, space });
      if (response.errors && response.errors.length > 0) {
        log.warn(
          `Bulk modifier update reported ${response.errors.length} error(s) for batch ${
            Math.floor(i / batchSize) + 1
          }: ${JSON.stringify(response.errors).slice(0, 1000)}`,
        );
      }
    }
    processed += batch.length;
    if (processed % 10 === 0 || processed === entries.length) {
      log.info(`Modifier update progress: ${processed}/${entries.length}`);
    }
  }
  log.info('Entity modifier assignment complete.');
};

const formatCell = (value: string, width: number): string => {
  if (value.length === width) return value;
  if (value.length < width) return value.padEnd(width, ' ');
  if (width <= 3) return value.slice(0, width);
  return `${value.slice(0, width - 3)}...`;
};

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
} as const;

const colorize = (message: string, color: keyof typeof ANSI): string => {
  if (!process.stdout.isTTY) {
    return message;
  }
  return `${ANSI.bold}${ANSI[color]}${message}${ANSI.reset}`;
};

const colorizeRiskLevel = (paddedCell: string, level: string): string => {
  const normalized = level.trim().toLowerCase();
  if (normalized === 'high' || normalized === 'critical') {
    return colorize(paddedCell, 'red');
  }
  if (normalized === 'moderate' || normalized === 'medium') {
    return colorize(paddedCell, 'yellow');
  }
  if (normalized === 'low') {
    return colorize(paddedCell, 'green');
  }
  return paddedCell;
};

const colorizeDelta = (paddedCell: string, delta: string): string => {
  const value = Number.parseFloat(delta);
  if (!Number.isFinite(value)) {
    return paddedCell;
  }
  if (value < 0) {
    return colorize(paddedCell, 'red');
  }
  if (value > 0) {
    return colorize(paddedCell, 'green');
  }
  return paddedCell;
};

const formatDurationMs = (ms: number): string => {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
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

const canUseInteractivePrompts = (): boolean =>
  Boolean(process.stdout.isTTY && process.stdin.isTTY);

const isPromptIoError = (error: unknown): boolean => {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : String(error);
  return message.includes('setRawMode') || message.includes('EIO');
};

const getFromNestedOrDotted = (
  source: Record<string, unknown> | undefined,
  path: string,
): unknown => {
  if (!source) return undefined;
  if (path in source) return source[path];
  const parts = path.split('.');
  let current: unknown = source;
  for (const part of parts) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
};

const toNumericScore = (value: string): number | null => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const collectRiskSnapshot = async ({
  space,
  entityIds,
}: {
  space: string;
  entityIds: string[];
}): Promise<RiskSnapshot> => {
  const client = getEsClient();
  const riskIndex = `risk-score.risk-score-${space}`;
  const uniqueEntityIds = [...new Set(entityIds)];
  const totalRiskDocs = await getRiskScoreDocCount(space);
  const totalEntityDocs = await getEntityStoreDocCount(space);

  if (uniqueEntityIds.length === 0) {
    return {
      rows: [],
      resolutionRows: [],
      totalRiskDocs,
      totalEntityDocs,
      riskDocsMatched: 0,
      watchlistModifierDocs: 0,
    };
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
    _source: [
      'entity.id',
      'entity.type',
      'entity.attributes.watchlists',
      'entity.relationships.resolution.resolved_to',
      'entity.relationships.owns',
      'asset.criticality',
    ],
  });

  const entityById = new Map<
    string,
    {
      entityType: string;
      criticality: string;
      watchlists: string[];
      resolutionTarget: string;
      ownershipLinks: number;
    }
  >();
  const aliasCountByTarget = new Map<string, number>();
  for (const hit of entityResponse.hits.hits) {
    const source = hit._source as
      | {
          entity?: {
            id?: string;
            type?: string;
            attributes?: { watchlists?: string[] };
            relationships?: { resolution?: { resolved_to?: unknown }; owns?: unknown };
          };
          asset?: { criticality?: string };
        }
      | undefined;
    const id = source?.entity?.id;
    if (!id) continue;
    const resolvedTo =
      normalizeWatchlists(
        getFromNestedOrDotted(
          source as Record<string, unknown> | undefined,
          'entity.relationships.resolution.resolved_to',
        ),
      )[0] ?? '-';
    const owns = normalizeWatchlists(
      getFromNestedOrDotted(
        source as Record<string, unknown> | undefined,
        'entity.relationships.owns',
      ),
    );
    if (resolvedTo !== '-') {
      aliasCountByTarget.set(resolvedTo, (aliasCountByTarget.get(resolvedTo) ?? 0) + 1);
    }
    entityById.set(id, {
      entityType: source.entity?.type ?? 'unknown',
      criticality: source.asset?.criticality ?? '-',
      watchlists: normalizeWatchlists(
        getFromNestedOrDotted(
          source as Record<string, unknown> | undefined,
          'entity.attributes.watchlists',
        ),
      ),
      resolutionTarget: resolvedTo,
      ownershipLinks: owns.length,
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
          { terms: { 'service.name': uniqueEntityIds } },
          { terms: { 'host.risk.id_value': uniqueEntityIds } },
          { terms: { 'user.risk.id_value': uniqueEntityIds } },
          { terms: { 'service.risk.id_value': uniqueEntityIds } },
        ],
        minimum_should_match: 1,
      },
    },
    _source: [
      '@timestamp',
      'host.name',
      'host.risk.calculated_score_norm',
      'host.risk.calculated_level',
      'host.risk.calculation_run_id',
      'host.risk.id_value',
      'host.risk.modifiers',
      'user.name',
      'user.risk.calculated_score_norm',
      'user.risk.calculated_level',
      'user.risk.calculation_run_id',
      'user.risk.id_value',
      'user.risk.modifiers',
      'service.name',
      'service.risk.calculated_score_norm',
      'service.risk.calculated_level',
      'service.risk.calculation_run_id',
      'service.risk.id_value',
      'service.risk.score_type',
      'service.risk.related_entities',
      'service.risk.modifiers',
      'host.risk.score_type',
      'host.risk.related_entities',
      'user.risk.score_type',
      'user.risk.related_entities',
    ],
  });

  const resolutionResponse = await client.search({
    index: riskIndex,
    size: Math.max(100, uniqueEntityIds.length * 8),
    sort: [{ '@timestamp': { order: 'desc' } }],
    query: {
      bool: {
        should: [
          {
            term: {
              'host.risk.score_type': 'resolution',
            },
          },
          {
            term: {
              'user.risk.score_type': 'resolution',
            },
          },
          {
            term: {
              'service.risk.score_type': 'resolution',
            },
          },
        ],
        minimum_should_match: 1,
        filter: [
          {
            bool: {
              should: [
                { terms: { 'host.name': uniqueEntityIds } },
                { terms: { 'user.name': uniqueEntityIds } },
                { terms: { 'service.name': uniqueEntityIds } },
                { terms: { 'host.risk.id_value': uniqueEntityIds } },
                { terms: { 'user.risk.id_value': uniqueEntityIds } },
                { terms: { 'service.risk.id_value': uniqueEntityIds } },
              ],
              minimum_should_match: 1,
            },
          },
        ],
      },
    },
    _source: [
      '@timestamp',
      'host.name',
      'host.risk.id_value',
      'host.risk.calculated_score_norm',
      'host.risk.calculated_level',
      'host.risk.score_type',
      'host.risk.related_entities',
      'host.risk.calculation_run_id',
      'user.name',
      'user.risk.id_value',
      'user.risk.calculated_score_norm',
      'user.risk.calculated_level',
      'user.risk.score_type',
      'user.risk.related_entities',
      'user.risk.calculation_run_id',
      'service.name',
      'service.risk.id_value',
      'service.risk.calculated_score_norm',
      'service.risk.calculated_level',
      'service.risk.score_type',
      'service.risk.related_entities',
      'service.risk.calculation_run_id',
    ],
  });

  const riskDocs = riskResponse.hits.hits.map((hit) => hit._source as Record<string, unknown>);
  const watchlistModifierDocs = riskDocs.filter((doc) => {
    const risk = ((doc.user as Record<string, unknown>)?.risk ??
      (doc.host as Record<string, unknown>)?.risk ??
      {}) as Record<string, unknown>;
    const modifiers = (risk.modifiers as Array<Record<string, unknown>> | undefined) ?? [];
    return modifiers.some((m) => m.type === 'watchlist');
  }).length;

  const riskById = new Map<
    string,
    { score: string; level: string; scoreType: string; relatedEntities: number }
  >();
  const resolutionRowsByKey = new Map<string, ResolutionScoreRow>();
  for (const hit of riskResponse.hits.hits) {
    const source = hit._source as
      | {
          '@timestamp'?: string;
          host?: {
            name?: string;
            risk?: {
              id_value?: string;
              calculated_score_norm?: number;
              calculated_level?: string;
              score_type?: string;
              related_entities?: unknown[];
              calculation_run_id?: string;
            };
          };
          user?: {
            name?: string;
            risk?: {
              id_value?: string;
              calculated_score_norm?: number;
              calculated_level?: string;
              score_type?: string;
              related_entities?: unknown[];
              calculation_run_id?: string;
            };
          };
          service?: {
            name?: string;
            risk?: {
              id_value?: string;
              calculated_score_norm?: number;
              calculated_level?: string;
              score_type?: string;
              related_entities?: unknown[];
              calculation_run_id?: string;
            };
          };
        }
      | undefined;
    const id =
      source?.host?.name ??
      source?.user?.name ??
      source?.service?.name ??
      source?.host?.risk?.id_value ??
      source?.user?.risk?.id_value ??
      source?.service?.risk?.id_value;
    const risk = source?.host?.risk ?? source?.user?.risk ?? source?.service?.risk;
    if (!id || !risk) continue;
    const scoreType = typeof risk.score_type === 'string' ? risk.score_type : '-';
    if (riskById.has(id)) continue;
    riskById.set(id, {
      score:
        typeof risk.calculated_score_norm === 'number'
          ? risk.calculated_score_norm.toFixed(2)
          : '-',
      level: risk.calculated_level ?? '-',
      scoreType,
      relatedEntities: Array.isArray(risk.related_entities) ? risk.related_entities.length : 0,
    });
  }

  return {
    rows: uniqueEntityIds.map((id) => ({
      id,
      score: riskById.get(id)?.score ?? '-',
      level: riskById.get(id)?.level ?? '-',
      scoreType: riskById.get(id)?.scoreType ?? '-',
      criticality: entityById.get(id)?.criticality ?? '-',
      watchlistsCount: entityById.get(id)?.watchlists.length ?? 0,
      resolutionTarget: entityById.get(id)?.resolutionTarget ?? '-',
      resolutionAliases: aliasCountByTarget.get(id) ?? 0,
      ownershipLinks: entityById.get(id)?.ownershipLinks ?? 0,
      relatedEntities: riskById.get(id)?.relatedEntities ?? 0,
    })),
    totalRiskDocs,
    totalEntityDocs,
    riskDocsMatched: riskById.size,
    watchlistModifierDocs,
    resolutionRows: (() => {
      for (const hit of resolutionResponse.hits.hits) {
        const source = hit._source as
          | {
              '@timestamp'?: string;
              host?: {
                name?: string;
                risk?: {
                  id_value?: string;
                  calculated_score_norm?: number;
                  calculated_level?: string;
                  score_type?: string;
                  related_entities?: unknown[];
                  calculation_run_id?: string;
                };
              };
              user?: {
                name?: string;
                risk?: {
                  id_value?: string;
                  calculated_score_norm?: number;
                  calculated_level?: string;
                  score_type?: string;
                  related_entities?: unknown[];
                  calculation_run_id?: string;
                };
              };
              service?: {
                name?: string;
                risk?: {
                  id_value?: string;
                  calculated_score_norm?: number;
                  calculated_level?: string;
                  score_type?: string;
                  related_entities?: unknown[];
                  calculation_run_id?: string;
                };
              };
            }
          | undefined;
        const risk = source?.host?.risk ?? source?.user?.risk ?? source?.service?.risk;
        if (!risk || risk.score_type !== 'resolution') continue;
        const id =
          source?.host?.name ??
          source?.user?.name ??
          source?.service?.name ??
          source?.host?.risk?.id_value ??
          source?.user?.risk?.id_value ??
          source?.service?.risk?.id_value;
        if (!id) continue;
        const calculationRunId =
          typeof risk.calculation_run_id === 'string' ? risk.calculation_run_id : '-';
        const resolutionKey = buildResolutionKey({ targetEntityId: id, calculationRunId });
        if (resolutionRowsByKey.has(resolutionKey)) continue;
        resolutionRowsByKey.set(resolutionKey, {
          resolutionKey,
          targetEntityId: id,
          score:
            typeof risk.calculated_score_norm === 'number'
              ? risk.calculated_score_norm.toFixed(2)
              : '-',
          level: risk.calculated_level ?? '-',
          relatedEntities: Array.isArray(risk.related_entities) ? risk.related_entities.length : 0,
          calculationRunId,
          timestamp: typeof source?.['@timestamp'] === 'string' ? source['@timestamp'] : '-',
        });
      }
      return [...resolutionRowsByKey.values()];
    })(),
  };
};

const logResolutionReadDiagnostics = async ({
  space,
  entityIds,
  context,
}: {
  space: string;
  entityIds: string[];
  context: string;
}): Promise<void> => {
  const uniqueEntityIds = [...new Set(entityIds)];
  if (uniqueEntityIds.length === 0) return;

  const client = getEsClient();
  const riskIndex = `risk-score.risk-score-${space}`;
  const response = await client.search({
    index: riskIndex,
    size: 8,
    sort: [{ '@timestamp': { order: 'desc' } }],
    query: {
      bool: {
        should: [
          { term: { 'host.risk.score_type': 'resolution' } },
          { term: { 'user.risk.score_type': 'resolution' } },
          { term: { 'service.risk.score_type': 'resolution' } },
        ],
        minimum_should_match: 1,
        filter: [
          {
            bool: {
              should: [
                { terms: { 'host.name': uniqueEntityIds } },
                { terms: { 'user.name': uniqueEntityIds } },
                { terms: { 'service.name': uniqueEntityIds } },
                { terms: { 'host.risk.id_value': uniqueEntityIds } },
                { terms: { 'user.risk.id_value': uniqueEntityIds } },
                { terms: { 'service.risk.id_value': uniqueEntityIds } },
              ],
              minimum_should_match: 1,
            },
          },
        ],
      },
    },
    _source: [
      '@timestamp',
      'host.name',
      'host.risk.id_value',
      'host.risk.score_type',
      'user.name',
      'user.risk.id_value',
      'user.risk.score_type',
      'service.name',
      'service.risk.id_value',
      'service.risk.score_type',
    ],
  });

  const hits = response.hits.hits;
  log.warn(
    `[debug:${context}] resolution-read diagnostics: matched_hits=${hits.length}, total=${response.hits.total && typeof response.hits.total === 'object' ? response.hits.total.value : 'n/a'}`,
  );
  for (const [index, hit] of hits.entries()) {
    const source = hit._source as
      | {
          '@timestamp'?: string;
          host?: { name?: string; risk?: { id_value?: string; score_type?: string } };
          user?: { name?: string; risk?: { id_value?: string; score_type?: string } };
          service?: { name?: string; risk?: { id_value?: string; score_type?: string } };
        }
      | undefined;
    const id =
      source?.host?.name ??
      source?.user?.name ??
      source?.service?.name ??
      source?.host?.risk?.id_value ??
      source?.user?.risk?.id_value ??
      source?.service?.risk?.id_value ??
      '-';
    const scoreType =
      source?.host?.risk?.score_type ??
      source?.user?.risk?.score_type ??
      source?.service?.risk?.score_type ??
      '-';
    log.warn(
      `[debug:${context}] hit_${index + 1}: id=${id}, score_type=${scoreType}, ts=${source?.['@timestamp'] ?? '-'}`,
    );
  }
};

const printRiskRows = async ({
  rows,
  riskDocsMatched,
  pageSize = 20,
}: {
  rows: RiskSummaryRow[];
  riskDocsMatched: number;
  pageSize?: number;
}): Promise<void> => {
  const idWidth = 66;
  const scoreWidth = 7;
  const scoreTypeWidth = 10;
  const levelWidth = 8;
  const critWidth = 14;
  const watchWidth = 5;
  const relTargetWidth = 22;
  const aliasWidth = 5;
  const ownsWidth = 4;
  const relatedWidth = 4;
  const header = [
    formatCell('Entity ID', idWidth),
    formatCell('Score', scoreWidth),
    formatCell('Type', scoreTypeWidth),
    formatCell('Lvl', levelWidth),
    formatCell('Criticality', critWidth),
    formatCell('WL', watchWidth),
    formatCell('Res.Target', relTargetWidth),
    formatCell('Ali', aliasWidth),
    formatCell('Own', ownsWidth),
    formatCell('Rel', relatedWidth),
  ].join(' | ');
  const separator = `${'-'.repeat(idWidth)}-+-${'-'.repeat(scoreWidth)}-+-${'-'.repeat(scoreTypeWidth)}-+-${'-'.repeat(levelWidth)}-+-${'-'.repeat(critWidth)}-+-${'-'.repeat(watchWidth)}-+-${'-'.repeat(relTargetWidth)}-+-${'-'.repeat(aliasWidth)}-+-${'-'.repeat(ownsWidth)}-+-${'-'.repeat(relatedWidth)}`;

  // eslint-disable-next-line no-console
  console.log(
    colorize(`📊 Risk docs matched for seeded IDs: ${riskDocsMatched}/${rows.length}`, 'cyan'),
  );
  log.info(`Entity scorecard (${rows.length} seeded entities):`);
  const printLine = (line: string) => {
    // eslint-disable-next-line no-console
    console.log(line);
  };

  if (!canUseInteractivePrompts() || rows.length <= pageSize) {
    printLine(header);
    printLine(separator);
    for (const row of rows) {
      const levelCell = formatCell(row.level, levelWidth);
      printLine(
        [
          formatCell(row.id, idWidth),
          formatCell(row.score, scoreWidth),
          formatCell(row.scoreType, scoreTypeWidth),
          colorizeRiskLevel(levelCell, row.level),
          formatCell(row.criticality, critWidth),
          formatCell(String(row.watchlistsCount), watchWidth),
          formatCell(row.resolutionTarget, relTargetWidth),
          formatCell(String(row.resolutionAliases), aliasWidth),
          formatCell(String(row.ownershipLinks), ownsWidth),
          formatCell(String(row.relatedEntities), relatedWidth),
        ].join(' | '),
      );
    }
    return;
  }

  let page = 0;
  const totalPages = Math.ceil(rows.length / pageSize);
  while (true) {
    const start = page * pageSize;
    const end = Math.min(start + pageSize, rows.length);
    const pageRows = rows.slice(start, end);

    printLine(header);
    printLine(separator);
    for (const row of pageRows) {
      const levelCell = formatCell(row.level, levelWidth);
      printLine(
        [
          formatCell(row.id, idWidth),
          formatCell(row.score, scoreWidth),
          formatCell(row.scoreType, scoreTypeWidth),
          colorizeRiskLevel(levelCell, row.level),
          formatCell(row.criticality, critWidth),
          formatCell(String(row.watchlistsCount), watchWidth),
          formatCell(row.resolutionTarget, relTargetWidth),
          formatCell(String(row.resolutionAliases), aliasWidth),
          formatCell(String(row.ownershipLinks), ownsWidth),
          formatCell(String(row.relatedEntities), relatedWidth),
        ].join(' | '),
      );
    }

    log.info(
      `Scorecard page ${page + 1}/${totalPages} (rows ${start + 1}-${end} of ${rows.length}).`,
    );
    const canNext = page < totalPages - 1;
    const canPrev = page > 0;
    const navHint =
      canPrev && canNext
        ? '[n] next, [p] previous, [q] continue'
        : canNext
          ? '[n] next, [q] continue'
          : canPrev
            ? '[p] previous, [q] continue'
            : '[q] continue';
    let navRaw: string;
    try {
      navRaw = await input({
        message: `Table navigation: ${navHint}`,
        default: 'q',
      });
    } catch (error) {
      if (isPromptIoError(error)) {
        log.warn(`Interactive table navigation unavailable (${error}). Continuing.`);
        break;
      }
      throw error;
    }
    const nav = navRaw.trim().toLowerCase();

    if (nav === 'n' && canNext) {
      page += 1;
      continue;
    }
    if (nav === 'p' && canPrev) {
      page -= 1;
      continue;
    }
    if (nav === 'q' || nav === '') {
      break;
    }
    log.warn(`Invalid table navigation "${nav}" for this page.`);
  }
};

const printResolutionRows = async ({
  rows,
  pageSize = 20,
}: {
  rows: ResolutionScoreRow[];
  pageSize?: number;
}): Promise<void> => {
  if (rows.length === 0) {
    log.info('Resolution scorecard: no resolution docs found for tracked entities.');
    return;
  }

  const keyWidth = 52;
  const idxWidth = 4;
  const targetWidth = 48;
  const scoreWidth = 7;
  const levelWidth = 9;
  const relWidth = 6;
  const runWidth = 18;
  const tsWidth = 24;

  const header = [
    formatCell('#', idxWidth),
    formatCell('Resolution Key', keyWidth),
    formatCell('Target Entity', targetWidth),
    formatCell('Score', scoreWidth),
    formatCell('Level', levelWidth),
    formatCell('Rel', relWidth),
    formatCell('Run ID', runWidth),
    formatCell('Timestamp', tsWidth),
  ].join(' | ');
  const separator = `${'-'.repeat(idxWidth)}-+-${'-'.repeat(keyWidth)}-+-${'-'.repeat(targetWidth)}-+-${'-'.repeat(scoreWidth)}-+-${'-'.repeat(levelWidth)}-+-${'-'.repeat(relWidth)}-+-${'-'.repeat(runWidth)}-+-${'-'.repeat(tsWidth)}`;

  // eslint-disable-next-line no-console
  console.log(colorize(`🧩 Resolution scorecard (${rows.length} rows)`, 'cyan'));
  const printLine = (line: string) => {
    // eslint-disable-next-line no-console
    console.log(line);
  };

  if (!canUseInteractivePrompts() || rows.length <= pageSize) {
    printLine(header);
    printLine(separator);
    for (const [index, row] of rows.entries()) {
      const levelCell = formatCell(row.level, levelWidth);
      printLine(
        [
          formatCell(String(index + 1), idxWidth),
          formatCell(row.resolutionKey, keyWidth),
          formatCell(row.targetEntityId, targetWidth),
          formatCell(row.score, scoreWidth),
          colorizeRiskLevel(levelCell, row.level),
          formatCell(String(row.relatedEntities), relWidth),
          formatCell(row.calculationRunId, runWidth),
          formatCell(row.timestamp, tsWidth),
        ].join(' | '),
      );
    }
    log.info('Tip: use [j] with a row number, full target ID, or ID prefix.');
    return;
  }

  let page = 0;
  const totalPages = Math.ceil(rows.length / pageSize);
  while (true) {
    const start = page * pageSize;
    const end = Math.min(start + pageSize, rows.length);
    const pageRows = rows.slice(start, end);

    printLine(header);
    printLine(separator);
    for (const [offset, row] of pageRows.entries()) {
      const index = start + offset;
      const levelCell = formatCell(row.level, levelWidth);
      printLine(
        [
          formatCell(String(index + 1), idxWidth),
          formatCell(row.resolutionKey, keyWidth),
          formatCell(row.targetEntityId, targetWidth),
          formatCell(row.score, scoreWidth),
          colorizeRiskLevel(levelCell, row.level),
          formatCell(String(row.relatedEntities), relWidth),
          formatCell(row.calculationRunId, runWidth),
          formatCell(row.timestamp, tsWidth),
        ].join(' | '),
      );
    }
    log.info('Tip: use [j] with a row number, full target ID, or ID prefix.');

    const canNext = page < totalPages - 1;
    const canPrev = page > 0;
    const navHint =
      canPrev && canNext
        ? '[n] next, [p] previous, [q] continue'
        : canNext
          ? '[n] next, [q] continue'
          : canPrev
            ? '[p] previous, [q] continue'
            : '[q] continue';
    let navRaw: string;
    try {
      navRaw = await input({
        message: `Resolution table navigation: ${navHint}`,
        default: 'q',
      });
    } catch (error) {
      if (isPromptIoError(error)) {
        log.warn(`Interactive resolution table navigation unavailable (${error}). Continuing.`);
        break;
      }
      throw error;
    }
    const nav = navRaw.trim().toLowerCase();
    if (nav === 'n' && canNext) {
      page += 1;
      continue;
    }
    if (nav === 'p' && canPrev) {
      page -= 1;
      continue;
    }
    if (nav === 'q' || nav === '') {
      break;
    }
  }
};

const resolveResolutionTargetFromInput = ({
  inputValue,
  rows,
}: {
  inputValue: string;
  rows: ResolutionScoreRow[];
}): string | null => {
  const value = inputValue.trim();
  if (!value) return null;

  const numeric = Number.parseInt(value, 10);
  if (Number.isFinite(numeric) && String(numeric) === value) {
    const row = rows[numeric - 1];
    return row?.targetEntityId ?? null;
  }

  const exactByTarget = rows.find((row) => row.targetEntityId === value);
  if (exactByTarget) return exactByTarget.targetEntityId;

  const exactByKey = rows.find((row) => row.resolutionKey === value);
  if (exactByKey) return exactByKey.targetEntityId;

  const prefixMatches = rows.filter(
    (row) => row.targetEntityId.startsWith(value) || row.resolutionKey.startsWith(value),
  );
  if (prefixMatches.length === 1) return prefixMatches[0].targetEntityId;

  return null;
};

const printSnapshotResult = (
  snapshot: RiskSnapshot,
): { missingRiskDocs: number; totalEntities: number } => {
  const missingRiskDocIds = snapshot.rows
    .filter((row) => row.score === '-' && row.level === '-')
    .map((row) => row.id);
  if (missingRiskDocIds.length > 0) {
    const preview = missingRiskDocIds.slice(0, 5).join(', ');
    log.warn(
      `Missing risk score docs for ${missingRiskDocIds.length}/${snapshot.rows.length} seeded entities. Missing examples: ${preview}${missingRiskDocIds.length > 5 ? ', ...' : ''}`,
    );
  } else {
    log.info(
      `All ${snapshot.rows.length}/${snapshot.rows.length} seeded entities have risk score docs.`,
    );
  }
  if (snapshot.rows.length > 0 && missingRiskDocIds.length === 0) {
    // eslint-disable-next-line no-console
    console.log(
      colorize(
        `✅ PASS: Risk docs present for all ${snapshot.rows.length} seeded entities.`,
        'green',
      ),
    );
  } else {
    // eslint-disable-next-line no-console
    console.log(
      colorize(
        `⚠️ WARN: Missing risk docs for ${missingRiskDocIds.length}/${snapshot.rows.length} seeded entities.`,
        'yellow',
      ),
    );
  }
  return { missingRiskDocs: missingRiskDocIds.length, totalEntities: snapshot.rows.length };
};

const reportRiskSummary = async ({
  space,
  baselineRiskScoreCount,
  baselineEntityCount,
  expectedRiskDelta,
  entityIds,
  pageSize,
  expectedResolutionTargets = 0,
  debugResolution = false,
}: {
  space: string;
  baselineRiskScoreCount: number;
  baselineEntityCount: number;
  expectedRiskDelta: number;
  entityIds: string[];
  pageSize: number;
  expectedResolutionTargets?: number;
  debugResolution?: boolean;
}): Promise<{ missingRiskDocs: number; totalEntities: number; snapshot: RiskSnapshot }> => {
  const snapshot = await collectRiskSnapshot({ space, entityIds });
  const riskDelta = Math.max(0, snapshot.totalRiskDocs - baselineRiskScoreCount);
  const entityDelta = Math.max(0, snapshot.totalEntityDocs - baselineEntityCount);

  log.info(
    `Run summary (${space}): entities ${baselineEntityCount} -> ${snapshot.totalEntityDocs} (delta +${entityDelta})`,
  );
  log.info(
    `Run summary (${space}): risk scores ${baselineRiskScoreCount} -> ${snapshot.totalRiskDocs} (delta +${riskDelta})`,
  );
  if (riskDelta < expectedRiskDelta) {
    log.warn(
      `Risk score delta lower than expected for this run (${riskDelta}/${expectedRiskDelta}). This can happen when existing score docs are updated in-place or scoring configuration limits entity types.`,
    );
  }

  log.info(`Docs with watchlist modifiers: ${snapshot.watchlistModifierDocs}`);
  if (expectedResolutionTargets > 0 && snapshot.resolutionRows.length === 0) {
    log.warn(
      `Resolution warning: expected resolution targets=${expectedResolutionTargets} but found no resolution docs in summary.`,
    );
    if (debugResolution) {
      await logResolutionReadDiagnostics({
        space,
        entityIds,
        context: 'initial_summary',
      });
    }
  }
  await printRiskRows({ rows: snapshot.rows, riskDocsMatched: snapshot.riskDocsMatched, pageSize });
  await printResolutionRows({ rows: snapshot.resolutionRows, pageSize });
  const result = printSnapshotResult(snapshot);
  return { ...result, snapshot };
};

const printBeforeAfterComparison = ({
  actionTitle,
  before,
  after,
}: {
  actionTitle: string;
  before: RiskSnapshot;
  after: RiskSnapshot;
}): string[] => {
  const beforeById = new Map(before.rows.map((row) => [row.id, row]));
  const afterById = new Map(after.rows.map((row) => [row.id, row]));
  const allIds = [...new Set([...beforeById.keys(), ...afterById.keys()])];
  const deltaRows = allIds.map((id) => {
    const beforeRow = beforeById.get(id) ?? {
      id,
      score: '-',
      level: '-',
      scoreType: '-',
      criticality: '-',
      watchlistsCount: 0,
      resolutionTarget: '-',
      resolutionAliases: 0,
      ownershipLinks: 0,
      relatedEntities: 0,
    };
    const afterRow = afterById.get(id) ?? {
      id,
      score: '-',
      level: '-',
      scoreType: '-',
      criticality: '-',
      watchlistsCount: 0,
      resolutionTarget: '-',
      resolutionAliases: 0,
      ownershipLinks: 0,
      relatedEntities: 0,
    };
    const beforeScore = toNumericScore(beforeRow.score);
    const afterScore = toNumericScore(afterRow.score);
    const delta =
      beforeScore !== null && afterScore !== null ? (afterScore - beforeScore).toFixed(2) : '-';
    return {
      id,
      beforeScore: beforeRow.score,
      afterScore: afterRow.score,
      beforeLevel: beforeRow.level,
      afterLevel: afterRow.level,
      beforeCriticality: beforeRow.criticality,
      afterCriticality: afterRow.criticality,
      beforeWatchlistsCount: beforeRow.watchlistsCount,
      afterWatchlistsCount: afterRow.watchlistsCount,
      beforeScoreType: beforeRow.scoreType,
      afterScoreType: afterRow.scoreType,
      beforeResolutionTarget: beforeRow.resolutionTarget,
      afterResolutionTarget: afterRow.resolutionTarget,
      beforeResolutionAliases: beforeRow.resolutionAliases,
      afterResolutionAliases: afterRow.resolutionAliases,
      beforeOwnershipLinks: beforeRow.ownershipLinks,
      afterOwnershipLinks: afterRow.ownershipLinks,
      beforeRelatedEntities: beforeRow.relatedEntities,
      afterRelatedEntities: afterRow.relatedEntities,
      scoreTransition: `${beforeRow.score}->${afterRow.score}`,
      delta,
      levelTransition: `${beforeRow.level}->${afterRow.level}`,
      scoreTypeTransition: `${beforeRow.scoreType}->${afterRow.scoreType}`,
      resolutionTransition: `${beforeRow.resolutionTarget}->${afterRow.resolutionTarget}`,
      criticalityTransition: `${beforeRow.criticality}->${afterRow.criticality}`,
      watchlistTransition: `${beforeRow.watchlistsCount}->${afterRow.watchlistsCount}`,
      aliasTransition: `${beforeRow.resolutionAliases}->${afterRow.resolutionAliases}`,
      ownershipTransition: `${beforeRow.ownershipLinks}->${afterRow.ownershipLinks}`,
      relatedTransition: `${beforeRow.relatedEntities}->${afterRow.relatedEntities}`,
    };
  });
  const changedRows = deltaRows.filter((row) => {
    return (
      row.beforeScore !== row.afterScore ||
      row.beforeLevel !== row.afterLevel ||
      row.beforeCriticality !== row.afterCriticality ||
      row.beforeWatchlistsCount !== row.afterWatchlistsCount ||
      row.beforeScoreType !== row.afterScoreType ||
      row.beforeResolutionTarget !== row.afterResolutionTarget ||
      row.beforeResolutionAliases !== row.afterResolutionAliases ||
      row.beforeOwnershipLinks !== row.afterOwnershipLinks ||
      row.beforeRelatedEntities !== row.afterRelatedEntities
    );
  });

  const idWidth = 40;
  const scoreWidth = 17;
  const typeWidth = 12;
  const deltaWidth = 7;
  const levelWidth = 15;
  const relWidth = 17;
  const critWidth = 21;
  const wlWidth = 9;
  const aliasWidth = 8;
  const ownWidth = 7;
  const relEntWidth = 7;
  const header = [
    formatCell('Entity ID', idWidth),
    formatCell('Score b->a', scoreWidth),
    formatCell('Type b->a', typeWidth),
    formatCell('Delta', deltaWidth),
    formatCell('Lvl b->a', levelWidth),
    formatCell('Res b->a', relWidth),
    formatCell('Crit b->a', critWidth),
    formatCell('WL b->a', wlWidth),
    formatCell('Ali b->a', aliasWidth),
    formatCell('Own b->a', ownWidth),
    formatCell('Rel b->a', relEntWidth),
  ].join(' | ');
  const separator = `${'-'.repeat(idWidth)}-+-${'-'.repeat(scoreWidth)}-+-${'-'.repeat(typeWidth)}-+-${'-'.repeat(deltaWidth)}-+-${'-'.repeat(levelWidth)}-+-${'-'.repeat(relWidth)}-+-${'-'.repeat(critWidth)}-+-${'-'.repeat(wlWidth)}-+-${'-'.repeat(aliasWidth)}-+-${'-'.repeat(ownWidth)}-+-${'-'.repeat(relEntWidth)}`;
  // eslint-disable-next-line no-console
  console.log(colorize(`🔄 Before/After (${actionTitle})`, 'cyan'));
  if (changedRows.length === 0) {
    log.info('No entity changes detected between snapshots.');
    return [];
  }
  // eslint-disable-next-line no-console
  console.log(header);
  // eslint-disable-next-line no-console
  console.log(separator);
  const maxRows = 100;
  for (const row of changedRows.slice(0, maxRows)) {
    const afterLevel = row.afterLevel ?? '-';
    const beforeLevel = row.beforeLevel ?? '-';
    const beforeLevelWidth = Math.floor((levelWidth - 2) / 2);
    const afterLevelWidth = levelWidth - 2 - beforeLevelWidth;
    const beforeLevelCell = formatCell(beforeLevel, beforeLevelWidth);
    const afterLevelCell = formatCell(afterLevel, afterLevelWidth);
    const levelCell = `${colorizeRiskLevel(beforeLevelCell, beforeLevel)}->${colorizeRiskLevel(afterLevelCell, afterLevel)}`;
    const deltaCell = formatCell(row.delta, deltaWidth);
    // eslint-disable-next-line no-console
    console.log(
      [
        formatCell(row.id, idWidth),
        formatCell(row.scoreTransition, scoreWidth),
        formatCell(row.scoreTypeTransition, typeWidth),
        colorizeDelta(deltaCell, row.delta),
        levelCell,
        formatCell(row.resolutionTransition, relWidth),
        formatCell(row.criticalityTransition, critWidth),
        formatCell(row.watchlistTransition, wlWidth),
        formatCell(row.aliasTransition, aliasWidth),
        formatCell(row.ownershipTransition, ownWidth),
        formatCell(row.relatedTransition, relEntWidth),
      ].join(' | '),
    );
  }
  if (changedRows.length > maxRows) {
    log.info(
      `... truncated ${changedRows.length - maxRows} additional changed entities from comparison output.`,
    );
  }

  const topMovers = changedRows
    .map((row) => ({ ...row, absDelta: Math.abs(toNumericScore(row.delta) ?? 0) }))
    .sort((a, b) => b.absDelta - a.absDelta)
    .slice(0, 5)
    .filter((row) => row.absDelta > 0);
  if (topMovers.length > 0) {
    log.info(`Top score changes: ${topMovers.map((row) => `${row.id}(${row.delta})`).join(', ')}`);
  } else {
    log.info('Top score changes: no score delta detected.');
  }
  return changedRows.map((row) => row.id);
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

const refreshRiskScoreIndex = async (space: string): Promise<void> => {
  const client = getEsClient();
  const index = `risk-score.risk-score-${space}`;
  try {
    await client.indices.refresh({ index, ignore_unavailable: true });
  } catch {
    // Ignore refresh issues in test harness; caller will still attempt reads.
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

const deleteAllDocsFromIndex = async (index: string, label: string): Promise<number> => {
  const client = getEsClient();
  try {
    const response = await client.deleteByQuery({
      index,
      refresh: true,
      ignore_unavailable: true,
      conflicts: 'proceed',
      query: { match_all: {} },
    });
    const deleted = response.deleted ?? 0;
    log.info(`Dangerous clean: deleted ${deleted} ${label} docs from "${index}".`);
    return deleted;
  } catch (error) {
    const statusCode = (error as { meta?: { statusCode?: number } }).meta?.statusCode;
    if (statusCode === 404) {
      log.info(`Dangerous clean: index "${index}" not found for ${label}; nothing to delete.`);
      return 0;
    }
    throw error;
  }
};

const dangerousCleanSpaceData = async (space: string): Promise<void> => {
  const alertIndex = getAlertIndex(space);
  const entityLatestIndex = `.entities.v2.latest.security_${space}`;
  const entityHistoryIndex = `.entities.v2.history.security_${space}`;
  const riskIndex = `risk-score.risk-score-${space}`;
  const riskLookupIndex = `.entity_analytics.risk_score.lookup-${space}`;

  log.warn(
    `Dangerous clean enabled for space "${space}". Clearing alerts, entity docs, and risk score docs before test run.`,
  );

  await deleteAllDocsFromIndex(alertIndex, 'alert');
  await deleteAllDocsFromIndex(entityLatestIndex, 'entity-latest');
  await deleteAllDocsFromIndex(entityHistoryIndex, 'entity-history');
  await deleteAllDocsFromIndex(riskIndex, 'risk-score');
  await deleteAllDocsFromIndex(riskLookupIndex, 'risk-score-lookup');
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

const indexAlertsForSeededEntities = async ({
  users,
  localUsers,
  hosts,
  services,
  alertsPerEntity,
  space,
}: {
  users: SeededUser[];
  localUsers: SeededLocalUser[];
  hosts: SeededHost[];
  services: SeededService[];
  alertsPerEntity: number;
  space: string;
}) => {
  log.info('Generating and indexing alerts for seeded entities...');
  const totalAlerts =
    (users.length + localUsers.length + hosts.length + services.length) * alertsPerEntity;
  const maxOperationsPerChunk = 5000 * 2;
  const totalOperations = totalAlerts * 2;
  const totalChunks = totalOperations > 0 ? Math.ceil(totalOperations / maxOperationsPerChunk) : 0;
  log.info(
    `Alert bulk indexing: total_operations=${totalOperations}, chunk_size=${maxOperationsPerChunk}, chunks=${totalChunks}`,
  );
  let chunkIndex = 0;
  for (const chunkOps of buildAlertOpChunks({
    idpUsers: users,
    localUsers,
    hosts,
    services,
    alertsPerEntity,
    space,
    maxOperationsPerChunk,
  })) {
    chunkIndex += 1;
    await bulkUpsert({ documents: chunkOps });
    log.info(`Alert bulk indexing progress: chunk ${chunkIndex}/${totalChunks}`);
  }
  log.info('Alert indexing stage complete.');
};

const deleteAlertsForSeededEntities = async ({
  space,
  users,
  localUsers,
  hosts,
  services,
}: {
  space: string;
  users: SeededUser[];
  localUsers: SeededLocalUser[];
  hosts: SeededHost[];
  services: SeededService[];
}) => {
  const client = getEsClient();
  const alertIndex = getAlertIndex(space);
  const shouldQueries: Array<Record<string, unknown>> = [];
  if (users.length > 0) {
    shouldQueries.push({ terms: { 'user.email': users.map((u) => u.userEmail) } });
  }
  if (localUsers.length > 0) {
    shouldQueries.push({ terms: { 'user.name': localUsers.map((u) => u.userName) } });
  }
  if (hosts.length > 0) {
    shouldQueries.push({ terms: { 'host.id': hosts.map((h) => h.hostId) } });
  }
  if (services.length > 0) {
    shouldQueries.push({ terms: { 'service.name': services.map((s) => s.serviceName) } });
  }
  if (shouldQueries.length === 0) {
    log.info('No seeded entities available for alert cleanup.');
    return;
  }
  log.info(`Deleting alerts tied to seeded entities from "${alertIndex}"...`);
  try {
    const response = await client.deleteByQuery({
      index: alertIndex,
      refresh: true,
      ignore_unavailable: true,
      conflicts: 'proceed',
      query: {
        bool: {
          should: shouldQueries,
          minimum_should_match: 1,
        },
      },
    });
    log.info(`Deleted ${response.deleted ?? 0} alerts for seeded entities.`);
  } catch (error) {
    const statusCode = (error as { meta?: { statusCode?: number } }).meta?.statusCode;
    if (statusCode === 404) {
      log.info(`Alert index "${alertIndex}" not found; nothing to delete.`);
      return;
    }
    throw error;
  }
};

const clearEntityModifiers = async ({
  entityIds,
  space,
  batchSize,
}: {
  entityIds: string[];
  space: string;
  batchSize: number;
}) => {
  const assignments = new Map<string, EntityModifierAssignment>();
  for (const entityId of entityIds) {
    const entityType = toModifierEntityType(entityId);
    if (!entityType) continue;
    assignments.set(entityId, { watchlists: [] });
  }

  const entries = [...assignments.entries()];
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    const entities: Array<{ type: ModifierEntityType; doc: Record<string, unknown> }> = [];
    for (const [entityId, assignment] of batch) {
      const entityType = toModifierEntityType(entityId);
      if (!entityType) continue;
      entities.push({
        type: entityType,
        doc: {
          entity: {
            id: entityId,
            attributes: { watchlists: assignment.watchlists ?? [] },
          },
          asset: { criticality: null },
        },
      });
    }
    if (entities.length > 0) {
      await forceBulkUpdateEntitiesViaCrud({ entities, space });
    }
  }
  log.info('Requested clearing of entity modifiers (watchlists + criticality).');
};

const runRiskMaintainerOnce = async ({
  space,
  runTimedStage,
  stage,
}: {
  space: string;
  runTimedStage: <T>(stage: string, fn: () => Promise<T>) => Promise<T>;
  stage: string;
}) =>
  runTimedStage(stage, async () => {
    await initEntityMaintainers(space);
    const outcome = await waitForMaintainerRun(space, 'risk-score');
    await refreshRiskScoreIndex(space);
    return outcome;
  });

const countSeededAlertsByEntityKind = async ({
  space,
  users,
  localUsers,
  hosts,
  services,
}: {
  space: string;
  users: SeededUser[];
  localUsers: SeededLocalUser[];
  hosts: SeededHost[];
  services: SeededService[];
}): Promise<{
  idpUserAlerts: number;
  localUserAlerts: number;
  hostAlerts: number;
  serviceAlerts: number;
}> => {
  const client = getEsClient();
  const alertIndex = getAlertIndex(space);
  const safeCount = async (query: Record<string, unknown>): Promise<number> => {
    try {
      const response = await client.count({
        index: alertIndex,
        ignore_unavailable: true,
        query,
      });
      return response.count;
    } catch {
      return 0;
    }
  };

  const [idpUserAlerts, localUserAlerts, hostAlerts, serviceAlerts] = await Promise.all([
    users.length > 0 ? safeCount({ terms: { 'user.email': users.map((u) => u.userEmail) } }) : 0,
    localUsers.length > 0
      ? safeCount({ terms: { 'user.name': localUsers.map((u) => u.userName) } })
      : 0,
    hosts.length > 0 ? safeCount({ terms: { 'host.id': hosts.map((h) => h.hostId) } }) : 0,
    services.length > 0
      ? safeCount({ terms: { 'service.name': services.map((s) => s.serviceName) } })
      : 0,
  ]);

  return { idpUserAlerts, localUserAlerts, hostAlerts, serviceAlerts };
};

type FollowOnAction =
  | 'reset_to_zero'
  | 'post_more_alerts'
  | 'remove_modifiers'
  | 'reapply_modifiers'
  | 'add_more_entities'
  | 'tweak_single_entity'
  | 'view_single_risk_doc'
  | 'explain_resolution'
  | 'export_risk_docs'
  | 'refresh_table'
  | 'run_maintainer_and_refresh'
  | 'graph_summary'
  | 'link_aliases'
  | 'unlink_entities'
  | 'ownership_mutate'
  | 'clear_relationships'
  | 'reapply_relationships'
  | 'exit';

type TrackedEntitySelection =
  | { kind: 'idp_user'; user: SeededUser; euid: string }
  | { kind: 'local_user'; user: SeededLocalUser; euid: string }
  | { kind: 'host'; host: SeededHost; euid: string }
  | { kind: 'service'; service: SeededService; euid: string };

const formatMenuKey = (key: string): string =>
  process.stdout.isTTY ? `${ANSI.bold}${key}${ANSI.reset}` : key;

const formatFollowOnOption = (key: string, description: string): string =>
  `  [${formatMenuKey(key)}] ${description}`;

const resolveTrackedEntitySelection = ({
  entityId,
  users,
  localUsers,
  hosts,
  services,
}: {
  entityId: string;
  users: SeededUser[];
  localUsers: SeededLocalUser[];
  hosts: SeededHost[];
  services: SeededService[];
}): TrackedEntitySelection | null => {
  const idpUser = users.find((user) => toUserEuid(user) === entityId);
  if (idpUser) return { kind: 'idp_user', user: idpUser, euid: entityId };

  const localUser = localUsers.find(
    (user) => `user:${user.userName}@${user.hostId}@local` === entityId,
  );
  if (localUser) return { kind: 'local_user', user: localUser, euid: entityId };

  const host = hosts.find((h) => toHostEuid(h) === entityId);
  if (host) return { kind: 'host', host, euid: entityId };

  const service = services.find((s) => toServiceEuid(s) === entityId);
  if (service) return { kind: 'service', service, euid: entityId };

  return null;
};

const getSelectionAlertQuery = (selection: TrackedEntitySelection): Record<string, unknown> => {
  const legacyQuery = (() => {
    switch (selection.kind) {
      case 'idp_user':
        return { term: { 'user.email': selection.user.userEmail } };
      case 'local_user':
        return {
          bool: {
            must: [
              { term: { 'user.name': selection.user.userName } },
              { term: { 'host.id': selection.user.hostId } },
            ],
          },
        };
      case 'host':
        return { term: { 'host.id': selection.host.hostId } };
      case 'service':
        return { term: { 'service.name': selection.service.serviceName } };
    }
  })();

  // Prefer explicit per-alert target marker; keep legacy matcher for older generated alerts.
  return {
    bool: {
      should: [{ term: { [ALERT_TARGET_ENTITY_ID_FIELD]: selection.euid } }, legacyQuery],
      minimum_should_match: 1,
    },
  };
};

const countAlertsForSelection = async ({
  space,
  selection,
}: {
  space: string;
  selection: TrackedEntitySelection;
}): Promise<number> => {
  const client = getEsClient();
  const alertIndex = getAlertIndex(space);
  try {
    const response = await client.count({
      index: alertIndex,
      ignore_unavailable: true,
      query: getSelectionAlertQuery(selection),
    });
    return response.count;
  } catch {
    return 0;
  }
};

const deleteAlertsForSelection = async ({
  space,
  selection,
}: {
  space: string;
  selection: TrackedEntitySelection;
}) => {
  const client = getEsClient();
  const alertIndex = getAlertIndex(space);
  try {
    const response = await client.deleteByQuery({
      index: alertIndex,
      refresh: true,
      ignore_unavailable: true,
      conflicts: 'proceed',
      query: getSelectionAlertQuery(selection),
    });
    log.info(`Deleted ${response.deleted ?? 0} alerts for entity "${selection.euid}".`);
  } catch (error) {
    const statusCode = (error as { meta?: { statusCode?: number } }).meta?.statusCode;
    if (statusCode === 404) {
      log.info(`Alert index "${alertIndex}" not found; nothing to delete.`);
      return;
    }
    throw error;
  }
};

const printSingleEntityState = async ({
  space,
  selection,
}: {
  space: string;
  selection: TrackedEntitySelection;
}) => {
  const snapshot = await collectRiskSnapshot({ space, entityIds: [selection.euid] });
  const row = snapshot.rows[0];
  const alertCount = await countAlertsForSelection({ space, selection });
  let resolutionGroupSize = 0;
  let resolutionAliases = 0;
  try {
    const resolutionGroup = await getResolutionGroup({ entityId: selection.euid, space });
    resolutionGroupSize = resolutionGroup.group_size;
    resolutionAliases = resolutionGroup.aliases.length;
  } catch {
    // Some entities may not participate in resolution; keep defaults.
  }
  if (!row) {
    log.warn(`No current risk/entity state found for "${selection.euid}".`);
    return;
  }
  // eslint-disable-next-line no-console
  console.log(colorize(`🎯 Single entity state: ${selection.euid}`, 'cyan'));
  // eslint-disable-next-line no-console
  console.log(
    `  score=${row.score}, score_type=${row.scoreType}, level=${row.level}, criticality=${row.criticality}, watchlists=${row.watchlistsCount}, alerts=${alertCount}, resolved_to=${row.resolutionTarget}, aliases=${row.resolutionAliases}, owns=${row.ownershipLinks}, related=${row.relatedEntities}, resolution_group_size=${resolutionGroupSize}, resolution_group_aliases=${resolutionAliases}`,
  );
};

const fetchSingleEntityModifierState = async ({
  space,
  entityId,
}: {
  space: string;
  entityId: string;
}): Promise<{ criticality: string; watchlists: string[] }> => {
  const client = getEsClient();
  const entityIndex = `.entities.v2.latest.security_${space}`;
  try {
    const response = await client.search({
      index: entityIndex,
      size: 1,
      query: {
        term: {
          'entity.id': entityId,
        },
      },
      _source: ['asset.criticality', 'entity.attributes.watchlists'],
    });
    const source = response.hits.hits[0]?._source as
      | { asset?: { criticality?: string }; entity?: { attributes?: { watchlists?: unknown } } }
      | undefined;
    return {
      criticality: source?.asset?.criticality ?? '-',
      watchlists: normalizeWatchlists(source?.entity?.attributes?.watchlists),
    };
  } catch {
    return { criticality: '-', watchlists: [] };
  }
};

const fetchRiskDocsForEntityIds = async ({
  space,
  entityIds,
  maxDocsPerEntity,
}: {
  space: string;
  entityIds: string[];
  maxDocsPerEntity: number;
}): Promise<Map<string, RiskDocSummary[]>> => {
  const uniqueEntityIds = [...new Set(entityIds)];
  const grouped = new Map<string, RiskDocSummary[]>();
  if (uniqueEntityIds.length === 0) {
    return grouped;
  }

  const client = getEsClient();
  const riskIndex = `risk-score.risk-score-${space}`;
  const response = await client.search({
    index: riskIndex,
    size: Math.max(100, uniqueEntityIds.length * Math.max(1, maxDocsPerEntity) * 4),
    sort: [{ '@timestamp': { order: 'desc' } }],
    query: {
      bool: {
        should: [
          { terms: { 'host.name': uniqueEntityIds } },
          { terms: { 'user.name': uniqueEntityIds } },
          { terms: { 'service.name': uniqueEntityIds } },
        ],
        minimum_should_match: 1,
      },
    },
  });

  for (const hit of response.hits.hits) {
    const source = (hit._source ?? {}) as {
      '@timestamp'?: string;
      host?: { name?: string; risk?: Record<string, unknown> };
      user?: { name?: string; risk?: Record<string, unknown> };
      service?: { name?: string; risk?: Record<string, unknown> };
    };
    const entityId = source.host?.name ?? source.user?.name ?? source.service?.name;
    if (!entityId || !uniqueEntityIds.includes(entityId)) {
      continue;
    }
    const risk = source.host?.risk ?? source.user?.risk ?? source.service?.risk ?? {};
    const entries = grouped.get(entityId) ?? [];
    if (entries.length >= maxDocsPerEntity) {
      continue;
    }
    entries.push({
      entityId,
      timestamp: source['@timestamp'] ?? '-',
      score:
        typeof risk.calculated_score_norm === 'number'
          ? (risk.calculated_score_norm as number)
          : null,
      level: typeof risk.calculated_level === 'string' ? (risk.calculated_level as string) : '-',
      scoreType: typeof risk.score_type === 'string' ? (risk.score_type as string) : '-',
      calculationRunId:
        typeof risk.calculation_run_id === 'string' ? (risk.calculation_run_id as string) : '-',
      source: source as unknown as Record<string, unknown>,
    });
    grouped.set(entityId, entries);
  }
  return grouped;
};

const promptFollowOnAction = async ({
  phase2Enabled,
  resolutionEnabled,
  propagationEnabled,
}: {
  phase2Enabled: boolean;
  resolutionEnabled: boolean;
  propagationEnabled: boolean;
}): Promise<FollowOnAction> => {
  const optionsText = [
    `${ANSI.bold}Choose a follow-on action:${ANSI.reset}`,
    formatFollowOnOption('r', 'reset to zero (wipe seeded alerts, re-run maintainer)'),
    formatFollowOnOption('p', 'post more alerts (same seeded entities)'),
    formatFollowOnOption('m', 'remove modifiers (clear watchlists + criticality)'),
    formatFollowOnOption('a', 're-apply modifiers (new watchlists + criticality)'),
    formatFollowOnOption('e', 'expand entities (add more users/hosts/local-users/services)'),
    formatFollowOnOption('t', 'tweak single entity (criticality/watchlists/reset/add alerts)'),
    formatFollowOnOption('v', 'view single risk-score doc(s)'),
    formatFollowOnOption('j', 'explain resolution score for one target'),
    formatFollowOnOption('x', 'export risk-score docs to file'),
    formatFollowOnOption('f', 'refresh table (no data changes)'),
    formatFollowOnOption('u', 'run maintainer and refresh table'),
    ...(phase2Enabled
      ? [
          formatFollowOnOption('g', 'graph summary (resolution groups + ownership edges)'),
          ...(resolutionEnabled
            ? [
                formatFollowOnOption('l', 'link aliases to a resolution target'),
                formatFollowOnOption('k', 'unlink entities from resolution groups'),
              ]
            : []),
          ...(propagationEnabled
            ? [formatFollowOnOption('o', 'mutate ownership relationships')]
            : []),
          formatFollowOnOption('c', 'clear all relationships'),
          formatFollowOnOption('d', 'reapply default relationships'),
        ]
      : []),
    formatFollowOnOption('q', 'exit'),
  ].join('\n');

  while (true) {
    const answer = (
      await input({
        message: optionsText,
        default: 'q',
      })
    )
      .trim()
      .toLowerCase();

    if (answer === 'r') {
      log.info('Selected [r] reset to zero.');
      return 'reset_to_zero';
    }
    if (answer === 'p') {
      log.info('Selected [p] post more alerts.');
      return 'post_more_alerts';
    }
    if (answer === 'm') {
      log.info('Selected [m] remove modifiers.');
      return 'remove_modifiers';
    }
    if (answer === 'a') {
      log.info('Selected [a] re-apply modifiers.');
      return 'reapply_modifiers';
    }
    if (answer === 'e') {
      log.info('Selected [e] expand entities.');
      return 'add_more_entities';
    }
    if (answer === 't') {
      log.info('Selected [t] tweak single entity.');
      return 'tweak_single_entity';
    }
    if (answer === 'v') {
      log.info('Selected [v] view single risk-score doc(s).');
      return 'view_single_risk_doc';
    }
    if (answer === 'j') {
      log.info('Selected [j] explain resolution score.');
      return 'explain_resolution';
    }
    if (answer === 'x') {
      log.info('Selected [x] export risk-score docs to file.');
      return 'export_risk_docs';
    }
    if (answer === 'f') {
      log.info('Selected [f] refresh table (no data changes).');
      return 'refresh_table';
    }
    if (answer === 'u') {
      log.info('Selected [u] run maintainer and refresh table.');
      return 'run_maintainer_and_refresh';
    }
    if (answer === 'g') {
      log.info('Selected [g] graph summary.');
      return 'graph_summary';
    }
    if (answer === 'l') {
      log.info('Selected [l] link aliases.');
      return 'link_aliases';
    }
    if (answer === 'k') {
      log.info('Selected [k] unlink entities.');
      return 'unlink_entities';
    }
    if (answer === 'o') {
      log.info('Selected [o] ownership mutate.');
      return 'ownership_mutate';
    }
    if (answer === 'c') {
      log.info('Selected [c] clear relationships.');
      return 'clear_relationships';
    }
    if (answer === 'd') {
      log.info('Selected [d] reapply relationships.');
      return 'reapply_relationships';
    }
    if (answer === 'q') {
      log.info('Selected [q] exit.');
      return 'exit';
    }

    log.warn(
      `Invalid option "${answer}". Please enter one of: r, p, m, a, e, t, v, j, x, f, u, g, l, k, o, c, d, q.`,
    );
  }
};

const runFollowOnActionLoop = async ({
  space,
  entityIds,
  users,
  localUsers,
  hosts,
  services,
  watchlistIds,
  entityKinds,
  eventIndex,
  offsetHours,
  enableCriticality,
  enableWatchlists,
  alertsPerEntity,
  modifierBulkBatchSize,
  pageSize,
  phase2Enabled,
  resolutionEnabled,
  propagationEnabled,
  resolutionGroupRate,
  avgAliasesPerTarget,
  ownershipEdgeRate,
  relationshipGraph,
  debugResolution,
  runTimedStage,
}: {
  space: string;
  entityIds: string[];
  users: SeededUser[];
  localUsers: SeededLocalUser[];
  hosts: SeededHost[];
  services: SeededService[];
  watchlistIds: string[];
  entityKinds: EntityKind[];
  eventIndex: string;
  offsetHours: number;
  enableCriticality: boolean;
  enableWatchlists: boolean;
  alertsPerEntity: number;
  modifierBulkBatchSize: number;
  pageSize: number;
  phase2Enabled: boolean;
  resolutionEnabled: boolean;
  propagationEnabled: boolean;
  resolutionGroupRate: number;
  avgAliasesPerTarget: number;
  ownershipEdgeRate: number;
  relationshipGraph: RelationshipGraphState;
  debugResolution: boolean;
  runTimedStage: <T>(stage: string, fn: () => Promise<T>) => Promise<T>;
}) => {
  let trackedUsers = [...users];
  let trackedLocalUsers = [...localUsers];
  let trackedHosts = [...hosts];
  let trackedServices = [...services];
  let trackedWatchlistIds = [...watchlistIds];
  let trackedEntityIds = [...new Set(entityIds)];
  let lastChangedEntityIds: string[] = [];
  let trackedRelationshipGraph: RelationshipGraphState = {
    resolutionGroups: [...relationshipGraph.resolutionGroups],
    ownershipEdges: [...relationshipGraph.ownershipEdges],
  };

  while (true) {
    log.info(
      `Current entity pool: idp_users=${trackedUsers.length}, local_users=${trackedLocalUsers.length}, hosts=${trackedHosts.length}, services=${trackedServices.length}, total=${trackedEntityIds.length}`,
    );
    const action = await promptFollowOnAction({
      phase2Enabled,
      resolutionEnabled,
      propagationEnabled,
    });

    if (action === 'exit') {
      log.info('Exiting follow-on action loop.');
      return;
    }

    const before = await collectRiskSnapshot({ space, entityIds: trackedEntityIds });
    log.info(`Captured baseline snapshot for action "${action}".`);

    if (action === 'reset_to_zero') {
      await runTimedStage('follow_on_reset_delete_alerts', async () =>
        deleteAlertsForSeededEntities({
          space,
          users: trackedUsers,
          localUsers: trackedLocalUsers,
          hosts: trackedHosts,
          services: trackedServices,
        }),
      );
      const maintainerOutcome = await runRiskMaintainerOnce({
        space,
        runTimedStage,
        stage: 'follow_on_reset_run_maintainer',
      });
      log.info(
        `Maintainer outcome: runs=${maintainerOutcome.runs}, taskStatus=${maintainerOutcome.taskStatus}, settled=${maintainerOutcome.settled ? 'yes' : 'no'}.`,
      );
    } else if (action === 'post_more_alerts') {
      const extraAlertsRaw = await input({
        message: 'Additional alerts per entity',
        default: String(alertsPerEntity),
      });
      const extraAlerts = Math.max(1, parseOptionInt(extraAlertsRaw, alertsPerEntity));
      await runTimedStage('follow_on_post_alerts', async () =>
        indexAlertsForSeededEntities({
          users: trackedUsers,
          localUsers: trackedLocalUsers,
          hosts: trackedHosts,
          services: trackedServices,
          alertsPerEntity: extraAlerts,
          space,
        }),
      );
      const maintainerOutcome = await runRiskMaintainerOnce({
        space,
        runTimedStage,
        stage: 'follow_on_post_alerts_run_maintainer',
      });
      log.info(
        `Maintainer outcome: runs=${maintainerOutcome.runs}, taskStatus=${maintainerOutcome.taskStatus}, settled=${maintainerOutcome.settled ? 'yes' : 'no'}.`,
      );
    } else if (action === 'remove_modifiers') {
      await runTimedStage('follow_on_remove_modifiers', async () =>
        clearEntityModifiers({
          entityIds: trackedEntityIds,
          space,
          batchSize: modifierBulkBatchSize,
        }),
      );
      const maintainerOutcome = await runRiskMaintainerOnce({
        space,
        runTimedStage,
        stage: 'follow_on_remove_modifiers_run_maintainer',
      });
      log.info(
        `Maintainer outcome: runs=${maintainerOutcome.runs}, taskStatus=${maintainerOutcome.taskStatus}, settled=${maintainerOutcome.settled ? 'yes' : 'no'}.`,
      );
    } else if (action === 'reapply_modifiers') {
      await runTimedStage('follow_on_reapply_modifiers', async () => {
        const watchlists = await createWatchlistsForRun(space);
        trackedWatchlistIds = watchlists.map((w) => w.id);
        const reassignments = buildEntityModifierAssignments({
          entityIds: trackedEntityIds,
          watchlistIds: trackedWatchlistIds,
          applyCriticality: true,
        });
        await applyEntityModifiers({
          assignments: reassignments,
          totalEntities: trackedEntityIds.length,
          space,
          batchSize: modifierBulkBatchSize,
        });
      });
      const maintainerOutcome = await runRiskMaintainerOnce({
        space,
        runTimedStage,
        stage: 'follow_on_reapply_modifiers_run_maintainer',
      });
      log.info(
        `Maintainer outcome: runs=${maintainerOutcome.runs}, taskStatus=${maintainerOutcome.taskStatus}, settled=${maintainerOutcome.settled ? 'yes' : 'no'}.`,
      );
    } else if (action === 'add_more_entities') {
      const [addUsersRaw, addLocalUsersRaw, addHostsRaw, addServicesRaw, addAlertsRaw] =
        await Promise.all([
          input({ message: 'Add IdP users', default: '0' }),
          input({ message: 'Add local users', default: '0' }),
          input({ message: 'Add hosts', default: '0' }),
          input({ message: 'Add services', default: '0' }),
          input({ message: 'Alerts per NEW entity', default: String(alertsPerEntity) }),
        ]);

      const addUsers = Math.max(0, parseOptionInt(addUsersRaw, 0));
      const addLocalUsers = Math.max(0, parseOptionInt(addLocalUsersRaw, 0));
      const addHosts = Math.max(0, parseOptionInt(addHostsRaw, 0));
      const addServices = Math.max(0, parseOptionInt(addServicesRaw, 0));
      const addAlertsPerEntity = Math.max(1, parseOptionInt(addAlertsRaw, alertsPerEntity));

      if (addUsers + addLocalUsers + addHosts + addServices === 0) {
        log.info('No additional entities requested. Skipping expansion action.');
      } else {
        const newUsers = seedUsers(addUsers, trackedUsers.length);
        const newHosts = seedHosts(addHosts, trackedHosts.length);
        const hostPool = [...trackedHosts, ...newHosts];
        const newLocalUsers = seedLocalUsers(
          addLocalUsers,
          hostPool.length > 0 ? hostPool : seedHosts(1),
          trackedLocalUsers.length,
        );
        const newServices = seedServices(addServices, trackedServices.length);

        const newEntityIds = getAllEntityIds({
          users: newUsers,
          localUsers: newLocalUsers,
          hosts: newHosts,
          services: newServices,
        });
        const expectedNewEntityIds = newEntityIds.filter((id) => !trackedEntityIds.includes(id));

        const addedKinds: EntityKind[] = [];
        if (addUsers > 0) addedKinds.push('idp_user');
        if (addLocalUsers > 0) addedKinds.push('local_user');
        if (addHosts > 0) addedKinds.push('host');
        if (addServices > 0) addedKinds.push('service');
        const extractionKinds = addedKinds.length > 0 ? addedKinds : entityKinds;

        await runTimedStage('follow_on_expand_source_ingest', async () => {
          const sourceIngestAction = await ensureEventTarget(eventIndex);
          const userEvents = buildUserEvents(newUsers, offsetHours);
          const hostEvents = buildHostEvents(newHosts, offsetHours);
          const localUserEvents = buildLocalUserEvents(newLocalUsers, offsetHours);
          const serviceEvents = buildServiceEvents(newServices, offsetHours);
          const docs = [...userEvents, ...hostEvents, ...localUserEvents, ...serviceEvents];
          log.info(
            `Ingesting ${docs.length} expansion source events into "${eventIndex}" (bulk action=${sourceIngestAction})...`,
          );
          await bulkIngest({
            index: eventIndex,
            documents: docs,
            action: sourceIngestAction,
          });
        });

        await runTimedStage('follow_on_expand_extract_entities', async () =>
          forceExtractExpectedEntities({
            space,
            entityKinds: extractionKinds,
            expectedEntityIds: expectedNewEntityIds,
            offsetHours,
          }),
        );

        if ((enableCriticality || enableWatchlists) && expectedNewEntityIds.length > 0) {
          await runTimedStage('follow_on_expand_apply_modifiers', async () => {
            if (enableWatchlists && trackedWatchlistIds.length === 0) {
              const created = await createWatchlistsForRun(space);
              trackedWatchlistIds = created.map((w) => w.id);
            }
            const modifierEntityIds = expectedNewEntityIds.filter(
              (entityId) => toModifierEntityType(entityId) !== null,
            );
            const assignments = buildEntityModifierAssignments({
              entityIds: modifierEntityIds,
              watchlistIds: enableWatchlists ? trackedWatchlistIds : [],
              applyCriticality: enableCriticality,
            });
            await applyEntityModifiers({
              assignments,
              totalEntities: trackedEntityIds.length + expectedNewEntityIds.length,
              space,
              batchSize: modifierBulkBatchSize,
            });
          });
        }

        if (phase2Enabled && expectedNewEntityIds.length > 0) {
          await runTimedStage('follow_on_expand_apply_relationships', async () => {
            const expandedGraph = buildRelationshipGraph({
              entityIds: [...trackedEntityIds, ...expectedNewEntityIds],
              enableResolution: resolutionEnabled,
              enablePropagation: propagationEnabled,
              resolutionGroupRate,
              avgAliasesPerTarget,
              ownershipEdgeRate,
            });
            await clearRelationshipGraph({
              entityIds: [...trackedEntityIds, ...expectedNewEntityIds],
              space,
            });
            await applyRelationshipGraph({ graph: expandedGraph, space });
            trackedRelationshipGraph = expandedGraph;
            if (debugResolution) {
              await waitForEntityRelationshipState({
                space,
                entityIds: [...trackedEntityIds, ...expectedNewEntityIds],
                graph: trackedRelationshipGraph,
                context: 'follow_on_expand_apply',
              });
            }
          });
        }

        await runTimedStage('follow_on_expand_alerts', async () =>
          indexAlertsForSeededEntities({
            users: newUsers,
            localUsers: newLocalUsers,
            hosts: newHosts,
            services: newServices,
            alertsPerEntity: addAlertsPerEntity,
            space,
          }),
        );

        trackedUsers = [...trackedUsers, ...newUsers];
        trackedHosts = [...trackedHosts, ...newHosts];
        trackedLocalUsers = [...trackedLocalUsers, ...newLocalUsers];
        trackedServices = [...trackedServices, ...newServices];
        trackedEntityIds = [...new Set([...trackedEntityIds, ...newEntityIds])];

        const maintainerOutcome = await runRiskMaintainerOnce({
          space,
          runTimedStage,
          stage: 'follow_on_expand_run_maintainer',
        });
        log.info(
          `Maintainer outcome: runs=${maintainerOutcome.runs}, taskStatus=${maintainerOutcome.taskStatus}, settled=${maintainerOutcome.settled ? 'yes' : 'no'}.`,
        );
      }
    } else if (action === 'tweak_single_entity') {
      const entityIdInput = await input({
        message: 'Entity ID to tweak (exact match)',
        default: trackedEntityIds[0] ?? '',
      });
      const selectedEntityId = entityIdInput.trim();
      const selection = resolveTrackedEntitySelection({
        entityId: selectedEntityId,
        users: trackedUsers,
        localUsers: trackedLocalUsers,
        hosts: trackedHosts,
        services: trackedServices,
      });
      if (!selection) {
        log.warn(`Entity "${selectedEntityId}" is not in the tracked entity pool.`);
      } else {
        await printSingleEntityState({ space, selection });
        const modifierState = await fetchSingleEntityModifierState({
          space,
          entityId: selection.euid,
        });

        const tweakActionRaw = await input({
          message:
            'Single-entity action: [c] criticality, [w] watchlists, [z] reset alerts->zero, [l] add alerts, [y] set resolution target, [h] set ownership target',
          default: 'c',
        });
        const tweakAction = tweakActionRaw.trim().toLowerCase();

        if (tweakAction === 'c') {
          const currentCriticality = modifierState.criticality;
          const selectedCriticality = await select({
            message: `Select criticality (current: ${currentCriticality})`,
            choices: [
              { name: `Keep current (${currentCriticality})`, value: '__keep__' },
              { name: 'None (clear criticality)', value: '__none__' },
              ...CRITICALITY_LEVELS.map((level) => ({
                name: `${level}${level === currentCriticality ? ' (current)' : ''}`,
                value: level,
              })),
            ],
            default: '__keep__',
          });

          if (selectedCriticality === '__keep__') {
            log.info('Criticality unchanged.');
          } else {
            const entityType = toModifierEntityType(selection.euid);
            if (!entityType) {
              log.warn(`Entity type for "${selection.euid}" does not support modifier updates.`);
            } else {
              const criticality: CriticalityLevel | null =
                selectedCriticality === '__none__'
                  ? null
                  : (selectedCriticality as CriticalityLevel);
              await runTimedStage('follow_on_tweak_criticality', async () => {
                await forceBulkUpdateEntitiesViaCrud({
                  entities: [
                    {
                      type: entityType,
                      doc: {
                        entity: { id: selection.euid },
                        asset: { criticality },
                      },
                    },
                  ],
                  space,
                });
              });
              const maintainerOutcome = await runRiskMaintainerOnce({
                space,
                runTimedStage,
                stage: 'follow_on_tweak_criticality_run_maintainer',
              });
              log.info(
                `Maintainer outcome: runs=${maintainerOutcome.runs}, taskStatus=${maintainerOutcome.taskStatus}, settled=${maintainerOutcome.settled ? 'yes' : 'no'}.`,
              );
            }
          }
        } else if (tweakAction === 'w') {
          if (trackedWatchlistIds.length === 0) {
            const created = await createWatchlistsForRun(space);
            trackedWatchlistIds = created.map((w) => w.id);
            log.info(`No existing watchlists; created ${trackedWatchlistIds.length} for tweaking.`);
          }
          const currentWatchlists = modifierState.watchlists;
          const availableWatchlistIds = [
            ...new Set([...trackedWatchlistIds, ...currentWatchlists]),
          ];
          const selectedWatchlists = await checkbox({
            message: `Select watchlists (current: ${currentWatchlists.length ? currentWatchlists.join(', ') : 'none'})`,
            choices: availableWatchlistIds.map((id) => ({
              name: `${id}${currentWatchlists.includes(id) ? ' (current)' : ''}`,
              value: id,
              checked: currentWatchlists.includes(id),
            })),
          });

          const nextWatchlists = selectedWatchlists;
          const entityType = toModifierEntityType(selection.euid);
          if (!entityType) {
            log.warn(`Entity type for "${selection.euid}" does not support modifier updates.`);
          } else {
            await runTimedStage('follow_on_tweak_watchlists', async () => {
              await forceBulkUpdateEntitiesViaCrud({
                entities: [
                  {
                    type: entityType,
                    doc: {
                      entity: {
                        id: selection.euid,
                        attributes: { watchlists: nextWatchlists },
                      },
                    },
                  },
                ],
                space,
              });
            });
            const maintainerOutcome = await runRiskMaintainerOnce({
              space,
              runTimedStage,
              stage: 'follow_on_tweak_watchlists_run_maintainer',
            });
            log.info(
              `Maintainer outcome: runs=${maintainerOutcome.runs}, taskStatus=${maintainerOutcome.taskStatus}, settled=${maintainerOutcome.settled ? 'yes' : 'no'}.`,
            );
          }
        } else if (tweakAction === 'z') {
          await runTimedStage('follow_on_tweak_single_reset_delete_alerts', async () =>
            deleteAlertsForSelection({ space, selection }),
          );
          const maintainerOutcome = await runRiskMaintainerOnce({
            space,
            runTimedStage,
            stage: 'follow_on_tweak_single_reset_run_maintainer',
          });
          log.info(
            `Maintainer outcome: runs=${maintainerOutcome.runs}, taskStatus=${maintainerOutcome.taskStatus}, settled=${maintainerOutcome.settled ? 'yes' : 'no'}.`,
          );
        } else if (tweakAction === 'l') {
          const extraAlertsRaw = await input({
            message: 'Additional alerts for this entity',
            default: '5',
          });
          const extraAlerts = Math.max(1, parseOptionInt(extraAlertsRaw, 5));
          await runTimedStage('follow_on_tweak_single_add_alerts', async () => {
            await indexAlertsForSeededEntities({
              users: selection.kind === 'idp_user' ? [selection.user] : [],
              localUsers: selection.kind === 'local_user' ? [selection.user] : [],
              hosts: selection.kind === 'host' ? [selection.host] : [],
              services: selection.kind === 'service' ? [selection.service] : [],
              alertsPerEntity: extraAlerts,
              space,
            });
          });
          const maintainerOutcome = await runRiskMaintainerOnce({
            space,
            runTimedStage,
            stage: 'follow_on_tweak_single_add_alerts_run_maintainer',
          });
          log.info(
            `Maintainer outcome: runs=${maintainerOutcome.runs}, taskStatus=${maintainerOutcome.taskStatus}, settled=${maintainerOutcome.settled ? 'yes' : 'no'}.`,
          );
        } else if (tweakAction === 'y') {
          const targetId = (
            await input({
              message: 'Resolution target entity ID (blank to clear resolution link)',
              default: '',
            })
          ).trim();
          await runTimedStage('follow_on_tweak_single_resolution', async () => {
            await unlinkResolutionEntities({ entityIds: [selection.euid], space });
            if (targetId && targetId !== selection.euid) {
              await linkResolutionEntities({
                targetId,
                entityIds: [selection.euid],
                space,
              });
            }
          });
          trackedRelationshipGraph.resolutionGroups = trackedRelationshipGraph.resolutionGroups
            .map((group) => ({
              targetId: group.targetId,
              aliasIds: group.aliasIds.filter((aliasId) => aliasId !== selection.euid),
            }))
            .filter((group) => group.aliasIds.length > 0);
          if (targetId && targetId !== selection.euid) {
            const existingGroup = trackedRelationshipGraph.resolutionGroups.find(
              (group) => group.targetId === targetId,
            );
            if (existingGroup) {
              existingGroup.aliasIds = [...new Set([...existingGroup.aliasIds, selection.euid])];
            } else {
              trackedRelationshipGraph.resolutionGroups.push({
                targetId,
                aliasIds: [selection.euid],
              });
            }
          }
          if (debugResolution) {
            await waitForEntityRelationshipState({
              space,
              entityIds: trackedEntityIds,
              graph: trackedRelationshipGraph,
              context: 'follow_on_tweak_resolution',
            });
          }
          const maintainerOutcome = await runRiskMaintainerOnce({
            space,
            runTimedStage,
            stage: 'follow_on_tweak_single_resolution_run_maintainer',
          });
          log.info(
            `Maintainer outcome: runs=${maintainerOutcome.runs}, taskStatus=${maintainerOutcome.taskStatus}, settled=${maintainerOutcome.settled ? 'yes' : 'no'}.`,
          );
        } else if (tweakAction === 'h') {
          const targetId = (
            await input({
              message: 'Ownership target entity ID (blank to clear ownership links)',
              default: '',
            })
          ).trim();
          const entityType = toModifierEntityType(selection.euid);
          if (!entityType) {
            log.warn(`Entity type for "${selection.euid}" does not support relationship updates.`);
          } else {
            await runTimedStage('follow_on_tweak_single_ownership', async () => {
              await forceBulkUpdateEntitiesViaCrud({
                entities: [
                  {
                    type: entityType,
                    doc: {
                      entity: {
                        id: selection.euid,
                        relationships: {
                          owns: targetId ? [targetId] : [],
                        },
                      },
                    },
                  },
                ],
                space,
              });
            });
            trackedRelationshipGraph.ownershipEdges =
              trackedRelationshipGraph.ownershipEdges.filter(
                (edge) => edge.sourceId !== selection.euid,
              );
            if (targetId) {
              trackedRelationshipGraph.ownershipEdges.push({
                sourceId: selection.euid,
                targetId,
              });
            }
            if (debugResolution) {
              await waitForEntityRelationshipState({
                space,
                entityIds: trackedEntityIds,
                graph: trackedRelationshipGraph,
                context: 'follow_on_tweak_ownership',
              });
            }
            const maintainerOutcome = await runRiskMaintainerOnce({
              space,
              runTimedStage,
              stage: 'follow_on_tweak_single_ownership_run_maintainer',
            });
            log.info(
              `Maintainer outcome: runs=${maintainerOutcome.runs}, taskStatus=${maintainerOutcome.taskStatus}, settled=${maintainerOutcome.settled ? 'yes' : 'no'}.`,
            );
          }
        } else {
          log.warn(`Invalid single-entity action "${tweakAction}". No changes applied.`);
        }
      }
    } else if (action === 'view_single_risk_doc') {
      const entityIdInput = await input({
        message: 'Entity ID to inspect',
        default: trackedEntityIds[0] ?? '',
      });
      const selectedEntityId = entityIdInput.trim();
      if (!selectedEntityId) {
        log.warn('No entity ID provided.');
      } else {
        const docCountRaw = await input({
          message: 'Latest docs to show',
          default: '1',
        });
        const docCount = Math.max(1, parseOptionInt(docCountRaw, 1));
        const docsByEntity = await fetchRiskDocsForEntityIds({
          space,
          entityIds: [selectedEntityId],
          maxDocsPerEntity: docCount,
        });
        const docs = docsByEntity.get(selectedEntityId) ?? [];
        if (docs.length === 0) {
          log.warn(`No risk score docs found for "${selectedEntityId}".`);
        } else {
          // eslint-disable-next-line no-console
          console.log(colorize(`🔍 Risk docs for ${selectedEntityId}`, 'cyan'));
          docs.forEach((doc, idx) => {
            // eslint-disable-next-line no-console
            console.log(
              `  [${idx + 1}] ts=${doc.timestamp} score=${doc.score ?? '-'} level=${doc.level} score_type=${doc.scoreType} run_id=${doc.calculationRunId}`,
            );
          });
          const showFullRaw = await input({
            message: 'Show full source JSON? [y/N]',
            default: 'n',
          });
          if (showFullRaw.trim().toLowerCase() === 'y') {
            for (const doc of docs) {
              // eslint-disable-next-line no-console
              console.log(JSON.stringify(doc.source, null, 2));
            }
          }
        }
      }
    } else if (action === 'explain_resolution') {
      const resolutionRowsForSelection = before.resolutionRows;
      const targetIdInput = await input({
        message: 'Resolution target (row #, full ID, or prefix)',
        default:
          resolutionRowsForSelection.length > 0
            ? resolutionRowsForSelection[0].targetEntityId
            : (trackedEntityIds[0] ?? ''),
      });
      const targetId =
        resolveResolutionTargetFromInput({
          inputValue: targetIdInput,
          rows: resolutionRowsForSelection,
        }) ?? targetIdInput.trim();
      if (!targetId) {
        log.warn('No target entity ID provided.');
      } else {
        const docsByEntity = await fetchRiskDocsForEntityIds({
          space,
          entityIds: [targetId],
          maxDocsPerEntity: 20,
        });
        const resolutionDocs = (docsByEntity.get(targetId) ?? []).filter(
          (doc) => doc.scoreType === 'resolution',
        );
        if (resolutionDocs.length === 0) {
          log.warn(`No resolution score docs found for "${targetId}".`);
          if (resolutionRowsForSelection.length > 0) {
            log.info(
              `Try one of the visible row numbers (1-${resolutionRowsForSelection.length}) from the resolution scorecard.`,
            );
          }
        } else {
          const latest = resolutionDocs[0];
          const riskSource = ((latest.source.user as Record<string, unknown>)?.risk ??
            (latest.source.host as Record<string, unknown>)?.risk ??
            (latest.source.service as Record<string, unknown>)?.risk ??
            {}) as Record<string, unknown>;
          const relatedEntities = Array.isArray(riskSource.related_entities)
            ? (riskSource.related_entities as unknown[])
            : [];
          const relatedIds = relatedEntities
            .map((item) => {
              if (typeof item === 'string') return item;
              if (item && typeof item === 'object') {
                const rec = item as Record<string, unknown>;
                if (typeof rec.id === 'string') return rec.id;
                if (typeof rec.entity_id === 'string') return rec.entity_id;
                if (typeof rec.name === 'string') return rec.name;
              }
              return null;
            })
            .filter((item): item is string => item !== null);
          const resolutionKey = buildResolutionKey({
            targetEntityId: targetId,
            calculationRunId: latest.calculationRunId,
          });
          // eslint-disable-next-line no-console
          console.log(colorize(`🧠 Resolution explain for ${targetId}`, 'cyan'));
          // eslint-disable-next-line no-console
          console.log(
            `  key=${resolutionKey} score=${latest.score ?? '-'} level=${latest.level} run_id=${latest.calculationRunId} related_count=${relatedEntities.length}`,
          );
          // eslint-disable-next-line no-console
          console.log(`  related_entities: ${summarizeList(relatedIds, 12)}`);
        }
      }
    } else if (action === 'export_risk_docs') {
      const scopeRaw = await input({
        message: 'Export scope: [t] tracked entities, [c] changed entities',
        default: 't',
      });
      const scope = scopeRaw.trim().toLowerCase();
      const targetEntityIds =
        scope === 'c' && lastChangedEntityIds.length > 0 ? lastChangedEntityIds : trackedEntityIds;
      if (scope === 'c' && lastChangedEntityIds.length === 0) {
        log.warn('No changed entities available yet; falling back to tracked entities.');
      }
      const docsPerEntityRaw = await input({
        message: 'Max docs per entity',
        default: '1',
      });
      const docsPerEntity = Math.max(1, parseOptionInt(docsPerEntityRaw, 1));
      const formatRaw = await input({
        message: 'Format: [n] ndjson, [j] json',
        default: 'n',
      });
      const format = formatRaw.trim().toLowerCase() === 'j' ? 'json' : 'ndjson';
      const includeRelRaw = await input({
        message: 'Include relationship context from entity docs? [y/N]',
        default: 'n',
      });
      const includeRelationshipContext = includeRelRaw.trim().toLowerCase() === 'y';
      const outDirRaw = await input({
        message: 'Output directory',
        default: 'tmp/risk-score-v2/exports',
      });
      const outDir = outDirRaw.trim() || 'tmp/risk-score-v2/exports';

      const docsByEntity = await fetchRiskDocsForEntityIds({
        space,
        entityIds: targetEntityIds,
        maxDocsPerEntity: docsPerEntity,
      });
      const records = [...docsByEntity.entries()].flatMap(([entityId, docs]) =>
        docs.map((doc, idx) => ({
          entity_id: entityId,
          doc_index: idx + 1,
          timestamp: doc.timestamp,
          score: doc.score,
          level: doc.level,
          score_type: doc.scoreType,
          resolution_key:
            doc.scoreType === 'resolution'
              ? buildResolutionKey({
                  targetEntityId: entityId,
                  calculationRunId: doc.calculationRunId,
                })
              : null,
          calculation_run_id: doc.calculationRunId,
          source: doc.source,
        })),
      );
      if (includeRelationshipContext && records.length > 0) {
        const snapshot = await collectRiskSnapshot({ space, entityIds: targetEntityIds });
        const rowById = new Map(snapshot.rows.map((row) => [row.id, row]));
        for (const record of records) {
          const row = rowById.get(record.entity_id);
          if (!row) continue;
          Object.assign(record, {
            relationship_context: {
              resolution_target: row.resolutionTarget,
              resolution_aliases: row.resolutionAliases,
              ownership_links: row.ownershipLinks,
              related_entities: row.relatedEntities,
              resolution_key:
                record.score_type === 'resolution'
                  ? buildResolutionKey({
                      targetEntityId: record.entity_id,
                      calculationRunId: record.calculation_run_id,
                    })
                  : null,
            },
          });
        }
      }

      await fs.mkdir(outDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filePath = path.resolve(
        outDir,
        `risk-docs-${space}-${timestamp}.${format === 'json' ? 'json' : 'ndjson'}`,
      );
      const payload =
        format === 'json'
          ? `${JSON.stringify(records, null, 2)}\n`
          : `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
      await fs.writeFile(filePath, payload, 'utf8');
      log.info(
        `Exported ${records.length} risk doc(s) for ${docsByEntity.size} entity(ies) to ${filePath}`,
      );
    } else if (action === 'run_maintainer_and_refresh') {
      const maintainerOutcome = await runRiskMaintainerOnce({
        space,
        runTimedStage,
        stage: 'follow_on_run_maintainer_and_refresh',
      });
      log.info(
        `Maintainer outcome: runs=${maintainerOutcome.runs}, taskStatus=${maintainerOutcome.taskStatus}, settled=${maintainerOutcome.settled ? 'yes' : 'no'}.`,
      );
    } else if (action === 'refresh_table') {
      log.info('Refreshing summary table without mutating alerts, modifiers, or entities.');
    } else if (action === 'graph_summary') {
      if (!phase2Enabled) {
        log.warn('Phase2 graph actions are disabled. Re-run with --phase2.');
      } else {
        const sampledIds = trackedEntityIds.slice(0, 3);
        const sampledGroups = await Promise.all(
          sampledIds.map(async (entityId) => {
            try {
              const group = await getResolutionGroup({ entityId, space });
              return `${entityId}:${group.group_size}`;
            } catch {
              return `${entityId}:n/a`;
            }
          }),
        );
        log.info(
          `Graph summary: resolution_groups=${trackedRelationshipGraph.resolutionGroups.length}, ownership_edges=${trackedRelationshipGraph.ownershipEdges.length}, sample_group_sizes=[${sampledGroups.join(', ')}]`,
        );
        printGraphSummaryViews({ graph: trackedRelationshipGraph, maxRows: pageSize });
      }
    } else if (action === 'link_aliases') {
      if (!phase2Enabled || !resolutionEnabled) {
        log.warn('Resolution linking is disabled. Re-run with --phase2 --resolution.');
      } else if (trackedEntityIds.length < 2) {
        log.warn('Not enough tracked entities to create resolution links.');
      } else {
        const targetId = (
          await input({
            message: 'Resolution target entity ID',
            default: trackedEntityIds[0] ?? '',
          })
        ).trim();
        const aliasCsv = await input({
          message: 'Alias entity IDs (comma-separated)',
          default: trackedEntityIds.slice(1, 3).join(','),
        });
        const aliasIds = [
          ...new Set(
            aliasCsv
              .split(',')
              .map((id) => id.trim())
              .filter(Boolean),
          ),
        ].filter((id) => id !== targetId);
        if (!targetId || aliasIds.length === 0) {
          log.warn('Target and at least one alias are required.');
        } else {
          await runTimedStage('follow_on_link_aliases', async () => {
            for (const ids of chunk(aliasIds, 1000)) {
              const response = await linkResolutionEntities({ targetId, entityIds: ids, space });
              log.info(
                `Resolution link: target=${targetId}, linked=${response.linked.length}, skipped=${response.skipped.length}`,
              );
            }
          });
          trackedRelationshipGraph.resolutionGroups.push({ targetId, aliasIds });
          if (debugResolution) {
            await waitForEntityRelationshipState({
              space,
              entityIds: trackedEntityIds,
              graph: trackedRelationshipGraph,
              context: 'follow_on_link_aliases',
            });
          }
          const maintainerOutcome = await runRiskMaintainerOnce({
            space,
            runTimedStage,
            stage: 'follow_on_link_aliases_run_maintainer',
          });
          log.info(
            `Maintainer outcome: runs=${maintainerOutcome.runs}, taskStatus=${maintainerOutcome.taskStatus}, settled=${maintainerOutcome.settled ? 'yes' : 'no'}.`,
          );
        }
      }
    } else if (action === 'unlink_entities') {
      if (!phase2Enabled || !resolutionEnabled) {
        log.warn('Resolution unlink is disabled. Re-run with --phase2 --resolution.');
      } else {
        const entityIdsRaw = await input({
          message: 'Entity IDs to unlink (comma-separated)',
          default: trackedEntityIds.slice(0, 2).join(','),
        });
        const entityIdsToUnlink = [
          ...new Set(
            entityIdsRaw
              .split(',')
              .map((id) => id.trim())
              .filter(Boolean),
          ),
        ];
        if (entityIdsToUnlink.length === 0) {
          log.warn('No entity IDs provided for unlink.');
        } else {
          await runTimedStage('follow_on_unlink_entities', async () => {
            for (const ids of chunk(entityIdsToUnlink, 1000)) {
              const response = await unlinkResolutionEntities({ entityIds: ids, space });
              log.info(
                `Resolution unlink: unlinked=${response.unlinked.length}, skipped=${response.skipped.length}`,
              );
            }
          });
          trackedRelationshipGraph.resolutionGroups = trackedRelationshipGraph.resolutionGroups.map(
            (group) => ({
              targetId: group.targetId,
              aliasIds: group.aliasIds.filter((aliasId) => !entityIdsToUnlink.includes(aliasId)),
            }),
          );
          if (debugResolution) {
            await waitForEntityRelationshipState({
              space,
              entityIds: trackedEntityIds,
              graph: trackedRelationshipGraph,
              context: 'follow_on_unlink_entities',
            });
          }
          const maintainerOutcome = await runRiskMaintainerOnce({
            space,
            runTimedStage,
            stage: 'follow_on_unlink_entities_run_maintainer',
          });
          log.info(
            `Maintainer outcome: runs=${maintainerOutcome.runs}, taskStatus=${maintainerOutcome.taskStatus}, settled=${maintainerOutcome.settled ? 'yes' : 'no'}.`,
          );
        }
      }
    } else if (action === 'ownership_mutate') {
      if (!phase2Enabled || !propagationEnabled) {
        log.warn('Ownership mutation is disabled. Re-run with --phase2 --propagation.');
      } else {
        const sourceId = (
          await input({
            message: 'Ownership source entity ID (host/service recommended)',
            default: trackedHosts[0] ? toHostEuid(trackedHosts[0]) : (trackedEntityIds[0] ?? ''),
          })
        ).trim();
        const targetId = (
          await input({
            message: 'Ownership target entity ID',
            default: trackedUsers[0] ? toUserEuid(trackedUsers[0]) : (trackedEntityIds[0] ?? ''),
          })
        ).trim();
        const sourceType = toModifierEntityType(sourceId);
        if (!sourceId || !targetId || !sourceType) {
          log.warn('Valid source and target IDs are required for ownership mutation.');
        } else {
          await runTimedStage('follow_on_ownership_mutate', async () => {
            await forceBulkUpdateEntitiesViaCrud({
              entities: [
                {
                  type: sourceType,
                  doc: {
                    entity: {
                      id: sourceId,
                      relationships: {
                        owns: [targetId],
                      },
                    },
                  },
                },
              ],
              space,
            });
          });
          trackedRelationshipGraph.ownershipEdges = trackedRelationshipGraph.ownershipEdges.filter(
            (edge) => edge.sourceId !== sourceId,
          );
          trackedRelationshipGraph.ownershipEdges.push({ sourceId, targetId });
          if (debugResolution) {
            await waitForEntityRelationshipState({
              space,
              entityIds: trackedEntityIds,
              graph: trackedRelationshipGraph,
              context: 'follow_on_ownership_mutate',
            });
          }
          const maintainerOutcome = await runRiskMaintainerOnce({
            space,
            runTimedStage,
            stage: 'follow_on_ownership_mutate_run_maintainer',
          });
          log.info(
            `Maintainer outcome: runs=${maintainerOutcome.runs}, taskStatus=${maintainerOutcome.taskStatus}, settled=${maintainerOutcome.settled ? 'yes' : 'no'}.`,
          );
        }
      }
    } else if (action === 'clear_relationships') {
      if (!phase2Enabled) {
        log.warn('Relationship operations are disabled. Re-run with --phase2.');
      } else {
        await runTimedStage('follow_on_clear_relationships', async () =>
          clearRelationshipGraph({ entityIds: trackedEntityIds, space }),
        );
        trackedRelationshipGraph = { resolutionGroups: [], ownershipEdges: [] };
        if (debugResolution) {
          await waitForEntityRelationshipState({
            space,
            entityIds: trackedEntityIds,
            graph: trackedRelationshipGraph,
            context: 'follow_on_clear_relationships',
          });
        }
        const maintainerOutcome = await runRiskMaintainerOnce({
          space,
          runTimedStage,
          stage: 'follow_on_clear_relationships_run_maintainer',
        });
        log.info(
          `Maintainer outcome: runs=${maintainerOutcome.runs}, taskStatus=${maintainerOutcome.taskStatus}, settled=${maintainerOutcome.settled ? 'yes' : 'no'}.`,
        );
      }
    } else if (action === 'reapply_relationships') {
      if (!phase2Enabled) {
        log.warn('Relationship operations are disabled. Re-run with --phase2.');
      } else {
        const rebuiltGraph = buildRelationshipGraph({
          entityIds: trackedEntityIds,
          enableResolution: resolutionEnabled,
          enablePropagation: propagationEnabled,
          resolutionGroupRate,
          avgAliasesPerTarget,
          ownershipEdgeRate,
        });
        await runTimedStage('follow_on_reapply_relationships', async () => {
          await clearRelationshipGraph({ entityIds: trackedEntityIds, space });
          await applyRelationshipGraph({ graph: rebuiltGraph, space });
        });
        trackedRelationshipGraph = rebuiltGraph;
        if (debugResolution) {
          await waitForEntityRelationshipState({
            space,
            entityIds: trackedEntityIds,
            graph: trackedRelationshipGraph,
            context: 'follow_on_reapply_relationships',
          });
        }
        const maintainerOutcome = await runRiskMaintainerOnce({
          space,
          runTimedStage,
          stage: 'follow_on_reapply_relationships_run_maintainer',
        });
        log.info(
          `Maintainer outcome: runs=${maintainerOutcome.runs}, taskStatus=${maintainerOutcome.taskStatus}, settled=${maintainerOutcome.settled ? 'yes' : 'no'}.`,
        );
      }
    }

    const after = await collectRiskSnapshot({ space, entityIds: trackedEntityIds });
    const trackedGraphStats = getRelationshipGraphStats(trackedRelationshipGraph);
    if (phase2Enabled && trackedGraphStats.resolutionEdgeCount === 0) {
      log.warn(
        'Resolution scoring will be empty because current graph has zero resolution edges; use [d] reapply relationships.',
      );
    }
    if (
      phase2Enabled &&
      trackedGraphStats.resolutionTargetCount > 0 &&
      after.resolutionRows.length === 0
    ) {
      log.warn(
        `Resolution warning: graph has ${trackedGraphStats.resolutionTargetCount} resolution targets but summary found no resolution docs. If maintainer just ran, wait and press [u], or use [d] to reapply.`,
      );
      if (debugResolution) {
        await logResolutionReadDiagnostics({
          space,
          entityIds: trackedEntityIds,
          context: `follow_on_${action}`,
        });
      }
    }
    if (action === 'reset_to_zero') {
      const alertCounts = await countSeededAlertsByEntityKind({
        space,
        users: trackedUsers,
        localUsers: trackedLocalUsers,
        hosts: trackedHosts,
        services: trackedServices,
      });
      log.info(
        `Post-reset seeded alert counts: idp_user=${alertCounts.idpUserAlerts}, local_user=${alertCounts.localUserAlerts}, host=${alertCounts.hostAlerts}, service=${alertCounts.serviceAlerts}`,
      );

      const lingeringServiceScores = after.rows.filter((row) => {
        if (!row.id.startsWith('service:')) return false;
        const score = toNumericScore(row.score);
        return score !== null && score > 0;
      });
      if (lingeringServiceScores.length > 0) {
        log.warn(
          `Reset diagnostic: ${lingeringServiceScores.length} service entities remain non-zero after alert cleanup + maintainer run. This suggests service score recalculation may not be zeroing stale docs in the current maintainer behavior.`,
        );
      }
    }
    lastChangedEntityIds = printBeforeAfterComparison({ actionTitle: action, before, after });
    await printRiskRows({ rows: after.rows, riskDocsMatched: after.riskDocsMatched, pageSize });
    await printResolutionRows({ rows: after.resolutionRows, pageSize });
    printSnapshotResult(after);
  }
};

export const riskScoreV2Command = async (options: RiskScoreV2Options) => {
  const overallStartMs = Date.now();
  const stageTimings: Array<{ stage: string; ms: number }> = [];
  const runTimedStage = async <T>(stage: string, fn: () => Promise<T>): Promise<T> => {
    const startMs = Date.now();
    const result = await fn();
    const elapsedMs = Date.now() - startMs;
    stageTimings.push({ stage, ms: elapsedMs });
    log.info(`Stage complete: ${stage} (${formatDurationMs(elapsedMs)})`);
    return result;
  };

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
      : parseOptionInt(options.users, 10)
    : 0;
  const hostsCount = entityKinds.includes('host')
    ? perf
      ? 1000
      : parseOptionInt(options.hosts, 10)
    : 0;
  const localUsersCount = entityKinds.includes('local_user')
    ? perf
      ? 1000
      : parseOptionInt(options.localUsers, 10)
    : 0;
  const servicesCount = entityKinds.includes('service')
    ? perf
      ? 1000
      : parseOptionInt(options.services, 10)
    : 0;
  const alertsPerEntity = perf ? 50 : parseOptionInt(options.alertsPerEntity, 5);
  const offsetHours = parseOptionInt(options.offsetHours, 1);
  const eventIndex = options.eventIndex || config.eventIndex || 'logs-testlogs-default';
  const modifierBulkBatchSize = perf ? 500 : 200;
  const phase2Enabled = options.phase2 !== false;
  const resolutionEnabled = phase2Enabled && options.resolution !== false;
  const propagationEnabled = phase2Enabled && options.propagation !== false;
  const resolutionGroupRate = Math.min(
    0.9,
    Math.max(0.01, Number.parseFloat(options.resolutionGroupRate ?? '0.2')),
  );
  const avgAliasesPerTarget = Math.max(1, parseOptionInt(options.avgAliasesPerTarget, 2));
  const ownershipEdgeRate = Math.min(
    1,
    Math.max(0, Number.parseFloat(options.ownershipEdgeRate ?? '0.3')),
  );
  const pageSize = Math.max(10, parseOptionInt(options.tablePageSize, phase2Enabled ? 30 : 20));
  const dangerousCleanEnabled = Boolean(options.dangerousClean);
  const debugResolutionEnabled = Boolean(options.debugResolution);
  const followOnEnabled = options.followOn ?? canUseInteractivePrompts();

  log.info(
    `Starting risk-score-v2 in space "${space}" with seedSource=${seedSource}, kinds=${entityKinds.join(',')}, idp_users=${usersCount}, local_users=${localUsersCount}, hosts=${hostsCount}, services=${servicesCount}, alertsPerEntity=${alertsPerEntity}, eventIndex=${eventIndex}, phase2=${phase2Enabled}, resolution=${resolutionEnabled}, propagation=${propagationEnabled}, dangerous_clean=${dangerousCleanEnabled}`,
  );

  if (options.setup !== false) {
    await runTimedStage('setup', async () => {
      await ensureSecurityDefaultDataView(space);
      await enableEntityStoreV2(space);
      await installEntityStoreV2(space);
    });
  }

  if (dangerousCleanEnabled) {
    await runTimedStage('dangerous_clean', async () => {
      await dangerousCleanSpaceData(space);
    });
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
  const allEntityIds = getAllEntityIds({ users, localUsers, hosts, services });
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
  await runTimedStage('source_ingest', async () => {
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
  });

  await runTimedStage('extract_entities', async () => {
    await forceExtractExpectedEntities({
      space,
      entityKinds,
      expectedEntityIds: expectedNewEntityIds,
      offsetHours,
    });
  });

  let relationshipGraph: RelationshipGraphState = { resolutionGroups: [], ownershipEdges: [] };
  if (phase2Enabled) {
    relationshipGraph = buildRelationshipGraph({
      entityIds: uniqueEntityIds,
      enableResolution: resolutionEnabled,
      enablePropagation: propagationEnabled,
      resolutionGroupRate,
      avgAliasesPerTarget,
      ownershipEdgeRate,
    });
    await runTimedStage('apply_relationships', async () => {
      if (
        relationshipGraph.resolutionGroups.length === 0 &&
        relationshipGraph.ownershipEdges.length === 0
      ) {
        log.info('Phase2 relationships enabled but no relationship rows generated; continuing.');
        return;
      }
      await applyRelationshipGraph({ graph: relationshipGraph, space });
      if (debugResolutionEnabled) {
        await waitForEntityRelationshipState({
          space,
          entityIds: uniqueEntityIds,
          graph: relationshipGraph,
          context: 'initial_apply',
        });
      }
    });
    const graphStats = getRelationshipGraphStats(relationshipGraph);
    log.info(
      `Pre-run graph summary: resolution_targets=${graphStats.resolutionTargetCount}, resolution_aliases=${graphStats.resolutionAliasCount}, resolution_edges=${graphStats.resolutionEdgeCount}, ownership_edges=${graphStats.ownershipEdgeCount}`,
    );
    if (graphStats.resolutionEdgeCount === 0) {
      log.warn(
        'Resolution scoring will be empty because resolution edge count is zero; use [d] reapply relationships.',
      );
    }
  }

  let watchlistIds: string[] = [];
  if (options.watchlists !== false) {
    log.info('Creating watchlists...');
    const watchlists = await createWatchlistsForRun(space);
    log.info(`Created ${watchlists.length} watchlists.`);
    watchlistIds = watchlists.map((w) => w.id);
  }

  if (options.watchlists !== false || options.criticality !== false) {
    await runTimedStage('apply_modifiers', async () => {
      const modifierEntityIds = allEntityIds.filter(
        (entityId) => toModifierEntityType(entityId) !== null,
      );
      const assignments = buildEntityModifierAssignments({
        entityIds: modifierEntityIds,
        watchlistIds,
        applyCriticality: options.criticality !== false,
      });
      await applyEntityModifiers({
        assignments,
        totalEntities: allEntityIds.length,
        space,
        batchSize: modifierBulkBatchSize,
      });
    });
  }

  if (options.alerts !== false) {
    await runTimedStage('index_alerts', async () =>
      indexAlertsForSeededEntities({
        users,
        localUsers,
        hosts,
        services,
        alertsPerEntity,
        space,
      }),
    );
  }

  const maintainerOutcome = await runRiskMaintainerOnce({
    space,
    runTimedStage,
    stage: 'run_maintainer',
  });
  log.info(
    `Maintainer outcome: runs=${maintainerOutcome.runs}, taskStatus=${maintainerOutcome.taskStatus}, settled=${maintainerOutcome.settled ? 'yes' : 'no'}.`,
  );
  const graphStats = getRelationshipGraphStats(relationshipGraph);
  if (phase2Enabled && graphStats.resolutionTargetCount > 0) {
    await runTimedStage('wait_for_resolution_docs', async () =>
      waitForResolutionDocs({
        space,
        entityIds: allEntityIds,
        minDocs: 1,
        timeoutMs: 60_000,
      }),
    );
  }
  log.info(
    'Maintainer run requested once. Collecting risk summary directly (without strict risk-score count gating).',
  );
  await runTimedStage('report_summary', async () =>
    reportRiskSummary({
      space,
      baselineRiskScoreCount,
      baselineEntityCount,
      expectedRiskDelta: Math.max(1, expectedNewEntityIds.length),
      entityIds: allEntityIds,
      pageSize,
      expectedResolutionTargets: graphStats.resolutionTargetCount,
      debugResolution: debugResolutionEnabled,
    }),
  );
  if (followOnEnabled && canUseInteractivePrompts()) {
    await runFollowOnActionLoop({
      space,
      entityIds: allEntityIds,
      users,
      localUsers,
      hosts,
      services,
      watchlistIds,
      entityKinds,
      eventIndex,
      offsetHours,
      enableCriticality: options.criticality !== false,
      enableWatchlists: options.watchlists !== false,
      alertsPerEntity,
      modifierBulkBatchSize,
      pageSize,
      phase2Enabled,
      resolutionEnabled,
      propagationEnabled,
      resolutionGroupRate,
      avgAliasesPerTarget,
      ownershipEdgeRate,
      relationshipGraph,
      debugResolution: debugResolutionEnabled,
      runTimedStage,
    });
  } else if (followOnEnabled && !canUseInteractivePrompts()) {
    log.info(
      'Follow-on actions requested, but output is non-interactive (non-TTY). Skipping menu.',
    );
  } else {
    log.info('Follow-on menu disabled (--no-follow-on).');
  }
  if (stageTimings.length > 0) {
    log.info(
      `Stage timings: ${stageTimings.map((timing) => `${timing.stage}=${formatDurationMs(timing.ms)}`).join(', ')}`,
    );
  }
  const totalRuntimeMs = Date.now() - overallStartMs;
  log.info(`Total runtime: ${formatDurationMs(totalRuntimeMs)}.`);
};
