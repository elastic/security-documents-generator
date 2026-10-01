import { createHash } from 'crypto';
import { log } from '../../utils/logger.ts';
import { getAlertIndex } from '../../utils/index.ts';
import { getEsClient } from '../utils/indices.ts';
import {
  fetchEntities,
  parseUserHit,
  type EntityHit,
  type HostIdentityForDed,
  type UserIdentityForDed,
} from '../utils/entity_store.ts';
import createAlerts from '../../generators/create_alerts.ts';
import { generateDedRecords } from '../misc/anomalous_behavior/generators/index.ts';
import { applyV2Fields } from '../misc/anomalous_behavior/generators/utils.ts';

const HOUR_MS = 3600_000;
// Width of each delta window in hours — used to bucket deterministic IDs so re-runs within
// the same window get a 409 (idempotent) but a run in the *next* window mints a fresh ID.
const WINDOW_BUCKET_HOURS: Record<string, number> = { '24h': 24, '7d': 168, '30d': 720 };
const SHARED_ANOMALIES_INDEX = '.ml-anomalies-shared';
const BULK_CHUNK_DOCS = 5000;
// fetchEntities uses a single search, so it is bound by index.max_result_window.
const MAX_FETCH_PER_TYPE = 10_000;
const ALERTS_PER_ENTITY_PER_WINDOW = 1;
const ANOMALY_RECORD_SCORE = 50;

// Previous-period windows, in hours before now: [from, to). Each one is exactly the
// range the tile's delta query reads: NOW()-doubleRange <= @timestamp < NOW()-timeRange.
const DELTA_WINDOWS = [
  { slot: '24h', fromHoursAgo: 48, toHoursAgo: 24 },
  { slot: '7d', fromHoursAgo: 336, toHoursAgo: 168 },
  { slot: '30d', fromHoursAgo: 1440, toHoursAgo: 720 },
] as const;

type DeltaWindow = (typeof DELTA_WINDOWS)[number];
type SeedEntity =
  | { kind: 'host'; entityId: string; host: HostIdentityForDed }
  | { kind: 'user'; entityId: string; user: UserIdentityForDed }
  | { kind: 'service'; entityId: string; serviceName: string };

export interface SeedAlertDeltasOptions {
  count: number;
  space: string;
  anomalyCount?: number;
}

interface IndexedCounts {
  indexed: number;
  alreadyPresent: number;
  failed: number;
}

// Deterministic UUID-shaped string so re-runs produce identical rule/alert ids.
const deterministicUuid = (seed: string): string => {
  const h = createHash('sha256').update(seed).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
};

const randomTimestampMs = (now: number, w: DeltaWindow): number => {
  const from = now - w.fromHoursAgo * HOUR_MS;
  const to = now - w.toHoursAgo * HOUR_MS;
  // Math.random() < 1 keeps the result strictly below `to` (window is half-open).
  return Math.floor(from + Math.random() * (to - from));
};

const toSeedEntity = (hit: EntityHit): SeedEntity | null => {
  const src = hit._source;
  const entityId = src.entity?.id;
  if (!entityId) return null;

  switch (src.entity?.type) {
    case 'Host': {
      const host = { id: src.host?.id, name: src.host?.name };
      return host.id || host.name ? { kind: 'host', entityId, host } : null;
    }
    case 'Service': {
      const serviceName = src.service?.name ?? src.entity?.name;
      return serviceName ? { kind: 'service', entityId, serviceName } : null;
    }
    default: {
      const user = parseUserHit(hit);
      return user ? { kind: 'user', entityId, user } : null;
    }
  }
};

const buildAlertDoc = (
  entity: SeedEntity,
  space: string,
  timestamp: number,
  alertUuid: string,
): Record<string, unknown> => {
  const overrides = {
    'kibana.alert.uuid': alertUuid,
    'kibana.alert.rule.uuid': deterministicUuid(`seed-ad-rule-${space}`),
    'kibana.alert.rule.execution.uuid': deterministicUuid(`seed-ad-exec-${alertUuid}`),
    'kibana.alert.entity.id': entity.entityId,
    'kibana.alert.workflow_status': 'open',
    'kibana.alert.severity': 'medium',
    'kibana.alert.rule.severity': 'medium',
  };

  let alert: Record<string, unknown>;
  if (entity.kind === 'user') {
    const { ecsArrays } = entity.user;
    alert = createAlerts(
      {
        ...overrides,
        ...(ecsArrays['user.email'] && { 'user.email': ecsArrays['user.email'][0] }),
      },
      {
        userName: ecsArrays['user.name']?.[0] ?? entity.user.displayLabel,
        userId: ecsArrays['user.id']?.[0],
        eventModule: ecsArrays['event.module']?.[0],
        space,
        timestamp,
      },
    );
    // createAlerts always sets a placeholder host.name; drop it so the alert only
    // resolves to this user's EUID and doesn't mint phantom host entities.
    delete alert['host.name'];
  } else if (entity.kind === 'host') {
    alert = createAlerts(overrides, {
      hostName: entity.host.name ?? entity.host.id,
      hostId: entity.host.id,
      space,
      timestamp,
    });
    delete alert['user.name'];
  } else {
    alert = createAlerts(
      { ...overrides, 'service.name': entity.serviceName },
      { space, timestamp },
    );
    delete alert['host.name'];
    delete alert['user.name'];
  }
  return alert;
};

// Reuse the DED generators so the anomaly shape matches generateAnomalousBehaviorDataWithMlJobs.
const buildAnomalyDoc = (
  entity: SeedEntity,
  timestamp: number,
  windowIndex: number,
): Record<string, unknown> | null => {
  if (entity.kind === 'service') return null;

  const records =
    entity.kind === 'host'
      ? generateDedRecords(1, { hosts: [entity.host] })
      : // Host-partitioned jobs can't carry a user identity, so skip them for user entities.
        generateDedRecords(1, { users: [entity.user] }).filter(
          (r) => !String(r.job_id).startsWith('ded_high_bytes_written_to_external_device'),
        );
  const record = records[windowIndex % records.length];
  if (!record) return null;

  return {
    ...applyV2Fields(record),
    // ML result docs carry `timestamp`; in the shared-anomalies mapping `@timestamp` is an alias
    // onto it, and writing to an alias is rejected.
    timestamp: new Date(timestamp).toISOString(),
    result_type: 'record',
    is_interim: false,
    record_score: ANOMALY_RECORD_SCORE,
    initial_record_score: ANOMALY_RECORD_SCORE,
  };
};

const bulkWrite = async (
  index: string,
  action: 'create' | 'index',
  docs: Array<{ _id: string; doc: Record<string, unknown> }>,
): Promise<IndexedCounts> => {
  const client = getEsClient();
  const counts: IndexedCounts = { indexed: 0, alreadyPresent: 0, failed: 0 };

  for (let i = 0; i < docs.length; i += BULK_CHUNK_DOCS) {
    const chunk = docs.slice(i, i + BULK_CHUNK_DOCS);
    const isLast = i + BULK_CHUNK_DOCS >= docs.length;
    const result = await client.bulk({
      refresh: isLast,
      operations: chunk.flatMap(({ _id, doc }) => [{ [action]: { _index: index, _id } }, doc]),
    });

    for (const item of result.items) {
      const op = item.create ?? item.index;
      if (!op?.error) {
        counts.indexed++;
      } else if (op.status === 409) {
        // Data streams / `create` can't overwrite; the deterministic doc is already there.
        counts.alreadyPresent++;
      } else {
        counts.failed++;
        if (counts.failed <= 3) log.error(`Bulk item failed in ${index}`, op.error);
      }
    }
  }
  return counts;
};

const interleave = <T>(lists: T[][]): T[] => {
  const out: T[] = [];
  const max = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < max; i++) {
    for (const list of lists) if (i < list.length) out.push(list[i]);
  }
  return out;
};

/**
 * Seeds backdated alerts and ML anomaly records into the *previous* period of each tile
 * time range (24h→48h, 7d→14d, 30d→60d) so the alerts / watchlisted / anomalies tiles
 * report a non-zero delta. Current-period data is never touched.
 */
export const seedAlertDeltas = async (opts: SeedAlertDeltasOptions): Promise<void> => {
  const { count, space } = opts;
  const anomalyCount = opts.anomalyCount ?? Math.floor(count * 0.5);

  if (count <= 0 && anomalyCount <= 0) {
    log.info('seedAlertDeltas: nothing to seed (count and anomalyCount are 0).');
    return;
  }

  const fetchCount = Math.max(count, anomalyCount);
  if (fetchCount > MAX_FETCH_PER_TYPE) {
    log.warn(
      `Requested ${fetchCount} entities but a single entity store search is capped at ${MAX_FETCH_PER_TYPE} per type; clamping.`,
    );
  }
  const perType = Math.min(fetchCount, MAX_FETCH_PER_TYPE);

  log.info(`Fetching entities from entity store in space "${space}" for delta seeding...`);
  const [users, hosts, services] = await Promise.all([
    fetchEntities(perType, space, 'Identity'),
    fetchEntities(perType, space, 'Host'),
    fetchEntities(perType, space, 'Service'),
  ]);

  // Round-robin across types so every kind is represented in a small sample.
  const entities = interleave([users, hosts, services].map((hits) => hits.map(toSeedEntity)))
    .filter((e): e is SeedEntity => e !== null)
    .slice(0, fetchCount);

  if (entities.length === 0) {
    throw new Error(
      `No usable entities found in space "${space}". Run risk-score-v2 first to seed entities.`,
    );
  }

  const alertEntities = entities.slice(0, count);
  const anomalyEntities = entities.filter((e) => e.kind !== 'service').slice(0, anomalyCount);
  log.info(
    `Seeding prev-period deltas: ${alertEntities.length} entities with alerts, ${anomalyEntities.length} with anomalies, across ${DELTA_WINDOWS.length} windows.`,
  );

  const alertIndex = getAlertIndex(space);
  const now = Date.now();

  for (const [windowIndex, w] of DELTA_WINDOWS.entries()) {
    // Rotate the ID each time the window period rolls over so `create` always succeeds with
    // a fresh @timestamp. Without this, a previous run's stale doc 409s and its @timestamp
    // drifts outside the query window (worst case: 24h docs expire in 24h).
    const bucket = Math.floor(now / (WINDOW_BUCKET_HOURS[w.slot] * HOUR_MS));

    const alertDocs = alertEntities.flatMap((entity) =>
      Array.from({ length: ALERTS_PER_ENTITY_PER_WINDOW }, (_, i) => {
        const _id = `seed-ad-${space}-${entity.entityId}-${w.slot}-${bucket}-${i}`;
        const doc = buildAlertDoc(entity, space, randomTimestampMs(now, w), deterministicUuid(_id));
        return { _id, doc };
      }),
    );

    const anomalyDocs = anomalyEntities.flatMap((entity) => {
      const doc = buildAnomalyDoc(entity, randomTimestampMs(now, w), windowIndex);
      const _id = `seed-ad-${space}-${entity.entityId}-${w.slot}-${bucket}-anom`;
      return doc ? [{ _id, doc }] : [];
    });

    // Alerts: `create` is the only op a data stream accepts. Anomalies: .ml-anomalies-shared is a
    // plain index, so `index` makes re-runs overwrite instead of 409.
    const alertCounts = await bulkWrite(alertIndex, 'create', alertDocs);
    const anomalyCounts = await bulkWrite(SHARED_ANOMALIES_INDEX, 'index', anomalyDocs);

    log.info(
      `  [${w.slot} prev window: now-${w.fromHoursAgo}h → now-${w.toHoursAgo}h] ` +
        `alerts indexed=${alertCounts.indexed} existing=${alertCounts.alreadyPresent} failed=${alertCounts.failed} | ` +
        `anomalies indexed=${anomalyCounts.indexed} failed=${anomalyCounts.failed}`,
    );
  }

  log.info('Alert/anomaly delta seeding complete.');
};
