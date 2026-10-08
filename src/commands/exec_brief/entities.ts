import { getEsClient } from '../utils/indices.ts';
import { log } from '../../utils/logger.ts';
import { API_VERSIONS, getEntityStoreIndex } from '../../constants.ts';
import {
  forceBulkUpdateEntitiesViaCrud,
  forceLogExtraction,
  kibanaFetch,
  linkResolutionEntities,
  runEntityMaintainer,
} from '../../utils/kibana_api.ts';
import {
  HOSTS,
  USERS,
  buildLogons,
  hostByKey,
  hostEuid,
  idpUserEuid,
  localUserEuid,
  userByKey,
  type ScenarioHost,
  type ScenarioUser,
} from './scenario.ts';
import { DAY_MS, endOfDay, getStatusCode, sleep } from './utils.ts';

export const RELATIONSHIP_MAINTAINERS = [
  'accesses_frequently_and_infrequently',
  'communicates_with',
] as const;

const EXTRACTION_TYPES = ['user', 'host', 'service'] as const;

export const metadataIndex = (space: string): string => `entities-metadata-${space}`;

const presentEntityIds = async (space: string, ids: string[]): Promise<Set<string>> => {
  const client = getEsClient();
  const present = new Set<string>();
  for (let i = 0; i < ids.length; i += 500) {
    const slice = ids.slice(i, i + 500);
    try {
      const response = await client.search({
        index: getEntityStoreIndex(space),
        size: slice.length,
        _source: ['entity.id'],
        query: { terms: { 'entity.id': slice } },
      });
      for (const hit of response.hits.hits) {
        const id = (hit._source as { entity?: { id?: string } }).entity?.id;
        if (id) present.add(id);
      }
    } catch (error) {
      if (getStatusCode(error) !== 404) throw error;
    }
  }
  return present;
};

/** Force log extraction for every entity type, then wait until the expected EUIDs exist. */
export const extractEntities = async ({
  anchor,
  space,
  expectedEntityIds,
  timeoutMs = 180_000,
}: {
  anchor: Date;
  space: string;
  expectedEntityIds: string[];
  timeoutMs?: number;
}): Promise<void> => {
  const fromDateISO = new Date(anchor.getTime() - 31 * DAY_MS).toISOString();
  const toDateISO = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const deadline = Date.now() + timeoutMs;
  let lastPresent = -1;

  // Extraction is incremental per run, so request it again while entities are still missing.
  while (Date.now() < deadline) {
    await Promise.all(
      EXTRACTION_TYPES.map((entityType) =>
        forceLogExtraction(entityType, { fromDateISO, toDateISO, space }),
      ),
    );
    const present = await presentEntityIds(space, expectedEntityIds);
    if (present.size !== lastPresent) {
      log.info(`Entity extraction: ${present.size}/${expectedEntityIds.length} entities present`);
      lastPresent = present.size;
    }
    if (present.size >= expectedEntityIds.length) return;
    await sleep(3000);
  }
  const present = await presentEntityIds(space, expectedEntityIds);
  const missing = expectedEntityIds.filter((id) => !present.has(id));
  throw new Error(
    `Timed out waiting for ${missing.length} entities, e.g. ${missing.slice(0, 5).join(', ')}`,
  );
};

/**
 * Run the relationship maintainers synchronously and rebadge the metadata docs they wrote
 * (stamped "now") to the end of the phase day, so first-seen times line up with the scenario.
 */
export const runRelationshipPhase = async ({
  phase,
  anchor,
  space,
}: {
  phase: number;
  anchor: Date;
  space: string;
}): Promise<{ rebadged: number }> => {
  const client = getEsClient();
  const runStart = new Date(Date.now() - 5_000).toISOString();

  for (const maintainerId of RELATIONSHIP_MAINTAINERS) {
    log.info(`Running maintainer ${maintainerId} (phase D-${phase})...`);
    await runEntityMaintainer(maintainerId, space, { sync: true });
  }

  const stamp = endOfDay(anchor, phase).toISOString();
  await client.indices.refresh({ index: metadataIndex(space), ignore_unavailable: true });
  const result = await client.updateByQuery({
    index: metadataIndex(space),
    refresh: true,
    conflicts: 'proceed',
    ignore_unavailable: true,
    query: {
      bool: {
        filter: [
          { term: { 'event.action': 'relationship_observed' } },
          { range: { '@timestamp': { gte: runStart } } },
        ],
      },
    },
    script: {
      source: "ctx._source['@timestamp'] = params.ts",
      lang: 'painless',
      params: { ts: stamp },
    },
  });
  const rebadged = result.updated ?? 0;
  log.info(`Rebadged ${rebadged} relationship_observed doc(s) to ${stamp}`);
  return { rebadged };
};

const resolvableUsers = (): ScenarioUser[] => USERS.filter((u) => u.resolve);

/** Local aliases (one per host the user logs on to) of a scenario user. */
export const aliasHostsFor = (user: ScenarioUser): ScenarioHost[] => {
  const hostKeys = new Set(
    buildLogons()
      .filter((l) => l.userKey === user.key)
      .map((l) => l.hostKey),
  );
  return [...hostKeys].map(hostByKey);
};

export const linkResolution = async (space: string): Promise<Record<string, string[]>> => {
  const linked: Record<string, string[]> = {};
  for (const user of resolvableUsers()) {
    const aliasIds = aliasHostsFor(user).map((host) => localUserEuid(user, host));
    const targetId = idpUserEuid(user);
    const response = await linkResolutionEntities({ targetId, entityIds: aliasIds, space });
    if (response.skipped.length > 0) {
      log.warn(`Resolution ${targetId}: skipped ${JSON.stringify(response.skipped)}`);
    }
    linked[targetId] = response.linked;
  }
  log.info(`Resolution links: ${JSON.stringify(linked)}`);
  return linked;
};

type EntityKind = 'user' | 'host' | 'service';
const kindOf = (euid: string): EntityKind => (euid.startsWith('host:') ? 'host' : 'user');

/** Criticality + owns via the CRUD bulk API (force). Hosts, S1 users and their aliases get criticality. */
export const applyEntityModifiers = async (space: string): Promise<void> => {
  const entities: Array<{ type: EntityKind; doc: Record<string, unknown> }> = [];

  for (const host of HOSTS) {
    if (!host.criticality) continue;
    entities.push({
      type: 'host',
      doc: { entity: { id: hostEuid(host) }, asset: { criticality: host.criticality } },
    });
  }
  for (const user of USERS) {
    if (!user.criticality) continue;
    const ids = [idpUserEuid(user), ...aliasHostsFor(user).map((h) => localUserEuid(user, h))];
    for (const id of ids) {
      entities.push({
        type: kindOf(id),
        doc: { entity: { id }, asset: { criticality: user.criticality } },
      });
    }
  }
  // Ownership: golden identity owns the laptop (owns maintainer needs an Entra device feed; set directly).
  for (const [userKey, hostKey] of [
    ['a.rodriguez', 'LAPTOP-FIN03'],
    ['j.chen', 'LAPTOP-MKT07'],
  ] as const) {
    entities.push({
      type: 'user',
      doc: {
        entity: {
          id: idpUserEuid(userByKey(userKey)),
          relationships: { owns: { ids: [hostEuid(hostByKey(hostKey))] } },
        },
      },
    });
  }

  const response = await forceBulkUpdateEntitiesViaCrud({ entities, space });
  if (response.errors && response.errors.length > 0) {
    log.warn(
      `Modifier bulk update reported errors: ${JSON.stringify(response.errors).slice(0, 800)}`,
    );
  }
  log.info(`Applied ${entities.length} criticality/ownership update(s).`);
};

const watchlistId = (space: string): string => `privileged-user-monitoring-watchlist-id-${space}`;

/** Install the prebuilt Privileged Users watchlist and assign the S1 golden identity. */
export const assignPrivilegedWatchlist = async (space: string): Promise<string[]> => {
  await kibanaFetch(
    '/api/entity_analytics/watchlists/install',
    { method: 'POST', body: JSON.stringify({}) },
    { apiVersion: API_VERSIONS.public.v1, space, ignoreStatuses: [409] },
  );
  const euids = USERS.filter((u) => u.watchlists?.includes('privileged')).map(idpUserEuid);
  await kibanaFetch(
    `/api/entity_analytics/watchlists/${watchlistId(space)}/entities/assign`,
    { method: 'POST', body: JSON.stringify({ euids }) },
    { apiVersion: API_VERSIONS.public.v1, space },
  );
  log.info(`Assigned ${euids.join(', ')} to the Privileged Users watchlist.`);
  return euids;
};
