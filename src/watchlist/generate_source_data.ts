import { faker } from '@faker-js/faker';
import cliProgress from 'cli-progress';
import { log } from '../utils/logger.ts';
import { generateIdentityPool } from '../risk_engine/identity_pool.ts';
import { streamingBulkIngest } from '../commands/shared/elasticsearch.ts';

export interface WatchlistSourceDataParams {
  /** Name for this source dataset (used in log messages). */
  name: string;
  /** ES index to write into. Default: "perf-watchlist-source". */
  indexName?: string;
  /** Field holding the entity identifier value. Default: "user.name". */
  identifierField?: string;
  /** Total number of documents to generate. Default: 100_000. */
  docCount?: number;
  /** Number of distinct entity values in the pool. Default: 10_000. */
  entityCount?: number;
  /**
   * Entity name prefix to match entity store naming convention.
   * Pass the same value used for `create-perf-data --idPrefix` (e.g. "p90-baseline")
   * so that `user.name` / `host.name` values align with entity store entities.
   */
  prefix?: string;
  /**
   * Entity type to use for identifier values — controls which pool (users/hosts) is sampled.
   * Default: "user".
   */
  entityType?: 'user' | 'host';
  /**
   * Fraction of docs that get event.outcome="failure" (for selective filter scenarios).
   * Default: 1.0 (all docs match).
   */
  matchRate?: number;
  /** Include realistic extra ECS fields (source.ip, etc.). Default: true. */
  extraFields?: boolean;
}

/**
 * Streams watchlist source index documents directly into ES.
 * Documents are simple: one identifier field + optional ECS extras.
 * Dynamic mapping handles field types so no explicit mapping is needed.
 */
export const generateAndUploadWatchlistSourceData = async (
  params: WatchlistSourceDataParams,
): Promise<{ docCount: number; distinctEntities: number }> => {
  const {
    name,
    indexName = 'perf-watchlist-source',
    identifierField = 'user.name',
    docCount = 100_000,
    entityCount = 10_000,
    prefix,
    entityType = 'user',
    matchRate = 1.0,
    extraFields = true,
  } = params;

  const matchCount = Math.min(entityCount, entityType === 'user' ? entityCount : entityCount);
  const pool = generateIdentityPool({
    userCount: entityType === 'user' ? matchCount : 1,
    hostCount: entityType === 'host' ? matchCount : 1,
    prefix,
  });

  const identities = entityType === 'user' ? pool.users : pool.hosts;
  if (identities.length === 0) {
    throw new Error('Identity pool is empty — check entityCount');
  }

  log.info(
    `Generating ${docCount} watchlist source docs for "${name}" ` +
      `(${identities.length} distinct ${entityType} values → ${indexName})`,
  );

  const progress = new cliProgress.SingleBar(
    { clearOnComplete: false, hideCursor: true, format: 'docs {bar} {value}/{total}' },
    cliProgress.Presets.shades_classic,
  );
  progress.start(docCount, 0);

  const failureThreshold = 1 - matchRate;

  const datasource = async function* () {
    for (let i = 0; i < docCount; i++) {
      const identity = identities[i % identities.length]!;
      const isFailure = Math.random() < failureThreshold;
      const outcome = isFailure ? 'failure' : 'success';
      const doc: Record<string, unknown> = {
        '@timestamp': new Date().toISOString(),
        [identifierField]: identity.name,
        'event.category': 'authentication',
        'event.outcome': outcome,
      };
      if (extraFields) {
        doc['source.ip'] = faker.internet.ip();
        doc['agent.id'] = faker.string.uuid();
      }
      progress.increment();
      yield doc;
    }
  };

  await streamingBulkIngest({
    index: indexName,
    datasource: datasource(),
    flushBytes: 1024 * 1024 * 5,
    flushInterval: 3000,
    onDocument: (doc) => [{ create: { _index: indexName } }, doc],
    onDrop: (doc) => {
      log.error('Failed to index watchlist source document:', doc);
    },
  });

  progress.stop();
  log.info(`Uploaded ${docCount} docs to ${indexName}`);
  return { docCount, distinctEntities: identities.length };
};

/**
 * Removes all documents from the watchlist source index by deleting and recreating it.
 */
export interface DeleteWatchlistSourceIndexParams {
  indexName?: string;
}
