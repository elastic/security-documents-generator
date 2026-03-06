/**
 * Teleport Integration
 * Generates audit log documents for Gravitational Teleport
 * Based on the Elastic teleport integration package
 */

import { BaseIntegration, IntegrationDocument, DataStreamConfig } from './base_integration';
import { Organization, Employee, CorrelationMap } from '../types';
import { faker } from '@faker-js/faker';

const AUDIT_EVENTS: Array<{
  event: string;
  code: string;
  category: string[];
  type: string[];
  weight: number;
}> = [
  {
    event: 'user.login',
    code: 'T1000I',
    category: ['authentication'],
    type: ['start'],
    weight: 25,
  },
  {
    event: 'user.login',
    code: 'T1000W',
    category: ['authentication'],
    type: ['start'],
    weight: 5,
  },
  {
    event: 'session.start',
    code: 'T2000I',
    category: ['session'],
    type: ['start'],
    weight: 15,
  },
  {
    event: 'session.end',
    code: 'T2004I',
    category: ['session'],
    type: ['end'],
    weight: 15,
  },
  { event: 'exec', code: 'T3000I', category: ['process'], type: ['start'], weight: 12 },
  { event: 'scp', code: 'T3001I', category: ['file'], type: ['access'], weight: 5 },
  {
    event: 'user.create',
    code: 'T1002I',
    category: ['iam'],
    type: ['creation'],
    weight: 3,
  },
  {
    event: 'user.update',
    code: 'T1003I',
    category: ['iam'],
    type: ['change'],
    weight: 3,
  },
  {
    event: 'user.password_change',
    code: 'T1005I',
    category: ['iam'],
    type: ['change'],
    weight: 2,
  },
  {
    event: 'session.command',
    code: 'T4000I',
    category: ['process'],
    type: ['info'],
    weight: 10,
  },
  {
    event: 'session.network',
    code: 'T4002I',
    category: ['network'],
    type: ['connection'],
    weight: 5,
  },
];

const LOGIN_METHODS = ['local', 'oidc', 'saml', 'github', 'passwordless'];

const SHELL_COMMANDS = [
  'ls -la',
  'cat /etc/passwd',
  'whoami',
  'ps aux',
  'df -h',
  'kubectl get pods',
  'docker ps',
  'systemctl status sshd',
  'tail -f /var/log/syslog',
  'netstat -tulpn',
];

const SERVER_HOSTNAMES = [
  'prod-web-01',
  'prod-db-01',
  'staging-app-01',
  'bastion-01',
  'ci-runner-01',
  'monitoring-01',
  'k8s-node-01',
  'logs-01',
];

export class TeleportIntegration extends BaseIntegration {
  readonly packageName = 'teleport';
  readonly displayName = 'Teleport';

  readonly dataStreams: DataStreamConfig[] = [
    { name: 'Audit Logs', index: 'logs-teleport.audit-default' },
  ];

  generateDocuments(
    org: Organization,
    _correlationMap: CorrelationMap
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const documents: IntegrationDocument[] = [];

    for (const employee of org.employees) {
      const eventCount = faker.number.int({ min: 2, max: 5 });
      for (let i = 0; i < eventCount; i++) {
        documents.push(this.createAuditDocument(employee));
      }
    }

    documentsMap.set(this.dataStreams[0].index, documents);
    return documentsMap;
  }

  private createAuditDocument(employee: Employee): IntegrationDocument {
    const eventDef = faker.helpers.weightedArrayElement(
      AUDIT_EVENTS.map((e) => ({ value: e, weight: e.weight }))
    );
    const timestamp = this.getRandomTimestamp(72);
    const isFailure = eventDef.code.endsWith('W');
    const outcome = isFailure ? 'failure' : 'success';
    const serverHostname = faker.helpers.arrayElement(SERVER_HOSTNAMES);
    const sessionId = faker.string.uuid();

    const rawEvent: Record<string, unknown> = {
      code: eventDef.code,
      event: eventDef.event,
      time: timestamp,
      uid: faker.string.uuid(),
      user: employee.email,
      success: !isFailure,
    };

    if (eventDef.event === 'user.login') {
      rawEvent.method = faker.helpers.arrayElement(LOGIN_METHODS);
    }

    if (eventDef.event.startsWith('session.') || eventDef.event === 'exec') {
      rawEvent.sid = sessionId;
      rawEvent.server_hostname = serverHostname;
      rawEvent.server_id = faker.string.uuid();
    }

    if (eventDef.event === 'exec' || eventDef.event === 'session.command') {
      rawEvent.command = faker.helpers.arrayElement(SHELL_COMMANDS);
      rawEvent.exitCode = isFailure ? 1 : 0;
      rawEvent.login = employee.userName;
    }

    if (eventDef.event === 'scp') {
      rawEvent.path = `/home/${employee.userName}/${faker.system.fileName()}`;
      rawEvent.action = faker.helpers.arrayElement(['upload', 'download']);
    }

    const teleportAudit: Record<string, unknown> = {};
    if (eventDef.event === 'user.login') {
      teleportAudit.login = { method: rawEvent.method as string };
    }
    if (eventDef.event === 'session.start' || eventDef.event === 'session.end') {
      teleportAudit.session = {
        id: sessionId,
        server_hostname: serverHostname,
      };
    }
    if (eventDef.event === 'exec' || eventDef.event === 'session.command') {
      teleportAudit.server = { hostname: serverHostname };
    }
    if (eventDef.event === 'session.network') {
      teleportAudit.network = {
        dest_addr: faker.internet.ipv4(),
        dest_port: faker.helpers.arrayElement([80, 443, 5432, 3306, 6379, 27017]),
      };
    }

    const userDomain = employee.email.split('@')[1];

    return {
      '@timestamp': timestamp,
      event: {
        action: eventDef.event,
        category: eventDef.category,
        type: eventDef.type,
        code: eventDef.code,
        kind: 'event',
        outcome: [outcome],
        id: rawEvent.uid as string,
        dataset: 'teleport.audit',
      },
      teleport: { audit: teleportAudit },
      user: {
        name: employee.userName,
        email: employee.email,
        domain: userDomain,
      },
      related: { user: [employee.userName, employee.email] },
      message: JSON.stringify(rawEvent),
      tags: ['preserve_original_event', 'forwarded', 'teleport-audit'],
      data_stream: { namespace: 'default', type: 'logs', dataset: 'teleport.audit' },
    } as IntegrationDocument;
  }
}
