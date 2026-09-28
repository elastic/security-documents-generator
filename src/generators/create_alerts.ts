import { faker } from '@faker-js/faker';

export const GENERATOR_RULE_DESCRIPTION = 'Alert created by documents-generator';

function baseCreateAlerts({
  userName = 'user-1',
  hostName = 'host-1',
  userId,
  hostId,
  eventModule,
  space = 'default',
  timestamp = Date.now(),
  ruleName = 'Alert created by documents-generator',
}: {
  userName?: string;
  hostName?: string;
  userId?: string;
  hostId?: string;
  eventModule?: string;
  space?: string;
  /** Epoch ms for the alert's `@timestamp`, and for the alert lifecycle fields derived from it. */
  timestamp?: number;
  ruleName?: string;
} = {}) {
  const risk_score = faker.number.int({ min: 0, max: 100 });
  const severity = ['low', 'medium', 'high', 'critical'][faker.number.int({ min: 0, max: 3 })];
  const detectedAt = new Date(timestamp).toISOString();
  return {
    'host.name': hostName,
    ...(hostId ? { 'host.id': hostId } : {}),
    'user.name': userName,
    ...(userId ? { 'user.id': userId } : {}),
    ...(eventModule ? { 'event.module': eventModule } : {}),
    'kibana.alert.start': detectedAt,
    'kibana.alert.last_detected': detectedAt,
    'kibana.version': '8.7.0',
    'kibana.alert.rule.parameters': {
      description: '2',
      risk_score,
      severity,
      license: '',
      author: [],
      false_positives: [],
      from: 'now-360s',
      rule_id: faker.string.uuid(),
      max_signals: 100,
      risk_score_mapping: [],
      severity_mapping: [],
      threat: [],
      to: 'now',
      references: [],
      version: 3,
      exceptions_list: [],
      immutable: false,
      related_integrations: [],
      required_fields: [],
      setup: '',
      type: 'query',
      language: 'kuery',
      index: ['my*'],
      query: '*',
      filters: [],
    },
    'kibana.alert.rule.category': 'Custom Query Rule',
    'kibana.alert.rule.consumer': 'siem',
    'kibana.alert.rule.execution.uuid': faker.string.uuid(),
    'kibana.alert.rule.name': ruleName,
    'kibana.alert.rule.producer': 'siem',
    'kibana.alert.rule.rule_type_id': 'siem.queryRule',
    'kibana.alert.rule.uuid': faker.string.uuid(),
    'kibana.space_ids': [space],
    'kibana.alert.rule.tags': [],
    '@timestamp': timestamp,
    'event.kind': 'signal',
    'kibana.alert.original_time': detectedAt,
    'kibana.alert.ancestors': [
      {
        id: '8TD3cYcB1hicTK_CdP--',
        type: 'event',
        index: 'my-index',
        depth: 0,
      },
    ],
    'kibana.alert.status': 'active',
    'kibana.alert.workflow_status': 'open',
    'kibana.alert.depth': 1,
    'kibana.alert.reason': 'event on ' + hostName + ' created alert with severity ' + severity,
    'kibana.alert.severity': severity,
    'kibana.alert.risk_score': risk_score,
    'kibana.alert.rule.actions': [],
    'kibana.alert.rule.author': [],
    'kibana.alert.rule.created_at': '2023-04-11T20:15:52.473Z',
    'kibana.alert.rule.created_by': 'elastic',
    // Rule names vary, so this stays constant as the marker for generator-created alerts.
    'kibana.alert.rule.description': GENERATOR_RULE_DESCRIPTION,
    'kibana.alert.rule.enabled': true,
    'kibana.alert.rule.exceptions_list': [],
    'kibana.alert.rule.false_positives': [],
    'kibana.alert.rule.from': 'now-360s',
    'kibana.alert.rule.immutable': false,
    'kibana.alert.rule.interval': '5m',
    'kibana.alert.rule.indices': ['my*'],
    'kibana.alert.rule.license': '',
    'kibana.alert.rule.max_signals': 100,
    'kibana.alert.rule.references': [],
    'kibana.alert.rule.risk_score_mapping': [],
    'kibana.alert.rule.rule_id': 'cc066b08-b4d2-4e74-81cb-3cda5aaa612d',
    'kibana.alert.rule.severity_mapping': [],
    'kibana.alert.rule.threat': [],
    'kibana.alert.rule.to': 'now',
    'kibana.alert.rule.type': 'query',
    'kibana.alert.rule.updated_at': '2023-04-11T20:18:11.024Z',
    'kibana.alert.rule.updated_by': 'elastic',
    'kibana.alert.rule.version': 3,
    'kibana.alert.rule.meta.from': '1m',
    'kibana.alert.rule.meta.kibana_siem_app_url': 'http://localhost:5601/app/security',
    'kibana.alert.rule.risk_score': risk_score,
    'kibana.alert.rule.severity': severity,
    'kibana.alert.uuid': faker.string.uuid(),
  };
}

export type BaseCreateAlertsReturnType = ReturnType<typeof baseCreateAlerts>;

export default function createAlerts<O extends object>(
  override: O,
  {
    userName,
    hostName,
    userId,
    hostId,
    eventModule,
    space,
    timestamp,
    ruleName,
  }: {
    userName?: string;
    hostName?: string;
    userId?: string;
    hostId?: string;
    eventModule?: string;
    space?: string;
    timestamp?: number;
    ruleName?: string;
  } = {},
): O & BaseCreateAlertsReturnType {
  return {
    ...baseCreateAlerts({
      userName,
      hostName,
      userId,
      hostId,
      eventModule,
      space,
      timestamp,
      ruleName,
    }),
    ...override,
  };
}
