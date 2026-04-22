import { log } from '../utils/logger.ts';
import { createWatchlist, deleteWatchlist, kibanaFetch } from '../utils/kibana_api.ts';
import { API_VERSIONS } from '../constants.ts';
import { esRequest, getEsClientConfig } from '../utils/es_client.ts';

/**
 * Entity source types supported by the watchlist management API.
 * - "index": source from an arbitrary ES index
 * - "store": filter from the entity store itself
 */
export type WatchlistSourceType = 'index' | 'store';

export interface EntitySourceConfig {
  type: WatchlistSourceType;
  name: string;
  indexPattern?: string;
  identifierField?: string;
  queryRule?: string;
  enabled?: boolean;
}

export interface WatchlistScenarioConfig {
  watchlistName: string;
  riskModifier: number;
  entitySources: EntitySourceConfig[];
  space?: string;
}

export interface WatchlistScenarioResult {
  watchlistId: string;
  watchlistName: string;
  entitySourceIds: string[];
}

export interface WaitForWatchlistSyncOptions {
  watchlistId: string;
  space?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  stablePollsRequired?: number;
}

export interface WaitForWatchlistSyncResult {
  watchlistId: string;
  durationMs: number;
  finalEntityCount: number;
  completed: boolean;
  timedOut: boolean;
  polls: number;
}

const WATCHLISTS_DATA_SOURCE_PATH = (watchlistId: string) =>
  `/api/entity_analytics/watchlists/${watchlistId}/entity_source`;

const WATCHLISTS_SYNC_PATH = (watchlistId: string) =>
  `/api/entity_analytics/watchlists/${watchlistId}/sync`;
const WATCHLISTS_GET_PATH = (watchlistId: string) =>
  `/api/entity_analytics/watchlists/${watchlistId}`;

const DEFAULT_WATCHLIST_WAIT_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_WATCHLIST_WAIT_POLL_INTERVAL_MS = 10 * 1000;
const DEFAULT_STABLE_POLLS_REQUIRED = 3;

/**
 * Creates an entity source on an existing watchlist.
 */
const createEntitySource = async (
  watchlistId: string,
  source: EntitySourceConfig,
  space: string,
): Promise<{ id: string }> => {
  const body: Record<string, unknown> = {
    type: source.type,
    name: source.name,
    enabled: source.enabled ?? true,
  };
  if (source.indexPattern) body.indexPattern = source.indexPattern;
  if (source.identifierField) body.identifierField = source.identifierField;
  if (source.queryRule) body.queryRule = source.queryRule;

  return kibanaFetch<{ id: string }>(
    WATCHLISTS_DATA_SOURCE_PATH(watchlistId),
    { method: 'POST', body: JSON.stringify(body) },
    { apiVersion: API_VERSIONS.public.v1, space },
  );
};

/**
 * Triggers an ad-hoc sync for a watchlist.
 */
export const triggerWatchlistSync = async (
  watchlistId: string,
  space = 'default',
): Promise<void> => {
  await kibanaFetch<unknown>(
    WATCHLISTS_SYNC_PATH(watchlistId),
    { method: 'POST', body: '{}' },
    { apiVersion: API_VERSIONS.public.v1, space },
  );
  log.info(`Triggered sync for watchlist ${watchlistId}`);
};

const extractPotentialCount = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;

  const candidates = [
    record.entityCount,
    record.memberCount,
    record.membersCount,
    record.entity_count,
    record.member_count,
    record.count,
    record.total,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }
  }
  for (const nested of Object.values(record)) {
    const found = extractPotentialCount(nested);
    if (typeof found === 'number') return found;
  }
  return undefined;
};

const extractPotentialSyncStatus = (value: unknown): string | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const candidates = [record.syncStatus, record.status, record.lastSyncStatus, record.sync_state];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.toLowerCase();
    }
  }
  for (const nested of Object.values(record)) {
    const found = extractPotentialSyncStatus(nested);
    if (found) return found;
  }
  return undefined;
};

const isSyncStatusTerminal = (status: string | undefined): boolean => {
  if (!status) return false;
  return ['completed', 'complete', 'finished', 'success', 'idle', 'ready'].includes(status);
};

const readWatchlistEntityCountFromEntityStore = async (
  watchlistId: string,
  space: string,
): Promise<number | undefined> => {
  try {
    const es = getEsClientConfig({});
    const response = await esRequest<{ count?: number }>(
      es,
      `/entities-latest-${encodeURIComponent(space)}/_count`,
      {
        method: 'POST',
        body: {
          query: {
            term: {
              'entity.attributes.watchlists': watchlistId,
            },
          },
        },
      },
    );
    if (typeof response.count === 'number') {
      return response.count;
    }
  } catch {
    // Fall through to watchlist API count extraction.
  }
  return undefined;
};

export const waitForWatchlistSync = async (
  options: WaitForWatchlistSyncOptions,
): Promise<WaitForWatchlistSyncResult> => {
  const space = options.space ?? 'default';
  const timeoutMs = options.timeoutMs ?? DEFAULT_WATCHLIST_WAIT_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_WATCHLIST_WAIT_POLL_INTERVAL_MS;
  const stablePollsRequired = options.stablePollsRequired ?? DEFAULT_STABLE_POLLS_REQUIRED;
  const startedAtMs = Date.now();
  let polls = 0;
  let lastCount: number | undefined;
  let stablePolls = 0;
  let finalEntityCount = 0;

  log.info(
    `Waiting for watchlist sync watchlistId=${options.watchlistId} timeout_ms=${timeoutMs} poll_interval_ms=${pollIntervalMs} stable_polls_required=${stablePollsRequired}`,
  );

  while (Date.now() - startedAtMs <= timeoutMs) {
    polls += 1;
    const detail = await kibanaFetch<Record<string, unknown>>(
      WATCHLISTS_GET_PATH(options.watchlistId),
      { method: 'GET' },
      { apiVersion: API_VERSIONS.public.v1, space },
    );

    const apiCount = extractPotentialCount(detail);
    const esCount = await readWatchlistEntityCountFromEntityStore(options.watchlistId, space);
    const currentCount = Math.max(apiCount ?? 0, esCount ?? 0);
    finalEntityCount = currentCount;
    const changed = lastCount === undefined ? true : currentCount !== lastCount;
    const syncStatus = extractPotentialSyncStatus(detail);

    stablePolls = changed ? 1 : stablePolls + 1;
    lastCount = currentCount;

    const elapsedMs = Date.now() - startedAtMs;
    log.info(
      `[watchlist-sync] poll=${polls} elapsed_ms=${elapsedMs} entity_count=${currentCount} api_count=${apiCount ?? 'none'} es_count=${esCount ?? 'none'} changed=${changed} stable_polls=${stablePolls} sync_status=${syncStatus ?? 'unknown'}`,
    );

    if (isSyncStatusTerminal(syncStatus) || stablePolls >= stablePollsRequired) {
      return {
        watchlistId: options.watchlistId,
        durationMs: elapsedMs,
        finalEntityCount,
        completed: true,
        timedOut: false,
        polls,
      };
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  return {
    watchlistId: options.watchlistId,
    durationMs: Date.now() - startedAtMs,
    finalEntityCount,
    completed: false,
    timedOut: true,
    polls,
  };
};

/**
 * Creates a watchlist + its entity sources. Returns IDs for cleanup.
 */
export const setupWatchlistScenario = async (
  config: WatchlistScenarioConfig,
): Promise<WatchlistScenarioResult> => {
  const space = config.space ?? 'default';

  log.info(`Creating watchlist "${config.watchlistName}" (riskModifier=${config.riskModifier})`);
  const watchlist = await createWatchlist({
    name: config.watchlistName,
    riskModifier: config.riskModifier,
    space,
  });

  log.info(`Watchlist created: id=${watchlist.id}`);
  const entitySourceIds: string[] = [];

  for (const source of config.entitySources) {
    log.info(`  Creating entity source "${source.name}" (type=${source.type})`);
    const created = await createEntitySource(watchlist.id, source, space);
    entitySourceIds.push(created.id);
    log.info(`  Entity source created: id=${created.id}`);
  }

  return { watchlistId: watchlist.id, watchlistName: watchlist.name, entitySourceIds };
};

/**
 * Tears down a watchlist scenario created by setupWatchlistScenario.
 */
export const teardownWatchlistScenario = async (
  watchlistId: string,
  space = 'default',
): Promise<void> => {
  await deleteWatchlist({ id: watchlistId, space });
  log.info(`Deleted watchlist ${watchlistId}`);
};

// ---------------------------------------------------------------------------
// Pre-defined performance scenarios
// ---------------------------------------------------------------------------

/**
 * index-broad: large index, all docs match (no query filter), broad entity coverage.
 * Measures: baseline index sync throughput.
 */
export const INDEX_BROAD_SCENARIO: WatchlistScenarioConfig = {
  watchlistName: 'perf-index-broad',
  riskModifier: 1.25,
  entitySources: [
    {
      type: 'index',
      name: 'perf-watchlist-broad-source',
      indexPattern: 'perf-watchlist-source',
      identifierField: 'user.name',
    },
  ],
};

/**
 * index-selective: large index, KQL filter matches ~2% of docs.
 * Measures: query filter cost on sync.
 */
export const INDEX_SELECTIVE_SCENARIO: WatchlistScenarioConfig = {
  watchlistName: 'perf-index-selective',
  riskModifier: 1.25,
  entitySources: [
    {
      type: 'index',
      name: 'perf-watchlist-selective-source',
      indexPattern: 'perf-watchlist-source',
      identifierField: 'user.name',
      queryRule: 'event.outcome: "failure"',
    },
  ],
};

/**
 * multi-watchlist: 4 watchlists sourcing the same index (different subsets via queryRule).
 * Measures: concurrent watchlist sync overhead.
 */
export const MULTI_WATCHLIST_SCENARIO: WatchlistScenarioConfig[] = [
  {
    watchlistName: 'perf-multi-wl-1',
    riskModifier: 1.25,
    entitySources: [
      {
        type: 'index',
        name: 'perf-watchlist-multi-source-1',
        indexPattern: 'perf-watchlist-source',
        identifierField: 'user.name',
      },
    ],
  },
  {
    watchlistName: 'perf-multi-wl-2',
    riskModifier: 1.5,
    entitySources: [
      {
        type: 'index',
        name: 'perf-watchlist-multi-source-2',
        indexPattern: 'perf-watchlist-source',
        identifierField: 'user.name',
        queryRule: 'event.outcome: "success"',
      },
    ],
  },
  {
    watchlistName: 'perf-multi-wl-3',
    riskModifier: 1.75,
    entitySources: [
      {
        type: 'index',
        name: 'perf-watchlist-multi-source-3',
        indexPattern: 'perf-watchlist-source',
        identifierField: 'user.name',
        queryRule: 'event.outcome: "failure"',
      },
    ],
  },
  {
    watchlistName: 'perf-multi-wl-4',
    riskModifier: 2.0,
    entitySources: [
      {
        type: 'index',
        name: 'perf-watchlist-multi-source-4',
        indexPattern: 'perf-watchlist-source',
        identifierField: 'user.name',
      },
    ],
  },
];

/**
 * deletion-stress: used for two-phase deletion test.
 * Phase 1: seed 50k docs → sync (populates 50k members)
 * Phase 2: delete 40k docs → sync (removal of 40k stale members)
 */
export const DELETION_STRESS_SCENARIO: WatchlistScenarioConfig = {
  watchlistName: 'perf-deletion-stress',
  riskModifier: 1.25,
  entitySources: [
    {
      type: 'index',
      name: 'perf-watchlist-deletion-source',
      indexPattern: 'perf-watchlist-deletion-source',
      identifierField: 'user.name',
    },
  ],
};
