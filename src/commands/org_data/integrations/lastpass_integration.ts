/**
 * LastPass Integration
 * Generates user, event report, and shared folder documents
 * Based on the Elastic lastpass integration package
 */

import { BaseIntegration, IntegrationDocument, DataStreamConfig } from './base_integration';
import { Organization, Employee, CorrelationMap } from '../types';
import { faker } from '@faker-js/faker';

const EVENT_ACTIONS: Array<{
  action: string;
  category: string[];
  outcome: string;
  weight: number;
}> = [
  {
    action: 'Log in from Mobile',
    category: ['authentication'],
    outcome: 'success',
    weight: 15,
  },
  {
    action: 'Failed Login Attempt',
    category: ['authentication'],
    outcome: 'failure',
    weight: 8,
  },
  {
    action: 'Log in from Extension',
    category: ['authentication'],
    outcome: 'success',
    weight: 20,
  },
  {
    action: 'Master Password Reenter',
    category: ['authentication'],
    outcome: 'success',
    weight: 5,
  },
  {
    action: 'Site Added',
    category: ['configuration'],
    outcome: 'success',
    weight: 10,
  },
  {
    action: 'Site Updated',
    category: ['configuration'],
    outcome: 'success',
    weight: 8,
  },
  {
    action: 'Site Deleted',
    category: ['configuration'],
    outcome: 'success',
    weight: 3,
  },
  {
    action: 'Vault Export',
    category: ['database'],
    outcome: 'success',
    weight: 2,
  },
  {
    action: 'Password Changed',
    category: ['iam'],
    outcome: 'success',
    weight: 4,
  },
  {
    action: 'Form Fill Created',
    category: ['configuration'],
    outcome: 'success',
    weight: 5,
  },
  {
    action: 'Shared Folder Created',
    category: ['configuration'],
    outcome: 'success',
    weight: 3,
  },
  {
    action: 'Shared Folder Item Added',
    category: ['configuration'],
    outcome: 'success',
    weight: 4,
  },
  {
    action: 'Emergency Access Accepted',
    category: ['iam'],
    outcome: 'success',
    weight: 1,
  },
  {
    action: 'Secure Note Added',
    category: ['configuration'],
    outcome: 'success',
    weight: 6,
  },
  {
    action: 'Multifactor Enabled',
    category: ['authentication'],
    outcome: 'success',
    weight: 3,
  },
  {
    action: 'Multifactor Disabled',
    category: ['authentication'],
    outcome: 'success',
    weight: 1,
  },
];

const USER_GROUPS = [
  'Domain Admins',
  'Dev Team',
  'Support Team',
  'Security Team',
  'Marketing Team',
  'Engineering',
  'Operations',
  'All Users',
];

const SHARED_FOLDER_NAMES = [
  'Engineering Credentials',
  'Shared Infrastructure',
  'Marketing Logins',
  'Production Secrets',
  'Vendor Accounts',
  'Cloud Credentials',
  'Team Shared',
  'Executive Access',
];

export class LastPassIntegration extends BaseIntegration {
  readonly packageName = 'lastpass';
  readonly displayName = 'LastPass';

  readonly dataStreams: DataStreamConfig[] = [
    { name: 'user', index: 'logs-lastpass.user-default' },
    { name: 'event_report', index: 'logs-lastpass.event_report-default' },
    {
      name: 'detailed_shared_folder',
      index: 'logs-lastpass.detailed_shared_folder-default',
    },
  ];

  generateDocuments(
    org: Organization,
    _correlationMap: CorrelationMap
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();

    const userDocs: IntegrationDocument[] = [];
    const eventDocs: IntegrationDocument[] = [];

    for (const employee of org.employees) {
      userDocs.push(this.createUserDocument(employee));

      const eventCount = faker.number.int({ min: 2, max: 5 });
      for (let i = 0; i < eventCount; i++) {
        eventDocs.push(this.createEventReportDocument(employee));
      }
    }

    const sharedFolderDocs = this.createSharedFolderDocuments(org);

    documentsMap.set(this.dataStreams[0].index, userDocs);
    documentsMap.set(this.dataStreams[1].index, eventDocs);
    documentsMap.set(this.dataStreams[2].index, sharedFolderDocs);

    return documentsMap;
  }

  private createUserDocument(employee: Employee): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(24);
    const userId = String(faker.number.int({ min: 100, max: 99999 }));
    const groups = faker.helpers.arrayElements(USER_GROUPS, { min: 1, max: 3 });
    groups.push(employee.department);

    return {
      '@timestamp': timestamp,
      lastpass: {
        user: {
          application: faker.number.int({ min: 0, max: 10 }),
          attachment: faker.number.int({ min: 0, max: 20 }),
          created: this.getRandomTimestamp(2160),
          disabled: false,
          form_fill: faker.number.int({ min: 0, max: 15 }),
          full_name: `${employee.firstName} ${employee.lastName}`,
          group: groups,
          id: userId,
          last_login: this.getRandomTimestamp(48),
          last_password_change: this.getRandomTimestamp(720),
          master_password_strength: faker.number.int({ min: 40, max: 100 }),
          never_logged_in: false,
          note: faker.number.int({ min: 0, max: 50 }),
          password_reset_required: false,
          sites: faker.number.int({ min: 5, max: 200 }),
          user_name: employee.email,
        },
      },
      event: {
        category: ['iam'],
        dataset: 'lastpass.user',
        kind: 'state',
        type: ['user'],
      },
      related: {
        user: [employee.email, `${employee.firstName} ${employee.lastName}`],
      },
      user: {
        email: employee.email,
        full_name: `${employee.firstName} ${employee.lastName}`,
        group: { name: groups },
        id: userId,
      },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'lastpass.user' },
      tags: ['forwarded', 'lastpass-user'],
    } as IntegrationDocument;
  }

  private createEventReportDocument(employee: Employee): IntegrationDocument {
    const eventDef = faker.helpers.weightedArrayElement(
      EVENT_ACTIONS.map((e) => ({ value: e, weight: e.weight }))
    );
    const timestamp = this.getRandomTimestamp(72);
    const sourceIp = faker.internet.ipv4();

    return {
      '@timestamp': timestamp,
      lastpass: {
        event_report: {
          action: eventDef.action,
          ip: sourceIp,
          time: timestamp,
          user_name: employee.email,
        },
      },
      event: {
        action: eventDef.action.toLowerCase(),
        category: eventDef.category,
        dataset: 'lastpass.event_report',
        kind: 'event',
        outcome: eventDef.outcome,
        type: ['info'],
      },
      source: { ip: sourceIp },
      related: {
        ip: [sourceIp],
        user: [employee.email],
      },
      user: {
        email: [employee.email],
      },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'lastpass.event_report' },
      tags: ['forwarded', 'lastpass-event_report'],
    } as IntegrationDocument;
  }

  private createSharedFolderDocuments(org: Organization): IntegrationDocument[] {
    return SHARED_FOLDER_NAMES.map((name) => {
      const timestamp = this.getRandomTimestamp(168);
      const folderId = String(faker.number.int({ min: 10000, max: 99999 }));
      const members = faker.helpers.arrayElements(org.employees, { min: 2, max: 5 });

      const users = members.map((m) => ({
        can_administer: faker.datatype.boolean(0.2),
        give: faker.datatype.boolean(0.5),
        name: m.email,
        read_only: faker.datatype.boolean(0.3),
        sites: faker.number.int({ min: 1, max: 20 }),
        super_admin: false,
      }));

      return {
        '@timestamp': timestamp,
        lastpass: {
          detailed_shared_folder: {
            deleted: false,
            name,
            score: faker.number.int({ min: 50, max: 100 }),
            shared_folder: { id: folderId },
            user: users,
          },
        },
        event: {
          dataset: 'lastpass.detailed_shared_folder',
          kind: 'state',
          type: ['info'],
        },
        data_stream: {
          namespace: 'default',
          type: 'logs',
          dataset: 'lastpass.detailed_shared_folder',
        },
        tags: ['forwarded', 'lastpass-detailed_shared_folder'],
      } as IntegrationDocument;
    });
  }
}
