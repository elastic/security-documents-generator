/**
 * GCP Integration
 * Generates audit and firewall log documents for Google Cloud Platform
 * Based on the Elastic gcp integration package
 */

import { BaseIntegration, IntegrationDocument, DataStreamConfig } from './base_integration';
import { Organization, Employee, CorrelationMap } from '../types';
import { faker } from '@faker-js/faker';

const GCP_SERVICES: Array<{
  serviceName: string;
  methods: string[];
  weight: number;
}> = [
  {
    serviceName: 'compute.googleapis.com',
    methods: [
      'beta.compute.instances.aggregatedList',
      'v1.compute.instances.list',
      'v1.compute.instances.get',
      'v1.compute.firewalls.list',
      'v1.compute.networks.list',
      'v1.compute.subnetworks.list',
    ],
    weight: 25,
  },
  {
    serviceName: 'storage.googleapis.com',
    methods: [
      'storage.buckets.list',
      'storage.buckets.get',
      'storage.objects.list',
      'storage.objects.get',
    ],
    weight: 20,
  },
  {
    serviceName: 'iam.googleapis.com',
    methods: [
      'google.iam.admin.v1.ListServiceAccounts',
      'google.iam.admin.v1.GetServiceAccount',
      'google.iam.admin.v1.ListRoles',
      'SetIamPolicy',
    ],
    weight: 15,
  },
  {
    serviceName: 'cloudresourcemanager.googleapis.com',
    methods: ['GetProject', 'ListProjects', 'GetIamPolicy', 'SetIamPolicy'],
    weight: 10,
  },
  {
    serviceName: 'bigquery.googleapis.com',
    methods: [
      'google.cloud.bigquery.v2.JobService.InsertJob',
      'google.cloud.bigquery.v2.JobService.GetQueryResults',
      'google.cloud.bigquery.v2.TableService.ListTables',
    ],
    weight: 10,
  },
  {
    serviceName: 'container.googleapis.com',
    methods: [
      'google.container.v1.ClusterManager.ListClusters',
      'google.container.v1.ClusterManager.GetCluster',
    ],
    weight: 8,
  },
  {
    serviceName: 'sqladmin.googleapis.com',
    methods: ['cloudsql.instances.list', 'cloudsql.instances.get'],
    weight: 5,
  },
  {
    serviceName: 'logging.googleapis.com',
    methods: [
      'google.logging.v2.LoggingServiceV2.ListLogEntries',
      'google.logging.v2.ConfigServiceV2.ListSinks',
    ],
    weight: 7,
  },
];

const GCP_REGIONS = [
  'us-central1',
  'us-east1',
  'us-west1',
  'europe-west1',
  'europe-west3',
  'asia-east1',
  'asia-southeast1',
];

const FIREWALL_RULES = [
  {
    name: 'allow-ssh',
    direction: 'INGRESS',
    action: 'ALLOW',
    priority: 1000,
    targetTag: 'allow-ssh',
    sourceRange: '0.0.0.0/0',
  },
  {
    name: 'allow-rdp',
    direction: 'INGRESS',
    action: 'ALLOW',
    priority: 1000,
    targetTag: 'allow-rdp',
    sourceRange: '0.0.0.0/0',
  },
  {
    name: 'allow-https',
    direction: 'INGRESS',
    action: 'ALLOW',
    priority: 1000,
    targetTag: 'https-server',
    sourceRange: '0.0.0.0/0',
  },
  {
    name: 'allow-http',
    direction: 'INGRESS',
    action: 'ALLOW',
    priority: 1000,
    targetTag: 'http-server',
    sourceRange: '0.0.0.0/0',
  },
  {
    name: 'allow-internal',
    direction: 'INGRESS',
    action: 'ALLOW',
    priority: 65534,
    targetTag: '',
    sourceRange: '10.128.0.0/9',
  },
  {
    name: 'deny-all-ingress',
    direction: 'INGRESS',
    action: 'DENY',
    priority: 65535,
    targetTag: '',
    sourceRange: '0.0.0.0/0',
  },
  {
    name: 'allow-egress',
    direction: 'EGRESS',
    action: 'ALLOW',
    priority: 65534,
    targetTag: '',
    sourceRange: '',
  },
];

export class GcpIntegration extends BaseIntegration {
  readonly packageName = 'gcp';
  readonly displayName = 'Google Cloud Platform';

  readonly dataStreams: DataStreamConfig[] = [
    { name: 'audit', index: 'logs-gcp.audit-default' },
    { name: 'firewall', index: 'logs-gcp.firewall-default' },
  ];

  generateDocuments(
    org: Organization,
    _correlationMap: CorrelationMap
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const auditDocs: IntegrationDocument[] = [];
    const firewallDocs: IntegrationDocument[] = [];

    const cloudEmployees = org.employees.filter((e) => e.hasAwsAccess);
    const gcpProjectId = `${org.name.toLowerCase().replace(/\s+/g, '-')}-prod`;

    for (const employee of cloudEmployees) {
      const auditCount = faker.number.int({ min: 2, max: 6 });
      for (let i = 0; i < auditCount; i++) {
        auditDocs.push(this.createAuditDocument(employee, org, gcpProjectId));
      }
    }

    const firewallCount = Math.max(5, Math.ceil(org.employees.length * 0.5));
    for (let i = 0; i < firewallCount; i++) {
      firewallDocs.push(this.createFirewallDocument(org, gcpProjectId));
    }

    documentsMap.set(this.dataStreams[0].index, auditDocs);
    documentsMap.set(this.dataStreams[1].index, firewallDocs);
    return documentsMap;
  }

  private createAuditDocument(
    employee: Employee,
    org: Organization,
    projectId: string
  ): IntegrationDocument {
    const service = faker.helpers.weightedArrayElement(
      GCP_SERVICES.map((s) => ({ value: s, weight: s.weight }))
    );
    const methodName = faker.helpers.arrayElement(service.methods);
    const timestamp = this.getRandomTimestamp(72);
    const sourceIp = faker.internet.ipv4();
    const region = faker.helpers.arrayElement(GCP_REGIONS);
    const isGranted = faker.helpers.weightedArrayElement([
      { value: true, weight: 92 },
      { value: false, weight: 8 },
    ]);
    const userAgent = faker.helpers.arrayElement([
      'google-cloud-sdk gcloud/450.0.1 command/gcloud.compute.instances.list',
      'google-api-go-client/0.5 Terraform/1.6.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'google-cloud-sdk gcloud/450.0.1 command/gcloud.projects.get-iam-policy',
      `grpc-go/1.59.0`,
    ]);

    const resourceName = `projects/${projectId}/${this.getResourcePath(service.serviceName)}`;
    const permission = this.getPermission(service.serviceName, methodName);

    return {
      '@timestamp': timestamp,
      event: {
        action: methodName,
        category: ['network'],
        type: ['access'],
        outcome: isGranted ? 'success' : 'failure',
        dataset: 'gcp.audit',
      },
      gcp: {
        audit: {
          authentication_info: {
            principal_email: employee.email,
          },
          authorization_info: [
            {
              permission,
              granted: isGranted,
              resource: resourceName,
              resource_attributes: {
                service: service.serviceName,
              },
            },
          ],
          method_name: methodName,
          resource_name: resourceName,
          resource_location: { current_locations: [region] },
          service_name: service.serviceName,
          request_metadata: {
            caller_ip: sourceIp,
            caller_supplied_user_agent: userAgent,
          },
          status: isGranted ? { code: 0 } : { code: 7, message: 'PERMISSION_DENIED' },
        },
      },
      cloud: {
        provider: 'gcp',
        project: { id: projectId, name: projectId },
        region,
      },
      user: {
        name: employee.userName,
        email: employee.email,
      },
      source: {
        ip: sourceIp,
      },
      user_agent: {
        original: userAgent,
      },
      related: {
        ip: [sourceIp],
        user: [employee.email],
      },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'gcp.audit' },
      tags: ['forwarded', 'gcp-audit'],
    } as IntegrationDocument;
  }

  private createFirewallDocument(org: Organization, projectId: string): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(72);
    const rule = faker.helpers.arrayElement(FIREWALL_RULES);
    const sourceIp = faker.internet.ipv4();
    const destIp = faker.internet.ipv4();
    const sourcePort = faker.number.int({ min: 1024, max: 65535 });
    const destPort = faker.helpers.arrayElement([22, 80, 443, 3389, 8080, 8443, 9200]);
    const protocol = faker.helpers.arrayElement([6, 17]); // TCP=6, UDP=17
    const region = faker.helpers.arrayElement(GCP_REGIONS);
    const zone = `${region}-${faker.helpers.arrayElement(['a', 'b', 'c'])}`;
    const vpcName = faker.helpers.arrayElement(['default', 'prod-vpc', 'dev-vpc']);

    return {
      '@timestamp': timestamp,
      event: {
        action: 'firewall-rule',
        category: ['network'],
        type: rule.action === 'ALLOW' ? ['allowed', 'connection'] : ['denied', 'connection'],
        dataset: 'gcp.firewall',
      },
      gcp: {
        destination: {
          instance: {
            project_id: projectId,
            region,
            zone,
          },
          vpc: {
            project_id: projectId,
            vpc_name: vpcName,
            subnetwork_name: `${vpcName}-${region}`,
          },
        },
        firewall: {
          rule_details: {
            action: rule.action,
            direction: rule.direction,
            priority: rule.priority,
            source_range: rule.sourceRange ? [rule.sourceRange] : [],
            target_tag: rule.targetTag ? [rule.targetTag] : [],
            reference: `network:${vpcName}/firewall:${rule.name}`,
          },
        },
        source: {
          instance: {},
          vpc: {},
        },
      },
      cloud: {
        provider: 'gcp',
        project: { id: projectId, name: projectId },
        region,
        availability_zone: zone,
      },
      source: {
        ip: sourceIp,
        port: sourcePort,
      },
      destination: {
        ip: destIp,
        port: destPort,
      },
      network: {
        direction: rule.direction === 'INGRESS' ? 'inbound' : 'outbound',
        iana_number: String(protocol),
        transport: protocol === 6 ? 'tcp' : 'udp',
      },
      rule: {
        name: `${vpcName}/${rule.name}`,
      },
      related: {
        ip: [sourceIp, destIp],
      },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'gcp.firewall' },
      tags: ['forwarded', 'gcp-firewall'],
    } as IntegrationDocument;
  }

  private getResourcePath(serviceName: string): string {
    const paths: Record<string, string> = {
      'compute.googleapis.com': `zones/${faker.helpers.arrayElement(GCP_REGIONS)}-a/instances`,
      'storage.googleapis.com': `buckets/${faker.string.alphanumeric(12).toLowerCase()}`,
      'iam.googleapis.com': 'serviceAccounts',
      'cloudresourcemanager.googleapis.com': '',
      'bigquery.googleapis.com': `datasets/${faker.string.alphanumeric(8).toLowerCase()}`,
      'container.googleapis.com': `zones/${faker.helpers.arrayElement(GCP_REGIONS)}-a/clusters`,
      'sqladmin.googleapis.com': `instances/${faker.string.alphanumeric(8).toLowerCase()}`,
      'logging.googleapis.com': 'sinks',
    };
    return paths[serviceName] || '';
  }

  private getPermission(serviceName: string, _methodName: string): string {
    const perms: Record<string, string> = {
      'compute.googleapis.com': 'compute.instances.list',
      'storage.googleapis.com': 'storage.buckets.get',
      'iam.googleapis.com': 'iam.serviceAccounts.list',
      'cloudresourcemanager.googleapis.com': 'resourcemanager.projects.get',
      'bigquery.googleapis.com': 'bigquery.jobs.create',
      'container.googleapis.com': 'container.clusters.list',
      'sqladmin.googleapis.com': 'cloudsql.instances.list',
      'logging.googleapis.com': 'logging.logEntries.list',
    };
    return perms[serviceName] || 'unknown.permission';
  }
}
