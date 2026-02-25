/**
 * Microsoft 365 (O365) Integration
 * Generates unified audit log documents for the o365.audit data stream
 */

import { BaseIntegration, IntegrationDocument, DataStreamConfig } from './base_integration';
import { Organization, CorrelationMap, Employee, DepartmentName } from '../types';
import { faker } from '@faker-js/faker';
import { O365_WORKLOADS, DEPT_O365_WEIGHTS, SHAREPOINT_SITES } from '../data/saas_apps';

/**
 * O365 Integration
 */
export class O365Integration extends BaseIntegration {
  readonly packageName = 'o365';
  readonly displayName = 'Microsoft 365';

  readonly dataStreams: DataStreamConfig[] = [{ name: 'audit', index: 'logs-o365.audit-default' }];

  generateDocuments(
    org: Organization,
    _correlationMap: CorrelationMap
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();

    // Only generate if Microsoft is the productivity suite
    if (org.productivitySuite !== 'microsoft') {
      documentsMap.set('logs-o365.audit-default', []);
      return documentsMap;
    }

    const auditDocs: IntegrationDocument[] = [];
    const eventsPerEmployee = this.getEventsPerEmployee(org.size);

    for (const employee of org.employees) {
      const eventCount = faker.number.int({
        min: eventsPerEmployee.min,
        max: eventsPerEmployee.max,
      });
      for (let i = 0; i < eventCount; i++) {
        auditDocs.push(this.generateAuditDocument(employee, org));
      }
    }

    documentsMap.set('logs-o365.audit-default', auditDocs);
    return documentsMap;
  }

  private generateAuditDocument(employee: Employee, org: Organization): IntegrationDocument {
    const workload = this.pickWorkload(employee.department);
    const workloadConfig = O365_WORKLOADS[workload];
    const operation = faker.helpers.arrayElement(workloadConfig.operations);
    const clientIp = faker.internet.ipv4();
    const timestamp = this.getRandomTimestamp(72);

    const doc: IntegrationDocument = {
      '@timestamp': timestamp,
      event: {
        action: operation,
        category: this.getEventCategory(workload),
        type: this.getEventType(operation),
        outcome: faker.helpers.weightedArrayElement([
          { value: 'success', weight: 95 },
          { value: 'failure', weight: 5 },
        ]),
        kind: 'event',
        dataset: 'o365.audit',
        code: workloadConfig.recordType,
        provider: workload,
      },
      o365: {
        audit: {
          Operation: operation,
          Workload: workload,
          UserId: employee.email,
          UserKey: employee.entraIdUserId,
          UserType: 'Regular',
          ClientIP: clientIp,
          RecordType: workloadConfig.recordType,
          ResultStatus: 'Succeeded',
          OrganizationId: faker.string.uuid(),
          CreationTime: timestamp,
          Id: faker.string.uuid(),
          Version: 1,
          ...this.getWorkloadSpecificFields(workload, operation, employee, org),
        },
      },
      user: {
        email: employee.email,
        name: employee.email,
        domain: org.domain,
        id: employee.entraIdUserId,
      },
      source: { ip: clientIp },
      client: { ip: clientIp },
      organization: { id: faker.string.uuid() },
      related: { user: [employee.email, employee.userName], ip: [clientIp] },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'o365.audit' },
      tags: ['forwarded', 'o365-audit', 'preserve_original_event'],
    };

    return doc;
  }

  private pickWorkload(department: DepartmentName): string {
    const weights = DEPT_O365_WEIGHTS[department];
    const entries = Object.entries(weights);
    const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
    let random = faker.number.float({ min: 0, max: totalWeight });

    for (const [workload, weight] of entries) {
      random -= weight;
      if (random <= 0) return workload;
    }
    return entries[0][0];
  }

  private getWorkloadSpecificFields(
    workload: string,
    operation: string,
    employee: Employee,
    org: Organization
  ): Record<string, unknown> {
    switch (workload) {
      case 'SharePoint':
      case 'OneDrive': {
        const sites = SHAREPOINT_SITES[employee.department] || ['/sites/general'];
        const site = faker.helpers.arrayElement(sites);
        return {
          ObjectId: `https://${org.name.toLowerCase().replace(/\s+/g, '')}-my.sharepoint.com${site}/document.docx`,
          ItemType: faker.helpers.arrayElement(['File', 'Folder', 'Page', 'Site']),
          Site: faker.string.uuid(),
          SiteUrl: `https://${org.name.toLowerCase().replace(/\s+/g, '')}.sharepoint.com${site}`,
          WebId: faker.string.uuid(),
          EventSource: 'SharePoint',
        };
      }
      case 'Exchange':
        return {
          ObjectId: operation === 'MailItemsAccessed' ? '' : faker.internet.email(),
          MailboxGuid: faker.string.uuid(),
          ClientInfoString: 'Client=OWA;Action=ViaProxy',
        };
      case 'AzureActiveDirectory':
        return {
          ObjectId: operation.includes('Logged') ? 'Not Available' : faker.string.uuid(),
          LogonType: faker.helpers.arrayElement([0, 1, 2]),
          ActorIpAddress: faker.internet.ipv4(),
        };
      case 'MicrosoftTeams':
        return {
          ObjectId: faker.string.uuid(),
          TeamName: `${employee.department} Team`,
          TeamGuid: faker.string.uuid(),
          CommunicationType: faker.helpers.arrayElement(['OneOnOne', 'GroupChat', 'Channel']),
        };
      default:
        return {};
    }
  }

  private getEventCategory(workload: string): string[] {
    switch (workload) {
      case 'AzureActiveDirectory':
        return ['authentication'];
      case 'Exchange':
        return ['email'];
      case 'SharePoint':
      case 'OneDrive':
        return ['file'];
      case 'MicrosoftTeams':
        return ['web'];
      default:
        return ['web'];
    }
  }

  private getEventType(operation: string): string[] {
    if (
      operation.includes('Logged') ||
      operation.includes('Login') ||
      operation.includes('Accessed')
    )
      return ['access'];
    if (
      operation.includes('Created') ||
      operation.includes('Create') ||
      operation.includes('Add') ||
      operation.includes('Uploaded')
    )
      return ['creation'];
    if (
      operation.includes('Modified') ||
      operation.includes('Update') ||
      operation.includes('Change') ||
      operation.includes('Set')
    )
      return ['change'];
    if (operation.includes('Deleted') || operation.includes('Remove')) return ['deletion'];
    return ['info'];
  }

  private getEventsPerEmployee(size: string): { min: number; max: number } {
    switch (size) {
      case 'small':
        return { min: 3, max: 8 };
      case 'medium':
        return { min: 3, max: 8 };
      case 'enterprise':
        return { min: 3, max: 8 };
      default:
        return { min: 3, max: 8 };
    }
  }
}
