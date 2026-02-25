/**
 * Zscaler Internet Access (ZIA) Integration
 * Generates web proxy and firewall session log documents
 */

import { BaseIntegration, IntegrationDocument, DataStreamConfig } from './base_integration';
import { Organization, CorrelationMap, Employee, DepartmentName } from '../types';
import { faker } from '@faker-js/faker';
import { ZSCALER_URL_CATEGORIES, BLOCKED_URLS, WEB_USER_AGENTS } from '../data/network_data';

/**
 * Zscaler ZIA Integration
 */
export class ZscalerZiaIntegration extends BaseIntegration {
  readonly packageName = 'zscaler_zia';
  readonly displayName = 'Zscaler Internet Access';

  readonly dataStreams: DataStreamConfig[] = [
    { name: 'web', index: 'logs-zscaler_zia.web-default' },
    { name: 'firewall', index: 'logs-zscaler_zia.firewall-default' },
  ];

  generateDocuments(
    org: Organization,
    _correlationMap: CorrelationMap
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const webDocs: IntegrationDocument[] = [];
    const fwDocs: IntegrationDocument[] = [];

    const webEventsPerEmployee = this.getEventsPerEmployee(org.size);

    for (const employee of org.employees) {
      // Web proxy logs (3-8 per employee)
      const webCount = faker.number.int({
        min: webEventsPerEmployee.min,
        max: webEventsPerEmployee.max,
      });
      for (let i = 0; i < webCount; i++) {
        webDocs.push(this.generateWebDocument(employee, org));
      }

      // Occasional blocked request (5% chance per employee)
      if (faker.datatype.boolean(0.05)) {
        webDocs.push(this.generateBlockedWebDocument(employee, org));
      }
    }

    // Firewall logs (~1 per employee)
    for (const employee of org.employees) {
      if (faker.datatype.boolean(0.5)) {
        fwDocs.push(this.generateFirewallDocument(employee, org));
      }
    }

    documentsMap.set('logs-zscaler_zia.web-default', webDocs);
    documentsMap.set('logs-zscaler_zia.firewall-default', fwDocs);
    return documentsMap;
  }

  private generateWebDocument(employee: Employee, _org: Organization): IntegrationDocument {
    const urlData = this.pickUrlForDepartment(employee.department);
    const laptop = employee.devices.find((d) => d.type === 'laptop');
    const clientIp = faker.internet.ipv4();
    const serverIp = faker.internet.ipv4();
    const userAgent = faker.helpers.arrayElement(WEB_USER_AGENTS);
    const timestamp = this.getRandomTimestamp(72);

    const rawEvent = {
      action: 'Allowed',
      epochtime: Math.floor(new Date(timestamp).getTime() / 1000),
      url: `https://${urlData.url}`,
      host: urlData.url,
      urlsubcat: urlData.category,
      urlsupercat: urlData.superCategory,
      urlcatmethod: 'Lookup',
      urlclass: 'Business Use',
      appname: urlData.url.split('.')[0],
      appclass: 'General Browsing',
      appriskscore: faker.number.int({ min: 1, max: 10 }),
      login: employee.email,
      dept: employee.department,
      location: employee.city,
      devicehostname: laptop ? `${employee.userName}-${laptop.platform}` : 'unknown',
      devicename: laptop?.displayName || 'Unknown Device',
      deviceostype: this.mapOsType(laptop?.platform),
      cltip: clientIp,
      cltintip: clientIp,
      cltpubip: clientIp,
      cltsourceport: faker.number.int({ min: 1024, max: 65535 }),
      serverip: serverIp,
      reqmethod: faker.helpers.arrayElement(['GET', 'POST']),
      reqsize: faker.number.int({ min: 200, max: 50000 }),
      respcode: '200',
      respsize: faker.number.int({ min: 500, max: 500000 }),
      contenttype: 'application/json',
      ssldecrypted: faker.datatype.boolean(0.8) ? 'Yes' : 'No',
      flow_type: 'Direct',
      useragent: userAgent,
      riskscore: 0,
      rulelabel: 'Default Allow',
      ruletype: 'Security',
      proto: 'SSL',
    };

    return {
      '@timestamp': timestamp,
      message: JSON.stringify({ event: rawEvent }),
      data_stream: { namespace: 'default', type: 'logs', dataset: 'zscaler_zia.web' },
    } as IntegrationDocument;
  }

  private generateBlockedWebDocument(employee: Employee, _org: Organization): IntegrationDocument {
    const blockedUrl = faker.helpers.arrayElement(BLOCKED_URLS);
    const laptop = employee.devices.find((d) => d.type === 'laptop');
    const clientIp = faker.internet.ipv4();
    const timestamp = this.getRandomTimestamp(72);
    const threatName = faker.helpers.arrayElement([
      'Trojan.GenericKD',
      'Phishing.Site',
      'Malware.Generic',
      'CryptoMiner',
    ]);

    const rawEvent = {
      action: 'Blocked',
      epochtime: Math.floor(new Date(timestamp).getTime() / 1000),
      url: `https://${blockedUrl}`,
      host: blockedUrl,
      urlsubcat: faker.helpers.arrayElement(['Malware', 'Phishing', 'Suspicious']),
      urlsupercat: 'Security Risk',
      urlcatmethod: 'Lookup',
      urlclass: 'Security Risk',
      appname: blockedUrl.split('.')[0],
      appclass: 'Suspicious',
      appriskscore: faker.number.int({ min: 8, max: 10 }),
      login: employee.email,
      dept: employee.department,
      location: employee.city,
      devicehostname: laptop ? `${employee.userName}-${laptop.platform}` : 'unknown',
      devicename: laptop?.displayName || 'Unknown Device',
      deviceostype: this.mapOsType(laptop?.platform),
      cltip: clientIp,
      cltintip: clientIp,
      cltpubip: clientIp,
      cltsourceport: faker.number.int({ min: 1024, max: 65535 }),
      serverip: faker.internet.ipv4(),
      reqmethod: 'GET',
      reqsize: faker.number.int({ min: 200, max: 5000 }),
      respcode: '403',
      respsize: 0,
      reason: faker.helpers.arrayElement([
        'Malware',
        'Phishing',
        'Policy Violation',
        'Suspicious Content',
      ]),
      threatname: threatName,
      riskscore: faker.number.int({ min: 80, max: 100 }),
      rulelabel: 'Block Malicious Content',
      ruletype: 'Security',
      ssldecrypted: 'Yes',
      flow_type: 'Direct',
      useragent: faker.helpers.arrayElement(WEB_USER_AGENTS),
      proto: 'SSL',
    };

    return {
      '@timestamp': timestamp,
      message: JSON.stringify({ event: rawEvent }),
      data_stream: { namespace: 'default', type: 'logs', dataset: 'zscaler_zia.web' },
    } as IntegrationDocument;
  }

  private generateFirewallDocument(employee: Employee, _org: Organization): IntegrationDocument {
    const clientIp = faker.internet.ipv4();
    const destIp = faker.internet.ipv4();
    const action = faker.helpers.weightedArrayElement([
      { value: 'Allow', weight: 85 },
      { value: 'Drop', weight: 10 },
      { value: 'Reset', weight: 5 },
    ]);

    return {
      '@timestamp': this.getRandomTimestamp(72),
      event: {
        action,
        category: ['network'],
        type: action === 'Allow' ? ['connection', 'allowed'] : ['connection', 'denied'],
        kind: 'event',
        dataset: 'zscaler_zia.firewall',
        outcome: action === 'Allow' ? 'success' : 'failure',
      },
      zscaler_zia: {
        firewall: {
          action,
          rule: faker.helpers.arrayElement([
            'Default Allow',
            'Block Suspicious Ports',
            'Allow HTTPS',
            'Block P2P',
          ]),
          rule_label: faker.helpers.arrayElement([
            'corporate-policy',
            'security-policy',
            'default-rule',
          ]),
          client: {
            source: { ip: clientIp, port: faker.number.int({ min: 1024, max: 65535 }) },
            destination: {
              ip: destIp,
              port: faker.helpers.arrayElement([80, 443, 8080, 8443, 3389, 22]),
            },
          },
          network: {
            application: faker.helpers.arrayElement(['HTTPS', 'HTTP', 'DNS', 'SSH', 'SMTP']),
            service: faker.helpers.arrayElement(['ssl', 'http', 'dns', 'ssh', 'smtp']),
          },
          ip_protocol: faker.helpers.arrayElement(['TCP', 'UDP']),
          department: employee.department,
          login: employee.email,
          location_name: employee.city,
          duration: { milliseconds: faker.number.int({ min: 100, max: 30000 }) },
          bytes_in: faker.number.int({ min: 100, max: 100000 }),
          out_bytes: faker.number.int({ min: 100, max: 500000 }),
          session: { count: 1 },
          device: {
            hostname: `${employee.userName}-${employee.devices[0]?.platform || 'unknown'}`,
            name: employee.devices[0]?.displayName || 'Unknown',
          },
        },
      },
      source: { ip: clientIp, port: faker.number.int({ min: 1024, max: 65535 }) },
      destination: { ip: destIp, port: faker.helpers.arrayElement([80, 443, 8080]) },
      network: { transport: 'tcp', protocol: 'https' },
      user: {
        email: employee.email,
        name: employee.userName,
        domain: employee.email.split('@')[1],
      },
      related: { user: [employee.email], ip: [clientIp, destIp] },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'zscaler_zia.firewall' },
      tags: ['forwarded', 'zscaler_zia-firewall'],
    } as IntegrationDocument;
  }

  private pickUrlForDepartment(department: DepartmentName): {
    url: string;
    category: string;
    superCategory: string;
  } {
    const urls = ZSCALER_URL_CATEGORIES[department] || ZSCALER_URL_CATEGORIES['Operations'];
    return faker.helpers.arrayElement(urls);
  }

  private mapOsType(platform?: string): string {
    if (!platform) return 'Unknown';
    const map: Record<string, string> = { mac: 'macOS', windows: 'Windows', linux: 'Linux' };
    return map[platform] || 'Unknown';
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
