/**
 * AWS CloudTrail Integration
 * Generates API call log documents for aws.cloudtrail data stream
 */

import {
  BaseIntegration,
  type IntegrationDocument,
  type DataStreamConfig,
} from './base_integration.ts';
import {
  type Organization,
  type CloudIamUser,
  type CloudIamRole,
  type CloudResource,
  type CorrelationMap,
  type CloudAccount,
  type AccessPathScenario,
  type Employee,
  type Host,
  type Service,
} from '../types.ts';
import { faker } from '@faker-js/faker';

/**
 * AWS services and their common API events
 */
const AWS_API_EVENTS: Record<string, { eventSource: string; events: string[] }> = {
  EC2: {
    eventSource: 'ec2.amazonaws.com',
    events: [
      'DescribeInstances',
      'DescribeSecurityGroups',
      'DescribeVpcs',
      'DescribeSubnets',
      'RunInstances',
      'StopInstances',
      'StartInstances',
      'TerminateInstances',
    ],
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
  SSM: {
    eventSource: 'ssm.amazonaws.com',
    events: ['StartSession', 'TerminateSession', 'ResumeSession'],
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
 * Tags required on every document for the ingest pipeline's entity
 * classification script to run. Without 'actor_target_mapping' the
 * Painless script that populates host.target.entity.id, user.entity.id,
 * etc. is skipped entirely.
 */
const CLOUDTRAIL_TAGS = ['actor_target_mapping', 'forwarded'];

/**
 * One set of temporary credentials for an assumed role. Every event in the session
 * carries the same session ARN, principal id and access key, and names the role it was
 * issued by in sessionContext.sessionIssuer, which is what the ingest pipeline reads
 * to attribute the event to the role entity.
 */
interface FederatedSession {
  roleArn: string;
  roleName: string;
  roleId: string;
  sessionName: string;
  assumedRoleArn: string;
  principalId: string;
  accessKeyId: string;
  accountId: string;
  /** Set for EC2 instance-profile sessions (session name = instance id). */
  ec2RoleDelivery?: string;
}

/**
 * Events the ingest pipeline's enrichment functions map to enrichCtx.target
 * using the instance ID, which the target classifier then routes to
 * host.target.entity.id (and host.id) via the i- prefix.
 *
 * Each entry carries its eventSource and the raw-event parameter shape
 * the pipeline reads the instance ID from.
 */
const HOST_TARGET_EVENTS: {
  eventSource: string;
  eventName: string;
  buildParams: (instanceId: string) => {
    requestParameters: Record<string, unknown>;
    responseElements?: null;
  };
}[] = [
  {
    eventSource: 'ec2.amazonaws.com',
    eventName: 'GetPasswordData',
    buildParams: (id) => ({
      requestParameters: { instanceId: id },
      responseElements: null,
    }),
  },
  {
    eventSource: 'ec2-instance-connect.amazonaws.com',
    eventName: 'SendSSHPublicKey',
    buildParams: (id) => ({
      requestParameters: {
        instanceId: id,
        instanceOSUser: 'ec2-user',
        sSHPublicKey: 'REDACTED',
      },
    }),
  },
  {
    eventSource: 'ssm.amazonaws.com',
    eventName: 'SendCommand',
    buildParams: (id) => ({
      requestParameters: {
        instanceIds: [id],
        documentName: 'AWS-RunShellScript',
      },
    }),
  },
  {
    eventSource: 'ssm.amazonaws.com',
    eventName: 'StartSession',
    buildParams: (id) => ({
      requestParameters: { target: id },
    }),
  },
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
   * Lookup of cloud platform services by id (eventSource). Set in
   * generateDocuments so doc factories can resolve service.entity.id without
   * threading correlationMap through every helper.
   */
  private serviceIdToService?: Map<string, Service>;

  /**
   * Resolve a service.entity.id attachment for a given CloudTrail eventSource.
   * Returns `undefined` if the service catalog isn't populated (correlation
   * map missing) or the eventSource isn't a known platform service, so callers
   * can spread the result without adding noise to documents.
   */
  private serviceAttachmentFor(eventSource: string): { entity: { id: string } } | undefined {
    const svc = this.serviceIdToService?.get(eventSource);
    return svc ? { entity: { id: svc.entityId } } : undefined;
  }

  /**
   * Build ECS cloud.* metadata for a CloudTrail document. In real deployments this
   * is added by the Filebeat AWS input (not the ingest pipeline), so the generator
   * must set it directly -- otherwise cloud.provider is never populated.
   */
  private buildCloud(
    accountId: string,
    region: string,
  ): { provider: 'aws'; account: { id: string }; region: string } {
    return { provider: 'aws', account: { id: accountId }, region };
  }

  private correlationMap?: CorrelationMap;

  /**
   * Federation roles an employee can assume in an account: the roles the AWS federation
   * app maps their Okta groups to. Falls back to the account's okta-developer role, and
   * to a synthesized legacy `okta` role when the org has no IAM model.
   */
  private federationRolesFor(employee: Employee, accountId: string): CloudIamRole[] {
    const map = this.correlationMap;
    const roles: CloudIamRole[] = [];
    if (map) {
      for (const groupId of employee.oktaGroupIds) {
        for (const roleArn of map.oktaGroupIdToRoleArns.get(groupId) ?? []) {
          const role = map.roleArnToRole.get(roleArn);
          if (role && role.accountId === accountId && !roles.includes(role)) roles.push(role);
        }
      }
      if (roles.length === 0) {
        const developer = Array.from(map.roleArnToRole.values()).find(
          (r) => r.accountId === accountId && r.name === 'okta-developer',
        );
        if (developer) roles.push(developer);
      }
    }
    if (roles.length === 0) {
      roles.push({
        arn: `arn:aws:iam::${accountId}:role/okta`,
        name: 'okta',
        roleId: this.generateRoleId(),
        path: '/',
        accountId,
        accountName: '',
        description: 'Legacy SSO role',
        purpose: 'federation',
        trustPolicy: { Version: '2012-10-17', Statement: [] },
        trustedPrincipalArns: [],
        trustedServices: [],
        trustedFederatedArns: [],
        attachedPolicyArns: [],
        inlinePolicies: [],
        maxSessionDuration: 3600,
        createdAt: new Date(0).toISOString(),
      });
    }
    return roles;
  }

  /**
   * Start a new temporary-credential session for a role.
   */
  private newSession(
    role: CloudIamRole,
    sessionName: string,
    options: { ec2RoleDelivery?: string } = {},
  ): FederatedSession {
    return {
      roleArn: role.arn,
      roleName: role.name,
      roleId: role.roleId,
      sessionName,
      assumedRoleArn: `arn:aws:sts::${role.accountId}:assumed-role/${role.name}/${sessionName}`,
      principalId: `${role.roleId}:${sessionName}`,
      accessKeyId: this.generateTemporaryAccessKeyId(),
      accountId: role.accountId,
      ...(options.ec2RoleDelivery && { ec2RoleDelivery: options.ec2RoleDelivery }),
    };
  }

  /**
   * CloudTrail userIdentity block for an assumed-role session. The pipeline sets
   * user.entity.id from sessionContext.sessionIssuer.arn (the role, not the session).
   */
  private assumedRoleIdentity(
    session: FederatedSession,
    creationDate: string,
    mfaAuthenticated: boolean = true,
  ): Record<string, unknown> {
    return {
      type: 'AssumedRole',
      principalId: session.principalId,
      arn: session.assumedRoleArn,
      accountId: session.accountId,
      accessKeyId: session.accessKeyId,
      sessionContext: {
        attributes: {
          mfaAuthenticated: mfaAuthenticated ? 'true' : 'false',
          creationDate,
        },
        sessionIssuer: {
          type: 'Role',
          principalId: session.roleId,
          arn: session.roleArn,
          accountId: session.accountId,
          userName: session.roleName,
        },
        ...(session.ec2RoleDelivery && { ec2RoleDelivery: session.ec2RoleDelivery }),
      },
    };
  }

  private offset(base: string, seconds: number): string {
    return new Date(new Date(base).getTime() + seconds * 1000).toISOString();
  }

  /**
   * Generate all CloudTrail documents
   */
  generateDocuments(
    org: Organization,
    correlationMap: CorrelationMap,
  ): Map<string, IntegrationDocument[]> {
    this.serviceIdToService = correlationMap.serviceIdToService;
    this.correlationMap = correlationMap;
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const documents: IntegrationDocument[] = [];

    // Planted access paths: the exact chain, observed end to end
    for (const path of org.accessPaths) {
      documents.push(...this.generateAccessPathEvents(path, org, correlationMap));
    }

    // Background activity from EC2 instance roles, so instance -> role edges are observed
    // outside the planted path too
    documents.push(...this.generateInstanceRoleEvents(org, correlationMap));

    // Get AWS accounts only
    const awsResources = org.cloudResources.filter((r) => r.provider === 'aws');
    const awsIamUsers = org.cloudIamUsers.filter((u) => u.provider === 'aws');

    // Get AWS hosts for host.id correlation
    const awsHosts = org.hosts.filter((h) => h.cloudProvider === 'aws');

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
      Math.ceil(federatedUsers.length * 0.3),
    );
    for (const iamUser of consoleUsers) {
      const employee = iamUser.oktaUserId
        ? correlationMap.oktaUserIdToEmployee.get(iamUser.oktaUserId)
        : undefined;
      if (employee) {
        documents.push(...this.generateConsoleLoginEvents(iamUser, employee, org));
      }
    }

    // Generate SSM StartSession events for federated users accessing hosts
    if (awsHosts.length > 0) {
      const ssmUsers = faker.helpers.arrayElements(
        federatedUsers,
        Math.ceil(federatedUsers.length * 0.4),
      );
      for (const iamUser of ssmUsers) {
        const employee = iamUser.oktaUserId
          ? correlationMap.oktaUserIdToEmployee.get(iamUser.oktaUserId)
          : undefined;
        if (employee) {
          documents.push(...this.generateStartSessionEvents(iamUser, employee, org, awsHosts));
        }
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
    resources: CloudResource[],
  ): IntegrationDocument[] {
    const events: IntegrationDocument[] = [];
    const account = org.cloudAccounts.find((a) => a.id === iamUser.accountId);
    const accountResources = resources.filter((r) => r.accountId === iamUser.accountId);
    const sessionCount = faker.number.int({ min: 2, max: 5 });

    const federationRoles = this.federationRolesFor(employee, iamUser.accountId);

    for (let s = 0; s < sessionCount; s++) {
      const sessionStart = this.getRandomTimestamp(48);
      const role = faker.helpers.arrayElement(federationRoles);
      const session = this.newSession(role, employee.email);

      // AssumeRoleWithSAML event (Okta federation into the mapped role)
      events.push(this.createAssumeRoleEvent(employee, account!, org, session, sessionStart));

      // GetCallerIdentity after assume role
      events.push(
        this.createGetCallerIdentityEvent(
          account!,
          org,
          session,
          this.offset(sessionStart, faker.number.int({ min: 1, max: 5 })),
        ),
      );

      // Generate API calls within the session
      const apiCallCount = faker.number.int({ min: 4, max: 12 });
      const availableServices = this.getServicesForResources(accountResources);

      for (let i = 0; i < apiCallCount; i++) {
        const service = faker.helpers.arrayElement(availableServices);
        const apiTime = this.offset(sessionStart, faker.number.int({ min: 10, max: 300 }));
        const region = faker.helpers.arrayElement(AWS_REGIONS);

        events.push(
          this.createApiCallEvent(
            account!,
            org,
            service,
            session,
            apiTime,
            region,
            accountResources,
          ),
        );
      }

      // Generate events that produce host.target.entity.id (2-4 per session)
      const ec2Instances = accountResources.filter((r) => r.subType === 'AWS EC2 Instance');
      if (ec2Instances.length > 0) {
        const instanceEventCount = faker.number.int({ min: 2, max: 4 });
        for (let i = 0; i < instanceEventCount; i++) {
          const apiTime = this.offset(sessionStart, faker.number.int({ min: 30, max: 600 }));
          const targetInstance = faker.helpers.arrayElement(ec2Instances);

          events.push(
            this.createHostTargetEvent(
              this.assumedRoleIdentity(session, sessionStart),
              account!,
              apiTime,
              targetInstance,
              org,
            ),
          );
        }
      }
    }

    return events;
  }

  /**
   * Observe the planted access path end to end, twice over the last 48 hours:
   *
   *   AssumeRoleWithSAML (user -> federation role)
   *   -> AssumeRole (federation role -> chained role)
   *   -> StartSession (chained role -> EC2 instance)
   *   -> GetObject (instance role -> crown-jewel bucket)
   *
   * plus the chained role reading its own permitted data-lake bucket.
   */
  private generateAccessPathEvents(
    path: AccessPathScenario,
    org: Organization,
    correlationMap: CorrelationMap,
  ): IntegrationDocument[] {
    const events: IntegrationDocument[] = [];
    const account = org.cloudAccounts.find((a) => a.id === path.accountId);
    const employee = org.employees.find((e) => e.id === path.seedEmployeeId);
    const federationRole = correlationMap.roleArnToRole.get(path.federationRoleArn);
    const chainedRole = correlationMap.roleArnToRole.get(path.chainedRoleArn);
    const instanceRole = correlationMap.roleArnToRole.get(path.instanceRoleArn);
    const host = correlationMap.hostIdToHost.get(path.instanceId);
    if (!account || !employee || !federationRole || !chainedRole || !instanceRole || !host) {
      return events;
    }

    // The data-lake bucket the chained role is allowed to read, from its attached policies
    const chainedRoleBucketArns = chainedRole.attachedPolicyArns
      .flatMap((arn) => correlationMap.policyArnToPolicy.get(arn)?.resourceIds ?? [])
      .filter((id) => id.startsWith('arn:aws:s3:::'));

    for (let s = 0; s < 2; s++) {
      const start = this.getRandomTimestamp(s === 0 ? 6 : 48);
      const federationSession = this.newSession(federationRole, employee.email);
      events.push(this.createAssumeRoleEvent(employee, account, org, federationSession, start));
      events.push(
        this.createGetCallerIdentityEvent(account, org, federationSession, this.offset(start, 3)),
      );

      // Hop: federation role -> chained role
      const chainedSession = this.newSession(chainedRole, `${employee.userName}-maintenance`);
      events.push(
        this.createRoleChainEvent(
          federationSession,
          chainedSession,
          account,
          org,
          this.offset(start, 20),
        ),
      );
      events.push(
        this.createGetCallerIdentityEvent(account, org, chainedSession, this.offset(start, 24)),
      );
      events.push(
        this.createApiCallEvent(
          account,
          org,
          'EC2',
          chainedSession,
          this.offset(start, 31),
          host.region,
          [],
          'DescribeInstances',
        ),
      );
      for (const bucketArn of chainedRoleBucketArns.slice(0, 1)) {
        events.push(
          this.createS3DataEvent(
            chainedSession,
            account,
            org,
            bucketArn,
            `exports/daily/${start.substring(0, 10)}/orders.parquet`,
            'GetObject',
            this.offset(start, 38),
            host.region,
            faker.internet.ipv4(),
          ),
        );
      }

      // Hop: chained role -> EC2 instance over Session Manager
      events.push(
        this.createStartSessionEvent(
          account,
          host,
          chainedSession,
          this.offset(start, 45),
          org,
          `${employee.userName}-${faker.string.alphanumeric(8).toLowerCase()}`,
        ),
      );

      // Hop: the instance role reads the crown-jewel bucket. The session name is the
      // instance id and ec2RoleDelivery is set, which is how instance-profile credentials
      // appear in CloudTrail.
      const instanceSession = this.newSession(instanceRole, host.id, { ec2RoleDelivery: '2.0' });
      const objectKey = `customers/export-${start.substring(0, 10)}.csv`;
      events.push(
        this.createS3DataEvent(
          instanceSession,
          account,
          org,
          path.crownJewelBucketArn,
          objectKey,
          'ListObjects',
          this.offset(start, 70),
          host.region,
          host.ipAddress,
        ),
      );
      events.push(
        this.createS3DataEvent(
          instanceSession,
          account,
          org,
          path.crownJewelBucketArn,
          objectKey,
          'GetObject',
          this.offset(start, 74),
          host.region,
          host.ipAddress,
        ),
      );
    }

    return events;
  }

  /**
   * Routine activity from EC2 instance roles (SSM agent heartbeat and reads of the buckets
   * the role's policies allow), for up to ten AWS hosts with an instance profile.
   */
  private generateInstanceRoleEvents(
    org: Organization,
    correlationMap: CorrelationMap,
  ): IntegrationDocument[] {
    const events: IntegrationDocument[] = [];
    const hosts = org.hosts
      .filter((h) => h.cloudProvider === 'aws' && h.instanceProfileArn && h.cloudAccountId)
      .slice(0, 10);

    for (const host of hosts) {
      const profile = correlationMap.instanceProfileArnToProfile.get(host.instanceProfileArn!);
      const role = profile ? correlationMap.roleArnToRole.get(profile.roleArn) : undefined;
      const account = org.cloudAccounts.find((a) => a.id === host.cloudAccountId);
      if (!role || !account) continue;

      const session = this.newSession(role, host.id, { ec2RoleDelivery: '2.0' });
      const bucketArns = role.attachedPolicyArns
        .flatMap((arn) => correlationMap.policyArnToPolicy.get(arn)?.resourceIds ?? [])
        .filter((id) => id.startsWith('arn:aws:s3:::'));

      const eventCount = faker.number.int({ min: 1, max: 3 });
      for (let i = 0; i < eventCount; i++) {
        const timestamp = this.getRandomTimestamp(48);
        if (bucketArns.length > 0 && faker.datatype.boolean(0.7)) {
          events.push(
            this.createS3DataEvent(
              session,
              account,
              org,
              faker.helpers.arrayElement(bucketArns),
              `app/config/${host.purpose}.json`,
              'GetObject',
              timestamp,
              host.region,
              host.ipAddress,
            ),
          );
        } else {
          events.push(this.createGetCallerIdentityEvent(account, org, session, timestamp));
        }
      }
    }

    return events;
  }

  /**
   * sts:AssumeRole from one role session into another role (role chaining). The pipeline
   * attributes the actor to the issuing role ARN and the target to requestParameters.roleArn.
   */
  private createRoleChainEvent(
    from: FederatedSession,
    to: FederatedSession,
    account: CloudAccount,
    org: Organization,
    timestamp: string,
  ): IntegrationDocument {
    const rawEvent = {
      eventVersion: '1.09',
      userIdentity: this.assumedRoleIdentity(from, timestamp),
      eventTime: timestamp,
      eventSource: 'sts.amazonaws.com',
      eventName: 'AssumeRole',
      awsRegion: 'us-east-1',
      sourceIPAddress: faker.internet.ipv4(),
      userAgent: faker.helpers.arrayElement(AWS_USER_AGENTS),
      requestParameters: {
        roleArn: to.roleArn,
        roleSessionName: to.sessionName,
        durationSeconds: 3600,
      },
      responseElements: {
        credentials: {
          accessKeyId: to.accessKeyId,
          sessionToken: 'REDACTED',
          expiration: new Date(new Date(timestamp).getTime() + 3600000).toISOString(),
        },
        assumedRoleUser: {
          assumedRoleId: to.principalId,
          arn: to.assumedRoleArn,
        },
      },
      requestID: faker.string.uuid(),
      eventID: faker.string.uuid(),
      readOnly: true,
      resources: [{ accountId: account.id, type: 'AWS::IAM::Role', ARN: to.roleArn }],
      eventType: 'AwsApiCall',
      managementEvent: true,
      recipientAccountId: account.id,
      eventCategory: 'Management',
    };

    const service = this.serviceAttachmentFor('sts.amazonaws.com');
    return {
      '@timestamp': timestamp,
      agent: this.buildCentralAgent(org),
      message: JSON.stringify(rawEvent),
      tags: CLOUDTRAIL_TAGS,
      data_stream: { namespace: 'default', type: 'logs', dataset: 'aws.cloudtrail' },
      cloud: this.buildCloud(account.id, 'us-east-1'),
      ...(service && { service }),
    } as IntegrationDocument;
  }

  /**
   * S3 data event (GetObject / ListObjects / PutObject). The pipeline puts the object and
   * bucket ARNs from `resources` on the target side and the bucket name in related.entity.
   */
  private createS3DataEvent(
    session: FederatedSession,
    account: CloudAccount,
    org: Organization,
    bucketArn: string,
    objectKey: string,
    eventName: 'GetObject' | 'ListObjects' | 'PutObject',
    timestamp: string,
    region: string,
    sourceIp: string,
  ): IntegrationDocument {
    const bucketName = bucketArn.replace('arn:aws:s3:::', '');
    const isList = eventName === 'ListObjects';
    const bytesOut = isList
      ? faker.number.int({ min: 512, max: 4096 })
      : faker.number.int({ min: 20_000, max: 50_000_000 });

    const rawEvent = {
      eventVersion: '1.09',
      userIdentity: this.assumedRoleIdentity(session, timestamp, !session.ec2RoleDelivery),
      eventTime: timestamp,
      eventSource: 's3.amazonaws.com',
      eventName,
      awsRegion: region,
      sourceIPAddress: sourceIp,
      userAgent: session.ec2RoleDelivery
        ? '[aws-sdk-go-v2/1.24.0 os/linux lang/go#1.21.5 md/GOOS#linux md/GOARCH#amd64 api/s3#1.47.5]'
        : faker.helpers.arrayElement(AWS_USER_AGENTS),
      requestParameters: {
        bucketName,
        Host: `${bucketName}.s3.${region}.amazonaws.com`,
        ...(isList
          ? { prefix: objectKey.substring(0, objectKey.lastIndexOf('/') + 1) }
          : { key: objectKey }),
      },
      responseElements: null,
      additionalEventData: {
        SignatureVersion: 'SigV4',
        CipherSuite: 'TLS_AES_128_GCM_SHA256',
        bytesTransferredIn: 0,
        AuthenticationMethod: 'AuthHeader',
        'x-amz-id-2': faker.string.alphanumeric(76),
        bytesTransferredOut: bytesOut,
      },
      requestID: faker.string.alphanumeric(16).toUpperCase(),
      eventID: faker.string.uuid(),
      readOnly: eventName !== 'PutObject',
      resources: [
        ...(isList ? [] : [{ type: 'AWS::S3::Object', ARN: `${bucketArn}/${objectKey}` }]),
        { accountId: account.id, type: 'AWS::S3::Bucket', ARN: bucketArn },
      ],
      eventType: 'AwsApiCall',
      managementEvent: false,
      recipientAccountId: account.id,
      eventCategory: 'Data',
      tlsDetails: {
        tlsVersion: 'TLSv1.3',
        cipherSuite: 'TLS_AES_128_GCM_SHA256',
        clientProvidedHostHeader: `${bucketName}.s3.${region}.amazonaws.com`,
      },
    };

    const service = this.serviceAttachmentFor('s3.amazonaws.com');
    return {
      '@timestamp': timestamp,
      agent: this.buildCentralAgent(org),
      message: JSON.stringify(rawEvent),
      tags: CLOUDTRAIL_TAGS,
      data_stream: { namespace: 'default', type: 'logs', dataset: 'aws.cloudtrail' },
      cloud: this.buildCloud(account.id, region),
      ...(service && { service }),
    } as IntegrationDocument;
  }

  /**
   * Generate events for service accounts
   */
  private generateServiceAccountEvents(
    iamUser: CloudIamUser,
    org: Organization,
    resources: CloudResource[],
  ): IntegrationDocument[] {
    const events: IntegrationDocument[] = [];
    const account = org.cloudAccounts.find((a) => a.id === iamUser.accountId);
    const accountResources = resources.filter((r) => r.accountId === iamUser.accountId);
    const eventCount = faker.number.int({ min: 10, max: 25 });
    const accessKeyId = this.generatePermanentAccessKeyId();

    for (let i = 0; i < eventCount; i++) {
      const timestamp = this.getRandomTimestamp(48);
      const service = faker.helpers.arrayElement(['S3', 'EC2', 'Lambda', 'CloudTrail', 'KMS']);
      const region = faker.helpers.arrayElement(AWS_REGIONS);

      events.push(
        this.createServiceAccountApiEvent(
          iamUser,
          account!,
          org,
          service,
          timestamp,
          accessKeyId,
          region,
          accountResources,
        ),
      );
    }

    // Generate events that produce host.target.entity.id (2-4 per batch)
    const ec2Instances = accountResources.filter((r) => r.subType === 'AWS EC2 Instance');
    if (ec2Instances.length > 0) {
      const instanceEventCount = faker.number.int({ min: 2, max: 4 });
      for (let i = 0; i < instanceEventCount; i++) {
        const timestamp = this.getRandomTimestamp(48);
        const targetInstance = faker.helpers.arrayElement(ec2Instances);

        events.push(
          this.createHostTargetEvent(
            {
              type: 'IAMUser',
              principalId: this.generatePrincipalId(),
              arn: iamUser.arn,
              accountId: account!.id,
              accessKeyId,
              userName: iamUser.userName,
            },
            account!,
            timestamp,
            targetInstance,
            org,
          ),
        );
      }
    }

    return events;
  }

  /**
   * Generate console login events
   */
  private generateConsoleLoginEvents(
    iamUser: CloudIamUser,
    employee: Employee,
    org: Organization,
  ): IntegrationDocument[] {
    const events: IntegrationDocument[] = [];
    const account = org.cloudAccounts.find((a) => a.id === iamUser.accountId);
    const loginCount = faker.number.int({ min: 1, max: 2 });

    for (let i = 0; i < loginCount; i++) {
      const timestamp = this.getRandomTimestamp(48);
      const isFailure = faker.number.float() < 0.05; // 5% failure rate

      events.push(
        this.createConsoleLoginEvent(iamUser, employee, account!, org, timestamp, isFailure),
      );
    }

    return events;
  }

  /**
   * Generate SSM StartSession events (user accesses host)
   */
  private generateStartSessionEvents(
    iamUser: CloudIamUser,
    employee: Employee,
    org: Organization,
    awsHosts: Host[],
  ): IntegrationDocument[] {
    const events: IntegrationDocument[] = [];
    const account = org.cloudAccounts.find((a) => a.id === iamUser.accountId);
    const sessionCount = faker.number.int({ min: 2, max: 4 });

    const federationRoles = this.federationRolesFor(employee, iamUser.accountId);

    for (let i = 0; i < sessionCount; i++) {
      const host = faker.helpers.arrayElement(awsHosts);
      const timestamp = this.getRandomTimestamp(48);
      const session = this.newSession(faker.helpers.arrayElement(federationRoles), employee.email);

      events.push(
        this.createStartSessionEvent(
          account!,
          host,
          session,
          timestamp,
          org,
          `${employee.email}-${faker.string.alphanumeric(8).toLowerCase()}`,
        ),
      );
    }

    return events;
  }

  /**
   * Create SSM StartSession event (a role session opens a Session Manager session on a host)
   */
  private createStartSessionEvent(
    account: CloudAccount,
    host: Host,
    session: FederatedSession,
    timestamp: string,
    org: Organization,
    sessionId: string,
  ): IntegrationDocument {
    const eventId = faker.string.uuid();
    const sourceIp = faker.internet.ipv4();
    const region = host.region || faker.helpers.arrayElement(AWS_REGIONS);

    const rawEvent = {
      eventVersion: '1.08',
      userIdentity: this.assumedRoleIdentity(session, timestamp),
      eventTime: timestamp,
      eventSource: 'ssm.amazonaws.com',
      eventName: 'StartSession',
      awsRegion: region,
      sourceIPAddress: sourceIp,
      userAgent: faker.helpers.arrayElement(AWS_USER_AGENTS),
      requestParameters: {
        target: host.id,
      },
      responseElements: {
        sessionId,
        tokenValue: 'REDACTED',
        streamUrl: `wss://ssmmessages.${region}.amazonaws.com/v1/data-channel/${sessionId}`,
      },
      eventID: eventId,
      readOnly: false,
      eventType: 'AwsApiCall',
      managementEvent: true,
      recipientAccountId: account.id,
    };

    const service = this.serviceAttachmentFor('ssm.amazonaws.com');
    return {
      '@timestamp': timestamp,
      agent: this.buildCentralAgent(org),
      message: JSON.stringify(rawEvent),
      // actor_target_mapping lets the pipeline derive user.entity.id (the issuing role) and
      // host.target.entity.id / host.target.id (the instance) from the raw event.
      tags: CLOUDTRAIL_TAGS,
      data_stream: { namespace: 'default', type: 'logs', dataset: 'aws.cloudtrail' },
      cloud: this.buildCloud(account.id, region),
      host: { id: host.id, name: host.name },
      ...(service && { service }),
    } as IntegrationDocument;
  }

  /**
   * Create AssumeRoleWithSAML event: the Okta user federates into the session's role
   */
  private createAssumeRoleEvent(
    employee: Employee,
    account: CloudAccount,
    org: Organization,
    session: FederatedSession,
    timestamp: string,
  ): IntegrationDocument {
    const eventId = faker.string.uuid();
    const sourceIp = faker.internet.ipv4();
    const { roleArn, assumedRoleArn, accessKeyId } = session;

    const rawEvent: Record<string, unknown> = {
      eventVersion: '1.08',
      userIdentity: {
        type: 'SAMLUser',
        principalId: `${employee.email}:${employee.oktaUserId}`,
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
          assumedRoleId: session.principalId,
          arn: assumedRoleArn,
        },
        issuer: `https://${org.name.toLowerCase().replace(/\s+/g, '')}.okta.com`,
      },
      resources: [{ accountId: account.id, type: 'AWS::IAM::Role', ARN: roleArn }],
      eventID: eventId,
      readOnly: false,
      eventType: 'AwsApiCall',
      managementEvent: true,
      recipientAccountId: account.id,
    };

    const service = this.serviceAttachmentFor('sts.amazonaws.com');
    return {
      '@timestamp': timestamp,
      agent: this.buildCentralAgent(org),
      message: JSON.stringify(rawEvent),
      tags: CLOUDTRAIL_TAGS,
      data_stream: { namespace: 'default', type: 'logs', dataset: 'aws.cloudtrail' },
      cloud: this.buildCloud(account.id, 'us-east-1'),
      ...(service && { service }),
    } as IntegrationDocument;
  }

  /**
   * Create GetCallerIdentity event
   */
  private createGetCallerIdentityEvent(
    account: CloudAccount,
    org: Organization,
    session: FederatedSession,
    timestamp: string,
  ): IntegrationDocument {
    const eventId = faker.string.uuid();
    const sourceIp = faker.internet.ipv4();
    const userAgent = faker.helpers.arrayElement(AWS_USER_AGENTS);

    const rawEvent = {
      eventVersion: '1.08',
      userIdentity: this.assumedRoleIdentity(session, timestamp, !session.ec2RoleDelivery),
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

    const service = this.serviceAttachmentFor('sts.amazonaws.com');
    return {
      '@timestamp': timestamp,
      agent: this.buildCentralAgent(org),
      message: JSON.stringify(rawEvent),
      tags: CLOUDTRAIL_TAGS,
      data_stream: { namespace: 'default', type: 'logs', dataset: 'aws.cloudtrail' },
      cloud: this.buildCloud(account.id, 'us-east-1'),
      ...(service && { service }),
    } as IntegrationDocument;
  }

  /**
   * Create generic API call event for federated user
   */
  private createApiCallEvent(
    account: CloudAccount,
    org: Organization,
    service: string,
    session: FederatedSession,
    timestamp: string,
    region: string,
    resources: CloudResource[],
    fixedEventName?: string,
  ): IntegrationDocument {
    const eventId = faker.string.uuid();
    const sourceIp = faker.internet.ipv4();
    const userAgent = faker.helpers.arrayElement(AWS_USER_AGENTS);
    const serviceConfig = AWS_API_EVENTS[service];
    const eventName = fixedEventName ?? faker.helpers.arrayElement(serviceConfig.events);

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
      userIdentity: this.assumedRoleIdentity(session, timestamp),
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

    const serviceAttachment = this.serviceAttachmentFor(serviceConfig.eventSource);
    return {
      '@timestamp': timestamp,
      agent: this.buildCentralAgent(org),
      message: JSON.stringify(rawEvent),
      tags: CLOUDTRAIL_TAGS,
      data_stream: { namespace: 'default', type: 'logs', dataset: 'aws.cloudtrail' },
      cloud: this.buildCloud(account.id, region),
      ...(serviceAttachment && { service: serviceAttachment }),
    } as IntegrationDocument;
  }

  /**
   * Create API event for service account (IAMUser type)
   */
  private createServiceAccountApiEvent(
    iamUser: CloudIamUser,
    account: CloudAccount,
    org: Organization,
    service: string,
    timestamp: string,
    accessKeyId: string,
    region: string,
    _resources: CloudResource[],
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

    const serviceAttachment = this.serviceAttachmentFor(serviceConfig.eventSource);
    return {
      '@timestamp': timestamp,
      agent: this.buildCentralAgent(org),
      message: JSON.stringify(rawEvent),
      tags: CLOUDTRAIL_TAGS,
      data_stream: { namespace: 'default', type: 'logs', dataset: 'aws.cloudtrail' },
      cloud: this.buildCloud(account.id, region),
      ...(serviceAttachment && { service: serviceAttachment }),
    } as IntegrationDocument;
  }

  /**
   * Create API event for service account (IAMUser type)
   */
  private createConsoleLoginEvent(
    iamUser: CloudIamUser,
    employee: Employee,
    account: CloudAccount,
    org: Organization,
    timestamp: string,
    isFailure: boolean,
  ): IntegrationDocument {
    const eventId = faker.string.uuid();
    const sourceIp = faker.internet.ipv4();
    const session = this.newSession(
      faker.helpers.arrayElement(this.federationRolesFor(employee, iamUser.accountId)),
      employee.email,
    );

    const rawEvent: Record<string, unknown> = {
      eventVersion: '1.08',
      userIdentity: this.assumedRoleIdentity(session, timestamp),
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

    const service = this.serviceAttachmentFor('signin.amazonaws.com');
    return {
      '@timestamp': timestamp,
      agent: this.buildCentralAgent(org),
      message: JSON.stringify(rawEvent),
      tags: CLOUDTRAIL_TAGS,
      data_stream: { namespace: 'default', type: 'logs', dataset: 'aws.cloudtrail' },
      cloud: this.buildCloud(account.id, 'us-east-1'),
      ...(service && { service }),
    } as IntegrationDocument;
  }

  /**
   * Create an event that the ingest pipeline maps to host.target.entity.id.
   * Uses HOST_TARGET_EVENTS which produce the exact parameter shapes that
   * enrichEc2 / enrichSsm / enrichEc2InstanceConnect add to enrichCtx.target.
   */
  private createHostTargetEvent(
    userIdentity: Record<string, unknown>,
    account: CloudAccount,
    timestamp: string,
    instance: CloudResource,
    org: Organization,
  ): IntegrationDocument {
    const hostTargetEvent = faker.helpers.arrayElement(HOST_TARGET_EVENTS);
    const params = hostTargetEvent.buildParams(instance.id);

    const rawEvent: Record<string, unknown> = {
      eventVersion: '1.08',
      userIdentity,
      eventTime: timestamp,
      eventSource: hostTargetEvent.eventSource,
      eventName: hostTargetEvent.eventName,
      awsRegion: instance.region,
      sourceIPAddress: faker.internet.ipv4(),
      userAgent: faker.helpers.arrayElement(AWS_USER_AGENTS),
      requestParameters: params.requestParameters,
      ...(params.responseElements !== undefined && {
        responseElements: params.responseElements,
      }),
      eventID: faker.string.uuid(),
      readOnly: hostTargetEvent.eventName === 'GetPasswordData',
      eventType: 'AwsApiCall',
      managementEvent: true,
      recipientAccountId: account.id,
    };

    const service = this.serviceAttachmentFor(hostTargetEvent.eventSource);
    return {
      '@timestamp': timestamp,
      agent: this.buildCentralAgent(org),
      message: JSON.stringify(rawEvent),
      tags: CLOUDTRAIL_TAGS,
      data_stream: { namespace: 'default', type: 'logs', dataset: 'aws.cloudtrail' },
      cloud: this.buildCloud(account.id, instance.region),
      ...(service && { service }),
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
