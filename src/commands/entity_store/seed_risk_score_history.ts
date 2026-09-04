import { log } from '../../utils/logger.ts';
import { faker } from '@faker-js/faker';
import { bulkUpsert } from '../shared/elasticsearch.ts';
import { getEsClient } from '../utils/indices.ts';
import { fetchEntities, type EntityHit } from '../utils/entity_store.ts';

// Real Kibana risk score level boundaries (matches EntityRiskLevelsEnum in Kibana).
type RiskLevel = 'Unknown' | 'Low' | 'Moderate' | 'High' | 'Critical';

const scoreNormToLevel = (score: number): RiskLevel => {
  if (score < 20) return 'Unknown';
  if (score < 40) return 'Low';
  if (score < 70) return 'Moderate';
  if (score < 90) return 'High';
  return 'Critical';
};

const randScore = (min: number, max: number) =>
  Math.round(faker.number.float({ min, max, fractionDigits: 2 }) * 100) / 100;

type EntityScenario = 'newly_high' | 'mover' | 'stable';

interface ScoredEntity {
  entity: EntityHit;
  entityType: 'host' | 'user';
  scenario: EntityScenario;
  yesterdayScore: number;
  todayScore: number;
}

const assignScenarios = (
  entities: Array<{ entity: EntityHit; entityType: 'host' | 'user' }>,
  newlyHighCount: number,
  moverCount: number,
): ScoredEntity[] => {
  const clampedNewlyHigh = Math.min(newlyHighCount, entities.length);
  const clampedMover = Math.min(moverCount, entities.length - clampedNewlyHigh);

  return entities.map(({ entity, entityType }, i) => {
    let scenario: EntityScenario;
    let yesterdayScore: number;
    let todayScore: number;

    if (i < clampedNewlyHigh) {
      // Yesterday: Low or Moderate (< 70). Today: High or Critical (≥ 70).
      scenario = 'newly_high';
      yesterdayScore = randScore(5, 65);
      todayScore = randScore(72, 98);
    } else if (i < clampedNewlyHigh + clampedMover) {
      // Delta ≥ 15, yesterday capped at 80 to guarantee room.
      scenario = 'mover';
      yesterdayScore = randScore(5, 75);
      todayScore = randScore(yesterdayScore + 15, Math.min(yesterdayScore + 50, 100));
    } else {
      // Stable: delta ≤ 5.
      scenario = 'stable';
      yesterdayScore = randScore(5, 95);
      const delta = faker.number.float({ min: -5, max: 5, fractionDigits: 1 });
      todayScore = Math.max(0, Math.min(100, Math.round((yesterdayScore + delta) * 100) / 100));
    }

    return { entity, entityType, scenario, yesterdayScore, todayScore };
  });
};

const buildRiskScoreDoc = (
  entity: EntityHit,
  entityType: 'host' | 'user',
  scoreNorm: number,
  timestamp: Date,
  space: string,
  slot: 'yesterday' | 'today',
): { _id: string; doc: object } => {
  const src = entity._source;
  const rawName =
    entityType === 'user'
      ? (src.user?.name ?? src.entity?.name)
      : (src.host?.name ?? src.entity?.name);
  // Real risk engine docs write the full EUID (e.g. 'host:my-host') as the
  // type-specific name field. The tile LOOKUP JOIN keys on COALESCE(host.name,
  // user.name) so it must match entity.id in entities-latest — which is the EUID.
  const entityId = src.entity?.id ?? `${entityType}:${rawName ?? entity._id}`;
  const level = scoreNormToLevel(scoreNorm);

  // Deterministic ID: re-runs overwrite the same doc instead of accumulating duplicates.
  const _id = `seed-rsh-${space}-${entityId}-${slot}`;

  const doc = {
    '@timestamp': timestamp.toISOString(),
    [entityType]: {
      name: entityId,
      risk: {
        calculated_score: scoreNorm,
        calculated_score_norm: scoreNorm,
        calculated_level: level,
        id_field: 'entity.id',
        id_value: entityId,
        score_type: 'base',
      },
    },
  };

  return { _id, doc };
};

const logSummary = (scored: ScoredEntity[]) => {
  const label = (e: ScoredEntity) =>
    e.entity._source?.user?.name ??
    e.entity._source?.host?.name ??
    e.entity._source?.entity?.name ??
    e.entity._id;

  const newlyHigh = scored.filter((e) => e.scenario === 'newly_high');
  const movers = scored.filter((e) => e.scenario === 'mover');
  const stable = scored.filter((e) => e.scenario === 'stable');

  log.info(`\nSeeded risk score history summary:`);

  log.info(`  Newly High/Critical (${newlyHigh.length}):`);
  for (const e of newlyHigh) {
    log.info(
      `    [${e.entityType}] ${label(e)}: ${e.yesterdayScore.toFixed(1)} (${scoreNormToLevel(e.yesterdayScore)}) → ${e.todayScore.toFixed(1)} (${scoreNormToLevel(e.todayScore)})`,
    );
  }

  log.info(`  Risk Movers ≥10pt delta (${movers.length}):`);
  for (const e of movers) {
    const delta = e.todayScore - e.yesterdayScore;
    log.info(
      `    [${e.entityType}] ${label(e)}: ${e.yesterdayScore.toFixed(1)} → ${e.todayScore.toFixed(1)} (+${delta.toFixed(1)})`,
    );
  }

  log.info(`  Stable (${stable.length}): score variation ≤5`);
};

export interface SeedRiskScoreHistoryOptions {
  count: number;
  space: string;
  yesterdayHours: number;
  todayHours: number;
  newlyHighCount: number;
  moverCount: number;
  clean?: boolean;
}

export const seedRiskScoreHistory = async (opts: SeedRiskScoreHistoryOptions) => {
  const { count, space, yesterdayHours, todayHours, newlyHighCount, moverCount, clean } = opts;
  const riskScoreIndex = `risk-score.risk-score-${space}`;

  log.info(`Fetching entities from entity store in space "${space}"...`);
  const [userHits, hostHits] = await Promise.all([
    fetchEntities(count, space, 'Identity'),
    fetchEntities(count, space, 'Host'),
  ]);

  const allEntities = [
    ...userHits.map((entity) => ({ entity, entityType: 'user' as const })),
    ...hostHits.map((entity) => ({ entity, entityType: 'host' as const })),
  ];

  if (allEntities.length === 0) {
    throw new Error(
      `No entities found in space "${space}". Run risk-score-v2 first to seed entities.`,
    );
  }

  log.info(
    `Found ${allEntities.length} entities (${userHits.length} users, ${hostHits.length} hosts).`,
  );

  const scored = assignScenarios(allEntities, newlyHighCount, moverCount);

  const yesterdayTs = new Date(Date.now() - yesterdayHours * 3600_000);
  const todayTs = new Date(Date.now() - todayHours * 3600_000);

  const yesterdayResults = scored.map(({ entity, entityType, yesterdayScore }) =>
    buildRiskScoreDoc(entity, entityType, yesterdayScore, yesterdayTs, space, 'yesterday'),
  );

  const todayResults = scored.map(({ entity, entityType, todayScore }) =>
    buildRiskScoreDoc(entity, entityType, todayScore, todayTs, space, 'today'),
  );

  const allResults = [...yesterdayResults, ...todayResults];

  if (clean) {
    const allIds = allResults.map(({ _id }) => _id);
    log.info(`Deleting ${allIds.length} previously-seeded docs from ${riskScoreIndex}...`);
    const esClient = getEsClient();
    await esClient.deleteByQuery({
      index: riskScoreIndex,
      ignore_unavailable: true,
      // Target only our own seeded docs by their deterministic IDs — real risk engine
      // docs have auto-generated IDs and will not be matched.
      query: { ids: { values: allIds } },
    });
    log.info('Clean complete.');
  }

  log.info(
    `Building two batches: yesterday=${yesterdayTs.toISOString()}, today=${todayTs.toISOString()}`,
  );
  log.info(`Indexing ${allResults.length} documents into ${riskScoreIndex}...`);

  // Use pre-built bulk body with deterministic _ids.
  // Data streams require op_type=create, but custom _id is accepted.
  const bulkBody = allResults.flatMap(({ _id, doc }) => [
    { create: { _index: riskScoreIndex, _id } },
    doc,
  ]);

  await bulkUpsert({ documents: bulkBody });

  logSummary(scored);
  log.info(`\nDone. Indexed into ${riskScoreIndex}.`);
};
