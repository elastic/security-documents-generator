/**
 * GCP Integration
 * Generates audit and firewall log documents for Google Cloud Platform
 * Based on the Elastic gcp integration package
 *
 * Documents use raw GCP LogEntry format in message field (JSON.stringify)
 * matching what the ingest pipeline expects: message -> event.original -> json parse.
 * Audit pipeline drops unless json.protoPayload.@type == "type.googleapis.com/google.cloud.audit.AuditLog"
 */

import {
  BaseIntegration,
  type IntegrationDocument,
  type DataStreamConfig,
  type AgentData,
} from './base_integration.ts';
import { type Organization, type Employee, type CorrelationMap, type Service } from '../types.ts';
import { CLOUD_PLATFORM_SERVICES } from '../data/services.ts';
import { faker } from '@faker-js/faker';

/**
 * GCP-specific audit method names + relative weights, keyed by the
 * `serviceName` (== `id` in the shared catalog). The catalog is the source
 * of truth for *which* GCP services exist; this map only contributes the
 * audit-log-specific behavior the catalog doesn't model.
 */
const GCP_AUDIT_METHODS: Record<string, { methods: string[]; weight: number }> = {
  'compute.googleapis.com': {
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
  'storage.googleapis.com': {
    methods: [
      'storage.buckets.list',
      'storage.buckets.get',
      'storage.objects.list',
      'storage.objects.get',
    ],
    weight: 20,
  },
  'iam.googleapis.com': {
    methods: [
      'google.iam.admin.v1.ListServiceAccounts',
      'google.iam.admin.v1.GetServiceAccount',
      'google.iam.admin.v1.ListRoles',
      'SetIamPolicy',
    ],
    weight: 15,
  },
  'cloudresourcemanager.googleapis.com': {
    methods: ['GetProject', 'ListProjects', 'GetIamPolicy', 'SetIamPolicy'],
    weight: 10,
  },
  'bigquery.googleapis.com': {
    methods: [
      'google.cloud.bigquery.v2.JobService.InsertJob',
      'google.cloud.bigquery.v2.JobService.GetQueryResults',
      'google.cloud.bigquery.v2.TableService.ListTables',
    ],
    weight: 10,
  },
  'container.googleapis.com': {
    methods: [
      'google.container.v1.ClusterManager.ListClusters',
      'google.container.v1.ClusterManager.GetCluster',
    ],
    weight: 8,
  },
  'sqladmin.googleapis.com': {
    methods: ['cloudsql.instances.list', 'cloudsql.instances.get'],
    weight: 5,
  },
  'logging.googleapis.com': {
    methods: [
      'google.logging.v2.LoggingServiceV2.ListLogEntries',
      'google.logging.v2.ConfigServiceV2.ListSinks',
    ],
    weight: 7,
  },
};

/**
 * Compose the audit-emitting GCP service list from the shared catalog,
 * decorating each entry with audit-specific methods/weight. Only catalog
 * services that have a method definition contribute audit logs.
 */
const buildGcpAuditServices = (): Array<{
  serviceName: string;
  methods: string[];
  weight: number;
}> =>
  CLOUD_PLATFORM_SERVICES.gcp
    .filter((tpl) => GCP_AUDIT_METHODS[tpl.id])
    .map((tpl) => ({
      serviceName: tpl.id,
      methods: GCP_AUDIT_METHODS[tpl.id].methods,
      weight: GCP_AUDIT_METHODS[tpl.id].weight,
    }));

const GCP_AUDIT_SERVICES = buildGcpAuditServices();

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

  /**
   * Lookup of cloud platform services by id (eventSource / serviceName).
   * Set in generateDocuments so doc factories can resolve service.entity.id.
   */
  private serviceIdToService?: Map<string, Service>;

  generateDocuments(
    org: Organization,
    correlationMap: CorrelationMap,
  ): Map<string, IntegrationDocument[]> {
    this.serviceIdToService = correlationMap.serviceIdToService;
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const centralAgent = this.buildCentralAgent(org);
    const auditDocs: IntegrationDocument[] = [];
    const firewallDocs: IntegrationDocument[] = [];

    const cloudEmployees = org.employees.filter((e) => e.hasAwsAccess);
    const gcpProjectId = `${org.name.toLowerCase().replace(/\s+/g, '-')}-prod`;

    for (const employee of cloudEmployees) {
      const auditCount = faker.number.int({ min: 2, max: 6 });
      for (let i = 0; i < auditCount; i++) {
        auditDocs.push(this.createAuditDocument(employee, org, gcpProjectId, centralAgent));
      }
    }

    const firewallCount = Math.max(5, Math.ceil(org.employees.length * 0.5));
    for (let i = 0; i < firewallCount; i++) {
      firewallDocs.push(this.createFirewallDocument(org, gcpProjectId, centralAgent));
    }

    documentsMap.set(this.dataStreams[0].index, auditDocs);
    documentsMap.set(this.dataStreams[1].index, firewallDocs);
    return documentsMap;
  }

  private createAuditDocument(
    employee: Employee,
    org: Organization,
    projectId: string,
    centralAgent: AgentData,
  ): IntegrationDocument {
    const service = faker.helpers.weightedArrayElement(
      GCP_AUDIT_SERVICES.map((s) => ({ value: s, weight: s.weight })),
    );
    const methodName = faker.helpers.arrayElement(service.methods);
    const timestamp = this.getRandomTimestamp(72);
    const receiveTimestamp = new Date(new Date(timestamp).getTime() + 1000).toISOString();
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

    // Raw GCP LogEntry format (camelCase) - pipeline parses message -> event.original -> json
    const rawGcpLogEntry = {
      insertId: faker.string.alphanumeric(12).toLowerCase(),
      logName: `projects/${projectId}/logs/cloudaudit.googleapis.com%2Factivity`,
      protoPayload: {
        '@type': 'type.googleapis.com/google.cloud.audit.AuditLog',
        serviceName: service.serviceName,
        methodName,
        resourceName,
        authenticationInfo: {
          principalEmail: employee.email,
          principalSubject: `user:${employee.email}`,
        },
        authorizationInfo: [
          {
            permission,
            granted: isGranted,
            resourceAttributes: { service: service.serviceName },
          },
        ],
        requestMetadata: {
          callerIp: sourceIp,
          callerSuppliedUserAgent: userAgent,
        },
        status: isGranted ? { code: 0 } : { code: 7, message: 'PERMISSION_DENIED' },
        resourceLocation: { currentLocations: [region] },
      },
      resource: {
        type: 'gce_instance',
        labels: { project_id: projectId },
      },
      timestamp,
      severity: 'NOTICE',
      receiveTimestamp,
    };

    const serviceEntity = this.serviceIdToService?.get(service.serviceName);
    return {
      '@timestamp': timestamp,
      agent: centralAgent,
      message: JSON.stringify(rawGcpLogEntry),
      data_stream: { namespace: 'default', type: 'logs', dataset: 'gcp.audit' },
      ...(serviceEntity && { service: { entity: { id: serviceEntity.entityId } } }),
    } as IntegrationDocument;
  }

  private createFirewallDocument(
    org: Organization,
    projectId: string,
    centralAgent: AgentData,
  ): IntegrationDocument {
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
    const subnetworkName = rule.direction === 'INGRESS' ? `${vpcName}-${region}` : vpcName;
    const receiveTimestamp = new Date(new Date(timestamp).getTime() + 2000).toISOString();

    // disposition: GCP uses "ALLOWED"/"DENIED" not "ALLOW"/"DENY"
    const disposition = rule.action === 'ALLOW' ? 'ALLOWED' : 'DENIED';

    // Raw GCP firewall LogEntry format - pipeline parses message -> event.original -> json
    const rawGcpFirewallEntry = {
      insertId: faker.string.alphanumeric(12).toLowerCase(),
      logName: `projects/${projectId}/logs/compute.googleapis.com%2Ffirewall`,
      timestamp,
      receiveTimestamp,
      resource: {
        type: 'gce_subnetwork',
        labels: {
          project_id: projectId,
          subnetwork_name: subnetworkName,
          subnetwork_id: String(faker.number.int({ min: 1e15, max: 9e15 })),
          location: zone,
        },
      },
      jsonPayload: {
        connection: {
          src_ip: sourceIp,
          src_port: sourcePort,
          dest_ip: destIp,
          dest_port: destPort,
          protocol,
        },
        disposition,
        rule_details: {
          action: rule.action,
          direction: rule.direction,
          priority: rule.priority,
          reference: `network:${vpcName}/firewall:${rule.name}`,
          source_range: rule.sourceRange ? [rule.sourceRange] : [],
          target_tag: rule.targetTag ? [rule.targetTag] : [],
          ip_port_info: [
            {
              ip_protocol: protocol === 6 ? 'TCP' : 'UDP',
              port_range: [String(destPort)],
            },
          ],
        },
        vpc: {
          project_id: projectId,
          vpc_name: vpcName,
          subnetwork_name: subnetworkName,
        },
        instance: {
          project_id: projectId,
          region,
          zone,
          vm_name: faker.string.alphanumeric(8).toLowerCase(),
        },
      },
    };

    return {
      '@timestamp': timestamp,
      agent: centralAgent,
      message: JSON.stringify(rawGcpFirewallEntry),
      data_stream: { namespace: 'default', type: 'logs', dataset: 'gcp.firewall' },
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
