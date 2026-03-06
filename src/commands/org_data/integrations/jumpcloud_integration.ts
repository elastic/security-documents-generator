/**
 * JumpCloud Integration
 * Generates Directory Insights event documents
 * Based on the Elastic jumpcloud integration package
 */

import { BaseIntegration, IntegrationDocument, DataStreamConfig } from './base_integration';
import { Organization, Employee, CorrelationMap } from '../types';
import { faker } from '@faker-js/faker';

const EVENT_TYPES: Array<{
  eventType: string;
  service: string;
  category: string[];
  weight: number;
  outcome?: 'success' | 'failure';
}> = [
  {
    eventType: 'admin_login_attempt',
    service: 'directory',
    category: ['authentication'],
    weight: 5,
  },
  {
    eventType: 'user_login_attempt',
    service: 'directory',
    category: ['authentication'],
    weight: 25,
  },
  {
    eventType: 'user_login_attempt',
    service: 'directory',
    category: ['authentication'],
    weight: 8,
    outcome: 'failure',
  },
  {
    eventType: 'sso_auth',
    service: 'sso',
    category: ['authentication'],
    weight: 20,
  },
  {
    eventType: 'user_password_change',
    service: 'directory',
    category: ['iam'],
    weight: 5,
  },
  {
    eventType: 'user_update',
    service: 'directory',
    category: ['iam'],
    weight: 8,
  },
  {
    eventType: 'user_mfa_update',
    service: 'directory',
    category: ['iam'],
    weight: 4,
  },
  {
    eventType: 'system_group_membership',
    service: 'systems',
    category: ['iam'],
    weight: 5,
  },
  {
    eventType: 'radius_auth_attempt',
    service: 'radius',
    category: ['authentication'],
    weight: 6,
  },
  {
    eventType: 'ldap_bind',
    service: 'ldap',
    category: ['authentication'],
    weight: 7,
  },
  {
    eventType: 'mdm_command',
    service: 'mdm',
    category: ['configuration'],
    weight: 3,
  },
  {
    eventType: 'user_locked_out',
    service: 'directory',
    category: ['authentication'],
    weight: 2,
    outcome: 'failure',
  },
  {
    eventType: 'organization_update',
    service: 'directory',
    category: ['configuration'],
    weight: 2,
  },
];

const USERAGENT_COMBOS: Array<{
  device: string;
  name: string;
  os: string;
  osVersion: string;
  version: string;
}> = [
  { device: 'Mac', name: 'Chrome', os: 'Mac OS X', osVersion: '14.5', version: '126.0.0.0' },
  { device: 'Mac', name: 'Safari', os: 'Mac OS X', osVersion: '14.5', version: '17.5' },
  {
    device: 'Other',
    name: 'Chrome',
    os: 'Windows',
    osVersion: '10.0',
    version: '126.0.0.0',
  },
  {
    device: 'Other',
    name: 'Firefox',
    os: 'Windows',
    osVersion: '10.0',
    version: '127.0',
  },
  {
    device: 'Other',
    name: 'Chrome',
    os: 'Linux',
    osVersion: '6.5.0',
    version: '126.0.0.0',
  },
];

const CHANGE_FIELDS = [
  'active',
  'displayName',
  'emails',
  'externalId',
  'title',
  'department',
  'phoneNumbers',
];

export class JumpCloudIntegration extends BaseIntegration {
  readonly packageName = 'jumpcloud';
  readonly displayName = 'JumpCloud';

  readonly dataStreams: DataStreamConfig[] = [
    { name: 'events', index: 'logs-jumpcloud.events-default' },
  ];

  generateDocuments(
    org: Organization,
    _correlationMap: CorrelationMap
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const eventDocs: IntegrationDocument[] = [];
    const orgId = faker.string.hexadecimal({ length: 24, prefix: '' });

    for (const employee of org.employees) {
      const eventCount = faker.number.int({ min: 2, max: 5 });
      for (let i = 0; i < eventCount; i++) {
        eventDocs.push(this.createEventDocument(employee, orgId));
      }
    }

    documentsMap.set(this.dataStreams[0].index, eventDocs);
    return documentsMap;
  }

  private createEventDocument(employee: Employee, orgId: string): IntegrationDocument {
    const eventDef = faker.helpers.weightedArrayElement(
      EVENT_TYPES.map((e) => ({ value: e, weight: e.weight }))
    );
    const timestamp = this.getRandomTimestamp(72);
    const clientIp = faker.internet.ipv4();
    const eventId = faker.string.hexadecimal({ length: 24, prefix: '' });
    const initiatorId = faker.string.hexadecimal({ length: 24, prefix: '' });
    const ua = faker.helpers.arrayElement(USERAGENT_COMBOS);
    const outcome = eventDef.outcome ?? 'success';
    const isAdmin = eventDef.eventType.startsWith('admin_');

    const changes =
      eventDef.eventType === 'user_update'
        ? faker.helpers
            .arrayElements(CHANGE_FIELDS, { min: 1, max: 3 })
            .map((field) => ({ field, to: field === 'active' ? true : `updated-${field}` }))
        : [];

    return {
      '@timestamp': timestamp,
      jumpcloud: {
        event: {
          ...(changes.length > 0 ? { changes } : {}),
          client_ip: clientIp,
          event_type: eventDef.eventType,
          geoip: {
            continent_code: faker.helpers.arrayElement(['NA', 'EU', 'OC', 'AS']),
            country_code: employee.countryCode,
            latitude: faker.location.latitude(),
            longitude: faker.location.longitude(),
            region_name: faker.location.state(),
            timezone: employee.timezone,
          },
          id: eventId,
          initiated_by: {
            email: employee.email,
            id: initiatorId,
            type: isAdmin ? 'admin' : 'user',
          },
          mfa: faker.datatype.boolean(0.7),
          organization: orgId,
          service: eventDef.service,
          success: outcome === 'success',
          timestamp,
          useragent: {
            device: ua.device,
            name: ua.name,
            os: ua.os,
            os_full: `${ua.os} ${ua.osVersion}`,
            os_name: ua.os,
            os_version: ua.osVersion,
            version: ua.version,
          },
          version: '1',
        },
      },
      client: {
        geo: {
          city_name: faker.location.city(),
          country_iso_code: employee.countryCode,
          country_name: employee.country,
        },
        ip: clientIp,
      },
      event: {
        action: eventDef.eventType,
        category: eventDef.category,
        dataset: 'jumpcloud.events',
        id: eventId,
        kind: 'event',
        module: eventDef.service,
        outcome,
        type: ['info'],
      },
      source: {
        user: {
          email: employee.email,
          id: initiatorId,
        },
      },
      user_agent: {
        device: { name: ua.device },
        name: ua.name,
        os: {
          full: `${ua.os} ${ua.osVersion}`,
          name: ua.os,
          version: ua.osVersion,
        },
        version: ua.version,
      },
      related: {
        ip: [clientIp],
        user: [employee.email, initiatorId],
      },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'jumpcloud.events' },
      tags: ['forwarded', 'jumpcloud-events'],
    } as IntegrationDocument;
  }
}
