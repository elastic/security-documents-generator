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
    const callerIp = faker.internet.ipv4();
    const resourceId = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/${resourceDef.provider}/${resourceName}`;

    const rawAzureJson = {
      time: timestamp,
      callerIpAddress: callerIp,
      operationName: operation.name,
      resultType: isSuccess ? 'Success' : 'Failure',
      resultSignature: isSuccess ? 'Succeeded.' : 'Failed.',
      identity: {
        authorization: {
          action: operation.name.toLowerCase(),
          evidence: {
            principalId: employee.entraIdUserId.replace(/-/g, ''),
            principalType: 'User',
            role: faker.helpers.arrayElement(['Owner', 'Contributor', 'Reader']),
            roleAssignmentId: faker.string.hexadecimal({ length: 32, prefix: '' }),
            roleAssignmentScope: `/subscriptions/${subscriptionId}`,
            roleDefinitionId: faker.string.hexadecimal({ length: 32, prefix: '' }),
          },
          scope: resourceId,
        },
        claims: {
          'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name': employee.email,
          'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname': employee.firstName,
          'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname': employee.lastName,
          'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn': employee.email,
          'http://schemas.microsoft.com/identity/claims/objectidentifier': employee.entraIdUserId,
          'http://schemas.microsoft.com/identity/claims/tenantid': tenantId,
          ipaddr: callerIp,
        },
      },
      resourceId,
      category: 'Administrative',
      level: 'Information',
      correlationId,
    };

    return {
      '@timestamp': timestamp,
      message: JSON.stringify(rawAzureJson),
      data_stream: { dataset: 'azure.activitylogs', namespace: 'default', type: 'logs' },
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

    const rawAzureJson = {
      time: timestamp,
      category: 'AuditLogs',
      operationName: activity.displayName,
      operationVersion: '1.0',
      resultSignature: 'None',
      resourceId: `/tenants/${tenantId}/providers/Microsoft.aadiam`,
      correlationId,
      tenantId,
      properties: {
        activityDateTime: timestamp,
        activityDisplayName: activity.displayName,
        category: activity.category,
        correlationId,
        id: `Directory_${faker.string.alphanumeric(3).toUpperCase()}`,
        loggedByService: activity.loggedByService,
        operationType: activity.operationType,
        resultReason: '',
        targetResources: [
          {
            displayName: targetDisplayName,
            id: targetId,
            type: activity.targetType,
          },
        ],
        initiatedBy: isAppInitiated
          ? {
              app: {
                displayName: 'Device Registration Service',
                servicePrincipalId: faker.string.uuid(),
              },
            }
          : {
              user: {
                displayName: `${employee.firstName} ${employee.lastName}`,
                userPrincipalName: employee.email,
                id: employee.entraIdUserId,
              },
            },
      },
    };

    return {
      '@timestamp': timestamp,
      message: JSON.stringify(rawAzureJson),
      data_stream: { dataset: 'azure.auditlogs', namespace: 'default', type: 'logs' },
    } as IntegrationDocument;
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

    const rawAzureJson = {
      Level: '4',
      time: timestamp,
      callerIpAddress: clientIp,
      category: 'SignInLogs',
      correlationId,
      durationMs: 0,
      identity: displayName,
      location: employee.countryCode,
      operationName: 'Sign-in activity',
      operationVersion: '1.0',
      resourceId: `/tenants/${tenantId}/providers/Microsoft.aadiam`,
      resultDescription: isSuccess ? '' : 'Invalid username or password.',
      resultSignature: 'None',
      resultType: String(errorCode),
      tenantId,
      properties: {
        appDisplayName: app.name,
        appId: app.id,
        clientAppUsed: clientApp,
        conditionalAccessStatus: faker.helpers.arrayElement([
          'notApplied',
          'success',
          'failure',
        ]),
        correlationId,
        createdDateTime: timestamp,
        deviceDetail: { browser, deviceId: '', operatingSystem: os },
        id: correlationId,
        ipAddress: clientIp,
        isInteractive: isInteractive,
        originalRequestId: correlationId,
        processingTimeInMilliseconds: faker.number.int({ min: 50, max: 500 }),
        riskDetail: riskLevel === 'none' ? 'none' : 'aiConfirmedSigninSafe',
        riskLevelAggregated: riskLevel,
        riskLevelDuringSignIn: riskLevel,
        riskState: riskLevel === 'none' ? 'none' : 'atRisk',
        status: { errorCode },
        tokenIssuerType: 'AzureAD',
        userDisplayName: displayName,
        userId: employee.entraIdUserId,
        userPrincipalName: employee.email,
      },
    };

    return {
      '@timestamp': timestamp,
      message: JSON.stringify(rawAzureJson),
      data_stream: { dataset: 'azure.signinlogs', namespace: 'default', type: 'logs' },
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

    const rawAzureJson = {
      time: timestamp,
      resourceId: `/tenants/${tenantId}/providers/microsoft.aadiam`,
      operationName: 'User Risk Detection',
      operationVersion: '1.0',
      category: 'UserRiskEvents',
      tenantId,
      resultSignature: 'None',
      durationMs: 0,
      callerIpAddress: sourceIp,
      correlationId,
      identity: displayName.toLowerCase(),
      Level: 4,
      location: employee.countryCode?.toLowerCase() ?? 'us',
      properties: {
        id: detectionId,
        requestId: faker.string.uuid(),
        correlationId: faker.string.uuid(),
        riskType: riskEventType,
        riskEventType: riskEventType,
        riskState: 'atRisk',
        riskLevel: riskLevel,
        riskDetail: 'none',
        source: 'IdentityProtection',
        detectionTimingType: faker.helpers.arrayElement(['realtime', 'offline']),
        activity: 'signin',
        ipAddress: sourceIp,
        location: {
          city: faker.location.city(),
          state: faker.location.state(),
          countryOrRegion: employee.countryCode ?? 'US',
          geoCoordinates: {
            altitude: 0,
            latitude: faker.location.latitude(),
            longitude: faker.location.longitude(),
          },
        },
        activityDateTime: timestamp,
        detectedDateTime: timestamp,
        lastUpdatedDateTime: timestamp,
        userId: employee.entraIdUserId,
        userDisplayName: displayName,
        userPrincipalName: employee.email,
        additionalInfo: JSON.stringify([
          { Key: 'userAgent', Value: faker.internet.userAgent() },
        ]),
        tokenIssuerType: 'AzureAD',
        userType: 'member',
      },
    };

    return {
      '@timestamp': timestamp,
      message: JSON.stringify(rawAzureJson),
      data_stream: {
        dataset: 'azure.identity_protection',
        namespace: 'default',
        type: 'logs',
      },
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

    const rawAzureJson = {
      time: timestamp,
      resourceId: `/tenants/${tenantId}/providers/Microsoft.aadiam`,
      operationName: 'Provisioning activity',
      operationVersion: '1.0',
      category: 'ProvisioningLogs',
      tenantId,
      resultSignature: 'None',
      durationMs,
      identity: faker.string.uuid(),
      Level: 4,
      properties: {
        action,
        activityDateTime: timestamp,
        changeId: correlationId,
        cycleId: faker.string.uuid(),
        durationInMilliseconds: durationMs,
        id: faker.string.uuid(),
        initiatedBy: {
          Id: '',
          Name: 'Azure AD Provisioning Service',
          Type: 'system',
        },
        jobId: `${targetApp.name.replace(/\s+/g, '')}SCIMOutDelta.${tenantId.replace(/-/g, '')}.${faker.string.uuid()}`,
        provisioningAction: action.toLowerCase(),
        provisioningStatusInfo: { Status: status },
        provisioningSteps: [
          {
            description: `Received User '${employee.email}' change of type (${action}) from Azure Active Directory`,
            name: `EntryImport${action}`,
            provisioningStepType: 0,
            status: 0,
          },
          {
            description: 'Determine if User in scope by evaluating against each scoping filter',
            name: 'EntrySynchronizationScoping',
            provisioningStepType: 1,
            status: 0,
          },
        ],
        servicePrincipal: { Id: targetApp.id, Name: targetApp.name },
        sourceIdentity: {
          details: {
            DisplayName: `${employee.firstName} ${employee.lastName}`,
            UserPrincipalName: employee.email,
            odatatype: 'User',
          },
          Id: employee.entraIdUserId,
          identityType: 'User',
          Name: employee.firstName,
        },
        sourceSystem: {
          details: {},
          Id: faker.string.uuid(),
          Name: 'Azure Active Directory',
        },
        targetIdentity: {
          details: {},
          Id: status === 'success' ? faker.string.uuid() : '',
          identityType: 'urn:ietf:params:scim:schemas:core:2.0:User',
          Name: status === 'success' ? employee.email : '',
        },
        targetSystem: {
          details: {
            ApplicationId: faker.string.uuid(),
            ServicePrincipalId: targetApp.id,
          },
          Id: faker.string.uuid(),
          Name: targetApp.name,
        },
        tenantId,
      },
      resultType: status === 'success' ? 'Success' : status === 'skipped' ? 'Skipped' : 'Failure',
    };

    return {
      '@timestamp': timestamp,
      message: JSON.stringify(rawAzureJson),
      data_stream: { dataset: 'azure.provisioning', namespace: 'default', type: 'logs' },
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
    const sourcePort = faker.number.int({ min: 1024, max: 65535 });
    const resourceId = `/SUBSCRIPTIONS/${subscriptionId}/RESOURCEGROUPS/${resourceGroup}/PROVIDERS/MICROSOFT.NETWORK/AZUREFIREWALLS/${firewallName}`;

    let msg: string;
    if (transport === 'icmp') {
      msg = `${transport.toUpperCase()} Type=8 request from ${sourceIp} to ${destIp}. Action: ${action}. `;
    } else {
      msg = `${transport} request from ${sourceIp}:${sourcePort} to ${destIp}:${destPort ?? 443}. Action: ${action}. `;
    }

    const rawAzureJson = {
      category: ruleCategory.category,
      operationName: ruleCategory.operationName,
      resourceId,
      time: timestamp,
      properties: {
        msg,
        SourceIp: sourceIp,
        DestinationIp: destIp,
        Protocol: transport.toUpperCase(),
        Action: action,
        ...(destPort !== undefined ? { SourcePort: sourcePort, DestinationPort: destPort } : {}),
      },
    };

    return {
      '@timestamp': timestamp,
      message: JSON.stringify(rawAzureJson),
      data_stream: { dataset: 'azure.firewall_logs', namespace: 'default', type: 'logs' },
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
    const resourceId = `/SUBSCRIPTIONS/${subscriptionId}/RESOURCEGROUPS/${resourceGroup}/PROVIDERS/${service.provider}/${service.resourceName}`;

    const rawAzureJson = {
      time: timestamp,
      resourceId,
      category: 'OperationalLogs',
      EventName: operation,
      ActivityId: activityId,
      Caller: faker.helpers.arrayElement(['Portal', 'ARM', 'ServiceFabric', 'Scheduler']),
      Environment: 'PROD',
      EventTimeString: new Date(timestamp).toUTCString(),
      ScaleUnit: `PROD-${faker.helpers.arrayElement(['AM3', 'CY4', 'DB3', 'HK1'])}-AZ${faker.number.int({ min: 100, max: 999 })}`,
      properties: {
        Namespace: service.resourceName.toLowerCase(),
        SubscriptionId: subscriptionId,
        TrackingId: `${activityId}_${faker.string.alphanumeric(4).toUpperCase()}`,
        Via: `https://${service.resourceName.toLowerCase()}.servicebus.windows.net/$Resources/eventhubs?api-version=2017-04&$skip=0&$top=100`,
      },
    };

    return {
      '@timestamp': timestamp,
      message: JSON.stringify(rawAzureJson),
      data_stream: { dataset: 'azure.platformlogs', namespace: 'default', type: 'logs' },
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
    const timeTaken = faker.number.int({ min: 50, max: 500 });
    const resourceId = `/SUBSCRIPTIONS/${subscriptionId}/RESOURCEGROUPS/${resourceGroup}/PROVIDERS/MICROSOFT.NETWORK/APPLICATIONGATEWAYS/${gatewayName}`;

    const rawAzureJson = {
      resourceId,
      operationName: 'ApplicationGatewayAccess',
      timestamp: timestamp,
      category: 'ApplicationGatewayAccessLog',
      properties: {
        instanceId: `ApplicationGatewayRole_IN_${faker.number.int({ min: 0, max: 3 })}`,
        clientIP: sourceIp,
        clientPort: sourcePort,
        httpMethod,
        requestUri: path,
        requestQuery: `X-AzureApplicationGateway-CACHE-HIT=0&SERVER-ROUTED=10.4.0.4&X-AzureApplicationGateway-LOG-ID=${faker.string.uuid()}&SERVER-STATUS=${statusCode}`,
        userAgent: '-',
        httpStatus: statusCode,
        httpVersion: 'HTTP/1.0',
        receivedBytes,
        sentBytes,
        timeTaken,
        sslEnabled: 'off',
        host,
        originalHost: host,
      },
    };

    return {
      '@timestamp': timestamp,
      message: JSON.stringify(rawAzureJson),
      data_stream: {
        dataset: 'azure.application_gateway',
        namespace: 'default',
        type: 'logs',
      },
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
    const logMessage = faker.helpers.arrayElement(SPRING_CLOUD_LOG_MESSAGES);
    const logLevel = faker.helpers.weightedArrayElement([
      { value: 'Informational', weight: 80 },
      { value: 'Warning', weight: 15 },
      { value: 'Error', weight: 5 },
    ]);
    const logLevelShort = logLevel === 'Error' ? 'ERROR' : logLevel === 'Warning' ? 'WARN' : 'INFO';
    const timestampStr = timestamp.replace('T', ' ').replace('Z', '');
    const threadName = faker.helpers.arrayElement(['main', 'trap-executor-0', 'http-nio-8080-exec-1']);
    const loggerName = `${faker.string.alpha(1).toLowerCase()}.${faker.string.alpha(1).toLowerCase()}.${faker.string.alpha(1).toLowerCase()}.${faker.string.alpha({ length: { min: 5, max: 15 } })}`;
    const logLine = `${timestampStr}  ${logLevelShort} [${appName},,,] 1 --- [${threadName}] ${loggerName}      : ${logMessage}`;
    const resourceId = `/SUBSCRIPTIONS/${subscriptionId}/RESOURCEGROUPS/${resourceGroup}/PROVIDERS/MICROSOFT.APPPLATFORM/SPRING/${serviceName.toUpperCase()}`;

    const rawAzureJson = {
      time: timestamp,
      resourceId,
      category: 'ApplicationConsole',
      operationName: 'Microsoft.AppPlatform/Spring/logs',
      LogFormat: 'RAW',
      logtag: 'F',
      properties: {
        AppName: appName,
        InstanceName: instanceName,
        ServiceId: faker.string.hexadecimal({ length: 32, prefix: '' }),
        ServiceName: serviceName,
        Stream: 'stdout',
        Log: logLine,
      },
    };

    return {
      '@timestamp': timestamp,
      message: JSON.stringify(rawAzureJson),
      data_stream: {
        dataset: 'azure.springcloudlogs',
        namespace: 'default',
        type: 'logs',
      },
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
