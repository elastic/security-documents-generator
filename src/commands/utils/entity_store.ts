import { getEntityStoreIndex } from '../../constants.ts';
import { getEsClient } from './indices.ts';
import { log } from '../../utils/logger.ts';

export interface EntityHitSource {
  '@timestamp'?: string;
  entity?: {
    id?: string;
    name?: string;
    type?: string;
    EngineMetadata?: { UntypedId?: string };
    risk?: {
      calculated_level?: string;
      calculated_score?: number;
      calculated_score_norm?: number;
    };
    behaviors?: {
      rule_names?: string[];
      anomaly_job_ids?: string[];
    };
    relationships?: Record<string, string[]>;
    attributes?: {
      watchlists?: string[];
      [key: string]: unknown;
    };
  };
  user?: {
    name?: string;
    id?: string;
    email?: string;
    domain?: string;
  };
  host?: {
    name?: string;
    id?: string;
  };
  asset?: {
    criticality?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface EntityHit {
  _id: string;
  _index: string;
  _source: EntityHitSource;
}

export const fetchEntities = async (
  count: number,
  space?: string,
  type: 'Identity' | 'Host' = 'Identity',
): Promise<EntityHit[]> => {
  if (count <= 0) return [];

  const client = getEsClient();
  const response = await client.search({
    index: getEntityStoreIndex(space),
    size: count,
    sort: [{ '@timestamp': 'desc' }],
    query: {
      bool: {
        filter: [{ term: { 'entity.type': type } }],
      },
    },
  });

  return (response.hits.hits ?? []) as EntityHit[];
};

// --- DED / Recent anomalies correlation (shared types + fetch + parse) ---

export interface HostIdentityForDed {
  id?: string;
  name?: string;
}

export interface UserIdentityForDed {
  displayLabel: string;
  ecsArrays: Record<string, string[]>;
}

const parseUserHit = (hit: EntityHit): UserIdentityForDed | null => {
  const src = hit._source;
  const entityId = src.entity?.id;
  if (typeof entityId !== 'string' || !entityId.startsWith('user:')) return null;
  if (entityId.endsWith('@local')) return null;

  const user = src.user;
  const userName = user?.name;
  const userId = user?.id;
  const userEmail = user?.email;
  const userDomain = user?.domain;

  // Fallback: use entity.name when user.* fields aren't populated.
  const entityName = src.entity?.name;
  const effectiveName = userName ?? entityName;
  if (!effectiveName && !userId && !userEmail) return null;

  // event.module is the @-suffix of UntypedId (e.g. "alice@okta" → "okta").
  const untypedId = src.entity?.EngineMetadata?.UntypedId ?? entityId.slice('user:'.length);
  const atIdx = untypedId.lastIndexOf('@');
  const eventModule = atIdx !== -1 ? untypedId.slice(atIdx + 1) : undefined;

  const ecsArrays: Record<string, string[]> = {};
  if (effectiveName) ecsArrays['user.name'] = [effectiveName];
  if (userId) ecsArrays['user.id'] = [userId];
  if (userEmail) ecsArrays['user.email'] = [userEmail];
  if (userDomain) ecsArrays['user.domain'] = [userDomain];
  if (eventModule) ecsArrays['event.module'] = [eventModule];

  const displayLabel = effectiveName ?? userId ?? userEmail ?? 'user';
  return { displayLabel, ecsArrays };
};

export const fetchHostIdentitiesForDed = async (
  space: string,
  count: number,
): Promise<HostIdentityForDed[]> => {
  const index = getEntityStoreIndex(space);
  try {
    const hits = await fetchEntities(count, space, 'Host');
    const identities = hits
      .map((h) => ({ id: h._source.host?.id, name: h._source.host?.name }))
      .filter((h) => Boolean(h.id || h.name)) as HostIdentityForDed[];
    log.info(
      `Entity store correlation: read ${hits.length} host hit(s) from ${index}, parsed ${identities.length} usable host identity row(s).`,
    );
    return identities;
  } catch (err) {
    log.error(`Failed to read host entities from ${index}`, err);
    throw err;
  }
};

export const fetchUserIdentitiesForDed = async (
  space: string,
  count: number,
): Promise<UserIdentityForDed[]> => {
  const index = getEntityStoreIndex(space);
  try {
    const hits = await fetchEntities(count, space, 'Identity');
    const identities: UserIdentityForDed[] = [];
    for (const hit of hits) {
      const parsed = parseUserHit(hit);
      if (parsed) identities.push(parsed);
    }
    log.info(
      `Entity store user correlation: read ${hits.length} Identity hit(s) from ${index}, parsed ${identities.length} usable user identity row(s).`,
    );
    return identities;
  } catch (err) {
    log.error(`Failed to read user entities from ${index}.`, err);
    throw err;
  }
};
