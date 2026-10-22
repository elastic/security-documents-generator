import { getEsClient } from '../utils/indices.ts';
import { log } from '../../utils/logger.ts';
import { initEntityMaintainers, runEntityMaintainer } from '../../utils/kibana_api.ts';
import { getStatusCode } from './utils.ts';

export const riskIndex = (space: string): string => `risk-score.risk-score-${space}`;

let maintainersInitialised = false;

/**
 * Run the real risk-score maintainer synchronously. When `stamp` is given, every risk doc the run
 * wrote (stamped "now") is rebadged to that time so the history shows the scenario's jump days.
 */
export const runRiskScore = async ({
  space,
  stamp,
}: {
  space: string;
  stamp?: Date;
}): Promise<{ rebadged: number }> => {
  if (!maintainersInitialised) {
    await initEntityMaintainers(space);
    maintainersInitialised = true;
  }
  const client = getEsClient();
  const runStart = new Date(Date.now() - 5_000).toISOString();
  await runEntityMaintainer('risk-score', space, { sync: true });
  if (!stamp) return { rebadged: 0 };

  await client.indices.refresh({ index: riskIndex(space), ignore_unavailable: true });
  const query = { range: { '@timestamp': { gte: runStart } } };
  try {
    const result = await client.updateByQuery({
      index: riskIndex(space),
      refresh: true,
      conflicts: 'proceed',
      query,
      script: {
        lang: 'painless',
        source: "ctx._source['@timestamp'] = params.ts",
        params: { ts: stamp.toISOString() },
      },
    });
    const rebadged = result.updated ?? 0;
    log.info(`Risk run rebadged ${rebadged} doc(s) to ${stamp.toISOString()}`);
    return { rebadged };
  } catch (error) {
    if (getStatusCode(error) === undefined) throw error;
    log.warn(
      `Risk rebadge via update_by_query failed (${String(error).slice(0, 200)}); copying instead.`,
    );
    return copyBackdated({ space, query, stamp });
  }
};

/** Fallback: re-create the run's docs with the backdated timestamp, then delete the originals. */
const copyBackdated = async ({
  space,
  query,
  stamp,
}: {
  space: string;
  query: object;
  stamp: Date;
}): Promise<{ rebadged: number }> => {
  const client = getEsClient();
  const found = await client.search({ index: riskIndex(space), size: 10_000, query });
  const operations = found.hits.hits.flatMap((hit) => [
    { create: { _index: riskIndex(space) } },
    { ...(hit._source as object), '@timestamp': stamp.toISOString() },
  ]);
  if (operations.length === 0) return { rebadged: 0 };
  await client.bulk({ operations, refresh: true });
  await client.deleteByQuery({
    index: riskIndex(space),
    refresh: true,
    conflicts: 'proceed',
    query: { bool: { filter: [query, { range: { '@timestamp': { gt: stamp.toISOString() } } }] } },
  });
  return { rebadged: found.hits.hits.length };
};
