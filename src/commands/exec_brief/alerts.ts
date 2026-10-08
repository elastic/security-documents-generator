import { getAlertIndex } from '../../utils/get_alert_index.ts';
import {
  hostByKey,
  hostEuid,
  idpUserEuid,
  localUserEuid,
  ruleByKey,
  userByKey,
  type ScenarioAlert,
} from './scenario.ts';
import type { InstalledRule } from './rules.ts';
import { SCENARIO_TAG, bulkCreate, timeAt, uuidv5 } from './utils.ts';

const RULE_TYPE_IDS: Record<string, { ruleTypeId: string; category: string }> = {
  eql: { ruleTypeId: 'siem.eqlRule', category: 'Event Correlation Rule' },
  query: { ruleTypeId: 'siem.queryRule', category: 'Custom Query Rule' },
  esql: { ruleTypeId: 'siem.esqlRule', category: 'ES|QL Rule' },
  new_terms: { ruleTypeId: 'siem.newTermsRule', category: 'New Terms Rule' },
  threshold: { ruleTypeId: 'siem.thresholdRule', category: 'Threshold Rule' },
};

type Json = Record<string, unknown>;

const asString = (value: unknown, fallback: string): string =>
  typeof value === 'string' ? value : fallback;
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

export const alertUuid = (alertKey: string): string => uuidv5(`alert:${alertKey}`);

export const alertTimestamp = (anchor: Date, spec: ScenarioAlert): Date =>
  timeAt(anchor, spec.daysAgo, spec.hour, spec.minute);

/** Threat blocks to stamp on the alert (v18 tactic name kept for one rule to exercise aliasing). */
const buildAlertThreat = (spec: ScenarioAlert, rule: InstalledRule): unknown[] => {
  const scenarioRule = ruleByKey(spec.ruleKey);
  if (scenarioRule.noRuleThreat) return [];
  const threat = asArray(rule.raw.threat);
  if (!scenarioRule.forceV18TacticName) return threat;
  return threat.map((block) => {
    const tactic = (block as Json).tactic as Json | undefined;
    if (!tactic || tactic.id !== 'TA0005') return block;
    return { ...(block as Json), tactic: { ...tactic, name: 'Defense Evasion' } };
  });
};

export const buildAlertDoc = ({
  spec,
  rule,
  anchor,
  space,
}: {
  spec: ScenarioAlert;
  rule: InstalledRule;
  anchor: Date;
  space: string;
}): Json => {
  const scenarioRule = ruleByKey(spec.ruleKey);
  const user = userByKey(spec.userKey);
  const host = spec.hostKey ? hostByKey(spec.hostKey) : undefined;
  const timestamp = alertTimestamp(anchor, spec).toISOString();
  const raw = rule.raw;
  const type = asString(raw.type, scenarioRule.type);
  const typeInfo = RULE_TYPE_IDS[type] ?? RULE_TYPE_IDS.query;
  const threat = buildAlertThreat(spec, rule);
  const severity = asString(raw.severity, scenarioRule.severity);
  const riskScore = typeof raw.risk_score === 'number' ? raw.risk_score : scenarioRule.riskScore;
  const tags = [...new Set([...asArray(raw.tags).map(String), SCENARIO_TAG])];
  const relatedIntegrations = asArray(raw.related_integrations);

  const entityIds: string[] = [];
  if (host) entityIds.push(hostEuid(host));
  entityIds.push(spec.userScope === 'idp' || !host ? idpUserEuid(user) : localUserEuid(user, host));

  const parameters: Json = {
    description: asString(raw.description, scenarioRule.name),
    risk_score: riskScore,
    severity,
    rule_id: rule.ruleId,
    author: raw.author ?? ['Elastic'],
    license: raw.license ?? 'Elastic License v2',
    false_positives: raw.false_positives ?? [],
    from: raw.from ?? 'now-9m',
    to: raw.to ?? 'now',
    max_signals: raw.max_signals ?? 100,
    references: raw.references ?? [],
    version: raw.version ?? 1,
    immutable: raw.immutable ?? true,
    type,
    language: raw.language ?? 'kuery',
    query: raw.query ?? '',
    index: raw.index ?? [],
    threat,
    related_integrations: relatedIntegrations,
    required_fields: raw.required_fields ?? [],
    setup: raw.setup ?? '',
    exceptions_list: [],
    risk_score_mapping: [],
    severity_mapping: [],
  };

  const doc: Json = {
    '@timestamp': timestamp,
    'event.kind': 'signal',
    'event.category': ['process'],
    'event.action': spec.process ? 'start' : 'alert',
    'data_stream.namespace': space,
    'host.name': host?.name,
    'host.id': host?.id,
    'host.os.type': host?.os,
    'host.os.name': host ? (host.os === 'windows' ? 'Windows' : 'Linux') : undefined,
    'user.name': user.userName,
    ...(spec.userScope === 'idp' ? { 'user.email': user.email, 'event.module': 'okta' } : {}),
    ...(spec.process
      ? {
          'process.name': spec.process.name,
          'process.command_line': spec.process.commandLine,
          'process.parent.name': spec.process.parent,
        }
      : {}),
    ...(spec.ecsThreatOnly
      ? {
          'threat.framework': 'MITRE ATT&CK',
          'threat.tactic.id': [scenarioRule.tactic.id],
          'threat.tactic.name': [scenarioRule.tactic.name],
          'threat.technique.id': [scenarioRule.technique.id],
          'threat.technique.name': [scenarioRule.technique.name],
        }
      : {}),
    'kibana.alert.entity.id': entityIds,
    'kibana.alert.uuid': alertUuid(spec.key),
    'kibana.alert.instance.id': alertUuid(spec.key),
    'kibana.alert.status': 'active',
    'kibana.alert.workflow_status': spec.status,
    ...(spec.status !== 'open' ? { 'kibana.alert.workflow_status_updated_at': timestamp } : {}),
    'kibana.alert.start': timestamp,
    'kibana.alert.last_detected': timestamp,
    'kibana.alert.original_time': timestamp,
    'kibana.alert.time_range': { gte: timestamp },
    'kibana.alert.reason': spec.reason,
    'kibana.alert.severity': severity,
    'kibana.alert.risk_score': riskScore,
    'kibana.alert.depth': 1,
    'kibana.alert.ancestors': [
      {
        id: uuidv5(`source:${spec.key}`),
        type: 'event',
        index: `logs-exec-brief-${space}`,
        depth: 0,
      },
    ],
    'kibana.alert.rule.uuid': rule.uuid,
    'kibana.alert.rule.rule_id': rule.ruleId,
    'kibana.alert.rule.name': rule.name,
    'kibana.alert.rule.description': parameters.description,
    'kibana.alert.rule.severity': severity,
    'kibana.alert.rule.risk_score': riskScore,
    'kibana.alert.rule.threat': threat,
    'kibana.alert.rule.tags': tags,
    'kibana.alert.rule.type': type,
    'kibana.alert.rule.category': typeInfo.category,
    'kibana.alert.rule.rule_type_id': typeInfo.ruleTypeId,
    'kibana.alert.rule.consumer': 'siem',
    'kibana.alert.rule.producer': 'siem',
    'kibana.alert.rule.enabled': true,
    'kibana.alert.rule.immutable': raw.immutable ?? true,
    'kibana.alert.rule.version': raw.version ?? 1,
    'kibana.alert.rule.interval': raw.interval ?? '5m',
    'kibana.alert.rule.from': raw.from ?? 'now-9m',
    'kibana.alert.rule.to': raw.to ?? 'now',
    'kibana.alert.rule.max_signals': raw.max_signals ?? 100,
    'kibana.alert.rule.created_by': 'elastic',
    'kibana.alert.rule.updated_by': 'elastic',
    'kibana.alert.rule.created_at': asString(raw.created_at, timestamp),
    'kibana.alert.rule.updated_at': asString(raw.updated_at, timestamp),
    'kibana.alert.rule.parameters': parameters,
    'kibana.alert.rule.execution.uuid': uuidv5(`exec:${spec.ruleKey}:${spec.daysAgo}`),
    'kibana.space_ids': [space],
    'kibana.version': '9.6.0',
    tags: [SCENARIO_TAG],
  };

  // Drop undefined values so they are not serialised as null.
  return Object.fromEntries(Object.entries(doc).filter(([, value]) => value !== undefined));
};

export const indexAlerts = async ({
  specs,
  rules,
  anchor,
  space,
}: {
  specs: ScenarioAlert[];
  rules: Map<string, InstalledRule>;
  anchor: Date;
  space: string;
}): Promise<number> => {
  const index = getAlertIndex(space);
  const operations: object[] = [];
  for (const spec of specs) {
    const rule = rules.get(spec.ruleKey);
    if (!rule) throw new Error(`Rule "${spec.ruleKey}" missing for alert ${spec.key}`);
    const doc = buildAlertDoc({ spec, rule, anchor, space });
    operations.push({ create: { _index: index, _id: doc['kibana.alert.uuid'] as string } }, doc);
  }
  return bulkCreate({ operations, label: 'alerts' });
};
