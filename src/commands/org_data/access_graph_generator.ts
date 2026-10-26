/**
 * IAM access model for the simulated organization.
 *
 * Builds the pieces that let the entity graph walk a multi-hop access path from a
 * compromised identity to a crown-jewel resource:
 *
 *   user -> Okta group -> federation role -> chained role -> EC2 instance
 *        -> instance role -> S3 bucket
 *
 * Every id produced here is the same value the Okta, Cloud Asset Inventory, CloudTrail
 * and access-graph emitters write, so the chain is consistent across indices.
 */

import { faker } from '@faker-js/faker';
import {
  type AccessEdge,
  type AccessNode,
  type AccessPathScenario,
  type AccessRelation,
  type CloudAccount,
  type CloudIamPolicy,
  type CloudIamRole,
  type CloudIamRolePurpose,
  type CloudIamUser,
  type CloudInstanceProfile,
  type CloudResource,
  type Employee,
  type Host,
  type IamPolicyDocument,
  type IamPolicyStatement,
  type IdpGroupRoleMapping,
  type OktaGroup,
  type Organization,
} from './types.ts';
import {
  IAM_INSTANCE_ROLES,
  IAM_SERVICE_ROLES,
  IDP_FEDERATION_GROUPS,
} from './data/cloud_resources.ts';

export interface IamModelInput {
  accounts: CloudAccount[];
  hosts: Host[];
  cloudResources: CloudResource[];
  oktaGroups: OktaGroup[];
  employees: Employee[];
  cloudIamUsers: CloudIamUser[];
  orgPrefix: string;
}

export interface IamModel {
  roles: CloudIamRole[];
  policies: CloudIamPolicy[];
  instanceProfiles: CloudInstanceProfile[];
  groupRoleMappings: IdpGroupRoleMapping[];
  s3BucketPolicies: Record<string, IamPolicyDocument>;
  accessPaths: AccessPathScenario[];
  /** Asset-inventory resources for the roles, policies and the crown-jewel bucket. */
  cloudResources: CloudResource[];
}

const SSM_CORE_POLICY_ARN = 'arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore';

/**
 * AWS-managed policies referenced by generated roles, with an approximation of their
 * document so the policy asset has something to show.
 */
const AWS_MANAGED_POLICY_DOCUMENTS: Record<string, IamPolicyStatement> = {
  [SSM_CORE_POLICY_ARN]: {
    Effect: 'Allow',
    Action: [
      'ssm:DescribeAssociation',
      'ssm:GetDocument',
      'ssm:UpdateInstanceInformation',
      'ssmmessages:CreateControlChannel',
      'ssmmessages:CreateDataChannel',
      'ssmmessages:OpenControlChannel',
      'ssmmessages:OpenDataChannel',
      'ec2messages:GetMessages',
    ],
    Resource: '*',
  },
};

const toEnvShort = (environment: CloudAccount['environment']): string =>
  environment === 'production' ? 'prod' : environment === 'staging' ? 'staging' : 'dev';

const toPascal = (value: string): string =>
  value
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

const newRoleId = (): string => `AROA${faker.string.alphanumeric(17).toUpperCase()}`;
const newPolicyId = (): string => `ANPA${faker.string.alphanumeric(17).toUpperCase()}`;
const newProfileId = (): string => `AIPA${faker.string.alphanumeric(17).toUpperCase()}`;
const pastDate = (): string => faker.date.past({ years: 2 }).toISOString();

export const instanceArn = (host: Host, accountId: string): string =>
  `arn:aws:ec2:${host.region}:${accountId}:instance/${host.id}`;

const asArray = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

/**
 * Extract the asset entity ids named by the Allow statements of a policy document:
 * bucket ARNs (with or without an object suffix), EC2 instance ids and role ARNs.
 */
export const resourceIdsFromDocument = (document: IamPolicyDocument): string[] => {
  const ids = new Set<string>();
  for (const statement of document.Statement) {
    if (statement.Effect !== 'Allow') continue;
    for (const resource of asArray(statement.Resource)) {
      if (resource === '*') continue;
      const bucket = resource.match(/^(arn:aws:s3:::[^/]+)(\/.*)?$/);
      if (bucket) {
        ids.add(bucket[1]);
        continue;
      }
      const instance = resource.match(/^arn:aws:ec2:[^:]*:\d{12}:instance\/(i-[a-z0-9]+)$/);
      if (instance) {
        ids.add(instance[1]);
        continue;
      }
      if (/^arn:aws:iam::\d{12}:role\//.test(resource)) {
        ids.add(resource);
      }
    }
  }
  return Array.from(ids);
};

const relationForResource = (resourceId: string): AccessRelation | undefined => {
  if (resourceId.startsWith('i-')) return 'can_connect';
  if (resourceId.startsWith('arn:aws:s3:::')) return 'grants_access_to';
  return undefined;
};

/**
 * Generate the IAM access model for every AWS account in the organization.
 * Mutates `hosts` (instance profile assignment) and `employees` (Okta group membership).
 */
export const generateIamModel = (input: IamModelInput): IamModel => {
  const { accounts, hosts, cloudResources, oktaGroups, employees, cloudIamUsers, orgPrefix } =
    input;

  const model: IamModel = {
    roles: [],
    policies: [],
    instanceProfiles: [],
    groupRoleMappings: [],
    s3BucketPolicies: {},
    accessPaths: [],
    cloudResources: [],
  };

  const awsAccounts = accounts.filter((a) => a.provider === 'aws');
  if (awsAccounts.length === 0) return model;

  const prodAccount = awsAccounts.find((a) => a.environment === 'production') || awsAccounts[0];
  const roleArn = (account: CloudAccount, name: string, path: string = '/'): string =>
    `arn:aws:iam::${account.id}:role${path}${name}`;
  const policyArn = (account: CloudAccount, name: string): string =>
    `arn:aws:iam::${account.id}:policy/${name}`;

  const addPolicy = (
    account: CloudAccount,
    name: string,
    description: string,
    statements: IamPolicyStatement[],
  ): CloudIamPolicy => {
    const document: IamPolicyDocument = { Version: '2012-10-17', Statement: statements };
    const policy: CloudIamPolicy = {
      arn: policyArn(account, name),
      name,
      policyId: newPolicyId(),
      path: '/',
      accountId: account.id,
      accountName: account.name,
      description,
      isAwsManaged: false,
      document,
      resourceIds: resourceIdsFromDocument(document),
      createdAt: pastDate(),
    };
    model.policies.push(policy);
    return policy;
  };

  const managedPolicyArns = new Set<string>();
  const ensureManagedPolicy = (arn: string, account: CloudAccount): void => {
    if (managedPolicyArns.has(arn)) return;
    managedPolicyArns.add(arn);
    const name = arn.substring(arn.lastIndexOf('/') + 1);
    const statement: IamPolicyStatement = AWS_MANAGED_POLICY_DOCUMENTS[arn] ?? {
      Effect: 'Allow',
      Action: [`${name.replace(/^(Amazon|AWS)/, '').replace(/Policy$/, '')}:*`],
      Resource: '*',
    };
    model.policies.push({
      arn,
      name,
      policyId: newPolicyId(),
      path: arn.includes('/service-role/')
        ? '/service-role/'
        : arn.includes('/aws-service-role/')
          ? '/aws-service-role/'
          : '/',
      accountId: account.id,
      accountName: account.name,
      description: `AWS managed policy ${name}`,
      isAwsManaged: true,
      document: { Version: '2012-10-17', Statement: [statement] },
      resourceIds: [],
      createdAt: '2020-01-01T00:00:00.000Z',
    });
  };

  const addRole = (
    account: CloudAccount,
    name: string,
    purpose: CloudIamRolePurpose,
    description: string,
    trust: {
      principalArns?: string[];
      services?: string[];
      federatedArns?: string[];
    },
    attachedPolicyArns: string[],
    inlinePolicies: Array<{ name: string; document: IamPolicyDocument }> = [],
    path: string = '/',
  ): CloudIamRole => {
    const statements: IamPolicyStatement[] = [];
    if (trust.principalArns?.length) {
      statements.push({
        Effect: 'Allow',
        Principal: { AWS: trust.principalArns },
        Action: 'sts:AssumeRole',
      });
    }
    if (trust.services?.length) {
      statements.push({
        Effect: 'Allow',
        Principal: { Service: trust.services },
        Action: 'sts:AssumeRole',
      });
    }
    for (const federated of trust.federatedArns ?? []) {
      statements.push({
        Effect: 'Allow',
        Principal: { Federated: federated },
        Action: 'sts:AssumeRoleWithSAML',
        Condition: { StringEquals: { 'SAML:aud': 'https://signin.aws.amazon.com/saml' } },
      });
    }
    for (const arn of attachedPolicyArns) {
      if (arn.startsWith('arn:aws:iam::aws:policy/')) ensureManagedPolicy(arn, account);
    }
    const role: CloudIamRole = {
      arn: roleArn(account, name, path),
      name,
      roleId: newRoleId(),
      path,
      accountId: account.id,
      accountName: account.name,
      description,
      purpose,
      trustPolicy: { Version: '2012-10-17', Statement: statements },
      trustedPrincipalArns: trust.principalArns ?? [],
      trustedServices: trust.services ?? [],
      trustedFederatedArns: trust.federatedArns ?? [],
      attachedPolicyArns,
      inlinePolicies: inlinePolicies.map((p) => ({
        ...p,
        resourceIds: resourceIdsFromDocument(p.document),
      })),
      maxSessionDuration: purpose === 'federation' ? 43200 : 3600,
      createdAt: pastDate(),
    };
    model.roles.push(role);
    return role;
  };

  const addInstanceProfile = (account: CloudAccount, role: CloudIamRole): CloudInstanceProfile => {
    const profile: CloudInstanceProfile = {
      arn: `arn:aws:iam::${account.id}:instance-profile/${role.name}`,
      name: role.name,
      id: newProfileId(),
      accountId: account.id,
      roleArn: role.arn,
      createdAt: role.createdAt,
    };
    model.instanceProfiles.push(profile);
    return profile;
  };

  const bucketStatements = (bucketArn: string, actions: string[]): IamPolicyStatement[] => [
    {
      Effect: 'Allow',
      Action: actions,
      Resource: [bucketArn, `${bucketArn}/*`],
    },
  ];

  const samlProviderArn = (account: CloudAccount): string =>
    `arn:aws:iam::${account.id}:saml-provider/Okta`;

  // Deterministic ARNs for the production chain so the trust policies can reference roles
  // before they are created.
  const prodAdminRoleArn = roleArn(prodAccount, 'okta-prod-admin');
  const dataPipelineRoleArn = roleArn(prodAccount, 'data-pipeline');

  // Crown-jewel bucket in production: the terminal node of the planted access path.
  const crownJewelName = `${orgPrefix}-prod-customer-pii-${faker.string.alphanumeric(6).toLowerCase()}`;
  const crownJewelArn = `arn:aws:s3:::${crownJewelName}`;
  model.cloudResources.push({
    id: crownJewelArn,
    name: crownJewelName,
    type: 'Storage Bucket',
    subType: 'AWS S3 Bucket',
    provider: 'aws',
    region: 'us-east-1',
    accountId: prodAccount.id,
    accountName: prodAccount.name,
    tags: {
      Environment: 'production',
      Team: 'data',
      Service: 'analytics',
      DataClassification: 'restricted',
      CrownJewel: 'true',
    },
  });

  const federationGroupByName = new Map(oktaGroups.map((g) => [g.name, g]));
  const perAccountRoles = new Map<string, Record<string, CloudIamRole>>();

  for (const account of awsAccounts) {
    const env = toEnvShort(account.environment);
    const isProd = account.id === prodAccount.id;
    const accountHosts = hosts.filter(
      (h) => h.cloudProvider === 'aws' && h.cloudAccountId === account.id,
    );
    const accountBuckets = cloudResources.filter(
      (r) => r.provider === 'aws' && r.subType === 'AWS S3 Bucket' && r.accountId === account.id,
    );
    const dataLakeBucket = accountBuckets[0];

    // --- Policies -----------------------------------------------------------------------
    const readOnly = addPolicy(
      account,
      `${toPascal(orgPrefix)}ReadOnlyPlatform`,
      'Read-only access to platform resources for engineers',
      [
        {
          Sid: 'ReadOnlyPlatform',
          Effect: 'Allow',
          Action: [
            'ec2:Describe*',
            's3:ListAllMyBuckets',
            's3:GetBucketLocation',
            'iam:List*',
            'iam:Get*',
            'rds:Describe*',
            'lambda:List*',
            'lambda:Get*',
            'cloudtrail:Describe*',
            'kms:List*',
            'kms:Describe*',
          ],
          Resource: '*',
        },
      ],
    );
    const dataLake = dataLakeBucket
      ? addPolicy(
          account,
          `S3DataLakeAccess-${env}`,
          `Read/write access to the ${env} data lake bucket`,
          bucketStatements(dataLakeBucket.id, ['s3:GetObject', 's3:PutObject', 's3:ListBucket']),
        )
      : undefined;
    const ssmAccess = addPolicy(
      account,
      `SsmSessionAccess-${env}`,
      `Session Manager access to ${env} EC2 instances`,
      [
        {
          Sid: 'StartSessions',
          Effect: 'Allow',
          Action: ['ssm:StartSession', 'ssm:TerminateSession', 'ssm:ResumeSession'],
          Resource:
            accountHosts.length > 0 ? accountHosts.map((h) => instanceArn(h, account.id)) : '*',
        },
        {
          Sid: 'DescribeSessions',
          Effect: 'Allow',
          Action: [
            'ssm:DescribeInstanceInformation',
            'ssm:DescribeSessions',
            'ec2:DescribeInstances',
          ],
          Resource: '*',
        },
      ],
    );
    const crownJewelRead = isProd
      ? addPolicy(
          account,
          'S3CustomerPiiRead',
          'Read access to the customer PII export bucket (restricted)',
          bucketStatements(crownJewelArn, ['s3:GetObject', 's3:ListBucket']),
        )
      : undefined;

    // --- Federation roles (Okta group -> role) ----------------------------------------------
    const roles: Record<string, CloudIamRole> = {};
    for (const federation of IDP_FEDERATION_GROUPS) {
      if (!federation.allAccounts && !isProd) continue;
      const group = federationGroupByName.get(federation.groupName);
      if (!group) continue;

      const attached: string[] = [readOnly.arn];
      const inline: Array<{ name: string; document: IamPolicyDocument }> = [];
      if (federation.roleName === 'okta-developer' && dataLake) attached.push(dataLake.arn);
      if (federation.roleName === 'okta-data-engineer' && dataLake) attached.push(dataLake.arn);
      if (federation.roleName === 'okta-prod-admin') {
        attached.push(ssmAccess.arn);
        inline.push({
          name: 'AssumeDataPipeline',
          document: {
            Version: '2012-10-17',
            Statement: [
              { Effect: 'Allow', Action: 'sts:AssumeRole', Resource: dataPipelineRoleArn },
            ],
          },
        });
      }

      const role = addRole(
        account,
        federation.roleName,
        'federation',
        `${federation.description} (assumed via Okta SAML)`,
        { federatedArns: [samlProviderArn(account)] },
        attached,
        inline,
      );
      roles[federation.roleName] = role;
      model.groupRoleMappings.push({
        oktaGroupId: group.id,
        oktaGroupName: group.name,
        roleArn: role.arn,
        accountId: account.id,
      });
    }

    // --- Role chaining: data-pipeline is assumed from the prod admin role --------------------
    if (isProd) {
      roles['data-pipeline'] = addRole(
        account,
        'data-pipeline',
        'pipeline',
        'Batch data pipeline role, assumed by production administrators for maintenance',
        { principalArns: [prodAdminRoleArn] },
        [ssmAccess.arn, ...(dataLake ? [dataLake.arn] : [])],
      );
    }

    // --- Instance roles and profiles ----------------------------------------------------------
    const profileByRoleName = new Map<string, CloudInstanceProfile>();
    for (const instanceRole of IAM_INSTANCE_ROLES) {
      const attached = [SSM_CORE_POLICY_ARN];
      if (instanceRole.name === 'ec2-app-server' && crownJewelRead)
        attached.push(crownJewelRead.arn);
      if (instanceRole.name === 'ec2-worker' && dataLake) attached.push(dataLake.arn);
      if (instanceRole.name === 'ec2-ci-runner') attached.push(readOnly.arn);
      const role = addRole(
        account,
        instanceRole.name,
        'instance',
        instanceRole.description,
        { services: ['ec2.amazonaws.com'] },
        attached,
      );
      roles[instanceRole.name] = role;
      profileByRoleName.set(instanceRole.name, addInstanceProfile(account, role));
    }
    for (const host of accountHosts) {
      const match =
        IAM_INSTANCE_ROLES.find((r) => r.purposes.includes(host.purpose)) ?? IAM_INSTANCE_ROLES[1];
      host.instanceProfileArn = profileByRoleName.get(match.name)?.arn;
    }

    // --- Service and service-linked roles -----------------------------------------------------
    for (const serviceRole of IAM_SERVICE_ROLES) {
      const path = serviceRole.serviceLinked
        ? `/aws-service-role/${serviceRole.servicePrincipal}/`
        : '/service-role/';
      roles[serviceRole.name] = addRole(
        account,
        serviceRole.name,
        'service',
        `Service role assumed by ${serviceRole.servicePrincipal}`,
        { services: [serviceRole.servicePrincipal] },
        serviceRole.managedPolicyArns,
        [],
        path,
      );
    }

    perAccountRoles.set(account.id, roles);

    // --- Bucket policies ----------------------------------------------------------------------
    if (dataLake && dataLakeBucket) {
      const principals = [
        roles['okta-developer']?.arn,
        roles['okta-data-engineer']?.arn,
        roles['data-pipeline']?.arn,
        roles['ec2-worker']?.arn,
      ].filter((arn): arn is string => Boolean(arn));
      model.s3BucketPolicies[dataLakeBucket.id] = {
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'DataLakeAccess',
            Effect: 'Allow',
            Principal: { AWS: principals },
            Action: ['s3:GetObject', 's3:PutObject', 's3:ListBucket'],
            Resource: [dataLakeBucket.id, `${dataLakeBucket.id}/*`],
          },
        ],
      };
    }
    if (isProd) {
      model.s3BucketPolicies[crownJewelArn] = {
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'AppServerRead',
            Effect: 'Allow',
            Principal: { AWS: [roles['ec2-app-server'].arn] },
            Action: ['s3:GetObject', 's3:ListBucket'],
            Resource: [crownJewelArn, `${crownJewelArn}/*`],
          },
          {
            Sid: 'DenyInsecureTransport',
            Effect: 'Deny',
            Principal: { AWS: '*' },
            Action: 's3:*',
            Resource: [crownJewelArn, `${crownJewelArn}/*`],
            Condition: { Bool: { 'aws:SecureTransport': 'false' } },
          },
        ],
      };
    }
  }

  // --- Cross-account roles in non-production accounts, trusted by the prod admin role ------
  for (const account of awsAccounts) {
    if (account.id === prodAccount.id) continue;
    const roles = perAccountRoles.get(account.id) ?? {};
    const readOnly = model.policies.find(
      (p) => p.accountId === account.id && p.name.endsWith('ReadOnlyPlatform'),
    );
    roles.CrossAccountAccessRole = addRole(
      account,
      'CrossAccountAccessRole',
      'cross_account',
      'Cross-account access from the production administrators',
      { principalArns: [prodAdminRoleArn] },
      readOnly ? [readOnly.arn] : [],
    );
  }

  // --- Asset-inventory resources for roles and policies -------------------------------------
  for (const role of model.roles) {
    model.cloudResources.push({
      id: role.arn,
      name: role.name,
      type: 'Service Account',
      subType: 'AWS IAM Role',
      provider: 'aws',
      region: 'us-east-1',
      accountId: role.accountId,
      accountName: role.accountName,
      tags: { Purpose: role.purpose },
    });
  }
  for (const policy of model.policies) {
    model.cloudResources.push({
      id: policy.arn,
      name: policy.name,
      type: 'Access Management',
      subType: 'AWS IAM Policy',
      provider: 'aws',
      region: 'us-east-1',
      accountId: policy.accountId,
      accountName: policy.accountName,
      tags: { Managed: policy.isAwsManaged ? 'aws' : 'customer' },
    });
  }

  // --- Okta group membership for the federation groups -------------------------------------
  const groupId = (name: string): string | undefined => federationGroupByName.get(name)?.id;
  const addMembership = (employee: Employee, name: string): void => {
    const id = groupId(name);
    if (id && !employee.oktaGroupIds.includes(id)) employee.oktaGroupIds.push(id);
  };
  const awsEmployees = employees.filter((e) => e.hasAwsAccess);
  for (const employee of awsEmployees) addMembership(employee, 'AWS-Access');

  const johnDoe = awsEmployees.find((e) => e.userName === 'john.doe');
  const infraEngineers = awsEmployees.filter(
    (e) =>
      e !== johnDoe &&
      /DevOps|Site Reliability|Platform Engineer|Infrastructure Engineer/.test(e.role),
  );
  const prodAdmins = [...(johnDoe ? [johnDoe] : []), ...infraEngineers.slice(0, 3)];
  if (prodAdmins.length === 0 && awsEmployees.length > 0) prodAdmins.push(awsEmployees[0]);
  for (const employee of prodAdmins) addMembership(employee, 'AWS-Prod-Admins');

  for (const employee of awsEmployees.filter((e) => /Data Engineer/.test(e.role)).slice(0, 5)) {
    addMembership(employee, 'AWS-Data-Engineers');
  }

  // --- The planted access path ----------------------------------------------------------------
  const prodRoles = perAccountRoles.get(prodAccount.id);
  const seed = prodAdmins[0];
  const prodAdminGroup = federationGroupByName.get('AWS-Prod-Admins');
  if (seed && prodRoles && prodAdminGroup) {
    let instanceHost = hosts.find(
      (h) =>
        h.cloudProvider === 'aws' &&
        h.cloudAccountId === prodAccount.id &&
        h.instanceProfileArn?.endsWith('/ec2-app-server'),
    );
    if (!instanceHost) {
      instanceHost = hosts.find((h) => h.cloudProvider === 'aws');
      if (instanceHost) {
        instanceHost.cloudAccountId = prodAccount.id;
        instanceHost.purpose = 'api-server';
        instanceHost.instanceProfileArn = model.instanceProfiles.find(
          (p) => p.accountId === prodAccount.id && p.name === 'ec2-app-server',
        )?.arn;
      }
    }

    if (instanceHost) {
      const appServerRole = prodRoles['ec2-app-server'];
      const prodAdminRole = prodRoles['okta-prod-admin'];
      const dataPipelineRole = prodRoles['data-pipeline'];
      const seedIamUser = cloudIamUsers.find((u) => u.oktaUserId === seed.oktaUserId);
      const seedIamUserArn =
        seedIamUser?.arn ?? `arn:aws:iam::${prodAccount.id}:user/${seed.userName}`;

      const userNode = employeeNode(seed, seedIamUserArn);
      const groupNode = oktaGroupNode(prodAdminGroup);
      const hostNode = hostAccessNode(instanceHost);
      const bucketNode: AccessNode = {
        id: crownJewelArn,
        type: 'bucket',
        subType: 'AWS S3 Bucket',
        name: crownJewelName,
      };

      const hops: AccessEdge[] = [
        {
          relation: 'member_of',
          source: userNode,
          target: groupNode,
          evidence: {
            kind: 'configuration',
            source: 'entityanalytics_okta',
            description: 'Okta group membership (user.group.id on the Okta user entity)',
          },
        },
        {
          relation: 'can_assume',
          source: groupNode,
          target: roleNode(prodAdminRole),
          evidence: {
            kind: 'configuration',
            source: 'okta_federation_app',
            description: 'Okta AWS federation app maps the group to the SAML role',
          },
          accountId: prodAccount.id,
        },
        {
          relation: 'can_assume',
          source: roleNode(prodAdminRole),
          target: roleNode(dataPipelineRole),
          evidence: {
            kind: 'configuration',
            source: 'cloud_asset_inventory',
            description:
              'data-pipeline trust policy names okta-prod-admin; okta-prod-admin inline policy allows sts:AssumeRole',
          },
          accountId: prodAccount.id,
        },
        {
          relation: 'can_connect',
          source: roleNode(dataPipelineRole),
          target: hostNode,
          evidence: {
            kind: 'configuration',
            source: 'cloud_asset_inventory',
            description: 'SsmSessionAccess policy allows ssm:StartSession on the instance',
          },
          accountId: prodAccount.id,
        },
        {
          relation: 'runs_as',
          source: hostNode,
          target: roleNode(appServerRole),
          evidence: {
            kind: 'configuration',
            source: 'cloud_asset_inventory',
            description: 'EC2 instance profile ec2-app-server (entity.Details.RoleArn)',
          },
          accountId: prodAccount.id,
        },
        {
          relation: 'grants_access_to',
          source: roleNode(appServerRole),
          target: bucketNode,
          evidence: {
            kind: 'configuration',
            source: 'cloud_asset_inventory',
            description:
              'S3CustomerPiiRead attached policy and the bucket policy allow s3:GetObject',
          },
          accountId: prodAccount.id,
        },
      ];

      model.accessPaths.push({
        id: 'compromised-okta-user-to-customer-pii',
        name: 'Compromised Okta user to customer PII bucket',
        description:
          `${seed.email} is a member of AWS-Prod-Admins, which federates into ${prodAdminRole.name}. ` +
          `That role can assume ${dataPipelineRole.name}, which can open an SSM session to ${instanceHost.name}. ` +
          `The instance runs as ${appServerRole.name}, which can read ${crownJewelName}.`,
        accountId: prodAccount.id,
        seedEmployeeId: seed.id,
        seedUserEmail: seed.email,
        seedOktaUserId: seed.oktaUserId,
        seedIamUserArn,
        groupId: prodAdminGroup.id,
        groupName: prodAdminGroup.name,
        federationRoleArn: prodAdminRole.arn,
        chainedRoleArn: dataPipelineRole.arn,
        instanceId: instanceHost.id,
        instanceRoleArn: appServerRole.arn,
        crownJewelBucketArn: crownJewelArn,
        crownJewelBucketName: crownJewelName,
        hops,
      });
    }
  }

  return model;
};

// --- Node helpers ----------------------------------------------------------------------------

export const employeeNode = (employee: Employee, iamUserArn?: string): AccessNode => ({
  id: employee.email,
  type: 'user',
  subType: 'Okta User',
  name: employee.userName,
  altIds: [employee.oktaUserId, ...(iamUserArn ? [iamUserArn] : [])],
});

export const oktaGroupNode = (group: OktaGroup): AccessNode => ({
  id: group.id,
  type: 'group',
  subType: 'Okta Group',
  name: group.name,
});

export const roleNode = (role: CloudIamRole): AccessNode => ({
  id: role.arn,
  type: 'role',
  subType: 'AWS IAM Role',
  name: role.name,
  altIds: [role.roleId],
});

export const policyNode = (policy: CloudIamPolicy): AccessNode => ({
  id: policy.arn,
  type: 'policy',
  subType: 'AWS IAM Policy',
  name: policy.name,
});

export const hostAccessNode = (host: Host): AccessNode => ({
  id: host.id,
  type: 'host',
  subType: 'AWS EC2 Instance',
  name: host.name,
});

const bucketNode = (bucket: CloudResource): AccessNode => ({
  id: bucket.id,
  type: 'bucket',
  subType: 'AWS S3 Bucket',
  name: bucket.name,
});

/**
 * Derive every configuration edge in the organization's access graph. The access-graph
 * emitter writes these as edge documents; the asset emitter uses the per-source subset as
 * entity.relationships on the asset documents.
 */
export const buildAccessEdges = (org: Organization): AccessEdge[] => {
  const edges: AccessEdge[] = [];
  const seen = new Set<string>();
  const push = (edge: AccessEdge): void => {
    const key = `${edge.relation}|${edge.source.id}|${edge.target.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push(edge);
  };

  const groupsById = new Map(org.oktaGroups.map((g) => [g.id, g]));
  const rolesByArn = new Map(org.cloudIamRoles.map((r) => [r.arn, r]));
  const policiesByArn = new Map(org.cloudIamPolicies.map((p) => [p.arn, p]));
  const hostsById = new Map(org.hosts.map((h) => [h.id, h]));
  const bucketsByArn = new Map(
    org.cloudResources.filter((r) => r.subType === 'AWS S3 Bucket').map((r) => [r.id, r]),
  );
  const employeesByIamArn = new Map<string, Employee>();
  for (const iamUser of org.cloudIamUsers) {
    const employee = iamUser.oktaUserId
      ? org.employees.find((e) => e.oktaUserId === iamUser.oktaUserId)
      : undefined;
    if (employee) employeesByIamArn.set(iamUser.arn, employee);
  }
  const iamUserArnByEmployee = new Map(
    org.cloudIamUsers
      .filter((u) => u.oktaUserId)
      .map((u) => [u.oktaUserId as string, u.arn] as const),
  );

  const resourceNode = (resourceId: string): AccessNode | undefined => {
    const host = hostsById.get(resourceId);
    if (host) return hostAccessNode(host);
    const bucket = bucketsByArn.get(resourceId);
    if (bucket) return bucketNode(bucket);
    return undefined;
  };

  const principalNode = (arn: string): AccessNode | undefined => {
    const role = rolesByArn.get(arn);
    if (role) return roleNode(role);
    const employee = employeesByIamArn.get(arn);
    if (employee) return employeeNode(employee, arn);
    return undefined;
  };

  // user -> group
  for (const employee of org.employees) {
    for (const groupId of employee.oktaGroupIds) {
      const group = groupsById.get(groupId);
      if (!group) continue;
      push({
        relation: 'member_of',
        source: employeeNode(employee, iamUserArnByEmployee.get(employee.oktaUserId)),
        target: oktaGroupNode(group),
        evidence: {
          kind: 'configuration',
          source: 'entityanalytics_okta',
          description: 'Okta group membership (user.group.id on the Okta user entity)',
        },
      });
    }
  }

  // group -> federation role
  for (const mapping of org.idpGroupRoleMappings) {
    const group = groupsById.get(mapping.oktaGroupId);
    const role = rolesByArn.get(mapping.roleArn);
    if (!group || !role) continue;
    push({
      relation: 'can_assume',
      source: oktaGroupNode(group),
      target: roleNode(role),
      evidence: {
        kind: 'configuration',
        source: 'okta_federation_app',
        description: 'Okta AWS federation app maps the group to the SAML role',
      },
      accountId: mapping.accountId,
    });
  }

  for (const role of org.cloudIamRoles) {
    // principal -> role (trust policy)
    for (const principalArn of role.trustedPrincipalArns) {
      const source = principalNode(principalArn);
      if (!source) continue;
      push({
        relation: 'can_assume',
        source,
        target: roleNode(role),
        evidence: {
          kind: 'configuration',
          source: 'cloud_asset_inventory',
          description: `${role.name} trust policy (AssumeRolePolicyDocument) names the principal`,
        },
        accountId: role.accountId,
      });
    }

    // role -> policy, and role -> resource through attached and inline policies
    const grantedResourceIds = new Set<string>();
    for (const policyArn of role.attachedPolicyArns) {
      const policy = policiesByArn.get(policyArn);
      if (!policy) continue;
      push({
        relation: 'has_policy',
        source: roleNode(role),
        target: policyNode(policy),
        evidence: {
          kind: 'configuration',
          source: 'cloud_asset_inventory',
          description: 'Managed policy attached to the role',
        },
        accountId: role.accountId,
      });
      policy.resourceIds.forEach((id) => grantedResourceIds.add(id));
    }
    for (const inline of role.inlinePolicies) {
      inline.resourceIds.forEach((id) => grantedResourceIds.add(id));
    }
    for (const resourceId of grantedResourceIds) {
      const relation = relationForResource(resourceId);
      const target = resourceNode(resourceId);
      if (!relation || !target) continue;
      push({
        relation,
        source: roleNode(role),
        target,
        evidence: {
          kind: 'configuration',
          source: 'cloud_asset_inventory',
          description: 'Effective permission from the role’s attached and inline policies',
        },
        accountId: role.accountId,
      });
    }
  }

  // policy -> resource
  for (const policy of org.cloudIamPolicies) {
    for (const resourceId of policy.resourceIds) {
      const relation = relationForResource(resourceId);
      const target = resourceNode(resourceId);
      if (!relation || !target) continue;
      push({
        relation,
        source: policyNode(policy),
        target,
        evidence: {
          kind: 'configuration',
          source: 'cloud_asset_inventory',
          description: 'Policy document Allow statement names the resource',
        },
        accountId: policy.accountId,
      });
    }
  }

  // instance -> role (instance profile)
  const profilesByArn = new Map(org.cloudInstanceProfiles.map((p) => [p.arn, p]));
  for (const host of org.hosts) {
    if (!host.instanceProfileArn) continue;
    const profile = profilesByArn.get(host.instanceProfileArn);
    const role = profile ? rolesByArn.get(profile.roleArn) : undefined;
    if (!role) continue;
    push({
      relation: 'runs_as',
      source: hostAccessNode(host),
      target: roleNode(role),
      evidence: {
        kind: 'configuration',
        source: 'cloud_asset_inventory',
        description: 'EC2 instance profile (entity.Details.InstanceProfileArn / RoleArn)',
      },
      accountId: host.cloudAccountId,
    });
  }

  // bucket policy principal -> bucket
  for (const [bucketArn, policy] of Object.entries(org.s3BucketPolicies)) {
    const bucket = bucketsByArn.get(bucketArn);
    if (!bucket) continue;
    for (const statement of policy.Statement) {
      if (statement.Effect !== 'Allow') continue;
      for (const principalArn of asArray(statement.Principal?.AWS)) {
        const source = principalNode(principalArn);
        if (!source) continue;
        push({
          relation: 'grants_access_to',
          source,
          target: bucketNode(bucket),
          evidence: {
            kind: 'configuration',
            source: 'cloud_asset_inventory',
            description: 'S3 bucket policy names the principal',
          },
          accountId: bucket.accountId,
        });
      }
    }
  }

  return edges;
};

/**
 * Relationship arrays for one asset, in entity store shape, from the edges it is the
 * source of.
 */
export const relationshipsForSource = (
  edges: AccessEdge[],
  sourceId: string,
): Partial<Record<AccessRelation, { entity: { id: string[] } }>> | undefined => {
  const byRelation = new Map<AccessRelation, string[]>();
  for (const edge of edges) {
    if (edge.source.id !== sourceId) continue;
    const list = byRelation.get(edge.relation) ?? [];
    list.push(edge.target.id);
    byRelation.set(edge.relation, list);
  }
  if (byRelation.size === 0) return undefined;
  const result: Partial<Record<AccessRelation, { entity: { id: string[] } }>> = {};
  for (const [relation, ids] of byRelation) {
    result[relation] = { entity: { id: ids } };
  }
  return result;
};

/**
 * Human-readable description of the planted access paths, for the CLI summary.
 */
export const getAccessPathSummary = (org: Organization): string => {
  if (org.accessPaths.length === 0) return 'Access paths: none (no AWS accounts)';
  return org.accessPaths
    .map((path) => {
      const hops = path.hops
        .map(
          (hop, i) =>
            `    ${i + 1}. ${hop.source.name} (${hop.source.type}) --${hop.relation}--> ${hop.target.name} (${hop.target.type})`,
        )
        .join('\n');
      return [
        `Access path: ${path.name}`,
        `  Seed user:        ${path.seedUserEmail} (okta ${path.seedOktaUserId})`,
        `  Okta group:       ${path.groupName} (${path.groupId})`,
        `  Federation role:  ${path.federationRoleArn}`,
        `  Chained role:     ${path.chainedRoleArn}`,
        `  EC2 instance:     ${path.instanceId}`,
        `  Instance role:    ${path.instanceRoleArn}`,
        `  Crown jewel:      ${path.crownJewelBucketArn}`,
        `  Hops:`,
        hops,
      ].join('\n');
    })
    .join('\n\n');
};
