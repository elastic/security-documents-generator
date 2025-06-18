import { faker } from '@faker-js/faker';
import { generateTimestamp } from './utils/timestamp_utils';

// Realistic security alert rule names
const REALISTIC_ALERT_NAMES = [
  'Suspicious PowerShell Activity Detected',
  'Malware Detection - Endpoint Security',
  'Failed Login Attempts from Multiple IPs',
  'Privilege Escalation Attempt',
  'Suspicious Network Traffic to External Domain',
  'File Integrity Monitoring Alert',
  'Credential Dumping Activity',
  'Process Injection Detected',
  'Unusual Outbound Network Connection',
  'Windows Defender Real-time Protection Disabled',
  'Suspicious Registry Modification',
  'Unauthorized Service Installation',
  'Command and Control Communication',
  'Data Exfiltration Attempt',
  'Lateral Movement Detected',
  'Brute Force Attack on SSH',
  'Web Shell Detection',
  'Suspicious DNS Query',
  'Endpoint Agent Tampering',
  'Critical System File Modified',
];

function baseCreateAlerts({
  userName = 'user-1',
  hostName = 'host-1',
  space = 'default',
  timestampConfig,
}: {
  userName?: string;
  hostName?: string;
  space?: string;
  timestampConfig?: import('./utils/timestamp_utils').TimestampConfig;
} = {}) {
  const timestamp = generateTimestamp(timestampConfig);
  const currentTime = new Date().toISOString(); // For rule metadata timestamps
  return {
    'host.name': hostName,
    'user.name': userName,
    'kibana.alert.start': timestamp,
    'kibana.alert.last_detected': timestamp,
    'kibana.version': '8.7.0',
    'kibana.alert.rule.parameters': {
      description: '2',
      risk_score: 21,
      severity: 'low',
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
    'kibana.alert.rule.name': faker.helpers.arrayElement(REALISTIC_ALERT_NAMES),
    'kibana.alert.rule.producer': 'siem',
    'kibana.alert.rule.rule_type_id': 'siem.queryRule',
    'kibana.alert.rule.uuid': faker.string.uuid(),
    'kibana.space_ids': [space],
    'kibana.alert.rule.tags': [],
    '@timestamp': timestamp,
    'event.kind': 'signal',
    'kibana.alert.original_time': timestamp,
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
    'kibana.alert.reason': 'event on ' + hostName + 'created low alert 1.',
    'kibana.alert.severity': 'low',
    'kibana.alert.risk_score': 21,
    'kibana.alert.rule.actions': [],
    'kibana.alert.rule.author': [],
    'kibana.alert.rule.created_at': currentTime,
    'kibana.alert.rule.created_by': 'elastic',
    'kibana.alert.rule.description': '2',
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
    'kibana.alert.rule.updated_at': currentTime,
    'kibana.alert.rule.updated_by': 'elastic',
    'kibana.alert.rule.version': 3,
    'kibana.alert.rule.meta.from': '1m',
    'kibana.alert.rule.meta.kibana_siem_app_url':
      'http://localhost:5601/app/security',
    'kibana.alert.rule.risk_score': 21,
    'kibana.alert.rule.severity': 'low',
    'kibana.alert.uuid': faker.string.uuid(),
  };
}

export type BaseCreateAlertsReturnType = ReturnType<typeof baseCreateAlerts>;

export default function createAlerts<O extends object>(
  override: O,
  {
    userName,
    hostName,
    space,
    timestampConfig,
  }: {
    userName?: string;
    hostName?: string;
    space?: string;
    timestampConfig?: import('./utils/timestamp_utils').TimestampConfig;
  } = {},
): O & BaseCreateAlertsReturnType {
  return {
    ...baseCreateAlerts({ userName, hostName, space, timestampConfig }),
    ...override,
  };
}
