import { getEsClient } from '../utils/indices.ts';
import { log } from '../../utils/logger.ts';
import { API_VERSIONS, getEntityStoreIndex } from '../../constants.ts';
import { getAlertIndex } from '../../utils/get_alert_index.ts';
import { kibanaFetch, installPackage } from '../../utils/kibana_api.ts';
import createVulnerabilities from '../../generators/create_vulnerability.ts';
import {
  DISCOVERIES,
  S1_ALERTS,
  S2_ALERTS,
  S2_CASE,
  VULNERABILITIES,
  hostByKey,
  hostEuid,
  idpUserEuid,
  userByKey,
  type ScenarioAlert,
  type ScenarioDiscovery,
} from './scenario.ts';
import { alertUuid } from './alerts.ts';
import type { InstalledRule } from './rules.ts';
import { SCENARIO_TAG, bulkCreate, sha256, timeAt, uuidv5 } from './utils.ts';

export const AD_CONNECTOR_NAME = 'exec-brief-scenario (no-LLM)';
const VULNERABILITY_INDEX = 'logs-cloud_security_posture.vulnerabilities_latest-default';
const INTERNAL_ORIGIN = { 'x-elastic-internal-origin': 'Kibana' };

export type AdMode = 'dev-route' | 'bulk' | 'none';

// ---------------------------------------------------------------------------
// Vulnerabilities
// ---------------------------------------------------------------------------

export const indexVulnerabilities = async (): Promise<number> => {
  const docs = VULNERABILITIES.map((vuln) => {
    const host = hostByKey(vuln.hostKey);
    const base = createVulnerabilities({ hostname: host.name, hostId: host.id, space: 'default' });
    return {
      ...base,
      vulnerability: {
        ...base.vulnerability,
        id: vuln.cve,
        severity: vuln.severity,
        title: vuln.title,
        score: { ...base.vulnerability.score, base: vuln.severity === 'CRITICAL' ? 9.8 : 7.5 },
      },
    };
  });
  const operations = docs.flatMap((doc) => [{ index: { _index: VULNERABILITY_INDEX } }, doc]);
  return bulkCreate({ operations, label: 'vulnerabilities' });
};

// ---------------------------------------------------------------------------
// Attack Discovery
// ---------------------------------------------------------------------------

const specsFor = (discovery: ScenarioDiscovery): ScenarioAlert[] =>
  [...S1_ALERTS, ...S2_ALERTS].filter((a) => discovery.alertKeys.includes(a.key));

const discoveryTimestamp = (anchor: Date, discovery: ScenarioDiscovery): Date =>
  timeAt(anchor, discovery.daysAgo, discovery.hour);

const adIndexPattern = (space: string): string =>
  `.alerts-security.attack.discovery.alerts-${space},.adhoc.alerts-security.attack.discovery.alerts-${space}`;

const createDiscoveriesViaDevRoute = async ({
  anchor,
  space,
}: {
  anchor: Date;
  space: string;
}): Promise<void> => {
  const attackDiscoveries = DISCOVERIES.map((discovery) => ({
    alertIds: specsFor(discovery).map((a) => alertUuid(a.key)),
    title: discovery.title,
    summaryMarkdown: discovery.summaryMarkdown,
    detailsMarkdown: discovery.detailsMarkdown,
    entitySummaryMarkdown: discovery.entitySummaryMarkdown,
    mitreAttackTactics: discovery.mitreAttackTactics,
    timestamp: discoveryTimestamp(anchor, discovery).toISOString(),
  }));
  await kibanaFetch(
    '/internal/elastic_assistant/data_generator/attack_discoveries/_create',
    {
      method: 'POST',
      body: JSON.stringify({
        alertsContextCount: attackDiscoveries.reduce((n, d) => n + d.alertIds.length, 0),
        anonymizedAlerts: [],
        apiConfig: { actionTypeId: 'none', connectorId: 'none', model: 'none' },
        attackDiscoveries,
        connectorName: AD_CONNECTOR_NAME,
        enableFieldRendering: true,
        generationUuid: uuidv5(`ad-generation:${space}:${anchor.toISOString().slice(0, 10)}`),
        replacements: undefined,
        withReplacements: false,
      }),
    },
    { apiVersion: '1', space, headers: INTERNAL_ORIGIN },
  );
};

/** Fallback: write AD documents straight into the alerts-as-data index (needs the alias to exist). */
const createDiscoveriesViaBulk = async ({
  anchor,
  space,
  rules,
}: {
  anchor: Date;
  space: string;
  rules: Map<string, InstalledRule>;
}): Promise<void> => {
  const index = `.alerts-security.attack.discovery.alerts-${space}`;
  const operations: object[] = [];
  for (const discovery of DISCOVERIES) {
    const specs = specsFor(discovery);
    const timestamp = discoveryTimestamp(anchor, discovery).toISOString();
    const id = uuidv5(`ad:${discovery.key}:${space}`);
    const riskScore = Math.max(
      ...specs.map((spec) => {
        const score = rules.get(spec.ruleKey)?.raw.risk_score;
        return typeof score === 'number' ? score : 47;
      }),
    );
    operations.push(
      { create: { _index: index, _id: id } },
      {
        '@timestamp': timestamp,
        'event.kind': 'signal',
        'kibana.alert.uuid': id,
        'kibana.alert.start': timestamp,
        'kibana.alert.status': 'active',
        'kibana.alert.workflow_status': 'open',
        'kibana.alert.risk_score': riskScore,
        'kibana.alert.rule.rule_type_id': 'attack-discovery',
        'kibana.alert.rule.execution.uuid': uuidv5(`ad-exec:${discovery.key}`),
        'kibana.space_ids': [space],
        'kibana.alert.attack_discovery.alert_ids': specs.map((a) => alertUuid(a.key)),
        'kibana.alert.attack_discovery.title': discovery.title,
        'kibana.alert.attack_discovery.summary_markdown': discovery.summaryMarkdown,
        'kibana.alert.attack_discovery.details_markdown': discovery.detailsMarkdown,
        'kibana.alert.attack_discovery.entity_summary_markdown': discovery.entitySummaryMarkdown,
        'kibana.alert.attack_discovery.mitre_attack_tactics': discovery.mitreAttackTactics,
        'kibana.alert.attack_discovery.alerts_context_count': specs.length,
        'kibana.alert.attack_discovery.api_config.action_type_id': 'none',
        'kibana.alert.attack_discovery.api_config.connector_id': 'none',
        'kibana.alert.attack_discovery.api_config.name': AD_CONNECTOR_NAME,
      },
    );
  }
  await bulkCreate({ operations, label: 'attack discovery (bulk fallback)' });
};

export interface AdResult {
  mode: AdMode;
  /** True when the dev route failed and the bulk fallback was used instead. */
  usedFallback: boolean;
  discoveryIds: Record<string, string>;
  /** Whether the source alerts already carried kibana.alert.attack_ids after creation. */
  attackIdsBackReferenceNative: boolean;
  attackIdsPatched: boolean;
}

export const createAttackDiscoveries = async ({
  mode,
  anchor,
  space,
  rules,
}: {
  mode: AdMode;
  anchor: Date;
  space: string;
  rules: Map<string, InstalledRule>;
}): Promise<AdResult> => {
  const result: AdResult = {
    mode,
    usedFallback: false,
    discoveryIds: {},
    attackIdsBackReferenceNative: false,
    attackIdsPatched: false,
  };
  if (mode === 'none') return result;

  // Idempotent on step retries: drop earlier scenario discoveries first.
  await getEsClient().deleteByQuery({
    index: adIndexPattern(space),
    refresh: true,
    ignore_unavailable: true,
    conflicts: 'proceed',
    query: { term: { 'kibana.alert.attack_discovery.api_config.name': AD_CONNECTOR_NAME } },
  });

  if (mode === 'dev-route') {
    try {
      await createDiscoveriesViaDevRoute({ anchor, space });
    } catch (error) {
      log.warn(`Attack Discovery dev route failed (${String(error)}); falling back to bulk.`);
      result.usedFallback = true;
    }
  }
  if (mode === 'bulk' || result.usedFallback) {
    await createDiscoveriesViaBulk({ anchor, space, rules });
  }

  const client = getEsClient();
  await client.indices.refresh({ index: adIndexPattern(space), ignore_unavailable: true });
  const found = await client.search({
    index: adIndexPattern(space),
    ignore_unavailable: true,
    size: 50,
    _source: ['kibana.alert.attack_discovery.title', 'kibana.alert.attack_discovery.alert_ids'],
    query: { term: { 'kibana.alert.attack_discovery.api_config.name': AD_CONNECTOR_NAME } },
  });

  const alertsIndex = getAlertIndex(space);
  for (const hit of found.hits.hits) {
    const source = hit._source as Record<string, unknown> | undefined;
    const title = (source?.['kibana.alert.attack_discovery.title'] ??
      (source?.kibana as { alert?: { attack_discovery?: { title?: string } } } | undefined)?.alert
        ?.attack_discovery?.title) as string | undefined;
    const discovery = DISCOVERIES.find((d) => d.title === title);
    if (!discovery || !hit._id) continue;
    result.discoveryIds[discovery.key] = hit._id;
  }

  // Live-only unknown: does the dev route back-reference the discovery on the source alerts?
  await client.indices.refresh({ index: alertsIndex });
  const withBackRef = await client.count({
    index: alertsIndex,
    query: {
      bool: {
        filter: [
          { term: { 'kibana.alert.rule.tags': SCENARIO_TAG } },
          { exists: { field: 'kibana.alert.attack_ids' } },
        ],
      },
    },
  });
  result.attackIdsBackReferenceNative = withBackRef.count > 0;
  if (!result.attackIdsBackReferenceNative) {
    for (const discovery of DISCOVERIES) {
      const adId = result.discoveryIds[discovery.key];
      if (!adId) continue;
      await client.updateByQuery({
        index: alertsIndex,
        refresh: true,
        conflicts: 'proceed',
        query: { terms: { 'kibana.alert.uuid': specsFor(discovery).map((a) => alertUuid(a.key)) } },
        script: {
          lang: 'painless',
          source:
            "if (ctx._source['kibana.alert.attack_ids'] == null) { ctx._source['kibana.alert.attack_ids'] = new ArrayList(); } ctx._source['kibana.alert.attack_ids'].add(params.id);",
          params: { id: adId },
        },
      });
      result.attackIdsPatched = true;
    }
  }
  log.info(
    `Attack Discovery: ${Object.keys(result.discoveryIds).length}/${DISCOVERIES.length} found, native back-reference=${result.attackIdsBackReferenceNative}, patched=${result.attackIdsPatched}`,
  );
  return result;
};

// ---------------------------------------------------------------------------
// Case (S2: "being handled")
// ---------------------------------------------------------------------------

export interface CaseResult {
  caseId: string;
  attachedAlertIds: string[];
}

export const deleteScenarioCases = async (space: string): Promise<void> => {
  try {
    const found = await kibanaFetch<{ cases?: Array<{ id: string }> }>(
      `/api/cases/_find?tags=${SCENARIO_TAG}&owner=securitySolution&perPage=100`,
      { method: 'GET' },
      { apiVersion: API_VERSIONS.public.v1, space },
    );
    const ids = (found.cases ?? []).map((c) => c.id);
    if (ids.length === 0) return;
    const query = `ids=${encodeURIComponent(JSON.stringify(ids))}`;
    await kibanaFetch(
      `/api/cases?${query}`,
      { method: 'DELETE' },
      { apiVersion: API_VERSIONS.public.v1, space },
    );
    log.info(`Clean: deleted ${ids.length} case(s)`);
  } catch (error) {
    log.warn(`Clean: cases failed: ${String(error).slice(0, 200)}`);
  }
};

export const createS2Case = async ({
  anchor,
  space,
  rules,
}: {
  anchor: Date;
  space: string;
  rules: Map<string, InstalledRule>;
}): Promise<CaseResult> => {
  // Idempotent on step retries: drop any earlier scenario case first.
  await deleteScenarioCases(space);
  const created = await kibanaFetch<{ id: string }>(
    '/api/cases',
    {
      method: 'POST',
      body: JSON.stringify({
        title: S2_CASE.title,
        description: S2_CASE.description,
        tags: [SCENARIO_TAG],
        severity: 'high',
        connector: { id: 'none', name: 'none', type: '.none', fields: null },
        settings: { syncAlerts: true },
        owner: 'securitySolution',
        assignees: [],
        customFields: [],
      }),
    },
    { apiVersion: API_VERSIONS.public.v1, space },
  );
  const caseId = created.id;
  const alertsIndex = getAlertIndex(space);
  const attachedAlertIds = S2_ALERTS.map((a) => alertUuid(a.key));

  await kibanaFetch(
    `/internal/cases/${caseId}/attachments/_bulk_create`,
    {
      method: 'POST',
      body: JSON.stringify(
        S2_ALERTS.map((spec) => {
          const rule = rules.get(spec.ruleKey);
          return {
            type: 'alert',
            alertId: alertUuid(spec.key),
            index: alertsIndex,
            rule: { id: rule?.uuid ?? null, name: rule?.name ?? null },
            owner: 'securitySolution',
          };
        }),
      ),
    },
    { apiVersion: '1', space, headers: INTERNAL_ORIGIN },
  );

  // Backdate the case (dev-only route); the case is optional metadata so failure is non-fatal.
  try {
    await kibanaFetch(
      `/internal/security_solution/data_generator/cases/${caseId}/timestamps`,
      {
        method: 'PUT',
        body: JSON.stringify({
          timestamp: timeAt(anchor, S2_CASE.daysAgo, S2_CASE.hour).toISOString(),
        }),
      },
      { apiVersion: '1', space, headers: INTERNAL_ORIGIN },
    );
  } catch (error) {
    log.warn(`Could not backdate case ${caseId}: ${String(error)}`);
  }

  // Case sync can reopen alerts; mark them acknowledged afterwards ("handled").
  await kibanaFetch(
    '/api/detection_engine/signals/status',
    {
      method: 'POST',
      body: JSON.stringify({ signal_ids: attachedAlertIds, status: 'acknowledged' }),
    },
    { apiVersion: API_VERSIONS.public.v1, space },
  );
  log.info(`Created case ${caseId} with ${attachedAlertIds.length} alert(s), alerts acknowledged.`);
  return { caseId, attachedAlertIds };
};

// ---------------------------------------------------------------------------
// Leads (no LLM connector: seeded as documents)
// ---------------------------------------------------------------------------

const LEADS_INDEX_PREFIX = '.entity_analytics.entity-leads.entity-';

const LEADS_MAPPINGS = {
  dynamic: 'strict' as const,
  properties: {
    id: { type: 'keyword' as const },
    title: { type: 'text' as const, fields: { keyword: { type: 'keyword' as const } } },
    byline: { type: 'text' as const },
    description: { type: 'text' as const },
    entity: {
      type: 'object' as const,
      properties: {
        type: { type: 'keyword' as const },
        name: { type: 'keyword' as const },
        id: { type: 'keyword' as const },
      },
    },
    tags: { type: 'keyword' as const },
    priority: { type: 'integer' as const },
    chat_recommendations: { type: 'text' as const },
    timestamp: { type: 'date' as const },
    staleness: { type: 'keyword' as const },
    status: { type: 'keyword' as const },
    observations: {
      type: 'object' as const,
      properties: {
        entity_id: { type: 'keyword' as const },
        module_id: { type: 'keyword' as const },
        type: { type: 'keyword' as const },
        score: { type: 'float' as const },
        severity: { type: 'keyword' as const },
        confidence: { type: 'float' as const },
        description: { type: 'text' as const },
        metadata: { type: 'object' as const, enabled: false },
      },
    },
    top_related_entities: {
      type: 'object' as const,
      properties: {
        id: { type: 'keyword' as const },
        type: { type: 'keyword' as const },
        name: { type: 'keyword' as const },
        kinds: { type: 'keyword' as const },
        risk_level: { type: 'keyword' as const },
        criticality: { type: 'keyword' as const },
        interacted_with_at_least: { type: 'integer' as const },
      },
    },
    related_entity_counts: {
      type: 'object' as const,
      properties: { kind: { type: 'keyword' as const }, count: { type: 'integer' as const } },
    },
    execution_uuid: { type: 'keyword' as const },
    source_type: { type: 'keyword' as const },
    origin: { type: 'keyword' as const },
    created_at: { type: 'date' as const },
    changed_at: { type: 'date' as const },
    version: { type: 'integer' as const },
    content_hash: { type: 'keyword' as const },
  },
};

interface EntitySnapshot {
  riskLevel?: string;
  criticality?: string;
}

const readEntitySnapshots = async (
  space: string,
  ids: string[],
): Promise<Map<string, EntitySnapshot>> => {
  const client = getEsClient();
  const snapshots = new Map<string, EntitySnapshot>();
  const response = await client.search({
    index: getEntityStoreIndex(space),
    size: ids.length,
    _source: ['entity.id', 'entity.risk.calculated_level', 'asset.criticality'],
    query: { terms: { 'entity.id': ids } },
  });
  for (const hit of response.hits.hits) {
    const source = hit._source as {
      entity?: { id?: string; risk?: { calculated_level?: string } };
      asset?: { criticality?: string };
    };
    if (source.entity?.id) {
      snapshots.set(source.entity.id, {
        riskLevel: source.entity.risk?.calculated_level,
        criticality: source.asset?.criticality,
      });
    }
  }
  return snapshots;
};

export const seedS1Lead = async ({
  anchor,
  space,
}: {
  anchor: Date;
  space: string;
}): Promise<string> => {
  const client = getEsClient();
  const index = `${LEADS_INDEX_PREFIX}${space}`;

  // The enable route requires an LLM connector, so the index is created directly.
  const exists = await client.indices.exists({ index });
  if (!exists) {
    await client.indices.create({
      index,
      settings: { hidden: true, auto_expand_replicas: '0-1' },
      mappings: LEADS_MAPPINGS,
    });
  }

  const user = userByKey('a.rodriguez');
  const golden = idpUserEuid(user);
  const hosts = ['LAPTOP-FIN03', 'jump-box-01', 'docker-host-prod-01'].map(hostByKey);
  const snapshots = await readEntitySnapshots(space, [golden, ...hosts.map(hostEuid)]);
  const now = new Date().toISOString();
  const kindsByHost: Record<string, string[]> = {
    'LAPTOP-FIN03': ['accesses_frequently', 'owns'],
    'jump-box-01': ['accesses_infrequently'],
    'docker-host-prod-01': ['accesses_infrequently'],
  };
  const observations = [
    {
      entity_id: golden,
      module_id: 'risk_analysis',
      type: 'high_risk_score',
      score: 90,
      severity: 'critical',
      confidence: 0.9,
      description: 'Risk score rose sharply over five days across three hosts',
      metadata: {},
    },
    {
      entity_id: golden,
      module_id: 'relationship',
      type: 'new_infrequent_access',
      score: 80,
      severity: 'high',
      confidence: 0.85,
      description: 'First-ever access to jump-box-01 (RDP) and docker-host-prod-01 (SSH)',
      metadata: {},
    },
    {
      entity_id: golden,
      module_id: 'privileged_user',
      type: 'privileged_user_activity',
      score: 75,
      severity: 'high',
      confidence: 0.8,
      description: 'Privileged Users watchlist member with credential dumping and sudoers changes',
      metadata: {},
    },
  ];
  const doc = {
    id: sha256(golden),
    title: 'Potential credential theft with lateral movement to production by a.rodriguez',
    byline:
      'Privileged user reached a production container host within three days of a phishing alert',
    description:
      'a.rodriguez is a Privileged Users watchlist member. Starting with a phishing document on LAPTOP-FIN03, the identity dumped credentials, made first-ever connections to jump-box-01 and docker-host-prod-01 and then created a privileged container with the host root mounted. Review the five linked alerts and the Attack Discovery before taking action.',
    entity: { type: 'user', name: user.userName, id: golden },
    tags: [
      'Initial Access',
      'Credential Access',
      'Lateral Movement',
      'Privilege Escalation',
      SCENARIO_TAG,
    ],
    priority: 9,
    chat_recommendations: [
      'Which hosts has a.rodriguez accessed for the first time in the last week?',
      'Summarize the alerts linked to a.rodriguez and the sequence of tactics.',
    ],
    timestamp: now,
    staleness: 'fresh',
    status: 'active',
    observations,
    top_related_entities: hosts.map((host) => ({
      id: hostEuid(host),
      type: 'host',
      name: host.name,
      kinds: kindsByHost[host.key] ?? [],
      risk_level: snapshots.get(hostEuid(host))?.riskLevel,
      criticality: snapshots.get(hostEuid(host))?.criticality ?? host.criticality,
      interacted_with_at_least: host.key === 'LAPTOP-FIN03' ? 30 : 2,
    })),
    related_entity_counts: [
      { kind: 'accesses_frequently', count: 1 },
      { kind: 'accesses_infrequently', count: 2 },
    ],
    execution_uuid: uuidv5(`lead:${space}:${anchor.toISOString().slice(0, 10)}`),
    source_type: 'adhoc',
    origin: 'observations',
    created_at: now,
    changed_at: now,
    version: 1,
    content_hash: sha256(JSON.stringify(observations)),
  };

  await client.index({ index, id: doc.id, document: doc, refresh: true });
  log.info(`Seeded S1 lead ${doc.id} into ${index}.`);
  return doc.id;
};

// ---------------------------------------------------------------------------
// Fleet packages
// ---------------------------------------------------------------------------

/** `network_traffic` is deliberately NOT installed (coverage gap: enabled rule, missing integration). */
export const PACKAGES_TO_INSTALL = [
  'system',
  'endpoint',
  'windows',
  'okta',
  'cloud_security_posture',
];

export const installPackages = async (space: string): Promise<Record<string, 'ok' | string>> => {
  const outcome: Record<string, 'ok' | string> = {};
  for (const packageName of PACKAGES_TO_INSTALL) {
    try {
      await installPackage({ packageName, space });
      outcome[packageName] = 'ok';
    } catch (error) {
      outcome[packageName] = `failed: ${String(error).slice(0, 160)}`;
      log.warn(`Package ${packageName} install failed: ${String(error).slice(0, 200)}`);
    }
  }
  return outcome;
};
