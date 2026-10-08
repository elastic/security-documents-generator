import { getEsClient } from '../utils/indices.ts';
import { API_VERSIONS, getEntityStoreIndex } from '../../constants.ts';
import { getAlertIndex } from '../../utils/get_alert_index.ts';
import { getEntityMaintainers, kibanaFetch } from '../../utils/kibana_api.ts';
import {
  hostByKey,
  hostEuid,
  idpUserEuid,
  localUserEuid,
  userByKey,
  USERS,
  S1_ALERTS,
} from './scenario.ts';
import { riskIndex } from './risk.ts';
import { alertUuid } from './alerts.ts';
import { AD_CONNECTOR_NAME } from './extras.ts';
import { DAY_MS, SCENARIO_TAG } from './utils.ts';

export interface CheckResult {
  id: string;
  name: string;
  pass: boolean;
  detail: string;
}

type Json = Record<string, unknown>;
const getPath = (source: unknown, path: string): unknown => {
  const flat = (source as Json | undefined)?.[path];
  if (flat !== undefined) return flat;
  return path.split('.').reduce<unknown>((acc, part) => (acc as Json | undefined)?.[part], source);
};
const asList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map(String)
    : value === undefined || value === null
      ? []
      : [String(value)];

const check = (id: string, name: string, pass: boolean, detail: string): CheckResult => ({
  id,
  name,
  pass,
  detail,
});

const safe = async (
  id: string,
  name: string,
  fn: () => Promise<CheckResult>,
): Promise<CheckResult> => {
  try {
    return await fn();
  } catch (error) {
    return check(id, name, false, `error: ${String(error).slice(0, 300)}`);
  }
};

export const runVerification = async ({
  space,
  anchor,
  mlEnabled,
  caseId,
}: {
  space: string;
  anchor: Date;
  mlEnabled: boolean;
  caseId?: string;
}): Promise<CheckResult[]> => {
  const client = getEsClient();
  const entityIndex = getEntityStoreIndex(space);
  const rodriguez = userByKey('a.rodriguez');
  const golden = idpUserEuid(rodriguez);
  const laptop = hostByKey('LAPTOP-FIN03');
  const jump = hostByKey('jump-box-01');
  const prod = hostByKey('docker-host-prod-01');
  const aliasOn = (host: typeof laptop) => localUserEuid(rodriguez, host);

  const results: CheckResult[] = [];
  const days = (ts: string | number | undefined): string =>
    ts === undefined
      ? 'n/a'
      : `D-${((anchor.getTime() - new Date(ts).getTime()) / DAY_MS).toFixed(1)}`;

  results.push(
    await safe('1', 'Entities exist with criticality/watchlist', async () => {
      const ids = [golden, hostEuid(laptop), hostEuid(jump), hostEuid(prod)];
      const res = await client.search({
        index: entityIndex,
        size: 20,
        query: { terms: { 'entity.id': ids } },
      });
      const byId = new Map(
        res.hits.hits.map((h) => [String(getPath(h._source, 'entity.id')), h._source]),
      );
      const crit = (id: string) => String(getPath(byId.get(id), 'asset.criticality') ?? 'none');
      const watch = asList(getPath(byId.get(golden), 'entity.attributes.watchlists'));
      const pass =
        ids.every((id) => byId.has(id)) &&
        crit(hostEuid(prod)) === 'extreme_impact' &&
        crit(hostEuid(jump)) === 'high_impact' &&
        watch.length > 0;
      return check(
        '1',
        'Entities exist with criticality/watchlist',
        pass,
        `present=${byId.size}/4 prod=${crit(hostEuid(prod))} jump=${crit(hostEuid(jump))} laptop=${crit(hostEuid(laptop))} watchlists=${JSON.stringify(watch)}`,
      );
    }),
  );

  results.push(
    await safe('2', 'Resolution: aliases point at golden identity', async () => {
      const counts: Record<string, number> = {};
      for (const user of USERS.filter((u) => u.resolve).slice(0, 3)) {
        const res = await client.count({
          index: entityIndex,
          query: { term: { 'entity.relationships.resolution.resolved_to': idpUserEuid(user) } },
        });
        counts[user.userName] = res.count;
      }
      const pass = counts['a.rodriguez'] === 3 && counts['j.chen'] === 1;
      return check(
        '2',
        'Resolution: aliases point at golden identity',
        pass,
        JSON.stringify(counts),
      );
    }),
  );

  results.push(
    await safe('3', 'Relationships: frequently vs infrequently', async () => {
      const res = await client.search({
        index: entityIndex,
        size: 10,
        query: { prefix: { 'entity.id': 'user:a.rodriguez@' } },
      });
      const edges: Record<string, { freq: string[]; infreq: string[]; comms: string[] }> = {};
      for (const hit of res.hits.hits) {
        edges[String(getPath(hit._source, 'entity.id'))] = {
          freq: asList(getPath(hit._source, 'entity.relationships.accesses_frequently.ids')),
          infreq: asList(getPath(hit._source, 'entity.relationships.accesses_infrequently.ids')),
          comms: asList(getPath(hit._source, 'entity.relationships.communicates_with.ids')),
        };
      }
      const pass =
        edges[aliasOn(laptop)]?.freq.includes(hostEuid(laptop)) === true &&
        edges[aliasOn(jump)]?.infreq.includes(hostEuid(jump)) === true &&
        edges[aliasOn(prod)]?.infreq.includes(hostEuid(prod)) === true;
      return check(
        '3',
        'Relationships: frequently vs infrequently',
        pass,
        `laptop.freq=${edges[aliasOn(laptop)]?.freq.length ?? 0} jump.infreq=${edges[aliasOn(jump)]?.infreq.length ?? 0} prod.infreq=${edges[aliasOn(prod)]?.infreq.length ?? 0}`,
      );
    }),
  );

  results.push(
    await safe('4', 'First-ever relationship timestamps (jump D-3, prod D-2)', async () => {
      const res = await client.search({
        index: `entities-metadata-${space}`,
        size: 0,
        query: {
          bool: {
            filter: [
              { term: { 'event.action': 'relationship_observed' } },
              { prefix: { 'entity.id': 'user:a.rodriguez@' } },
            ],
          },
        },
        aggs: {
          by_target: {
            terms: { field: 'entity.relationships.accesses_infrequently.target', size: 10 },
            aggs: { first: { min: { field: '@timestamp' } } },
          },
        },
      });
      const buckets =
        (
          res.aggregations?.by_target as {
            buckets?: Array<{ key: string; first: { value: number } }>;
          }
        )?.buckets ?? [];
      const first = (host: typeof jump) =>
        buckets.find((b) => b.key === hostEuid(host))?.first.value;
      const jumpAge =
        first(jump) === undefined ? NaN : (anchor.getTime() - (first(jump) as number)) / DAY_MS;
      const prodAge =
        first(prod) === undefined ? NaN : (anchor.getTime() - (first(prod) as number)) / DAY_MS;
      const pass = Math.abs(jumpAge - 3) < 1.1 && Math.abs(prodAge - 2) < 1.1;
      return check(
        '4',
        'First-ever relationship timestamps (jump D-3, prod D-2)',
        pass,
        `jump first=${days(first(jump))} prod first=${days(first(prod))}`,
      );
    }),
  );

  results.push(
    await safe('5', 'Alerts carry MITRE + EUIDs; tactic order for S1', async () => {
      const res = await client.search({
        index: getAlertIndex(space),
        size: 0,
        query: {
          bool: {
            filter: [
              { term: { 'kibana.alert.rule.tags': SCENARIO_TAG } },
              { term: { 'kibana.alert.entity.id': hostEuid(prod) } },
            ],
          },
        },
        aggs: {
          tactic: {
            terms: { field: 'kibana.alert.rule.threat.tactic.id', size: 20 },
            aggs: { first: { min: { field: '@timestamp' } } },
          },
        },
      });
      const prodTactics =
        (res.aggregations?.tactic as { buckets?: Array<{ key: string; first: { value: number } }> })
          ?.buckets ?? [];
      const all = await client.search({
        index: getAlertIndex(space),
        size: 0,
        query: {
          bool: {
            filter: [
              { term: { 'kibana.alert.rule.tags': SCENARIO_TAG } },
              { terms: { 'kibana.alert.uuid': S1_ALERTS.map((a) => alertUuid(a.key)) } },
            ],
          },
        },
        aggs: {
          tactic: {
            terms: { field: 'kibana.alert.rule.threat.tactic.id', size: 20 },
            aggs: { first: { min: { field: '@timestamp' } } },
          },
          no_tactic: { missing: { field: 'kibana.alert.rule.threat.tactic.id' } },
          ecs: { terms: { field: 'threat.tactic.id', size: 5 } },
        },
      });
      const s1Tactics =
        (all.aggregations?.tactic as { buckets?: Array<{ key: string; first: { value: number } }> })
          ?.buckets ?? [];
      const order = [...s1Tactics]
        .sort((a, b) => a.first.value - b.first.value)
        .map((b) => `${b.key}@${days(b.first.value)}`);
      const missing = (all.aggregations?.no_tactic as { doc_count?: number })?.doc_count ?? 0;
      const ecs = (
        (all.aggregations?.ecs as { buckets?: Array<{ key: string }> })?.buckets ?? []
      ).map((b) => b.key);
      const pass =
        s1Tactics.length >= 5 && missing === 1 && ecs.includes('TA0008') && prodTactics.length >= 2;
      return check(
        '5',
        'Alerts carry MITRE + EUIDs; tactic order for S1',
        pass,
        `S1 tactic order=${order.join(' -> ')}; alerts without rule tactic=${missing} (expect 1, EDR promo; ecs=${ecs.join(',')}); prod-host tactics=${prodTactics.length}`,
      );
    }),
  );

  results.push(
    await safe('6', 'Risk history with jumps for docker-host-prod-01', async () => {
      const res = await client.search({
        index: riskIndex(space),
        size: 30,
        sort: [{ '@timestamp': 'asc' }],
        query: { term: { 'host.risk.id_value': hostEuid(prod) } },
        _source: ['@timestamp', 'host.risk.calculated_score_norm', 'host.risk.calculated_level'],
      });
      const series = res.hits.hits.map((h) => ({
        t: String(getPath(h._source, '@timestamp')),
        score: Number(getPath(h._source, 'host.risk.calculated_score_norm')),
      }));
      const nonDecreasing = series.every((p, i) => i === 0 || p.score >= series[i - 1].score);
      const pass =
        series.length >= 4 && nonDecreasing && series[series.length - 1].score > series[0].score;
      return check(
        '6',
        'Risk history with jumps for docker-host-prod-01',
        pass,
        series.map((p) => `${days(p.t)}:${p.score.toFixed(1)}`).join(' '),
      );
    }),
  );

  results.push(
    await safe('7', 'Watchlist list API', async () => {
      const res = await kibanaFetch<{ watchlists?: unknown[]; items?: unknown[] } | unknown[]>(
        '/api/entity_analytics/watchlists/list',
        { method: 'GET' },
        { apiVersion: API_VERSIONS.public.v1, space },
      );
      const count = Array.isArray(res) ? res.length : (res.watchlists ?? res.items ?? []).length;
      return check('7', 'Watchlist list API', count > 0, `watchlists=${count}`);
    }),
  );

  results.push(
    await safe('8', 'Vulnerabilities on docker-host-prod-01', async () => {
      const res = await client.search({
        index: 'logs-cloud_security_posture.vulnerabilities_latest-default',
        size: 0,
        query: { term: { 'host.name': prod.name } },
        aggs: { sev: { terms: { field: 'vulnerability.severity' } } },
      });
      const sev = Object.fromEntries(
        (
          (res.aggregations?.sev as { buckets?: Array<{ key: string; doc_count: number }> })
            ?.buckets ?? []
        ).map((b) => [b.key, b.doc_count]),
      );
      return check(
        '8',
        'Vulnerabilities on docker-host-prod-01',
        sev.CRITICAL === 2,
        JSON.stringify(sev),
      );
    }),
  );

  results.push(
    await safe('9', 'Attack Discovery (S1 + S2) via _find', async () => {
      const res = await kibanaFetch<{
        data?: Array<{ title?: string; alert_ids?: string[] }>;
        total?: number;
      }>(
        '/api/attack_discovery/_find?start=now-30d&per_page=50',
        { method: 'GET' },
        { apiVersion: API_VERSIONS.public.v1, space },
      );
      const titles = (res.data ?? []).map((d) => d.title ?? '');
      const direct = await client.count({
        index: `.alerts-security.attack.discovery.alerts-${space},.adhoc.alerts-security.attack.discovery.alerts-${space}`,
        ignore_unavailable: true,
        query: { term: { 'kibana.alert.attack_discovery.api_config.name': AD_CONNECTOR_NAME } },
      });
      return check(
        '9',
        'Attack Discovery (S1 + S2) via _find',
        (res.total ?? titles.length) >= 2 && direct.count >= 2,
        `_find total=${res.total ?? titles.length} direct=${direct.count} titles=${JSON.stringify(titles)}`,
      );
    }),
  );

  results.push(
    await safe('10', 'Case + case_ids on S2 alerts, acknowledged', async () => {
      const res = await client.search({
        index: getAlertIndex(space),
        size: 0,
        query: { exists: { field: 'kibana.alert.case_ids' } },
        aggs: {
          wf: { terms: { field: 'kibana.alert.workflow_status' } },
          cases: { terms: { field: 'kibana.alert.case_ids' } },
        },
      });
      const wf = Object.fromEntries(
        (
          (res.aggregations?.wf as { buckets?: Array<{ key: string; doc_count: number }> })
            ?.buckets ?? []
        ).map((b) => [b.key, b.doc_count]),
      );
      const cases = (
        (res.aggregations?.cases as { buckets?: Array<{ key: string; doc_count: number }> })
          ?.buckets ?? []
      ).map((b) => `${b.key}:${b.doc_count}`);
      const pass = wf.acknowledged === 3 && cases.some((c) => c.startsWith(String(caseId)));
      return check(
        '10',
        'Case + case_ids on S2 alerts, acknowledged',
        pass,
        `workflow=${JSON.stringify(wf)} cases=${cases.join(',')}`,
      );
    }),
  );

  results.push(
    await safe('11', 'Lead with related entities', async () => {
      const res = await client.search({
        index: `.entity_analytics.entity-leads.entity-${space}`,
        size: 5,
        _source: ['title', 'priority', 'top_related_entities.name', 'entity.id'],
      });
      const titles = res.hits.hits.map((h) => String(getPath(h._source, 'title')));
      return check(
        '11',
        'Lead with related entities',
        res.hits.hits.length >= 1,
        JSON.stringify(titles),
      );
    }),
  );

  results.push(
    await safe('12', 'Maintainer status', async () => {
      const res = await getEntityMaintainers(space);
      const summary = res.maintainers.map((m) => `${m.id}:runs=${m.runs}`);
      const rel = res.maintainers.filter((m) =>
        ['accesses_frequently_and_infrequently', 'communicates_with', 'risk-score'].includes(m.id),
      );
      return check(
        '12',
        'Maintainer status',
        rel.every((m) => m.runs > 0) && rel.length === 3,
        summary.join(' '),
      );
    }),
  );

  // Blind-spot triggers
  results.push(
    await safe('B5', 'Unresolved local users among the noise', async () => {
      const res = await client.count({
        index: entityIndex,
        query: {
          bool: {
            filter: [
              { term: { 'entity.namespace': 'local' } },
              { term: { 'entity.type': 'Identity' } },
            ],
            must_not: [{ exists: { field: 'entity.relationships.resolution.resolved_to' } }],
          },
        },
      });
      return check(
        'B5',
        'Unresolved local users among the noise',
        res.count >= 10,
        `unresolved local users=${res.count}`,
      );
    }),
  );

  results.push(
    await safe('B6', 'High/Critical entity without criticality', async () => {
      const res = await client.search({
        index: entityIndex,
        size: 20,
        _source: ['entity.id', 'entity.risk.calculated_level', 'asset.criticality'],
        query: {
          bool: {
            filter: [{ terms: { 'entity.risk.calculated_level': ['High', 'Critical'] } }],
            must_not: [{ exists: { field: 'asset.criticality' } }],
          },
        },
      });
      const ids = res.hits.hits.map(
        (h) =>
          `${getPath(h._source, 'entity.id')}(${getPath(h._source, 'entity.risk.calculated_level')})`,
      );
      return check(
        'B6',
        'High/Critical entity without criticality',
        ids.length >= 1,
        ids.join(', ') || 'none',
      );
    }),
  );

  results.push(
    await safe('B12', 'ML state', async () => {
      const res = await kibanaFetch<unknown>(
        '/internal/ml/jobs/jobs_summary',
        { method: 'POST', body: JSON.stringify({}) },
        { apiVersion: '1', space },
      ).catch(() => []);
      const jobs = Array.isArray(res) ? res.length : 0;
      const pass = mlEnabled ? jobs > 0 : jobs === 0;
      return check('B12', 'ML state', pass, `mlEnabled=${mlEnabled} jobs=${jobs}`);
    }),
  );

  results.push(
    await safe('LM', 'Lateral Movement coverage setup', async () => {
      const res = await client.search({
        index: getAlertIndex(space),
        size: 0,
        query: { term: { 'kibana.alert.rule.threat.tactic.id': 'TA0008' } },
        aggs: { rules: { terms: { field: 'kibana.alert.rule.name', size: 5 } } },
      });
      const rules = (
        (res.aggregations?.rules as { buckets?: Array<{ key: string }> })?.buckets ?? []
      ).map((b) => b.key);
      return check(
        'LM',
        'Lateral Movement coverage setup',
        rules.length === 1,
        `alerting LM rules=${rules.join(', ')} (RDP-from-Internet rule enabled with no data)`,
      );
    }),
  );

  return results;
};
