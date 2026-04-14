/**
 * LastPass Integration
 * Generates user, event report, and shared folder documents
 * Based on the Elastic lastpass integration package
 * Produces raw LastPass API JSON in message for ingest pipeline processing
 */

import {
  BaseIntegration,
  type IntegrationDocument,
  type DataStreamConfig,
} from './base_integration.ts';
import { type Organization, type Employee, type CorrelationMap } from '../types.ts';
import { faker } from '@faker-js/faker';

/** Stable LastPass user ID from employee (numeric string for API) */
function getStableLastPassUserId(employee: Employee): string {
  const hash = employee.id.replace(/-/g, '').slice(0, 6);
  return String((parseInt(hash, 16) % 90000) + 10000);
}

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
    _correlationMap: CorrelationMap,
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();

    const userDocs: IntegrationDocument[] = [];
    const eventDocs: IntegrationDocument[] = [];
    const centralAgent = this.buildCentralAgent(org);

    for (const employee of org.employees) {
      userDocs.push(this.createUserDocument(employee, centralAgent));

      const eventCount = faker.number.int({ min: 2, max: 5 });
      for (let i = 0; i < eventCount; i++) {
        eventDocs.push(this.createEventReportDocument(employee, centralAgent));
      }
    }

    const sharedFolderDocs = this.createSharedFolderDocuments(org, centralAgent);

    documentsMap.set(this.dataStreams[0].index, userDocs);
    documentsMap.set(this.dataStreams[1].index, eventDocs);
    documentsMap.set(this.dataStreams[2].index, sharedFolderDocs);

    return documentsMap;
  }

  private createUserDocument(
    employee: Employee,
    centralAgent: { id: string; name: string; type: string; version: string },
  ): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(24);
    const userId = getStableLastPassUserId(employee);
    const groups = faker.helpers.arrayElements(USER_GROUPS, { min: 1, max: 3 });
    groups.push(employee.department);
    const created = this.getRandomTimestamp(2160);
    const lastLogin = this.getRandomTimestamp(48);
    const lastPwChange = this.getRandomTimestamp(720);

    const rawUser: Record<string, unknown> = {
      admin: false,
      applications: faker.number.int({ min: 0, max: 10 }),
      attachments: faker.number.int({ min: 0, max: 20 }),
      created: this.formatLastPassDateTime(created),
      disabled: false,
      formfills: faker.number.int({ min: 0, max: 15 }),
      fullname: `${employee.firstName} ${employee.lastName}`,
      groups,
      id: userId,
      last_login: this.formatLastPassDateTime(lastLogin),
      last_pw_change: this.formatLastPassDateTime(lastPwChange),
      linked: null,
      mpstrength: String(faker.number.int({ min: 40, max: 100 })),
      neverloggedin: false,
      notes: faker.number.int({ min: 0, max: 50 }),
      password_reset_required: false,
      sites: faker.number.int({ min: 5, max: 200 }),
      username: employee.email,
    };

    return {
      '@timestamp': timestamp,
      agent: centralAgent,
      message: JSON.stringify(rawUser),
      data_stream: { namespace: 'default', type: 'logs', dataset: 'lastpass.user' },
    } as IntegrationDocument;
  }

  /** Format ISO timestamp to LastPass API format (yyyy-MM-dd HH:mm:ss) */
  private formatLastPassDateTime(iso: string): string {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  private createEventReportDocument(
    employee: Employee,
    centralAgent: { id: string; name: string; type: string; version: string },
  ): IntegrationDocument {
    const eventDef = faker.helpers.weightedArrayElement(
      EVENT_ACTIONS.map((e) => ({ value: e, weight: e.weight })),
    );
    const timestamp = this.getRandomTimestamp(72);
    const sourceIp = faker.internet.ipv4();
    const eventId = `Event${faker.string.alphanumeric(6)}`;

    const rawEvent = {
      Action: eventDef.action,
      Data: '',
      IP_Address: sourceIp,
      Time: this.formatLastPassDateTime(timestamp),
      Username: employee.email,
      id: eventId,
    };

    return {
      '@timestamp': timestamp,
      agent: centralAgent,
      message: JSON.stringify(rawEvent),
      data_stream: {
        namespace: 'default',
        type: 'logs',
        dataset: 'lastpass.event_report',
      },
    } as IntegrationDocument;
  }

  private createSharedFolderDocuments(
    org: Organization,
    centralAgent: { id: string; name: string; type: string; version: string },
  ): IntegrationDocument[] {
    const docs: IntegrationDocument[] = [];
    for (const name of SHARED_FOLDER_NAMES) {
      const timestamp = this.getRandomTimestamp(168);
      const folderId = String(faker.number.int({ min: 10000, max: 99999 }));
      const members = faker.helpers.arrayElements(org.employees, { min: 2, max: 5 });
      const score = faker.number.int({ min: 50, max: 100 });

      for (const member of members) {
        const rawFolder = {
          id: folderId,
          score,
          sharedfoldername: name,
          deleted: false,
          users: {
            username: member.email,
            superadmin: false,
            readonly: faker.datatype.boolean(0.3),
            give: faker.datatype.boolean(0.5),
            can_administer: faker.datatype.boolean(0.2),
            sites: Array.from({ length: faker.number.int({ min: 1, max: 5 }) }, () =>
              faker.internet.domainName(),
            ),
          },
        };

        docs.push({
          '@timestamp': timestamp,
          agent: centralAgent,
          message: JSON.stringify(rawFolder),
          data_stream: {
            namespace: 'default',
            type: 'logs',
            dataset: 'lastpass.detailed_shared_folder',
          },
        } as IntegrationDocument);
      }
    }
    return docs;
  }
}
