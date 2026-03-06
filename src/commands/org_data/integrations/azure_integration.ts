/**
 * Azure Integration
 * Generates log documents across all 10 substantive Azure data streams:
 * activitylogs, auditlogs, signinlogs, identity_protection, provisioning,
 * graphactivitylogs, firewall_logs, platformlogs, application_gateway, springcloudlogs
 *
 * Based on the Elastic azure integration package (packages/azure)
 */

import { BaseIntegration, IntegrationDocument, DataStreamConfig } from './base_integration';
import { Organization, Employee, Device, CorrelationMap } from '../types';
import { faker } from '@faker-js/faker';

const AZURE_RESOURCE_OPERATIONS: Array<{
  provider: string;
  operations: Array<{ name: string; resultType: string }>;
  weight: number;
}> = [
  {
    provider: 'MICROSOFT.COMPUTE/VIRTUALMACHINES',
    operations: [
      { name: 'MICROSOFT.COMPUTE/VIRTUALMACHINES/WRITE', resultType: 'Success' },
      { name: 'MICROSOFT.COMPUTE/VIRTUALMACHINES/START/ACTION', resultType: 'Success' },
      { name: 'MICROSOFT.COMPUTE/VIRTUALMACHINES/DEALLOCATE/ACTION', resultType: 'Success' },
      { name: 'MICROSOFT.COMPUTE/VIRTUALMACHINES/DELETE', resultType: 'Success' },
      { name: 'MICROSOFT.COMPUTE/VIRTUALMACHINES/RESTART/ACTION', resultType: 'Success' },
    ],
    weight: 25,
  },
  {
    provider: 'MICROSOFT.RESOURCES/DEPLOYMENTS',
    operations: [
      { name: 'MICROSOFT.RESOURCES/DEPLOYMENTS/WRITE', resultType: 'Success' },
      { name: 'MICROSOFT.RESOURCES/DEPLOYMENTS/DELETE', resultType: 'Success' },
      { name: 'MICROSOFT.RESOURCES/DEPLOYMENTS/VALIDATE/ACTION', resultType: 'Success' },
    ],
    weight: 20,
  },
  {
    provider: 'MICROSOFT.STORAGE/STORAGEACCOUNTS',
    operations: [
      { name: 'MICROSOFT.STORAGE/STORAGEACCOUNTS/WRITE', resultType: 'Success' },
      { name: 'MICROSOFT.STORAGE/STORAGEACCOUNTS/DELETE', resultType: 'Success' },
      { name: 'MICROSOFT.STORAGE/STORAGEACCOUNTS/LISTKEYS/ACTION', resultType: 'Success' },
    ],
    weight: 15,
  },
  {
    provider: 'MICROSOFT.NETWORK/NETWORKSECURITYGROUPS',
    operations: [
      {
        name: 'MICROSOFT.NETWORK/NETWORKSECURITYGROUPS/SECURITYRULES/WRITE',
        resultType: 'Success',
      },
      {
        name: 'MICROSOFT.NETWORK/NETWORKSECURITYGROUPS/SECURITYRULES/DELETE',
        resultType: 'Success',
      },
    ],
    weight: 15,
  },
  {
    provider: 'MICROSOFT.KEYVAULT/VAULTS',
    operations: [
      { name: 'MICROSOFT.KEYVAULT/VAULTS/WRITE', resultType: 'Success' },
      { name: 'MICROSOFT.KEYVAULT/VAULTS/DELETE', resultType: 'Success' },
      { name: 'MICROSOFT.KEYVAULT/VAULTS/SECRETS/WRITE', resultType: 'Success' },
    ],
    weight: 10,
  },
  {
    provider: 'MICROSOFT.SQL/SERVERS',
    operations: [
      { name: 'MICROSOFT.SQL/SERVERS/DATABASES/WRITE', resultType: 'Success' },
      { name: 'MICROSOFT.SQL/SERVERS/FIREWALLRULES/WRITE', resultType: 'Success' },
    ],
    weight: 10,
  },
  {
    provider: 'MICROSOFT.WEB/SITES',
    operations: [
      { name: 'MICROSOFT.WEB/SITES/WRITE', resultType: 'Success' },
      { name: 'MICROSOFT.WEB/SITES/DELETE', resultType: 'Success' },
      { name: 'MICROSOFT.WEB/SITES/RESTART/ACTION', resultType: 'Success' },
    ],
    weight: 5,
  },
];

const AUDIT_LOG_ACTIVITIES: Array<{
  displayName: string;
  category: string;
  operationType: string;
  targetType: string;
  loggedByService: string;
  weight: number;
}> = [
  {
    displayName: 'Update device',
    category: 'Device',
    operationType: 'Update',
    targetType: 'Device',
    loggedByService: 'Core Directory',
    weight: 15,
  },
  {
    displayName: 'Add user',
    category: 'UserManagement',
    operationType: 'Add',
    targetType: 'User',
    loggedByService: 'Core Directory',
    weight: 10,
  },
  {
    displayName: 'Update user',
    category: 'UserManagement',
    operationType: 'Update',
    targetType: 'User',
    loggedByService: 'Core Directory',
    weight: 20,
  },
  {
    displayName: 'Delete user',
    category: 'UserManagement',
    operationType: 'Delete',
    targetType: 'User',
    loggedByService: 'Core Directory',
    weight: 5,
  },
  {
    displayName: 'Add member to group',
    category: 'GroupManagement',
    operationType: 'Add',
    targetType: 'Group',
    loggedByService: 'Core Directory',
    weight: 15,
  },
  {
    displayName: 'Remove member from group',
    category: 'GroupManagement',
    operationType: 'Delete',
    targetType: 'Group',
    loggedByService: 'Core Directory',
    weight: 10,
  },
  {
    displayName: 'Add app role assignment to service principal',
    category: 'ApplicationManagement',
    operationType: 'Assign',
    targetType: 'ServicePrincipal',
    loggedByService: 'Core Directory',
    weight: 10,
  },
  {
    displayName: 'Update conditional access policy',
    category: 'Policy',
    operationType: 'Update',
    targetType: 'Policy',
    loggedByService: 'Conditional Access',
    weight: 5,
  },
  {
    displayName: 'Add service principal',
    category: 'ApplicationManagement',
    operationType: 'Add',
    targetType: 'ServicePrincipal',
    loggedByService: 'Core Directory',
    weight: 5,
  },
  {
    displayName: 'Consent to application',
    category: 'ApplicationManagement',
    operationType: 'Consent',
    targetType: 'ServicePrincipal',
    loggedByService: 'Core Directory',
    weight: 5,
  },
];

const SIGNIN_APPS = [
  { name: 'Office 365', id: faker.string.uuid() },
  { name: 'Azure Portal', id: faker.string.uuid() },
  { name: 'Microsoft Teams', id: faker.string.uuid() },
  { name: 'Outlook Mobile', id: faker.string.uuid() },
  { name: 'SharePoint Online', id: faker.string.uuid() },
  { name: 'My Apps', id: faker.string.uuid() },
  { name: 'Microsoft Edge', id: faker.string.uuid() },
];

const RISK_EVENT_TYPES = [
  'anonymizedIPAddress',
  'unfamiliarFeatures',
  'maliciousIPAddress',
  'leakedCredentials',
  'investigationsThreatIntelligence',
  'passwordSpray',
  'impossibleTravel',
  'suspiciousIPAddress',
];

const PROVISIONING_TARGET_APPS = [
  { name: 'Dropbox Business', id: faker.string.uuid() },
  { name: 'Salesforce', id: faker.string.uuid() },
  { name: 'ServiceNow', id: faker.string.uuid() },
  { name: 'Slack Enterprise', id: faker.string.uuid() },
  { name: 'AWS Single Sign-On', id: faker.string.uuid() },
  { name: 'Google Cloud Platform', id: faker.string.uuid() },
];

const GRAPH_API_ENDPOINTS = [
  { path: '/v1.0/users', method: 'GET' },
  { path: '/v1.0/groups', method: 'GET' },
  { path: '/v1.0/directoryRoles', method: 'GET' },
  { path: '/v1.0/applications', method: 'GET' },
  { path: '/v1.0/servicePrincipals', method: 'GET' },
  { path: '/beta/security/alerts', method: 'GET' },
  { path: '/v1.0/users/{id}/memberOf', method: 'GET' },
  { path: '/v1.0/organization', method: 'GET' },
  { path: '/v1.0/domains', method: 'GET' },
  { path: '/v1.0/subscribedSkus', method: 'GET' },
  { path: '/v1.0/me', method: 'GET' },
  { path: '/v1.0/users', method: 'POST' },
  { path: '/v1.0/groups/{id}/members/$ref', method: 'POST' },
  { path: '/beta/conditionalAccess/policies', method: 'GET' },
];

const FIREWALL_RULE_CATEGORIES = [
  { category: 'AzureFirewallNetworkRule', operationName: 'AzureFirewallNetworkRuleLog' },
  { category: 'AzureFirewallApplicationRule', operationName: 'AzureFirewallApplicationRuleLog' },
  { category: 'AzureFirewallDnsProxy', operationName: 'AzureFirewallDnsProxyLog' },
];

const AZURE_PLATFORM_SERVICES: Array<{
  provider: string;
  resourceName: string;
  operations: string[];
}> = [
  {
    provider: 'MICROSOFT.EVENTHUB/NAMESPACES',
    resourceName: 'EVENTHUBNAMESPACE01',
    operations: ['Retreive Namespace', 'Create or Update Namespace', 'Delete Namespace'],
  },
  {
    provider: 'MICROSOFT.SERVICEBUS/NAMESPACES',
    resourceName: 'SERVICEBUSNS01',
    operations: ['Retreive Namespace', 'Create Queue', 'Delete Queue'],
  },
  {
    provider: 'MICROSOFT.CONTAINERREGISTRY/REGISTRIES',
    resourceName: 'ACRREGISTRY01',
    operations: ['Pull Image', 'Push Image', 'Delete Image'],
  },
  {
    provider: 'MICROSOFT.CACHE/REDIS',
    resourceName: 'REDISCACHE01',
    operations: ['Create or Update Cache', 'List Keys', 'Regenerate Key'],
  },
];

const SPRING_CLOUD_APPS = ['api-gateway', 'user-service', 'order-service', 'payment-service'];

const SPRING_CLOUD_LOG_MESSAGES = [
  'Resolving eureka endpoints via configuration',
  'Fetching config from server',
  'Located environment: name=default, profiles=[default]',
  'Started application in 12.345 seconds',
  'Mapped URL path [/api/v1/**] onto handler',
  'Initializing Spring DispatcherServlet',
  'Completed initialization in 1 ms',
  'HikariPool-1 - Starting...',
  'HikariPool-1 - Start completed.',
  'Bean instantiation completed for class HealthEndpoint',
];

const AZURE_REGIONS = [
  'East US',
  'West US 2',
  'West Europe',
  'North Europe',
  'Southeast Asia',
  'East Asia',
  'Central US',
  'UK South',
  'France Central',
  'Germany West Central',
];

export class AzureIntegration extends BaseIntegration {
  readonly packageName = 'azure';
  readonly displayName = 'Azure Logs';

  readonly dataStreams: DataStreamConfig[] = [
    { name: 'Activity Logs', index: 'logs-azure.activitylogs-default' },
    { name: 'Audit Logs', index: 'logs-azure.auditlogs-default' },
    { name: 'Sign-in Logs', index: 'logs-azure.signinlogs-default' },
    { name: 'Identity Protection', index: 'logs-azure.identity_protection-default' },
    { name: 'Provisioning', index: 'logs-azure.provisioning-default' },
    { name: 'Graph Activity Logs', index: 'logs-azure.graphactivitylogs-default' },
    { name: 'Firewall Logs', index: 'logs-azure.firewall_logs-default' },
    { name: 'Platform Logs', index: 'logs-azure.platformlogs-default' },
    { name: 'Application Gateway', index: 'logs-azure.application_gateway-default' },
    { name: 'Spring Cloud Logs', index: 'logs-azure.springcloudlogs-default' },
  ];

  generateDocuments(
    org: Organization,
    _correlationMap: CorrelationMap
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const tenantId = faker.string.uuid();
    const subscriptionId = faker.string.uuid().toUpperCase();
    const resourceGroup = `${org.name.toUpperCase().replace(/\s+/g, '-')}-RG`;
    const cloudEmployees = org.employees.filter((e) => e.hasAwsAccess);

    documentsMap.set(
      'logs-azure.activitylogs-default',
      this.generateActivityLogs(cloudEmployees, org, tenantId, subscriptionId, resourceGroup)
    );
    documentsMap.set(
      'logs-azure.auditlogs-default',
      this.generateAuditLogs(org.employees, org, tenantId)
    );
    documentsMap.set(
      'logs-azure.signinlogs-default',
      this.generateSignInLogs(org.employees, tenantId)
    );
    documentsMap.set(
      'logs-azure.identity_protection-default',
      this.generateIdentityProtectionLogs(org.employees, tenantId)
    );
    documentsMap.set(
      'logs-azure.provisioning-default',
      this.generateProvisioningLogs(org.employees, org, tenantId)
    );
    documentsMap.set(
      'logs-azure.graphactivitylogs-default',
      this.generateGraphActivityLogs(tenantId)
    );
    documentsMap.set(
      'logs-azure.firewall_logs-default',
      this.generateFirewallLogs(org, subscriptionId, resourceGroup)
    );
    documentsMap.set(
      'logs-azure.platformlogs-default',
      this.generatePlatformLogs(subscriptionId, resourceGroup)
    );
    documentsMap.set(
      'logs-azure.application_gateway-default',
      this.generateApplicationGatewayLogs(subscriptionId, resourceGroup)
    );
    documentsMap.set(
      'logs-azure.springcloudlogs-default',
      this.generateSpringCloudLogs(subscriptionId)
    );

    return documentsMap;
  }

  private generateActivityLogs(
    employees: Employee[],
    _org: Organization,
    tenantId: string,
    subscriptionId: string,
    resourceGroup: string
  ): IntegrationDocument[] {
    const docs: IntegrationDocument[] = [];

    for (const employee of employees) {
      const count = faker.number.int({ min: 2, max: 5 });
      for (let i = 0; i < count; i++) {
        docs.push(this.createActivityLogDoc(employee, tenantId, subscriptionId, resourceGroup));
      }
    }

    return docs;
  }

  private createActivityLogDoc(
    employee: Employee,
    tenantId: string,
    subscriptionId: string,
    resourceGroup: string
  ): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(72);
    const resourceDef = faker.helpers.weightedArrayElement(
      AZURE_RESOURCE_OPERATIONS.map((r) => ({ value: r, weight: r.weight }))
    );
    const operation = faker.helpers.arrayElement(resourceDef.operations);
    const isSuccess = faker.helpers.weightedArrayElement([
      { value: true, weight: 92 },
      { value: false, weight: 8 },
    ]);
    const correlationId = faker.string.uuid();
    const resourceName = faker.string.alphanumeric(12).toUpperCase();

    return {
      '@timestamp': timestamp,
      azure: {
        activitylogs: {
          category: 'Administrative',
          event_category: 'Administrative',
          identity: {
            authorization: {
              action: operation.name.toLowerCase(),
              evidence: {
                principal_id: employee.entraIdUserId.replace(/-/g, ''),
                principal_type: 'User',
                role: faker.helpers.arrayElement(['Owner', 'Contributor', 'Reader']),
                role_assignment_id: faker.string.hexadecimal({ length: 32, prefix: '' }),
                role_assignment_scope: `/subscriptions/${subscriptionId}`,
                role_definition_id: faker.string.hexadecimal({ length: 32, prefix: '' }),
              },
              scope: `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/${resourceDef.provider}/${resourceName}`,
            },
            claims: {
              'http://schemas_xmlsoap_org/ws/2005/05/identity/claims/name': employee.email,
              'http://schemas_xmlsoap_org/ws/2005/05/identity/claims/givenname': employee.firstName,
              'http://schemas_xmlsoap_org/ws/2005/05/identity/claims/surname': employee.lastName,
              'http://schemas_xmlsoap_org/ws/2005/05/identity/claims/upn': employee.email,
              'http://schemas_microsoft_com/identity/claims/objectidentifier':
                employee.entraIdUserId,
              'http://schemas_microsoft_com/identity/claims/tenantid': tenantId,
              ipaddr: faker.internet.ipv4(),
            },
          },
          operation_name: operation.name,
          result_signature: isSuccess ? 'Succeeded.' : 'Failed.',
          result_type: isSuccess ? 'Success' : 'Failure',
        },
        correlation_id: correlationId,
        resource: {
          group: resourceGroup,
          id: `/SUBSCRIPTIONS/${subscriptionId}/RESOURCEGROUPS/${resourceGroup}/PROVIDERS/${resourceDef.provider}/${resourceName}`,
          name: resourceName,
          provider: resourceDef.provider,
        },
        subscription_id: subscriptionId,
      },
      cloud: { provider: 'azure' },
      data_stream: { dataset: 'azure.activitylogs', namespace: 'default', type: 'logs' },
      event: {
        action: operation.name,
        dataset: 'azure.activitylogs',
        kind: 'event',
        outcome: isSuccess ? 'success' : 'failure',
      },
      log: { level: 'Information' },
      tags: ['forwarded', 'azure-activitylogs'],
    } as IntegrationDocument;
  }

  private generateAuditLogs(
    employees: Employee[],
    _org: Organization,
    tenantId: string
  ): IntegrationDocument[] {
    const docs: IntegrationDocument[] = [];
    const auditCount = Math.max(5, Math.ceil(employees.length * 0.3));

    for (let i = 0; i < auditCount; i++) {
      const employee = faker.helpers.arrayElement(employees);
      docs.push(this.createAuditLogDoc(employee, tenantId));
    }

    return docs;
  }

  private createAuditLogDoc(employee: Employee, tenantId: string): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(72);
    const activity = faker.helpers.weightedArrayElement(
      AUDIT_LOG_ACTIVITIES.map((a) => ({ value: a, weight: a.weight }))
    );
    const correlationId = faker.string.uuid();
    const targetId = faker.string.uuid();
    const targetDisplayName =
      activity.targetType === 'User'
        ? `${employee.firstName} ${employee.lastName}`
        : activity.targetType === 'Device'
          ? `DESKTOP-${faker.string.alphanumeric(7).toUpperCase()}`
          : `${activity.category}-${faker.string.alphanumeric(6)}`;

    const isAppInitiated = faker.datatype.boolean();

    const doc: Record<string, unknown> = {
      '@timestamp': timestamp,
      'azure.auditlogs.category': 'AuditLogs',
      'azure.auditlogs.identity': isAppInitiated
        ? 'Device Registration Service'
        : `${employee.firstName} ${employee.lastName}`,
      'azure.auditlogs.operation_name': activity.displayName,
      'azure.auditlogs.operation_version': '1.0',
      'azure.auditlogs.properties.activity_datetime': timestamp,
      'azure.auditlogs.properties.activity_display_name': activity.displayName,
      'azure.auditlogs.properties.category': activity.category,
      'azure.auditlogs.properties.correlation_id': correlationId,
      'azure.auditlogs.properties.id': `Directory_${faker.string.alphanumeric(3).toUpperCase()}`,
      'azure.auditlogs.properties.logged_by_service': activity.loggedByService,
      'azure.auditlogs.properties.operation_type': activity.operationType,
      'azure.auditlogs.properties.result_reason': '',
      'azure.auditlogs.properties.target_resources.0.display_name': targetDisplayName,
      'azure.auditlogs.properties.target_resources.0.id': targetId,
      'azure.auditlogs.properties.target_resources.0.type': activity.targetType,
      'azure.auditlogs.result_signature': 'None',
      'azure.correlation_id': correlationId,
      'azure.resource.id': `/tenants/${tenantId}/providers/Microsoft.aadiam`,
      'azure.resource.provider': 'Microsoft.aadiam',
      'azure.tenant_id': tenantId,
      cloud: { provider: 'azure' },
      data_stream: { dataset: 'azure.auditlogs', namespace: 'default', type: 'logs' },
      event: {
        action: activity.displayName,
        dataset: 'azure.auditlogs',
        kind: 'event',
        outcome: 'success',
      },
      log: { level: 'Information' },
      tags: ['forwarded', 'azure-auditlogs'],
    };

    if (isAppInitiated) {
      doc['azure.auditlogs.properties.initiated_by.app.displayName'] =
        'Device Registration Service';
      doc['azure.auditlogs.properties.initiated_by.app.servicePrincipalId'] = faker.string.uuid();
    } else {
      doc['azure.auditlogs.properties.initiated_by.user.displayName'] =
        `${employee.firstName} ${employee.lastName}`;
      doc['azure.auditlogs.properties.initiated_by.user.userPrincipalName'] = employee.email;
      doc['azure.auditlogs.properties.initiated_by.user.id'] = employee.entraIdUserId;
    }

    return doc as IntegrationDocument;
  }

  private generateSignInLogs(employees: Employee[], tenantId: string): IntegrationDocument[] {
    const docs: IntegrationDocument[] = [];

    for (const employee of employees) {
      const count = faker.number.int({ min: 2, max: 5 });
      for (let i = 0; i < count; i++) {
        docs.push(this.createSignInLogDoc(employee, tenantId));
      }
    }

    return docs;
  }

  private createSignInLogDoc(employee: Employee, tenantId: string): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(72);
    const app = faker.helpers.arrayElement(SIGNIN_APPS);
    const correlationId = faker.string.uuid();
    const clientIp = faker.internet.ipv4();
    const isInteractive = faker.helpers.weightedArrayElement([
      { value: true, weight: 70 },
      { value: false, weight: 30 },
    ]);
    const isSuccess = faker.helpers.weightedArrayElement([
      { value: true, weight: 88 },
      { value: false, weight: 12 },
    ]);
    const errorCode = isSuccess
      ? 0
      : faker.helpers.arrayElement([50126, 50140, 50053, 50057, 50076, 53003, 530032]);
    const browser = faker.helpers.arrayElement([
      'Chrome 120.0.0',
      'Edge 120.0.2210',
      'Firefox 121.0',
      'Safari 17.2',
    ]);
    const os = faker.helpers.arrayElement([
      'Windows 10',
      'Windows 11',
      'MacOs',
      'iOS 17',
      'Android 14',
    ]);
    const clientApp = faker.helpers.arrayElement([
      'Browser',
      'Mobile Apps and Desktop clients',
      'Exchange ActiveSync',
    ]);

    const riskLevel = isSuccess
      ? 'none'
      : faker.helpers.weightedArrayElement([
          { value: 'none', weight: 60 },
          { value: 'low', weight: 20 },
          { value: 'medium', weight: 15 },
          { value: 'high', weight: 5 },
        ]);

    const displayName = `${employee.firstName} ${employee.lastName}`;

    return {
      '@timestamp': timestamp,
      azure: {
        correlation_id: correlationId,
        resource: {
          id: `/tenants/${tenantId}/providers/Microsoft.aadiam`,
          provider: 'Microsoft.aadiam',
        },
        signinlogs: {
          caller_ip_address: clientIp,
          category: 'SignInLogs',
          identity: displayName,
          operation_name: 'Sign-in activity',
          operation_version: '1.0',
          properties: {
            app_display_name: app.name,
            app_id: app.id,
            client_app_used: clientApp,
            conditional_access_status: faker.helpers.arrayElement([
              'notApplied',
              'success',
              'failure',
            ]),
            correlation_id: correlationId,
            created_at: timestamp,
            device_detail: { browser, operating_system: os },
            id: correlationId,
            is_interactive: isInteractive,
            original_request_id: correlationId,
            processing_time_ms: faker.number.int({ min: 50, max: 500 }),
            risk_detail: riskLevel === 'none' ? 'none' : 'aiConfirmedSigninSafe',
            risk_level_aggregated: riskLevel,
            risk_level_during_signin: riskLevel,
            risk_state: riskLevel === 'none' ? 'none' : 'atRisk',
            status: { error_code: errorCode },
            token_issuer_type: 'AzureAD',
            user_display_name: displayName,
            user_id: employee.entraIdUserId,
            user_principal_name: employee.email,
          },
          result_description: isSuccess ? '' : 'Invalid username or password.',
          result_signature: 'None',
          result_type: String(errorCode),
        },
        tenant_id: tenantId,
      },
      client: { ip: clientIp },
      cloud: { provider: 'azure' },
      event: {
        action: 'Sign-in activity',
        category: ['authentication'],
        kind: 'event',
        outcome: isSuccess ? 'success' : 'failure',
        type: ['info'],
      },
      geo: {
        city_name: employee.city,
        country_iso_code: employee.countryCode,
      },
      log: { level: '4' },
      related: {
        ip: [clientIp],
        user: [employee.entraIdUserId, employee.email, displayName],
      },
      source: { address: clientIp, ip: clientIp },
      user: {
        email: employee.email,
        full_name: displayName,
        id: employee.entraIdUserId,
        name: employee.email,
      },
      data_stream: { dataset: 'azure.signinlogs', namespace: 'default', type: 'logs' },
      tags: ['forwarded', 'azure-signinlogs', 'preserve_original_event'],
    } as IntegrationDocument;
  }

  private generateIdentityProtectionLogs(
    employees: Employee[],
    tenantId: string
  ): IntegrationDocument[] {
    const docs: IntegrationDocument[] = [];
    const riskyCount = Math.max(2, Math.ceil(employees.length * 0.1));
    const riskyEmployees = faker.helpers.arrayElements(employees, riskyCount);

    for (const employee of riskyEmployees) {
      docs.push(this.createIdentityProtectionDoc(employee, tenantId));
    }

    return docs;
  }

  private createIdentityProtectionDoc(employee: Employee, tenantId: string): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(72);
    const riskEventType = faker.helpers.arrayElement(RISK_EVENT_TYPES);
    const riskLevel = faker.helpers.weightedArrayElement([
      { value: 'low', weight: 40 },
      { value: 'medium', weight: 35 },
      { value: 'high', weight: 25 },
    ]);
    const correlationId = faker.string.hexadecimal({ length: 64, prefix: '' });
    const detectionId = faker.string.hexadecimal({ length: 64, prefix: '' });
    const sourceIp = faker.internet.ipv4();
    const displayName = `${employee.firstName} ${employee.lastName}`;

    return {
      '@timestamp': timestamp,
      azure: {
        correlation_id: correlationId,
        identityprotection: {
          category: 'UserRiskEvents',
          operation_name: 'User Risk Detection',
          operation_version: '1.0',
          properties: {
            activity: 'signin',
            activity_datetime: timestamp,
            additional_info: [
              {
                Key: 'userAgent',
                Value: faker.internet.userAgent(),
              },
            ],
            correlation_id: faker.string.uuid(),
            detected_datetime: timestamp,
            detection_timing_type: faker.helpers.arrayElement(['realtime', 'offline']),
            id: detectionId,
            ip_address: sourceIp,
            last_updated_datetime: timestamp,
            location: {
              city: faker.location.city(),
              countryOrRegion: faker.location.countryCode(),
              geoCoordinates: {
                latitude: faker.location.latitude(),
                longitude: faker.location.longitude(),
              },
              state: faker.location.state(),
            },
            request_id: faker.string.uuid(),
            risk_detail: 'none',
            risk_event_type: riskEventType,
            risk_level: riskLevel,
            risk_state: 'atRisk',
            risk_type: riskEventType,
            source: 'IdentityProtection',
            token_issuer_type: 'AzureAD',
            user_display_name: displayName,
            user_id: employee.entraIdUserId,
            user_principal_name: employee.email,
            user_type: 'member',
          },
          result_signature: 'None',
        },
        resource: {
          id: `/tenants/${tenantId}/providers/microsoft.aadiam`,
          provider: 'microsoft.aadiam',
        },
        tenant_id: tenantId,
      },
      cloud: { provider: 'azure' },
      event: {
        action: 'User Risk Detection',
        kind: 'event',
      },
      source: { ip: sourceIp },
      related: {
        user: [employee.entraIdUserId, employee.email, displayName],
      },
      user: {
        email: employee.email,
        full_name: displayName,
        id: employee.entraIdUserId,
        name: employee.email,
      },
      data_stream: {
        dataset: 'azure.identity_protection',
        namespace: 'default',
        type: 'logs',
      },
      tags: ['forwarded', 'azure-identity-protection'],
    } as IntegrationDocument;
  }

  private generateProvisioningLogs(
    employees: Employee[],
    org: Organization,
    tenantId: string
  ): IntegrationDocument[] {
    const docs: IntegrationDocument[] = [];
    const provisionCount = Math.max(3, Math.ceil(employees.length * 0.15));
    const selectedEmployees = faker.helpers.arrayElements(employees, provisionCount);

    for (const employee of selectedEmployees) {
      docs.push(this.createProvisioningDoc(employee, org, tenantId));
    }

    return docs;
  }

  private createProvisioningDoc(
    employee: Employee,
    _org: Organization,
    tenantId: string
  ): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(72);
    const targetApp = faker.helpers.arrayElement(PROVISIONING_TARGET_APPS);
    const action = faker.helpers.weightedArrayElement([
      { value: 'Create', weight: 40 },
      { value: 'Update', weight: 40 },
      { value: 'Delete', weight: 10 },
      { value: 'Other', weight: 10 },
    ]);
    const status = faker.helpers.weightedArrayElement([
      { value: 'success', weight: 75 },
      { value: 'skipped', weight: 15 },
      { value: 'failure', weight: 10 },
    ]);
    const correlationId = faker.string.uuid();
    const durationMs = faker.number.int({ min: 200, max: 5000 });

    return {
      '@timestamp': timestamp,
      azure: {
        correlation_id: correlationId,
        provisioning: {
          category: 'ProvisioningLogs',
          identity: faker.string.uuid(),
          level: 4,
          operation_name: 'Provisioning activity',
          operation_version: '1.0',
          properties: {
            action,
            activity_datetime: timestamp,
            change_id: correlationId,
            cycle_id: faker.string.uuid(),
            duration_ms: durationMs,
            id: faker.string.uuid(),
            initiated_by: {
              id: '',
              name: 'Azure AD Provisioning Service',
              type: 'system',
            },
            job_id: `${targetApp.name.replace(/\s+/g, '')}SCIMOutDelta.${tenantId.replace(/-/g, '')}.${faker.string.uuid()}`,
            provisioning_action: action.toLowerCase(),
            provisioning_status_info: { status },
            provisioning_steps: [
              {
                description: `Received User '${employee.email}' change of type (${action}) from Azure Active Directory`,
                name: `EntryImport${action}`,
                provisioning_step_type: 0,
                status: 0,
              },
              {
                description: 'Determine if User in scope by evaluating against each scoping filter',
                name: 'EntrySynchronizationScoping',
                provisioning_step_type: 1,
                status: 0,
              },
            ],
            service_principal: { id: targetApp.id, name: targetApp.name },
            source_identity: {
              details: {
                display_name: `${employee.firstName} ${employee.lastName}`,
                id: employee.entraIdUserId,
                odatatype: 'User',
                user_principal_name: employee.email,
              },
              id: employee.entraIdUserId,
              identity_type: 'User',
              name: employee.firstName,
            },
            source_system: {
              details: {},
              id: faker.string.uuid(),
              name: 'Azure Active Directory',
            },
            target_identity: {
              details: {},
              id: status === 'success' ? faker.string.uuid() : '',
              identity_type: 'urn:ietf:params:scim:schemas:core:2.0:User',
              name: status === 'success' ? employee.email : '',
            },
            target_system: {
              details: {
                application_id: faker.string.uuid(),
                service_principal_id: targetApp.id,
              },
              id: faker.string.uuid(),
              name: targetApp.name,
            },
            tenant_id: tenantId,
          },
          result_type:
            status === 'success' ? 'Success' : status === 'skipped' ? 'Skipped' : 'Failure',
        },
        resource: {
          id: `/tenants/${tenantId}/providers/Microsoft.aadiam`,
          provider: 'Microsoft.aadiam',
        },
        tenant_id: tenantId,
      },
      cloud: { provider: 'azure' },
      event: {
        action: 'Provisioning activity',
        duration: durationMs * 1_000_000,
        kind: 'event',
      },
      data_stream: { dataset: 'azure.provisioning', namespace: 'default', type: 'logs' },
      tags: ['forwarded', 'azure-provisioning'],
    } as IntegrationDocument;
  }

  private generateGraphActivityLogs(tenantId: string): IntegrationDocument[] {
    const docs: IntegrationDocument[] = [];
    const count = faker.number.int({ min: 5, max: 15 });

    for (let i = 0; i < count; i++) {
      docs.push(this.createGraphActivityLogDoc(tenantId));
    }

    return docs;
  }

  private createGraphActivityLogDoc(tenantId: string): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(72);
    const endpoint = faker.helpers.arrayElement(GRAPH_API_ENDPOINTS);
    const correlationId = faker.string.uuid();
    const statusCode = faker.helpers.weightedArrayElement([
      { value: 200, weight: 85 },
      { value: 201, weight: 5 },
      { value: 403, weight: 5 },
      { value: 404, weight: 3 },
      { value: 429, weight: 2 },
    ]);
    const clientIp = faker.internet.ipv4();
    const region = faker.helpers.arrayElement(AZURE_REGIONS);
    const servicePrincipalId = faker.string.uuid();
    const appId = faker.string.uuid();

    return {
      '@timestamp': timestamp,
      azure: {
        correlation_id: correlationId,
        graphactivitylogs: {
          category: 'MicrosoftGraphActivityLogs',
          operation_name: 'Microsoft Graph Activity',
          operation_version: 'v1.0',
          properties: {
            api_version: endpoint.path.startsWith('/beta') ? 'beta' : 'v1.0',
            app_id: appId,
            client_auth_method: 2,
            client_request_id: faker.string.uuid(),
            identity_provider: `https://sts.windows.net/${tenantId}/`,
            operation_id: correlationId,
            roles: faker.helpers.arrayElements(
              [
                'Application.Read.All',
                'User.Read.All',
                'GroupMember.Read.All',
                'Directory.Read.All',
                'Organization.Read.All',
                'RoleManagement.Read.Directory',
              ],
              { min: 2, max: 5 }
            ),
            service_principal_id: servicePrincipalId,
            sign_in_activity_id: faker.string.uuid(),
            time_generated: timestamp,
            token_issued_at: new Date(new Date(timestamp).getTime() - 5 * 60 * 1000).toISOString(),
            wids: [faker.string.uuid()],
          },
          result_signature: String(statusCode),
        },
        resource: {
          id: `/TENANTS/${tenantId.toUpperCase()}/PROVIDERS/MICROSOFT.AADIAM`,
          provider: 'MICROSOFT.AADIAM',
        },
        tenant_id: tenantId,
      },
      client: { ip: clientIp },
      cloud: {
        account: { id: tenantId },
        provider: 'azure',
        region,
        service: { name: 'Microsoft Graph' },
      },
      destination: { geo: { region_name: region } },
      event: {
        action: 'Microsoft Graph Activity',
        kind: 'event',
        type: ['access'],
      },
      http: {
        request: { id: correlationId, method: endpoint.method },
        response: {
          bytes: faker.number.int({ min: 200, max: 50000 }),
          status_code: statusCode,
        },
      },
      log: { level: '4' },
      related: { ip: [clientIp] },
      source: { ip: clientIp },
      url: {
        domain: 'graph.microsoft.com',
        original: `https://graph.microsoft.com${endpoint.path}`,
        path: endpoint.path,
        scheme: 'https',
      },
      data_stream: {
        dataset: 'azure.graphactivitylogs',
        namespace: 'default',
        type: 'logs',
      },
      tags: ['forwarded', 'azure-graphactivitylogs', 'preserve_original_event'],
    } as IntegrationDocument;
  }

  private generateFirewallLogs(
    org: Organization,
    subscriptionId: string,
    resourceGroup: string
  ): IntegrationDocument[] {
    const docs: IntegrationDocument[] = [];
    const count = Math.max(5, Math.ceil(org.employees.length * 0.5));
    const firewallName = `${org.name.replace(/\s+/g, '-').toUpperCase()}-FW01`;

    for (let i = 0; i < count; i++) {
      const device = this.pickRandomDevice(org);
      docs.push(this.createFirewallLogDoc(subscriptionId, resourceGroup, firewallName, device));
    }

    return docs;
  }

  private createFirewallLogDoc(
    subscriptionId: string,
    resourceGroup: string,
    firewallName: string,
    device: Device | null
  ): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(72);
    const ruleCategory = faker.helpers.arrayElement(FIREWALL_RULE_CATEGORIES);
    const action = faker.helpers.weightedArrayElement([
      { value: 'Allow', weight: 80 },
      { value: 'Deny', weight: 20 },
    ]);
    const sourceIp = device?.ipAddress ?? faker.internet.ipv4();
    const destIp = faker.internet.ipv4();
    const transport = faker.helpers.arrayElement(['tcp', 'udp', 'icmp']);
    const destPort =
      transport === 'icmp'
        ? undefined
        : faker.helpers.arrayElement([22, 80, 443, 3389, 8080, 8443, 9200, 5601]);

    return {
      '@timestamp': timestamp,
      azure: {
        firewall: {
          action,
          category: ruleCategory.category,
          operation_name: ruleCategory.operationName,
          ...(transport === 'icmp' ? { icmp: { request: { code: '8' } } } : {}),
        },
        resource: {
          group: resourceGroup,
          id: `/SUBSCRIPTIONS/${subscriptionId}/RESOURCEGROUPS/${resourceGroup}/PROVIDERS/MICROSOFT.NETWORK/AZUREFIREWALLS/${firewallName}`,
          name: firewallName,
          provider: 'MICROSOFT.NETWORK/AZUREFIREWALLS',
        },
        subscription_id: subscriptionId,
      },
      cloud: {
        account: { id: subscriptionId },
        provider: 'azure',
      },
      destination: {
        address: destIp,
        ip: destIp,
        ...(destPort !== undefined ? { port: destPort } : {}),
      },
      event: {
        category: ['network'],
        kind: 'event',
        type: action === 'Allow' ? ['connection', 'allowed'] : ['connection', 'denied'],
      },
      network: { transport },
      observer: {
        name: firewallName,
        product: 'Network Firewall',
        type: 'firewall',
        vendor: 'Azure',
      },
      related: { ip: [sourceIp, destIp] },
      source: { address: sourceIp, ip: sourceIp },
      data_stream: { dataset: 'azure.firewall_logs', namespace: 'default', type: 'logs' },
      tags: ['forwarded', 'azure-firewall-logs', 'preserve_original_event'],
    } as IntegrationDocument;
  }

  private generatePlatformLogs(
    subscriptionId: string,
    resourceGroup: string
  ): IntegrationDocument[] {
    const docs: IntegrationDocument[] = [];
    const count = faker.number.int({ min: 5, max: 12 });

    for (let i = 0; i < count; i++) {
      docs.push(this.createPlatformLogDoc(subscriptionId, resourceGroup));
    }

    return docs;
  }

  private createPlatformLogDoc(subscriptionId: string, resourceGroup: string): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(72);
    const service = faker.helpers.arrayElement(AZURE_PLATFORM_SERVICES);
    const operation = faker.helpers.arrayElement(service.operations);
    const region = faker.helpers.arrayElement(AZURE_REGIONS);
    const activityId = faker.string.uuid();

    return {
      '@timestamp': timestamp,
      azure: {
        platformlogs: {
          ActivityId: activityId,
          Caller: faker.helpers.arrayElement(['Portal', 'ARM', 'ServiceFabric', 'Scheduler']),
          Environment: 'PROD',
          EventTimeString: new Date(timestamp).toUTCString(),
          ScaleUnit: `PROD-${faker.helpers.arrayElement(['AM3', 'CY4', 'DB3', 'HK1'])}-AZ${faker.number.int({ min: 100, max: 999 })}`,
          category: 'OperationalLogs',
          event_category: 'Administrative',
          properties: {
            Namespace: service.resourceName.toLowerCase(),
            SubscriptionId: subscriptionId,
            TrackingId: `${activityId}_${faker.string.alphanumeric(4).toUpperCase()}`,
          },
        },
        resource: {
          group: resourceGroup,
          id: `/SUBSCRIPTIONS/${subscriptionId}/RESOURCEGROUPS/${resourceGroup}/PROVIDERS/${service.provider}/${service.resourceName}`,
          name: service.resourceName,
          provider: service.provider,
        },
        subscription_id: subscriptionId,
      },
      cloud: { provider: 'azure', region },
      data_stream: { dataset: 'azure.platformlogs', namespace: 'default', type: 'logs' },
      event: {
        action: operation,
        dataset: 'azure.platformlogs',
        kind: 'event',
        outcome: 'success',
      },
      tags: ['forwarded', 'azure-platformlogs'],
    } as IntegrationDocument;
  }

  private generateApplicationGatewayLogs(
    subscriptionId: string,
    resourceGroup: string
  ): IntegrationDocument[] {
    const docs: IntegrationDocument[] = [];
    const count = faker.number.int({ min: 5, max: 15 });
    const gatewayName = 'Application-Gateway-01';

    for (let i = 0; i < count; i++) {
      docs.push(this.createApplicationGatewayLogDoc(subscriptionId, resourceGroup, gatewayName));
    }

    return docs;
  }

  private createApplicationGatewayLogDoc(
    subscriptionId: string,
    resourceGroup: string,
    gatewayName: string
  ): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(72);
    const sourceIp = faker.internet.ipv4();
    const sourcePort = faker.number.int({ min: 1024, max: 65535 });
    const host = faker.helpers.arrayElement([
      'api.contoso.com',
      'app.contoso.com',
      'www.contoso.com',
      'portal.contoso.com',
    ]);
    const httpMethod = faker.helpers.arrayElement(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']);
    const statusCode = faker.helpers.weightedArrayElement([
      { value: 200, weight: 60 },
      { value: 201, weight: 5 },
      { value: 301, weight: 5 },
      { value: 400, weight: 5 },
      { value: 403, weight: 5 },
      { value: 404, weight: 10 },
      { value: 500, weight: 5 },
      { value: 502, weight: 5 },
    ]);
    const path = faker.helpers.arrayElement([
      '/api/v1/users',
      '/api/v1/orders',
      '/api/v2/health',
      '/login',
      '/static/main.js',
      '/phpmyadmin/scripts/setup.php',
      '/.env',
    ]);
    const receivedBytes = faker.number.int({ min: 50, max: 5000 });
    const sentBytes = faker.number.int({ min: 100, max: 50000 });

    return {
      '@timestamp': timestamp,
      azure: {
        application_gateway: {
          instance_id: `ApplicationGatewayRole_IN_${faker.number.int({ min: 0, max: 3 })}`,
          operation_name: 'ApplicationGatewayAccess',
        },
        resource: {
          group: resourceGroup,
          id: `/SUBSCRIPTIONS/${subscriptionId}/RESOURCEGROUPS/${resourceGroup}/PROVIDERS/MICROSOFT.NETWORK/APPLICATIONGATEWAYS/${gatewayName}`,
          name: gatewayName,
          provider: 'MICROSOFT.NETWORK/APPLICATIONGATEWAYS',
        },
        subscription_id: subscriptionId,
      },
      cloud: {
        account: { id: subscriptionId },
        provider: 'azure',
      },
      destination: {
        address: host,
        bytes: sentBytes,
        domain: host,
      },
      event: {
        category: ['network'],
        kind: 'event',
        type: ['connection'],
      },
      http: {
        request: { method: httpMethod },
        response: { status_code: statusCode },
        version: '1.1',
      },
      network: {
        bytes: receivedBytes + sentBytes,
        protocol: 'http',
      },
      observer: {
        name: gatewayName,
        product: 'Web Application Firewall',
        type: 'firewall',
        vendor: 'Azure',
      },
      related: {
        hosts: [host],
        ip: [sourceIp],
      },
      source: {
        address: sourceIp,
        bytes: receivedBytes,
        ip: sourceIp,
        port: sourcePort,
      },
      url: {
        domain: host,
        path,
      },
      data_stream: {
        dataset: 'azure.application_gateway',
        namespace: 'default',
        type: 'logs',
      },
      tags: ['forwarded', 'azure-application-gateway', 'preserve_original_event'],
    } as IntegrationDocument;
  }

  private generateSpringCloudLogs(subscriptionId: string): IntegrationDocument[] {
    const docs: IntegrationDocument[] = [];
    const count = faker.number.int({ min: 5, max: 12 });
    const serviceName = 'springcloud01';
    const resourceGroup = 'SPRINGAPPS-RG';

    for (let i = 0; i < count; i++) {
      docs.push(this.createSpringCloudLogDoc(subscriptionId, resourceGroup, serviceName));
    }

    return docs;
  }

  private createSpringCloudLogDoc(
    subscriptionId: string,
    resourceGroup: string,
    serviceName: string
  ): IntegrationDocument {
    const timestamp = this.getRandomTimestamp(72);
    const appName = faker.helpers.arrayElement(SPRING_CLOUD_APPS);
    const instanceName = `${appName}-default-${faker.number.int({ min: 1, max: 8 })}-${faker.string.alphanumeric(10).toLowerCase()}`;
    const message = faker.helpers.arrayElement(SPRING_CLOUD_LOG_MESSAGES);
    const logLevel = faker.helpers.weightedArrayElement([
      { value: 'Informational', weight: 80 },
      { value: 'Warning', weight: 15 },
      { value: 'Error', weight: 5 },
    ]);

    return {
      '@timestamp': timestamp,
      azure: {
        resource: {
          group: resourceGroup,
          id: `/SUBSCRIPTIONS/${subscriptionId}/RESOURCEGROUPS/${resourceGroup}/PROVIDERS/MICROSOFT.APPPLATFORM/SPRING/${serviceName.toUpperCase()}`,
          name: serviceName.toUpperCase(),
          provider: 'MICROSOFT.APPPLATFORM/SPRING',
        },
        springcloudlogs: {
          category: 'ApplicationConsole',
          event_category: 'Administrative',
          log_format: 'RAW',
          logtag: 'F',
          operation_name: 'Microsoft.AppPlatform/Spring/logs',
          properties: {
            app_name: appName,
            instance_name: instanceName,
            service_id: faker.string.hexadecimal({ length: 32, prefix: '' }),
            service_name: serviceName,
            stream: 'stdout',
          },
        },
        subscription_id: subscriptionId,
      },
      cloud: { provider: 'azure' },
      data_stream: {
        dataset: 'azure.springcloudlogs',
        namespace: 'default',
        type: 'logs',
      },
      event: {
        action: 'Microsoft.AppPlatform/Spring/logs',
        dataset: 'azure.springcloudlogs',
        kind: 'event',
      },
      log: { level: logLevel },
      message: `${timestamp.replace('T', ' ').replace('Z', '')}  ${logLevel === 'Error' ? 'ERROR' : logLevel === 'Warning' ? 'WARN' : 'INFO'} [${appName},,,] 1 --- [main] ${faker.string.alpha(1).toLowerCase()}.${faker.string.alpha(1).toLowerCase()}.${faker.string.alpha(1).toLowerCase()}.${faker.string.alpha({ length: { min: 5, max: 15 } })}      : ${message}`,
      tags: ['forwarded', 'azure-springcloudlogs'],
    } as IntegrationDocument;
  }

  private pickRandomDevice(org: Organization): Device | null {
    const allDevices: Device[] = [];
    for (const emp of org.employees) {
      for (const d of emp.devices) {
        if (d.type === 'laptop') allDevices.push(d);
      }
    }
    return allDevices.length > 0 ? faker.helpers.arrayElement(allDevices) : null;
  }
}
