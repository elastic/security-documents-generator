import { createHash } from 'crypto';
import { log } from '../../utils/logger.ts';
import { getAlertIndex } from '../../utils/index.ts';
import { getConfig } from '../../get_config.ts';
import {
  createPlaceholderSecurityMlJob,
  createWatchlist,
  deleteWatchlist,
  getMlJobsSummary,
} from '../../utils/kibana_api.ts';
import { ML_GROUP_ID } from '../../constants.ts';
import { getEsClient } from '../utils/indices.ts';
import { bulkUpsert } from '../shared/elasticsearch.ts';
import createAlerts from '../../generators/create_alerts.ts';
import { generateDedRecords } from '../misc/anomalous_behavior/generators/index.ts';
import { applyV2Fields } from '../misc/anomalous_behavior/generators/utils.ts';

const HOUR_MS = 3600_000;
const SHARED_ANOMALIES_INDEX = '.ml-anomalies-shared';
const WATCHLIST_NAME = 'tile-test-watchlist';
const ANOMALY_RECORD_SCORE = 50;
const MOVER_POINTS = 10;

// A risk score 0.1 hour before a boundary sits inside the 2 hours the risk tiles read before it, and
// stays there for about 1.9 hours, so the numbers hold for about an hour or so after seeding.
const BOUNDARY_OFFSET_HOURS = 0.1;

// The ranges of the tiles. A sparkline has 6 dots; dot k is the tile's number over a window of the
// range's length that ends k steps ago. The delta compares the range with the one before it.
const RANGES = [
  { label: '24h', hours: 24, stepHours: 4 },
  { label: '7d', hours: 168, stepHours: 28 },
  { label: '30d', hours: 720, stepHours: 120 },
] as const;
const DOTS = 6;

type Kind = 'host' | 'user';
type Severity = 'low' | 'medium' | 'high' | 'critical';

interface EntitySpec {
  slug: string;
  kind: Kind;
  /** First seen this many hours ago. */
  firstSeenHours: number;
  /** Risk score on the entity now; the New & alerting tile needs it above 0. */
  score?: number;
  watchlisted?: boolean;
  /** One alert at each of these ages (hours before now). */
  alerts?: { severity: Severity; ages: number[] };
  /** One anomaly record at each of these ages (host entities only). */
  anomalyAges?: number[];
  /** Risk history: `hi` for the last `hours` hours, `lo` before that. */
  rise?: { hours: number; lo: number; hi: number };
}

// One set of entities. Ages are chosen so that every tile has something to count on 24h, 7d and
// 30d, something in the period before (so there is a delta, up and down), and something in each of
// the last dots (so the sparkline has a line). They stay clear of the window edges, so the numbers
// hold for about an hour. `expectedTiles` works out what every tile should show from these same
// definitions. The oldest alert and anomaly are 65 days old, which is what the tiles need to
// have history for the deltas.
const ENTITY_SET: readonly EntitySpec[] = [
  {
    slug: 'severe-steady',
    kind: 'host',
    firstSeenHours: 2400,
    alerts: { severity: 'high', ages: [1, 21, 144, 590, 1560] },
  },
  {
    slug: 'severe-recent',
    kind: 'user',
    firstSeenHours: 2400,
    alerts: { severity: 'critical', ages: [1, 9, 100, 400] },
  },
  {
    slug: 'severe-older',
    kind: 'host',
    firstSeenHours: 2400,
    alerts: { severity: 'high', ages: [40, 100, 250] },
  },
  {
    slug: 'watch-steady',
    kind: 'host',
    firstSeenHours: 2400,
    watchlisted: true,
    alerts: { severity: 'medium', ages: [1, 21, 144, 590] },
  },
  {
    slug: 'watch-recent',
    kind: 'user',
    firstSeenHours: 2400,
    watchlisted: true,
    alerts: { severity: 'low', ages: [1, 9, 100, 400] },
  },
  {
    slug: 'watch-before',
    kind: 'host',
    firstSeenHours: 2400,
    watchlisted: true,
    alerts: { severity: 'medium', ages: [30, 200, 800] },
  },
  {
    slug: 'anomaly-steady',
    kind: 'host',
    firstSeenHours: 2400,
    anomalyAges: [1, 21, 144, 590, 1560],
  },
  { slug: 'anomaly-recent', kind: 'host', firstSeenHours: 2400, anomalyAges: [1, 9, 100, 400] },
  { slug: 'anomaly-before-a', kind: 'host', firstSeenHours: 2400, anomalyAges: [30, 200, 800] },
  { slug: 'anomaly-before-b', kind: 'host', firstSeenHours: 2400, anomalyAges: [35, 220, 900] },
  { slug: 'anomaly-before-c', kind: 'host', firstSeenHours: 2400, anomalyAges: [38, 230, 950] },
  ...[1, 9, 17, 22, 40, 100, 250, 1080].map((age): EntitySpec => ({
    slug: `new-${age}h`,
    kind: age % 2 === 1 ? 'host' : 'user',
    firstSeenHours: age,
    score: 5,
    alerts: { severity: 'medium', ages: [age] },
  })),
  {
    slug: 'risk-a',
    kind: 'user',
    firstSeenHours: 2400,
    score: 75,
    rise: { hours: 22, lo: 30, hi: 75 },
  },
  {
    slug: 'risk-b',
    kind: 'host',
    firstSeenHours: 2400,
    score: 55,
    rise: { hours: 100, lo: 40, hi: 55 },
  },
  {
    slug: 'risk-c',
    kind: 'host',
    firstSeenHours: 2400,
    score: 55,
    rise: { hours: 500, lo: 40, hi: 55 },
  },
  {
    slug: 'risk-d',
    kind: 'user',
    firstSeenHours: 2400,
    score: 75,
    rise: { hours: 100, lo: 65, hi: 75 },
  },
  {
    slug: 'risk-e',
    kind: 'user',
    firstSeenHours: 2400,
    score: 95,
    rise: { hours: 500, lo: 85, hi: 95 },
  },
];

/** How many entities one set holds; `--entities` is rounded down to whole sets. */
export const NAT_TILES_SET_SIZE = ENTITY_SET.length;

const levelRank = (score: number): number => {
  if (score < 20) return 0; // Unknown
  if (score < 40) return 1; // Low
  if (score < 70) return 2; // Moderate
  if (score < 90) return 3; // High
  return 4; // Critical
};

const LEVEL_NAMES = ['Unknown', 'Low', 'Moderate', 'High', 'Critical'];
const scoreToLevel = (score: number): string => LEVEL_NAMES[levelRank(score)];

const hasAgeIn = (ages: number[] | undefined, from: number, to: number): boolean =>
  (ages ?? []).some((age) => age >= from && age < to);

// What each tile counts in a window of ages [from, to) hours before now. `rise` entities are
// movers when their score went up inside the window: high at its end, low at its start.
const TILES: ReadonlyArray<{
  name: string;
  counts: (spec: EntitySpec, from: number, to: number) => boolean;
}> = [
  {
    name: 'Severely alerting',
    counts: ({ alerts }, from, to) =>
      alerts !== undefined &&
      (alerts.severity === 'high' || alerts.severity === 'critical') &&
      hasAgeIn(alerts.ages, from, to),
  },
  { name: 'Anomalous', counts: ({ anomalyAges }, from, to) => hasAgeIn(anomalyAges, from, to) },
  {
    name: 'Risk movers',
    counts: ({ rise }, from, to) =>
      rise !== undefined &&
      rise.hi - rise.lo >= MOVER_POINTS &&
      from < rise.hours &&
      rise.hours <= to,
  },
  {
    name: 'Newly high-risk',
    counts: ({ rise }, from, to) =>
      rise !== undefined &&
      levelRank(rise.hi) >= 3 &&
      levelRank(rise.hi) > levelRank(rise.lo) &&
      from < rise.hours &&
      rise.hours <= to,
  },
  {
    name: 'Watchlisted & alerting',
    counts: ({ watchlisted, alerts }, from, to) =>
      watchlisted === true && alerts !== undefined && hasAgeIn(alerts.ages, from, to),
  },
  {
    name: 'New & alerting',
    counts: ({ score, firstSeenHours }, from, to) =>
      (score ?? 0) > 0 && firstSeenHours >= from && firstSeenHours < to,
  },
];

export interface ExpectedTile {
  tile: string;
  /** The number on the tile. */
  count: number;
  /** The badge: the number now minus the number for the period before. */
  change: number;
  /** The sparkline, oldest dot first; it ends on `count`. */
  dots: number[];
}

export const expectedTiles = (copies: number): Array<{ range: string; tiles: ExpectedTile[] }> =>
  RANGES.map(({ label, hours, stepHours }) => ({
    range: label,
    tiles: TILES.map(({ name, counts }) => {
      const countIn = (from: number, to: number): number =>
        ENTITY_SET.filter((spec) => counts(spec, from, to)).length * copies;
      const count = countIn(0, hours);
      const dots = Array.from({ length: DOTS }, (_, k) =>
        countIn(k * stepHours, k * stepHours + hours),
      ).reverse();
      return { tile: name, count, change: count - countIn(hours, 2 * hours), dots };
    }),
  }));

// The ages at which the risk tiles read a score: the end and the start of every dot's window, and
// the start of each previous period.
const RISK_AGES: readonly number[] = [
  ...new Set(
    RANGES.flatMap(({ hours, stepHours }) => [
      ...Array.from({ length: DOTS - 1 }, (_, k) => (k + 1) * stepHours),
      ...Array.from({ length: DOTS }, (_, k) => k * stepHours + hours),
      2 * hours,
    ]),
  ),
].sort((a, b) => a - b);

export interface NatTilesOptions {
  space: string;
  entities: number;
  clean: boolean;
}

interface Doc {
  index: string;
  id: string;
  doc: Record<string, unknown>;
}

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

const riskFields = (score: number) => ({
  calculated_score: score,
  calculated_score_norm: score,
  calculated_level: scoreToLevel(score),
});

const copiesFor = (entities: number): number =>
  Math.max(1, Math.floor(entities / NAT_TILES_SET_SIZE));

const nameOf = (spec: EntitySpec, copy: number): string =>
  `tile-${spec.slug}${copy === 0 ? '' : `-${copy}`}`;

const entityIdOf = (spec: EntitySpec, copy: number): string =>
  spec.kind === 'host'
    ? `host:${nameOf(spec, copy)}-id`
    : `user:${nameOf(spec, copy)}@example.com@okta`;

const buildEntityDoc = (
  spec: EntitySpec,
  copy: number,
  now: number,
  watchlistId: string | undefined,
): Record<string, unknown> => {
  const name = nameOf(spec, copy);
  const nowIso = new Date(now).toISOString();
  const lifecycle = {
    first_seen: new Date(now - spec.firstSeenHours * HOUR_MS).toISOString(),
    last_activity: nowIso,
    last_seen: nowIso,
  };
  const attributes =
    spec.watchlisted && watchlistId ? { attributes: { watchlists: [watchlistId] } } : {};
  const risk = spec.score === undefined ? {} : { risk: riskFields(spec.score) };

  if (spec.kind === 'host') {
    return {
      '@timestamp': nowIso,
      data_stream: { dataset: 'okta.system' },
      host: { name, id: `${name}-id` },
      event: { module: 'okta', dataset: 'okta.system' },
      entity: {
        lifecycle,
        EngineMetadata: { Type: 'host', UntypedId: `${name}-id` },
        name,
        ...risk,
        source: 'okta',
        id: entityIdOf(spec, copy),
        type: 'Host',
        ...attributes,
      },
    };
  }

  const email = `${name}@example.com`;
  return {
    '@timestamp': nowIso,
    data_stream: { dataset: 'okta.system' },
    event: { kind: 'asset', module: 'okta', category: 'iam', type: 'user', dataset: 'okta.system' },
    user: { name, id: `${name}-id`, email },
    entity: {
      lifecycle,
      EngineMetadata: { Type: 'user', UntypedId: `${email}@okta` },
      confidence: 'high',
      namespace: 'okta',
      name,
      ...risk,
      source: 'okta',
      id: entityIdOf(spec, copy),
      type: 'Identity',
      ...attributes,
    },
  };
};

const buildRiskDoc = (
  spec: EntitySpec,
  copy: number,
  timestamp: number,
  score: number,
): Doc['doc'] => ({
  '@timestamp': new Date(timestamp).toISOString(),
  [spec.kind]: {
    name: entityIdOf(spec, copy),
    risk: {
      ...riskFields(score),
      id_field: 'entity.id',
      id_value: entityIdOf(spec, copy),
      score_type: 'base',
    },
  },
});

const buildAlertDoc = (
  spec: EntitySpec,
  copy: number,
  space: string,
  severity: Severity,
  timestamp: number,
  idSuffix: string,
): Record<string, unknown> => {
  const name = nameOf(spec, copy);
  const alertUuid = sha256(`seed-nat-tiles-alert-${space}-${name}-${idSuffix}`).slice(0, 32);
  const overrides = {
    'kibana.alert.uuid': alertUuid,
    'kibana.alert.entity.id': entityIdOf(spec, copy),
    'kibana.alert.workflow_status': 'open',
    'kibana.alert.severity': severity,
    'kibana.alert.rule.severity': severity,
  };
  if (spec.kind === 'host') {
    const alert: Record<string, unknown> = createAlerts(overrides, {
      hostName: name,
      hostId: `${name}-id`,
      space,
      timestamp,
    });
    delete alert['user.name'];
    return alert;
  }
  const alert: Record<string, unknown> = createAlerts(overrides, {
    userName: name,
    userId: `${name}-id`,
    eventModule: 'okta',
    space,
    timestamp,
  });
  // createAlerts always sets a placeholder host.name; drop it so the alert only belongs to this user.
  delete alert['host.name'];
  return alert;
};

const buildAnomalyDoc = (
  spec: EntitySpec,
  copy: number,
  timestamp: number,
): Record<string, unknown> | undefined => {
  const name = nameOf(spec, copy);
  const [record] = generateDedRecords(1, { hosts: [{ id: `${name}-id`, name }] });
  if (!record) return undefined;
  const ts = new Date(timestamp).toISOString();
  return {
    ...applyV2Fields(record),
    timestamp: ts,
    result_type: 'record',
    is_interim: false,
    record_score: ANOMALY_RECORD_SCORE,
    initial_record_score: ANOMALY_RECORD_SCORE,
  };
};

const anomalyJobIds = (): string[] => [
  ...new Set(generateDedRecords(1).map((record) => String(applyV2Fields(record).job_id))),
];

interface Dataset {
  entities: Doc[];
  risk: Doc[];
  alerts: Doc[];
  anomalies: Doc[];
}

const buildDataset = ({
  space,
  copies,
  now,
  watchlistId,
  entityIndex,
}: {
  space: string;
  copies: number;
  now: number;
  watchlistId: string | undefined;
  entityIndex: string;
}): Dataset => {
  const dataset: Dataset = { entities: [], risk: [], alerts: [], anomalies: [] };
  const riskIndex = `risk-score.risk-score-${space}`;
  const alertIndex = getAlertIndex(space);

  for (let copy = 0; copy < copies; copy++) {
    for (const spec of ENTITY_SET) {
      const entityId = entityIdOf(spec, copy);
      const name = nameOf(spec, copy);
      dataset.entities.push({
        index: entityIndex,
        id: sha256(entityId),
        doc: buildEntityDoc(spec, copy, now, watchlistId),
      });

      const { rise, alerts, anomalyAges } = spec;
      if (rise) {
        for (const age of RISK_AGES) {
          dataset.risk.push({
            index: riskIndex,
            id: `seed-nat-tiles-${space}-${entityId}-${age}h`,
            doc: buildRiskDoc(
              spec,
              copy,
              now - (age + BOUNDARY_OFFSET_HOURS) * HOUR_MS,
              age < rise.hours ? rise.hi : rise.lo,
            ),
          });
        }
      }

      for (const age of alerts?.ages ?? []) {
        const doc = buildAlertDoc(
          spec,
          copy,
          space,
          alerts?.severity ?? 'medium',
          now - age * HOUR_MS,
          `${age}h`,
        );
        dataset.alerts.push({ index: alertIndex, id: String(doc['kibana.alert.uuid']), doc });
      }

      for (const age of anomalyAges ?? []) {
        const doc = buildAnomalyDoc(spec, copy, now - age * HOUR_MS);
        if (doc) {
          dataset.anomalies.push({
            index: SHARED_ANOMALIES_INDEX,
            id: `seed-nat-tiles-anomaly-${space}-${name}-${age}h`,
            doc,
          });
        }
      }
    }
  }
  return dataset;
};

const fail = (message: string): never => {
  log.error(message);
  process.exit(1);
};

const resolveEntityIndex = async (space: string): Promise<string> => {
  const alias = `.entities.v2.latest.security_${space}`;
  try {
    const aliasInfo = await getEsClient().indices.getAlias({ name: alias });
    const [index] = Object.keys(aliasInfo);
    if (index) return index;
  } catch {
    // Handled below with one clear message.
  }
  return fail(
    `The Entity Store is not installed in the "${space}" space (no ${alias} alias). ` +
      'Install it in Kibana (Security > Entity analytics), then run this command again.',
  );
};

const checkLicense = async (): Promise<void> => {
  const { license } = await getEsClient().license.get();
  if (!['platinum', 'enterprise', 'trial'].includes(license.type)) {
    fail(
      `Entity Analytics needs a Platinum, Enterprise or trial license, and this cluster has "${license.type}". ` +
        'Start a trial in Kibana (Stack Management > License Management) and run this command again.',
    );
  }
};

const ensureMlJobs = async (space: string): Promise<void> => {
  const jobIds = anomalyJobIds();
  const failures: string[] = [];
  let created = 0;
  try {
    const summary = (await getMlJobsSummary(jobIds, space)) as Array<{
      id: string;
      groups?: string[];
    }>;
    const installed = new Map(summary.map((job) => [job.id, job]));
    for (const jobId of jobIds) {
      const job = installed.get(jobId);
      if (job) {
        if (!(job.groups ?? []).includes(ML_GROUP_ID)) {
          failures.push(`${jobId}: exists but is not in the "${ML_GROUP_ID}" group`);
        }
        continue;
      }
      try {
        await createPlaceholderSecurityMlJob(jobId, space);
        created++;
      } catch (error) {
        const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
        failures.push(`${jobId}: ${message.slice(0, 200)}`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
    failures.push(message.slice(0, 200));
  }
  if (failures.length > 0) {
    fail(
      'The security machine learning jobs could not be installed, so the Anomalous tile would show 0. ' +
        'Check that Machine Learning is available on this cluster and that Kibana is running. ' +
        `Nothing was written. Details: ${failures.join('; ')}`,
    );
  }
  log.info(
    `Security ML jobs: ${jobIds.length - created} already installed, ${created} placeholder jobs created.`,
  );
};

/** The id of the watchlist a previous run created, read from the seeded entity. */
const findExistingWatchlistId = async (entityIndex: string): Promise<string | undefined> => {
  const spec = ENTITY_SET.find((s) => s.watchlisted);
  if (!spec) return undefined;
  try {
    const hit = await getEsClient().get<{ entity?: { attributes?: { watchlists?: string[] } } }>({
      index: entityIndex,
      id: sha256(entityIdOf(spec, 0)),
    });
    return hit._source?.entity?.attributes?.watchlists?.[0];
  } catch {
    return undefined;
  }
};

// The risk score index is a data stream, so its documents cannot be overwritten. Removing this
// command's documents first lets a repeat run put fresh timestamps back, which the risk tiles need.
const removeRiskDocs = async (space: string, copies: number): Promise<number> => {
  const entityIds = ENTITY_SET.flatMap((spec) =>
    Array.from({ length: copies }, (_, copy) => entityIdOf(spec, copy)),
  );
  const result = await getEsClient().deleteByQuery({
    index: `risk-score.risk-score-${space}`,
    query: {
      bool: {
        should: [
          { terms: { 'host.risk.id_value': entityIds } },
          { terms: { 'user.risk.id_value': entityIds } },
        ],
        minimum_should_match: 1,
      },
    },
    refresh: true,
    conflicts: 'proceed',
  });
  return result.deleted ?? 0;
};

// Data streams (the risk score index) only accept `create`; the other indices take `index`, which
// overwrites a document from an earlier run, so running the command again does not duplicate anything.
// `bulkUpsert` is the shared helper for a pre-built body with custom ids across indices.
const bulkWrite = async (
  label: string,
  docs: Doc[],
  action: 'index' | 'create' = 'index',
): Promise<void> => {
  if (docs.length === 0) return;
  const result = await bulkUpsert({
    documents: docs.flatMap(({ index, id, doc }) => [
      { [action]: { _index: index, _id: id } },
      doc,
    ]),
    refresh: true,
  });
  if (result.errors) {
    const first = result.items.map((item) => item[action]?.error).find(Boolean);
    fail(`Writing ${label} failed: ${first?.type ?? 'unknown error'}: ${first?.reason ?? ''}`);
  }
  log.info(`Wrote ${docs.length} ${label}.`);
};

const printSummary = (space: string, copies: number): void => {
  const kibana = getConfig().kibana.node.replace(/\/$/, '');
  const spacePath = space === 'default' ? '' : `/s/${space}`;
  log.info('');
  log.info(
    'Expected on each range: the number, the change against the period before it, and the sparkline (oldest dot first, ending on the number):',
  );
  for (const { range, tiles } of expectedTiles(copies)) {
    log.info(`  Last ${range}`);
    for (const { tile, count, change, dots } of tiles) {
      const sign = change > 0 ? '+' : '';
      log.info(
        `    ${tile.padEnd(24)} ${String(count).padStart(3)}  ${`${sign}${change}`.padEnd(4)} ${dots.join(', ')}`,
      );
    }
  }
  log.info('');
  log.info(`Open: ${kibana}${spacePath}/app/security/entity_analytics_home_page`);
  log.info(
    'The new page needs this in kibana.yml (then restart Kibana): ' +
      'feature_flags.overrides: { securitySolution.useNewEntityAnalyticsPage: true }',
  );
  log.info(
    'Reload the page after seeding (tile results are cached for an hour). The numbers hold for about an hour; ' +
      'run the command again to refresh them. A running risk engine can overwrite the seeded risk scores.',
  );
};

const clean = async ({ space, copies }: { space: string; copies: number }): Promise<void> => {
  const entityIndex = await resolveEntityIndex(space);
  const watchlistId = await findExistingWatchlistId(entityIndex);
  const dataset = buildDataset({ space, copies, now: Date.now(), watchlistId, entityIndex });
  const client = getEsClient();
  log.info(`Removed ${await removeRiskDocs(space, copies)} risk scores.`);
  for (const [label, docs] of Object.entries(dataset)) {
    if (docs.length === 0 || label === 'risk') continue;
    const byIndex = new Map<string, string[]>();
    for (const { index, id } of docs) byIndex.set(index, [...(byIndex.get(index) ?? []), id]);
    for (const [index, ids] of byIndex) {
      const result = await client.deleteByQuery({
        index,
        query: { ids: { values: ids } },
        refresh: true,
        conflicts: 'proceed',
      });
      log.info(`Removed ${result.deleted ?? 0} ${label} from ${index}.`);
    }
  }
  if (watchlistId) {
    try {
      await deleteWatchlist({ id: watchlistId, space });
      log.info(`Removed watchlist ${WATCHLIST_NAME}.`);
    } catch {
      log.warn(
        `Could not remove the watchlist ${watchlistId}; remove it in Kibana if it is still there.`,
      );
    }
  }
  log.info('The security ML placeholder jobs were left in place; they are harmless.');
};

export const seedNatTiles = async ({ space, entities, clean: shouldClean }: NatTilesOptions) => {
  const copies = copiesFor(entities);
  if (shouldClean) {
    await clean({ space, copies });
    return;
  }

  await checkLicense();
  const entityIndex = await resolveEntityIndex(space);
  await ensureMlJobs(space);

  let watchlistId = await findExistingWatchlistId(entityIndex);
  if (watchlistId) {
    log.info(`Using the watchlist from the previous run (${watchlistId}).`);
  } else {
    const watchlist = await createWatchlist({ name: WATCHLIST_NAME, riskModifier: 1.5, space });
    watchlistId = watchlist.id;
    log.info(`Created watchlist ${WATCHLIST_NAME} (${watchlistId}).`);
  }

  const dataset = buildDataset({ space, copies, now: Date.now(), watchlistId, entityIndex });
  log.info(`Seeding ${copies * NAT_TILES_SET_SIZE} entities into the "${space}" space.`);
  await bulkWrite('entities', dataset.entities);
  const removed = await removeRiskDocs(space, copies);
  if (removed > 0) log.info(`Replaced ${removed} risk scores from an earlier run.`);
  await bulkWrite('risk scores', dataset.risk, 'create');
  await bulkWrite('alerts', dataset.alerts);
  await bulkWrite('anomaly records', dataset.anomalies);
  printSummary(space, copies);
};
