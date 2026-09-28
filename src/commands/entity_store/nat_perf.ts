import { log } from '../../utils/logger.ts';
import { riskScoreV2Command, type RiskScoreV2Options } from './risk_score_v2.ts';
import { seedRiskScoreHistory } from './seed_risk_score_history.ts';
import { generateAnomalousBehaviorDataWithMlJobs } from '../misc/anomalous_behavior/index.ts';

export interface NatPerfOptions {
  totalEntities: number;
  batchSize: number;
  entityKinds: string[];
  alertsPerEntity: number;
  alertRiskScoreMin: number;
  alertRiskScoreMax: number;
  space: string;
  delaySeconds: number;
  cleanHistory: boolean;
}

type EntityKind = 'host' | 'idp_user' | 'local_user' | 'service';

const distributeBatchSize = (
  batchSize: number,
  kinds: EntityKind[],
): Partial<Record<EntityKind, number>> => {
  const perKind = Math.floor(batchSize / kinds.length);
  let remainder = batchSize - perKind * kinds.length;
  const result: Partial<Record<EntityKind, number>> = {};
  for (const kind of kinds) {
    result[kind] = perKind + (remainder-- > 0 ? 1 : 0);
  }
  return result;
};

const applyCounts = (opts: RiskScoreV2Options, counts: Partial<Record<EntityKind, number>>) => {
  if (counts.host) opts.hosts = String(counts.host);
  if (counts.idp_user) opts.users = String(counts.idp_user);
  if (counts.local_user) opts.localUsers = String(counts.local_user);
  if (counts.service) opts.services = String(counts.service);
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const natPerfCommand = async (opts: NatPerfOptions): Promise<void> => {
  const {
    totalEntities,
    batchSize,
    entityKinds,
    alertsPerEntity,
    alertRiskScoreMin,
    alertRiskScoreMax,
    space,
    delaySeconds,
    cleanHistory,
  } = opts;

  const totalBatches = Math.ceil(totalEntities / batchSize);

  log.info(
    `NAT Perf: ${totalEntities.toLocaleString()} entities target | ` +
      `${totalBatches} batch(es) of up to ${batchSize} | kinds=[${entityKinds.join(',')}]`,
  );

  let totalSeeded = 0;

  for (let batch = 0; batch < totalBatches; batch++) {
    const isFirst = batch === 0;
    const remaining = totalEntities - totalSeeded;
    const currentBatchSize = Math.min(batchSize, remaining);
    const kindCounts = distributeBatchSize(currentBatchSize, entityKinds as EntityKind[]);

    log.info(
      `\n--- Batch ${batch + 1}/${totalBatches} | ${currentBatchSize} entities | ` +
        `seeded so far: ${totalSeeded.toLocaleString()} ---`,
    );

    const riskScoreOpts: RiskScoreV2Options = {
      entityKinds: entityKinds.join(','),
      alertsPerEntity: String(alertsPerEntity),
      alertRiskScoreMin: String(alertRiskScoreMin),
      alertRiskScoreMax: String(alertRiskScoreMax),
      space,
      setup: isFirst,
      criticality: true,
      watchlists: true,
      alerts: true,
      phase2: false,
      followOn: false,
    };

    applyCounts(riskScoreOpts, kindCounts);

    await riskScoreV2Command(riskScoreOpts);

    // Seed anomaly records after the first batch so entity store is populated for correlation
    if (isFirst) {
      log.info('\n[Tile 2] Seeding ML anomaly records once (correlated with entity store)...');
      await generateAnomalousBehaviorDataWithMlJobs(space, 10, false, true, true);
    }

    const moverCount = Math.max(1, Math.round(currentBatchSize * 0.2));
    const newlyHighCount = Math.max(1, Math.min(Math.round(currentBatchSize * 0.1), moverCount));

    await seedRiskScoreHistory({
      space,
      count: currentBatchSize,
      yesterdayHours: 36,
      todayHours: 2,
      moverCount,
      newlyHighCount,
      clean: cleanHistory,
    });

    totalSeeded += currentBatchSize;
    log.info(
      `Batch ${batch + 1}/${totalBatches} complete | total seeded: ${totalSeeded.toLocaleString()}`,
    );

    if (delaySeconds > 0 && batch < totalBatches - 1) {
      log.info(`Waiting ${delaySeconds}s before next batch...`);
      await sleep(delaySeconds * 1000);
    }
  }

  log.info(
    `\nNAT Perf complete. ${totalSeeded.toLocaleString()} entities seeded across ${totalBatches} batch(es).`,
  );
};
