/**
 * Keeper Security Integration
 * Generates audit event documents for the Keeper password manager
 * Based on the Elastic keeper integration package
 */

import {
  BaseIntegration,
  type IntegrationDocument,
  type DataStreamConfig,
} from './base_integration.ts';
import { type Organization, type Employee, type CorrelationMap } from '../types.ts';
import { faker } from '@faker-js/faker';

const AUDIT_EVENTS: Array<{
  event: string;
  category: string;
  eventCategory: string[];
  eventType: string[];
  weight: number;
  outcome?: 'failure';
}> = [
  {
    event: 'login',
    category: 'security',
    eventCategory: ['authentication'],
    eventType: ['start'],
    weight: 30,
  },
  {
    event: 'failed_login',
    category: 'security',
    eventCategory: ['authentication'],
    eventType: ['start'],
    weight: 8,
    outcome: 'failure',
  },
  {
    event: 'change_master_password',
    category: 'security',
    eventCategory: ['authentication', 'web'],
    eventType: ['access', 'info'],
    weight: 3,
  },
  {
    event: 'vault_export',
    category: 'security',
    eventCategory: ['database'],
    eventType: ['access'],
    weight: 2,
  },
  {
    event: 'create_record',
    category: 'records',
    eventCategory: ['database'],
    eventType: ['creation'],
    weight: 15,
  },
  {
    event: 'update_record',
    category: 'records',
    eventCategory: ['database'],
    eventType: ['change'],
    weight: 12,
  },
  {
    event: 'delete_record',
    category: 'records',
    eventCategory: ['database'],
    eventType: ['deletion'],
    weight: 4,
  },
  {
    event: 'share_record',
    category: 'sharing',
    eventCategory: ['database'],
    eventType: ['access'],
    weight: 8,
  },
  {
    event: 'accept_share',
    category: 'sharing',
    eventCategory: ['database'],
    eventType: ['access'],
    weight: 5,
  },
  {
    event: 'two_factor_enabled',
    category: 'security',
    eventCategory: ['authentication'],
    eventType: ['info'],
    weight: 3,
  },
  {
    event: 'two_factor_disabled',
    category: 'security',
    eventCategory: ['authentication'],
    eventType: ['info'],
    weight: 1,
  },
  {
    event: 'create_shared_folder',
    category: 'sharing',
    eventCategory: ['database'],
    eventType: ['creation'],
    weight: 4,
  },
  {
    event: 'create_team',
    category: 'teams',
    eventCategory: ['iam'],
    eventType: ['creation'],
    weight: 2,
  },
  {
    event: 'add_team_member',
    category: 'teams',
    eventCategory: ['iam'],
    eventType: ['change'],
    weight: 3,
  },
];

const CLIENT_VERSIONS = [
  'CLI.5.3.1',
  'Web.16.12.0',
  'Desktop.16.11.4',
  'iOS.16.10.1',
  'Android.16.10.2',
  'Browser.16.12.0',
];

export class KeeperIntegration extends BaseIntegration {
  readonly packageName = 'keeper';
  readonly displayName = 'Keeper Security';

  readonly dataStreams: DataStreamConfig[] = [
    { name: 'audit', index: 'logs-keeper.audit-default' },
  ];

  generateDocuments(
    org: Organization,
    _correlationMap: CorrelationMap,
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const auditDocs: IntegrationDocument[] = [];
    const enterpriseId = faker.number.int({ min: 1000, max: 9999 });

    for (const employee of org.employees) {
      const eventCount = faker.number.int({ min: 2, max: 5 });
      for (let i = 0; i < eventCount; i++) {
        auditDocs.push(this.createAuditDocument(employee, enterpriseId));
      }
    }

    documentsMap.set(this.dataStreams[0].index, auditDocs);
    return documentsMap;
  }

  private createAuditDocument(employee: Employee, enterpriseId: number): IntegrationDocument {
    const eventDef = faker.helpers.weightedArrayElement(
      AUDIT_EVENTS.map((e) => ({ value: e, weight: e.weight })),
    );
    const timestamp = this.getRandomTimestamp(72);
    const sourceIp = faker.internet.ipv4();
    const clientVersion = faker.helpers.arrayElement(CLIENT_VERSIONS);
    const outcome = eventDef.outcome ?? 'success';

    const rawEvent = {
      audit_event: eventDef.event,
      category: eventDef.category,
      client_version: clientVersion,
      enterprise_id: enterpriseId,
      username: employee.email,
      remote_address: sourceIp,
      timestamp,
      outcome,
      event_type: eventDef.event,
      event_category: eventDef.eventCategory,
      event_types: eventDef.eventType,
      organization_id: String(enterpriseId),
      source_ip: sourceIp,
      city_name: faker.location.city(),
      continent_name: faker.helpers.arrayElement(['North America', 'Europe', 'Asia', 'Oceania']),
      country_iso_code: employee.countryCode,
      country_name: employee.country,
      user_agent: `Keeper/${clientVersion}`,
    };

    return {
      '@timestamp': timestamp,
      message: JSON.stringify(rawEvent),
      data_stream: { namespace: 'default', type: 'logs', dataset: 'keeper.audit' },
    } as IntegrationDocument;
  }
}
