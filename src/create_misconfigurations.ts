import { faker } from '@faker-js/faker';
import moment from 'moment';

export interface CreateMisconfigurationsParams {
  username?: string;
  hostname?: string;
  space?: string;
}

export default function createMisconfigurations({
  username = 'user-1',
  hostname = 'host-1',
  space = 'default',
}: CreateMisconfigurationsParams) {
  const now = moment().format('yyyy-MM-DDTHH:mm:ss.SSSSSSZ');
  return {
    '@timestamp': now,
    agent: {
      name: 'elastic-agent-cspm',
      id: faker.string.uuid(),
      type: 'cloudbeat',
      ephemeral_id: faker.string.uuid(),
      version: '9.0.0',
    },
    resource: {
      account_id: faker.string.numeric(12),
      sub_type: 'gcp-iam-service-account-key',
      account_name: 'test',
      organization_id: faker.string.numeric(12),
      name: `projects/test/serviceAccounts/sa-cspm-gcp-test-91@test.iam.gserviceaccount.com/keys/${faker.string.uuid()}`,
      raw: {
        AccessContextPolicy: null,
        update_time: {
          seconds: 1753889348,
        },
        resource: {
          data: {
            keyAlgorithm: 'KEY_ALG_RSA_2048',
            privateKeyType: 'TYPE_GOOGLE_CREDENTIALS_FILE',
            validBeforeTime: '9999-12-31T23:59:59Z',
            name: `projects/test/serviceAccounts/sa-cspm-gcp-test-73@test.iam.gserviceaccount.com/keys/${faker.string.uuid()}`,
            keyType: 'USER_MANAGED',
            keyOrigin: 'GOOGLE_PROVIDED',
            validAfterTime: '2025-07-30T15:29:08Z',
          },
          discovery_name: 'TestAccountKey',
          version: 'v1',
          discovery_document_uri: 'https://iam.googleapis.com/$discovery/rest',
        },
        asset_type: 'iam.googleapis.com/ServiceAccountKey',
        name: `//iam.googleapis.com/projects/test/serviceAccounts/${faker.string.numeric(22)}/keys/${faker.string.uuid()}`,
        ancestors: [
          `projects/${faker.string.numeric(12)}`,
          `folders/${faker.string.numeric(12)}`,
          `folders/${faker.string.numeric(12)}`,
          `folders/${faker.string.numeric(12)}`,
          `organizations/${faker.string.numeric(12)}`,
        ],
      },
      id: `//iam.googleapis.com/projects/test/serviceAccounts/${faker.string.numeric(22)}/keys/${faker.string.uuid()}`,
      type: 'identity-management',
    },
    cloud_security_posture: {
      package_policy: {
        id: faker.string.uuid(),
        revision: 11,
      },
    },
    elastic_agent: {
      id: faker.string.uuid(),
      version: '9.0.0',
      snapshot: false,
    },
    rule: {
      references:
        '1. https://cloud.google.com/iam/docs/understanding-service-accounts#managing_service_account_keys\n2. https://cloud.google.com/sdk/gcloud/reference/iam/service-accounts/keys/list\n3. https://cloud.google.com/iam/docs/service-accounts',
      impact:
        'Rotating service account keys will break communication for dependent applications. Dependent applications need to be configured manually with the new key `ID` displayed in the `Service account keys` section and the `private key` downloaded by the user.',
      description:
        'Service Account keys consist of a key ID (Private_key_Id) and Private key, which are used to sign programmatic requests users make to Google cloud services accessible to that particular service account.\nIt is recommended that all Service Account keys are regularly rotated.',
      default_value: '',
      section: 'Identity and Access Management',
      rationale:
        'Rotating Service Account keys will reduce the window of opportunity for an access key that is associated with a compromised or terminated account to be used.\nService Account keys should be rotated to ensure that data cannot be accessed with an old key that might have been lost, cracked, or stolen.\n\nEach service account is associated with a key pair managed by Google Cloud Platform (GCP).\nIt is used for service-to-service authentication within GCP.\nGoogle rotates the keys daily.\n\nGCP provides the option to create one or more user-managed (also called external key pairs) key pairs for use from outside GCP (for example, for use with Application Default Credentials).\nWhen a new key pair is created, the user is required to download the private key (which is not retained by Google).\nWith external keys, users are responsible for keeping the private key secure and other management operations such as key rotation.\nExternal keys can be managed by the IAM API, gcloud command-line tool, or the Service Accounts page in the Google Cloud Platform Console.\nGCP facilitates up to 10 external service account keys per service account to facilitate key rotation.',
      version: '1.0',
      benchmark: {
        name: 'CIS Google Cloud Platform Foundation',
        rule_number: '1.7',
        id: 'cis_gcp',
        version: 'v2.0.0',
        posture_type: 'cspm',
      },
      tags: ['CIS', 'GCP', 'CIS 1.7', 'Identity and Access Management'],
      remediation:
        '**From Google Cloud Console**\n\n**Delete any external (user-managed) Service Account Key older than 90 days:**\n\n1. Go to `APIs & Services\\Credentials` using `https://console.cloud.google.com/apis/credentials`\n\n2. In the Section `Service Account Keys`, for every external (user-managed) service account key where `creation date` is greater than or equal to the past 90 days, click `Delete Bin Icon` to `Delete Service Account key`\n\n**Create a new external (user-managed) Service Account Key for a Service Account:**\n\n3. Go to `APIs & Services\\Credentials` using `https://console.cloud.google.com/apis/credentials`\n\n4. Click `Create Credentials` and Select `Service Account Key`.\n\n5. Choose the service account in the drop-down list for which an External (user-managed) Service Account key needs to be created.\n\n6. Select the desired key type format among `JSON` or `P12`.\n\n7. Click `Create`. It will download the `private key`. Keep it safe. \n\n8. Click `Close` if prompted. \n\n9. The site will redirect to the `APIs & Services\\Credentials` page. Make a note of the new `ID` displayed in the `Service account keys` section.',
      audit:
        '**From Google Cloud Console**\n\n1. Go to `APIs & Services\\Credentials` using `https://console.cloud.google.com/apis/credentials`\n\n2. In the section `Service Account Keys`, for every External (user-managed) service account key listed ensure the `creation date` is within the past 90 days.\n\n**From Google Cloud CLI**\n\n3. List all Service accounts from a project.\n\n```\ngcloud iam service-accounts list\n```\n\n4. For every service account list service account keys.\n\n```\ngcloud iam service-accounts keys list --iam-account [Service_Account_Email_Id] --format=json\n```\n\n5. Ensure every service account key for a service account has a `"validAfterTime"` value within the past 90 days.',
      name: 'Ensure User-Managed/External Keys for Service Accounts Are Rotated Every 90 Days or Fewer',
      id: faker.string.uuid(),
      profile_applicability: '* Level 1',
    },
    message:
      'Rule "Ensure User-Managed/External Keys for Service Accounts Are Rotated Every 90 Days or Fewer": passed',
    result: {
      evaluation: faker.helpers.arrayElement(['passed', 'failed']),
      evidence: now,
      expected: null,
    },
    cloud: {
      Organization: {
        id: faker.string.numeric(12),
      },
      provider: 'gcp',
      account: {
        name: 'test',
        id: faker.string.numeric(12),
      },
    },
    observer: {
      vendor: 'Elastic',
    },
    cloudbeat: {
      commit_time: '0001-01-01T00:00:00Z',
      version: '9.0.0',
      policy: {
        commit_time: '0001-01-01T00:00:00Z',
        version: '9.0.0',
      },
    },
    ecs: {
      version: '8.6.0',
    },
    related: {
      entity: [
        `//iam.googleapis.com/projects/test/serviceAccounts/${faker.string.numeric(21)}/keys/${faker.string.uuid()}`,
      ],
    },
    data_stream: {
      namespace: space,
      type: 'logs',
      dataset: 'cloud_security_posture.findings',
    },
    event: {
      agent_id_status: 'verified',
      sequence: 1753889443,
      created: now,
      kind: 'state',
      id: faker.string.uuid(),
      category: ['configuration'],
      type: ['info'],
      dataset: 'cloud_security_posture.findings',
      outcome: 'success',
    },
    user: {
      name: username,
      effective: {
        name: `projects/test/serviceAccounts/sa-cspm-gcp-test-85-sa@test.iam.gserviceaccount.com/keys/${faker.string.uuid()}`,
        id: `//iam.googleapis.com/projects/test/serviceAccounts/${faker.string.numeric(21)}/keys/${faker.string.uuid()}`,
      },
    },
    host: {
      name: hostname,
    },
  };
}
