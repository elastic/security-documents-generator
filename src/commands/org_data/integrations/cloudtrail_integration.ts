/**
 * AWS CloudTrail Integration
 * Generates API call log documents for aws.cloudtrail data stream
 */

import { BaseIntegration, IntegrationDocument, DataStreamConfig } from './base_integration';
import {
  Organization,
  CloudIamUser,
  CloudResource,
  CorrelationMap,
  CloudAccount,
  Employee,
} from '../types';
import { faker } from '@faker-js/faker';

/**
 * AWS services and their common API events
 */
const AWS_API_EVENTS: Record<string, { eventSource: string; events: string[] }> = {
  EC2: {
    eventSource: 'ec2.amazonaws.com',
    events: ['DescribeInstances', 'DescribeSecurityGroups', 'DescribeVpcs', 'DescribeSubnets'],
  },
  S3: {
    eventSource: 's3.amazonaws.com',
    events: ['ListBuckets', 'GetBucketPolicy', 'GetBucketAcl', 'HeadBucket'],
  },
  RDS: {
    eventSource: 'rds.amazonaws.com',
    events: ['DescribeDBInstances', 'DescribeDBClusters', 'DescribeDBSnapshots'],
  },
  Lambda: {
    eventSource: 'lambda.amazonaws.com',
    events: ['ListFunctions', 'GetFunction', 'ListLayers'],
  },
  IAM: {
    eventSource: 'iam.amazonaws.com',
    events: ['ListUsers', 'ListRoles', 'GetRole', 'ListPolicies'],
  },
  STS: {
    eventSource: 'sts.amazonaws.com',
    events: ['GetCallerIdentity', 'AssumeRole'],
  },
  CloudTrail: {
    eventSource: 'cloudtrail.amazonaws.com',
    events: ['DescribeTrails', 'GetTrailStatus', 'LookupEvents'],
  },
  KMS: {
    eventSource: 'kms.amazonaws.com',
    events: ['ListKeys', 'DescribeKey', 'ListAliases'],
  },
};

/**
 * Common AWS regions
 */
const AWS_REGIONS = [
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'eu-west-1',
  'eu-central-1',
  'ap-southeast-1',
  'ap-northeast-1',
];

/**
 * User agent strings for AWS calls
 */
const AWS_USER_AGENTS = [
  'aws-cli/2.15.0 Python/3.11.6 Darwin/23.2.0 source/arm64 prompt/off',
  'aws-sdk-js/3.485.0',
  'Boto3/1.34.14 md/Botocore#1.34.14 ua/2.0 os/macos#14.2.1 md/arch#arm64 lang/python#3.11.7',
  'console.amazonaws.com',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'terraform-aws-provider/5.31.0',
];

/**
 * AWS CloudTrail Integration
 */
export class CloudTrailIntegration extends BaseIntegration {
  readonly packageName = 'aws';
  readonly displayName = 'AWS CloudTrail';

  readonly dataStreams: DataStreamConfig[] = [
    {
      name: 'cloudtrail',
      index: 'logs-aws.cloudtrail-default',
    },
  ];

  /**
   * Generate all CloudTrail documents
   */
  generateDocuments(
    org: Organization,
    correlationMap: CorrelationMap
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const documents: IntegrationDocument[] = [];

    // Get AWS accounts only
    const _awsAccounts = org.cloudAccounts.filter((a) => a.provider === 'aws');
    const awsResources = org.cloudResources.filter((r) => r.provider === 'aws');
    const awsIamUsers = org.cloudIamUsers.filter((u) => u.provider === 'aws');

    // Generate events for federated users (employees with AWS access)
    for (const iamUser of awsIamUsers) {
      if (iamUser.isFederated && iamUser.oktaUserId) {
        const employee = correlationMap.oktaUserIdToEmployee.get(iamUser.oktaUserId);
        if (employee) {
          documents.push(...this.generateFederatedUserEvents(iamUser, employee, org, awsResources));
        }
      } else {
        // Service account events
        documents.push(...this.generateServiceAccountEvents(iamUser, org, awsResources));
      }
    }

    // Generate console login events for some federated users
    const federatedUsers = awsIamUsers.filter((u) => u.isFederated);
    const consoleUsers = faker.helpers.arrayElements(
      federatedUsers,
      Math.ceil(federatedUsers.length * 0.3)
    );
    for (const iamUser of consoleUsers) {
      const employee = iamUser.oktaUserId
        ? correlationMap.oktaUserIdToEmployee.get(iamUser.oktaUserId)
        : undefined;
      if (employee) {
        documents.push(...this.generateConsoleLoginEvents(iamUser, employee, org));
      }
    }

    // Sort documents by timestamp
    documents.sort((a, b) => {
      return new Date(a['@timestamp']).getTime() - new Date(b['@timestamp']).getTime();
    });

    documentsMap.set(this.dataStreams[0].index, documents);

    return documentsMap;
  }

  /**
   * Generate events for federated users (employees accessing AWS via Okta)
   */
  private generateFederatedUserEvents(
    iamUser: CloudIamUser,
    employee: Employee,
    org: Organization,
    resources: CloudResource[]
  ): IntegrationDocument[] {
    const events: IntegrationDocument[] = [];
    const account = org.cloudAccounts.find((a) => a.id === iamUser.accountId);
    const accountResources = resources.filter((r) => r.accountId === iamUser.accountId);
    const sessionCount = faker.number.int({ min: 1, max: 3 });

    for (let s = 0; s < sessionCount; s++) {
      const sessionStart = this.getRandomTimestamp(48);
      const sessionId = this.generateSessionId();
      const accessKeyId = this.generateTemporaryAccessKeyId();
      const roleArn = `arn:aws:iam::${iamUser.accountId}:role/okta`;
      const assumedRoleArn = `arn:aws:sts::${iamUser.accountId}:assumed-role/okta/${employee.email}`;

      // AssumeRole event (SAML federation)
      events.push(
        this.createAssumeRoleEvent(
          iamUser,
          employee,
          account!,
          org,
          roleArn,
          assumedRoleArn,
          sessionStart,
          accessKeyId
        )
      );

      // GetCallerIdentity after assume role
      const callerIdentityTime = new Date(
        new Date(sessionStart).getTime() + faker.number.int({ min: 1, max: 5 }) * 1000
      ).toISOString();
      events.push(
        this.createGetCallerIdentityEvent(
          iamUser,
          employee,
          account!,
          assumedRoleArn,
          callerIdentityTime,
          accessKeyId,
          sessionId
        )
      );

      // Generate API calls within the session
      const apiCallCount = faker.number.int({ min: 2, max: 8 });
      const availableServices = this.getServicesForResources(accountResources);

      for (let i = 0; i < apiCallCount; i++) {
        const service = faker.helpers.arrayElement(availableServices);
        const apiTime = new Date(
          new Date(sessionStart).getTime() + faker.number.int({ min: 10, max: 300 }) * 1000
        ).toISOString();
        const region = faker.helpers.arrayElement(AWS_REGIONS);

        events.push(
          this.createApiCallEvent(
            iamUser,
            employee,
            account!,
            service,
            assumedRoleArn,
            apiTime,
            accessKeyId,
            sessionId,
            region,
            accountResources
          )
        );
      }
    }

    return events;
  }

  /**
   * Generate events for service accounts
   */
  private generateServiceAccountEvents(
    iamUser: CloudIamUser,
    org: Organization,
    resources: CloudResource[]
  ): IntegrationDocument[] {
    const events: IntegrationDocument[] = [];
    const account = org.cloudAccounts.find((a) => a.id === iamUser.accountId);
    const accountResources = resources.filter((r) => r.accountId === iamUser.accountId);
    const eventCount = faker.number.int({ min: 5, max: 15 });
    const accessKeyId = this.generatePermanentAccessKeyId();

    for (let i = 0; i < eventCount; i++) {
      const timestamp = this.getRandomTimestamp(48);
      const service = faker.helpers.arrayElement(['S3', 'EC2', 'Lambda', 'CloudTrail', 'KMS']);
      const region = faker.helpers.arrayElement(AWS_REGIONS);

      events.push(
        this.createServiceAccountApiEvent(
          iamUser,
          account!,
          service,
          timestamp,
          accessKeyId,
          region,
          accountResources
        )
      );
    }

    return events;
  }

  /**
   * Generate console login events
   */
  private generateConsoleLoginEvents(
    iamUser: CloudIamUser,
    employee: Employee,
    org: Organization
  ): IntegrationDocument[] {
    const events: IntegrationDocument[] = [];
    const account = org.cloudAccounts.find((a) => a.id === iamUser.accountId);
    const loginCount = faker.number.int({ min: 1, max: 2 });

    for (let i = 0; i < loginCount; i++) {
      const timestamp = this.getRandomTimestamp(48);
      const isFailure = faker.number.float() < 0.05; // 5% failure rate

      events.push(this.createConsoleLoginEvent(iamUser, employee, account!, timestamp, isFailure));
    }

    return events;
  }

  /**
   * Create AssumeRole event for federated user
   */
  private createAssumeRoleEvent(
    iamUser: CloudIamUser,
    employee: Employee,
    account: CloudAccount,
    org: Organization,
    roleArn: string,
    assumedRoleArn: string,
    timestamp: string,
    accessKeyId: string
  ): IntegrationDocument {
    const eventId = faker.string.uuid();
    const sourceIp = faker.internet.ipv4();

    const rawEvent = {
      eventVersion: '1.08',
      userIdentity: {
        type: 'SAMLUser',
        principalId: `${employee.email}:${employee.oktaUserId}`,
        arn: '',
        accountId: account.id,
      },
      eventTime: timestamp,
      eventSource: 'sts.amazonaws.com',
      eventName: 'AssumeRoleWithSAML',
      awsRegion: 'us-east-1',
      sourceIPAddress: sourceIp,
      userAgent: 'signin.amazonaws.com',
      requestParameters: {
        roleArn,
        principalArn: `arn:aws:iam::${account.id}:saml-provider/Okta`,
        SAMLAssertion: 'REDACTED',
        durationSeconds: 3600,
      },
      responseElements: {
        credentials: {
          accessKeyId,
          sessionToken: 'REDACTED',
          expiration: new Date(new Date(timestamp).getTime() + 3600000).toISOString(),
        },
        assumedRoleUser: {
          assumedRoleId: `${this.generateRoleId()}:${employee.email}`,
          arn: assumedRoleArn,
        },
        issuer: `https://${org.name.toLowerCase().replace(/\s+/g, '')}.okta.com`,
      },
      eventID: eventId,
      readOnly: false,
      eventType: 'AwsApiCall',
      managementEvent: true,
      recipientAccountId: account.id,
    };

    return {
      '@timestamp': timestamp,
      message: JSON.stringify(rawEvent),
      event: { dataset: 'aws.cloudtrail' },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'aws.cloudtrail' },
      user: { entity: { id: assumedRoleArn } },
    } as IntegrationDocument;
  }

  /**
   * Create GetCallerIdentity event
   */
  private createGetCallerIdentityEvent(
    iamUser: CloudIamUser,
    employee: Employee,
    account: CloudAccount,
    assumedRoleArn: string,
    timestamp: string,
    accessKeyId: string,
    _sessionId: string
  ): IntegrationDocument {
    const eventId = faker.string.uuid();
    const sourceIp = faker.internet.ipv4();
    const userAgent = faker.helpers.arrayElement(AWS_USER_AGENTS);

    const rawEvent = {
      eventVersion: '1.08',
      userIdentity: {
        type: 'AssumedRole',
        principalId: `${this.generateRoleId()}:${employee.email}`,
        arn: assumedRoleArn,
        accountId: account.id,
        accessKeyId,
        sessionContext: {
          attributes: {
            mfaAuthenticated: 'true',
            creationDate: timestamp,
          },
          sessionIssuer: {
            type: 'Role',
            principalId: this.generateRoleId(),
            arn: `arn:aws:iam::${account.id}:role/okta`,
            accountId: account.id,
            userName: 'okta',
          },
        },
      },
      eventTime: timestamp,
      eventSource: 'sts.amazonaws.com',
      eventName: 'GetCallerIdentity',
      awsRegion: 'us-east-1',
      sourceIPAddress: sourceIp,
      userAgent,
      requestParameters: {},
      eventID: eventId,
      readOnly: true,
      eventType: 'AwsApiCall',
      managementEvent: true,
      recipientAccountId: account.id,
    };

    return {
      '@timestamp': timestamp,
      message: JSON.stringify(rawEvent),
      event: { dataset: 'aws.cloudtrail' },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'aws.cloudtrail' },
      user: { entity: { id: assumedRoleArn } },
    } as IntegrationDocument;
  }

  /**
   * Create generic API call event for federated user
   */
  private createApiCallEvent(
    iamUser: CloudIamUser,
    employee: Employee,
    account: CloudAccount,
    service: string,
    assumedRoleArn: string,
    timestamp: string,
    accessKeyId: string,
    sessionId: string,
    region: string,
    resources: CloudResource[]
  ): IntegrationDocument {
    const eventId = faker.string.uuid();
    const sourceIp = faker.internet.ipv4();
    const userAgent = faker.helpers.arrayElement(AWS_USER_AGENTS);
    const serviceConfig = AWS_API_EVENTS[service];
    const eventName = faker.helpers.arrayElement(serviceConfig.events);

    // Find related resources if any
    const relatedResources = resources.filter((r) => {
      const resourceService = this.getServiceFromSubType(r.subType);
      return resourceService === service && r.region === region;
    });

    const awsResources =
      relatedResources.length > 0
        ? relatedResources.slice(0, 2).map((r) => ({
            ARN: r.id,
            accountId: account.id,
            type: `AWS::${service}::${this.getResourceType(r.subType)}`,
          }))
        : undefined;

    const rawEvent = {
      eventVersion: '1.08',
      userIdentity: {
        type: 'AssumedRole',
        principalId: `${this.generateRoleId()}:${employee.email}`,
        arn: assumedRoleArn,
        accountId: account.id,
        accessKeyId,
        sessionContext: {
          attributes: {
            mfaAuthenticated: 'true',
            creationDate: timestamp,
          },
          sessionIssuer: {
            type: 'Role',
            principalId: this.generateRoleId(),
            arn: `arn:aws:iam::${account.id}:role/okta`,
            accountId: account.id,
            userName: 'okta',
          },
        },
      },
      eventTime: timestamp,
      eventSource: serviceConfig.eventSource,
      eventName,
      awsRegion: region,
      sourceIPAddress: sourceIp,
      userAgent,
      requestParameters: this.generateRequestParameters(eventName),
      ...(awsResources && { resources: awsResources }),
      eventID: eventId,
      readOnly: true,
      eventType: 'AwsApiCall',
      managementEvent: true,
      recipientAccountId: account.id,
    };

    return {
      '@timestamp': timestamp,
      message: JSON.stringify(rawEvent),
      event: { dataset: 'aws.cloudtrail' },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'aws.cloudtrail' },
      user: { entity: { id: assumedRoleArn } },
    } as IntegrationDocument;
  }

  /**
   * Create API event for service account (IAMUser type)
   */
  private createServiceAccountApiEvent(
    iamUser: CloudIamUser,
    account: CloudAccount,
    service: string,
    timestamp: string,
    accessKeyId: string,
    region: string,
    _resources: CloudResource[]
  ): IntegrationDocument {
    const eventId = faker.string.uuid();
    const sourceIp = faker.internet.ipv4();
    const userAgent = faker.helpers.arrayElement([
      'aws-sdk-js/3.485.0',
      'Boto3/1.34.14 md/Botocore#1.34.14',
      'terraform-aws-provider/5.31.0',
    ]);
    const serviceConfig = AWS_API_EVENTS[service];
    const eventName = faker.helpers.arrayElement(serviceConfig.events);

    const rawEvent = {
      eventVersion: '1.08',
      userIdentity: {
        type: 'IAMUser',
        principalId: this.generatePrincipalId(),
        arn: iamUser.arn,
        accountId: account.id,
        accessKeyId,
        userName: iamUser.userName,
      },
      eventTime: timestamp,
      eventSource: serviceConfig.eventSource,
      eventName,
      awsRegion: region,
      sourceIPAddress: sourceIp,
      userAgent,
      requestParameters: this.generateRequestParameters(eventName),
      eventID: eventId,
      readOnly: true,
      eventType: 'AwsApiCall',
      managementEvent: true,
      recipientAccountId: account.id,
    };

    return {
      '@timestamp': timestamp,
      message: JSON.stringify(rawEvent),
      event: { dataset: 'aws.cloudtrail' },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'aws.cloudtrail' },
    } as IntegrationDocument;
  }

  /**
   * Create console login event
   */
  private createConsoleLoginEvent(
    iamUser: CloudIamUser,
    employee: Employee,
    account: CloudAccount,
    timestamp: string,
    isFailure: boolean
  ): IntegrationDocument {
    const eventId = faker.string.uuid();
    const sourceIp = faker.internet.ipv4();
    const assumedRoleArn = `arn:aws:sts::${account.id}:assumed-role/okta/${employee.email}`;

    const rawEvent: Record<string, unknown> = {
      eventVersion: '1.08',
      userIdentity: {
        type: 'AssumedRole',
        principalId: `${this.generateRoleId()}:${employee.email}`,
        arn: assumedRoleArn,
        accountId: account.id,
        sessionContext: {
          attributes: {
            mfaAuthenticated: 'true',
            creationDate: timestamp,
          },
          sessionIssuer: {
            type: 'Role',
            principalId: this.generateRoleId(),
            arn: `arn:aws:iam::${account.id}:role/okta`,
            accountId: account.id,
            userName: 'okta',
          },
        },
      },
      eventTime: timestamp,
      eventSource: 'signin.amazonaws.com',
      eventName: 'ConsoleLogin',
      awsRegion: 'us-east-1',
      sourceIPAddress: sourceIp,
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      responseElements: {
        ConsoleLogin: isFailure ? 'Failure' : 'Success',
      },
      additionalEventData: {
        MobileVersion: 'No',
        LoginTo: 'https://console.aws.amazon.com/console/home',
        MFAUsed: 'Yes',
      },
      eventID: eventId,
      eventType: 'AwsConsoleSignIn',
      recipientAccountId: account.id,
    };

    if (isFailure) {
      rawEvent.errorCode = 'Failed authentication';
      rawEvent.errorMessage = 'Failed authentication';
    }

    return {
      '@timestamp': timestamp,
      message: JSON.stringify(rawEvent),
      event: { dataset: 'aws.cloudtrail' },
      data_stream: { namespace: 'default', type: 'logs', dataset: 'aws.cloudtrail' },
      user: { entity: { id: assumedRoleArn } },
    } as IntegrationDocument;
  }

  /**
   * Generate temporary access key ID (starts with ASIA)
   */
  private generateTemporaryAccessKeyId(): string {
    return `ASIA${faker.string.alphanumeric(16).toUpperCase()}`;
  }

  /**
   * Generate permanent access key ID (starts with AKIA)
   */
  private generatePermanentAccessKeyId(): string {
    return `AKIA${faker.string.alphanumeric(16).toUpperCase()}`;
  }

  /**
   * Generate role ID (starts with AROA)
   */
  private generateRoleId(): string {
    return `AROA${faker.string.alphanumeric(17).toUpperCase()}`;
  }

  /**
   * Generate principal ID (starts with AIDA)
   */
  private generatePrincipalId(): string {
    return `AIDA${faker.string.alphanumeric(17).toUpperCase()}`;
  }

  /**
   * Generate session ID
   */
  private generateSessionId(): string {
    return faker.string.alphanumeric(32);
  }

  /**
   * Get available services based on resources
   */
  private getServicesForResources(resources: CloudResource[]): string[] {
    const services = new Set<string>();
    services.add('STS'); // Always include STS
    services.add('IAM'); // Always include IAM

    for (const resource of resources) {
      const service = this.getServiceFromSubType(resource.subType);
      if (service && AWS_API_EVENTS[service]) {
        services.add(service);
      }
    }

    return Array.from(services);
  }

  /**
   * Get AWS service name from subType (cloudbeat AssetClassification format)
   */
  private getServiceFromSubType(subType: string): string {
    const serviceMap: Record<string, string> = {
      'AWS EC2 Instance': 'EC2',
      'AWS S3 Bucket': 'S3',
      'AWS RDS Instance': 'RDS',
      'AWS Lambda Function': 'Lambda',
      'AWS IAM User': 'IAM',
      'AWS IAM Role': 'IAM',
      'AWS IAM Policy': 'IAM',
      'AWS KMS Key': 'KMS',
      'AWS EKS Cluster': 'EC2',
      'AWS EKS Node Group': 'EC2',
      'AWS ECS Service': 'EC2',
      'AWS DynamoDB Table': 'EC2',
      'AWS ElastiCache Cluster': 'EC2',
      'AWS VPC': 'EC2',
      'AWS Elastic Load Balancer v2': 'EC2',
      'AWS CloudFront Distribution': 'EC2',
      'AWS SNS Topic': 'SNS',
      'AWS SQS Queue': 'SQS',
      'AWS EBS Volume': 'EC2',
    };
    return serviceMap[subType] || 'EC2';
  }

  /**
   * Get resource type from subType (cloudbeat AssetClassification format)
   * Extracts the main resource type for CloudTrail resource type format (e.g., AWS::EC2::Instance)
   */
  private getResourceType(subType: string): string {
    const resourceTypeMap: Record<string, string> = {
      'AWS EC2 Instance': 'Instance',
      'AWS S3 Bucket': 'Bucket',
      'AWS RDS Instance': 'DBInstance',
      'AWS Lambda Function': 'Function',
      'AWS IAM User': 'User',
      'AWS IAM Role': 'Role',
      'AWS IAM Policy': 'Policy',
      'AWS KMS Key': 'Key',
      'AWS EKS Cluster': 'Cluster',
      'AWS EKS Node Group': 'NodeGroup',
      'AWS ECS Service': 'Service',
      'AWS DynamoDB Table': 'Table',
      'AWS ElastiCache Cluster': 'CacheCluster',
      'AWS VPC': 'VPC',
      'AWS Elastic Load Balancer v2': 'LoadBalancer',
      'AWS CloudFront Distribution': 'Distribution',
      'AWS SNS Topic': 'Topic',
      'AWS SQS Queue': 'Queue',
      'AWS EBS Volume': 'Volume',
    };
    return resourceTypeMap[subType] || 'Resource';
  }

  /**
   * Generate request parameters for an event
   */
  private generateRequestParameters(eventName: string): Record<string, unknown> | undefined {
    switch (eventName) {
      case 'DescribeInstances':
        return { maxResults: 100 };
      case 'ListBuckets':
        return {};
      case 'DescribeDBInstances':
        return { maxRecords: 100 };
      case 'ListFunctions':
        return { maxItems: 50 };
      case 'ListUsers':
        return { maxItems: 100 };
      case 'GetCallerIdentity':
        return {};
      default:
        return {};
    }
  }
}
