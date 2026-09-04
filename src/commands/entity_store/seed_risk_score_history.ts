import { log } from '../../utils/logger.ts';
import { faker } from '@faker-js/faker';
import { bulkIngest } from '../shared/elasticsearch.ts';
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
      // Yesterday: Low or Medium (< 70). Today: High or Critical (≥ 70).
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
): object => {
  const src = entity._source;
  const entityName =
    entityType === 'user'
      ? (src.user?.name ?? src.entity?.name)
      : (src.host?.name ?? src.entity?.name);
  const name = entityName ?? entity._id;
  const idField = `${entityType}.name`;
  const level = scoreNormToLevel(scoreNorm);

  return {
    '@timestamp': timestamp.toISOString(),
    [entityType]: {
      name,
      risk: {
        calculated_score: scoreNorm,
        calculated_score_norm: scoreNorm,
        calculated_level: level,
        id_field: idField,
        id_value: name,
        score_type: 'risk_score',
      },
    },
  };
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
}

export const seedRiskScoreHistory = async (opts: SeedRiskScoreHistoryOptions) => {
  const { count, space, yesterdayHours, todayHours, newlyHighCount, moverCount } = opts;
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

  log.info(
    `Building two batches: yesterday=${yesterdayTs.toISOString()}, today=${todayTs.toISOString()}`,
  );

  const yesterdayDocs = scored.map(({ entity, entityType, yesterdayScore }) =>
    buildRiskScoreDoc(entity, entityType, yesterdayScore, yesterdayTs),
  );

  const todayDocs = scored.map(({ entity, entityType, todayScore }) =>
    buildRiskScoreDoc(entity, entityType, todayScore, todayTs),
  );

  const allDocs = [...yesterdayDocs, ...todayDocs];

  log.info(`Indexing ${allDocs.length} documents into ${riskScoreIndex}...`);

  await bulkIngest({ index: riskScoreIndex, documents: allDocs, action: 'create' });

  logSummary(scored);
  log.info(`\nDone. Indexed into ${riskScoreIndex}.`);
};
