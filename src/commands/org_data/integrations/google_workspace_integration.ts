/**
 * Google Workspace Integration
 * Generates login, admin, and drive audit log documents
 */

import { BaseIntegration, IntegrationDocument, DataStreamConfig } from './base_integration';
import { Organization, CorrelationMap, Employee, DepartmentName } from '../types';
import { faker } from '@faker-js/faker';
import { GOOGLE_WORKSPACE_SERVICES, DEPT_DRIVE_WEIGHTS } from '../data/saas_apps';

/**
 * Google Workspace Integration
 */
export class GoogleWorkspaceIntegration extends BaseIntegration {
  readonly packageName = 'google_workspace';
  readonly displayName = 'Google Workspace';

  readonly dataStreams: DataStreamConfig[] = [
    { name: 'login', index: 'logs-google_workspace.login-default' },
    { name: 'admin', index: 'logs-google_workspace.admin-default' },
    { name: 'drive', index: 'logs-google_workspace.drive-default' },
  ];

  generateDocuments(
    org: Organization,
    _correlationMap: CorrelationMap
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();

    // Only generate if Google is the productivity suite
    if (org.productivitySuite !== 'google') {
      documentsMap.set('logs-google_workspace.login-default', []);
      documentsMap.set('logs-google_workspace.admin-default', []);
      documentsMap.set('logs-google_workspace.drive-default', []);
      return documentsMap;
    }

    const loginDocs: IntegrationDocument[] = [];
    const adminDocs: IntegrationDocument[] = [];
    const driveDocs: IntegrationDocument[] = [];

    for (const employee of org.employees) {
      // Login events (1-3 per employee)
      const loginCount = faker.number.int({ min: 1, max: 3 });
      for (let i = 0; i < loginCount; i++) {
        loginDocs.push(this.generateLoginDocument(employee, org));
      }

      // Drive events (2-6 per employee)
      const driveCount = faker.number.int({ min: 2, max: 6 });
      for (let i = 0; i < driveCount; i++) {
        driveDocs.push(this.generateDriveDocument(employee, org));
      }
    }

    // Admin events only from Operations/IT staff
    const adminEmployees = org.employees.filter(
      (e) => e.department === 'Operations' && (e.role.includes('IT') || e.role.includes('Admin'))
    );
    // If no IT staff found, pick a few from operations
    const admins =
      adminEmployees.length > 0
        ? adminEmployees
        : org.employees.filter((e) => e.department === 'Operations').slice(0, 3);
    for (const admin of admins) {
      const adminCount = faker.number.int({ min: 1, max: 4 });
      for (let i = 0; i < adminCount; i++) {
        adminDocs.push(this.generateAdminDocument(admin, org));
      }
    }

    documentsMap.set('logs-google_workspace.login-default', loginDocs);
    documentsMap.set('logs-google_workspace.admin-default', adminDocs);
    documentsMap.set('logs-google_workspace.drive-default', driveDocs);
    return documentsMap;
  }

  private generateLoginDocument(employee: Employee, org: Organization): IntegrationDocument {
    const loginConfig = GOOGLE_WORKSPACE_SERVICES.login;
    const eventType = faker.helpers.weightedArrayElement([
      { value: 'login_success', weight: 85 },
      { value: 'login_failure', weight: 8 },
      { value: 'login_challenge', weight: 5 },
      { value: 'logout', weight: 2 },
    ]);
    const sourceIp = faker.internet.ipv4();
    const isSuccess = eventType === 'login_success' || eventType === 'logout';

    return {
      '@timestamp': this.getRandomTimestamp(72),
      event: {
        action: eventType,
        category: ['authentication'],
        type: isSuccess ? ['start'] : ['info'],
        outcome: isSuccess ? 'success' : 'failure',
        kind: 'event',
        dataset: 'google_workspace.login',
        provider: 'login',
      },
      google_workspace: {
        actor: { type: 'USER' },
        event: { type: eventType.includes('login') ? 'login' : 'logout' },
        organization: { domain: org.domain },
        login: {
          challenge_method:
            eventType === 'login_challenge'
              ? faker.helpers.arrayElement(loginConfig.challengeMethods)
              : undefined,
          is_suspicious: eventType === 'login_failure' && faker.datatype.boolean(0.1),
          type: faker.helpers.arrayElement(['exchange', 'google_password', 'saml', 'reauth']),
          timestamp: Date.now() * 1000,
        },
      },
      source: {
        ip: sourceIp,
        user: { email: employee.email },
      },
      user: {
        email: employee.email,
        name: employee.userName,
        domain: org.domain,
        id: faker.string.numeric(20),
      },
      related: { user: [employee.email, employee.userName], ip: [sourceIp] },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'google_workspace.login' },
      tags: ['forwarded', 'google_workspace-login'],
    } as IntegrationDocument;
  }

  private generateAdminDocument(employee: Employee, org: Organization): IntegrationDocument {
    const adminConfig = GOOGLE_WORKSPACE_SERVICES.admin;
    const eventAction = faker.helpers.arrayElement(adminConfig.events);
    const sourceIp = faker.internet.ipv4();

    return {
      '@timestamp': this.getRandomTimestamp(72),
      event: {
        action: eventAction,
        category: ['iam', 'configuration'],
        type: ['change'],
        kind: 'event',
        dataset: 'google_workspace.admin',
        provider: 'admin',
      },
      google_workspace: {
        actor: { type: 'USER' },
        event: { type: eventAction },
        organization: { domain: org.domain },
        admin: {
          application: {
            name: faker.helpers.arrayElement(adminConfig.applications),
          },
          setting: {
            name: eventAction.toLowerCase().replace(/_/g, ' '),
          },
          old_value: faker.helpers.arrayElement(['true', 'false', 'enabled', 'disabled']),
          new_value: faker.helpers.arrayElement(['true', 'false', 'enabled', 'disabled']),
        },
      },
      source: {
        ip: sourceIp,
        user: { email: employee.email },
      },
      user: {
        email: employee.email,
        name: employee.userName,
        domain: org.domain,
        id: faker.string.numeric(20),
      },
      related: { user: [employee.email, employee.userName], ip: [sourceIp] },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'google_workspace.admin' },
      tags: ['forwarded', 'google_workspace-admin'],
    } as IntegrationDocument;
  }

  private generateDriveDocument(employee: Employee, org: Organization): IntegrationDocument {
    const driveConfig = GOOGLE_WORKSPACE_SERVICES.drive;
    const eventAction = faker.helpers.arrayElement(driveConfig.events);
    const fileType = this.pickFileType(employee.department);
    const visibility = faker.helpers.arrayElement(driveConfig.visibilities);
    const sourceIp = faker.internet.ipv4();

    return {
      '@timestamp': this.getRandomTimestamp(72),
      event: {
        action: eventAction,
        category: ['file'],
        type: this.mapDriveEventType(eventAction),
        kind: 'event',
        dataset: 'google_workspace.drive',
        provider: 'drive',
      },
      google_workspace: {
        actor: { type: 'USER' },
        event: { type: eventAction },
        organization: { domain: org.domain },
        drive: {
          file: {
            id: faker.string.alphanumeric(44),
            type: fileType,
            owner: {
              email: employee.email,
              is_shared_drive: false,
            },
          },
          billable: faker.datatype.boolean(0.8),
          visibility,
          primary_event: true,
          originating_app_id: faker.string.numeric(12),
          ...(eventAction.includes('folder')
            ? {
                destination_folder_id: faker.string.alphanumeric(33),
                destination_folder_title: faker.helpers.arrayElement([
                  'Projects',
                  'Shared',
                  'Archive',
                  'Templates',
                ]),
              }
            : {}),
          ...(eventAction.includes('change_acl') || eventAction.includes('shared')
            ? {
                target_user: faker.helpers.arrayElement(org.employees).email,
              }
            : {}),
        },
      },
      file: {
        name: `${faker.word.adjective()}-${faker.word.noun()}.${this.fileTypeToExt(fileType)}`,
        owner: employee.email,
        type: 'file',
      },
      source: {
        ip: sourceIp,
        user: { email: employee.email },
      },
      user: {
        email: employee.email,
        name: employee.userName,
        domain: org.domain,
      },
      related: { user: [employee.email, employee.userName], ip: [sourceIp] },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'google_workspace.drive' },
      tags: ['forwarded', 'google_workspace-drive'],
    } as IntegrationDocument;
  }

  private pickFileType(department: DepartmentName): string {
    const weights = DEPT_DRIVE_WEIGHTS[department];
    const entries = Object.entries(weights);
    const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
    let random = faker.number.float({ min: 0, max: totalWeight });
    for (const [type, weight] of entries) {
      random -= weight;
      if (random <= 0) return type;
    }
    return 'document';
  }

  private fileTypeToExt(fileType: string): string {
    const map: Record<string, string> = {
      document: 'gdoc',
      spreadsheet: 'gsheet',
      presentation: 'gslides',
      form: 'gform',
      pdf: 'pdf',
      image: 'png',
      video: 'mp4',
      folder: '',
    };
    return map[fileType] || 'txt';
  }

  private mapDriveEventType(action: string): string[] {
    if (action.includes('create') || action.includes('upload') || action.includes('add'))
      return ['creation'];
    if (action.includes('delete') || action.includes('remove')) return ['deletion'];
    if (
      action.includes('edit') ||
      action.includes('rename') ||
      action.includes('move') ||
      action.includes('change')
    )
      return ['change'];
    return ['access'];
  }
}
