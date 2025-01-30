
import { getEsClient } from './utils/index';
import cliProgress from 'cli-progress';
import { faker } from '@faker-js/faker';
import { assignAssetCriticality, initPrivmon, enableRiskScore} from '../utils/kibana_api';
const client = getEsClient(); 

const PRIVMON_INDEX_PREFIX = 'risk-score.risk-monitoring';

const getPrivmonLoginsIndex = (namespace: string) =>
  `${PRIVMON_INDEX_PREFIX}.logins-${namespace}`;

const getPrivmonPrivilegesIndex = (namespace: string) =>
  `${PRIVMON_INDEX_PREFIX}.privileges-${namespace}`;

const createLoginDoc = ({ username = 'johndoe', hostname = 'riskyhost.com', ip = '1.1.1.1', sourceIp = '2.2.2.2', timestamp }: { username?: string, hostname?: string, ip?: string, sourceIp?: string, timestamp?: string }) => ({
  '@timestamp': timestamp || new Date().toISOString(),
  'event': {
    'action': 'login',
    'category': ['authentication'],
    'type': ['start'],
    'outcome': 'success',
    'kind': 'event',
    'id': '7b8e5b19-3f4c-4d3b-a57b-2d876d02e5e6',
    'provider': 'Microsoft-Windows-Security-Auditing'
  },
  'user': {
    'name': username,
    'id': '1234' + username
  },
  'host': {
    'name': hostname,
    'hostname': hostname,
    'ip': ip,
    'os': {
      'type': 'windows',
      'name': 'Windows Server 2019',
      'version': '10.0.17763'
    }
  },
  'source': {
    'ip': sourceIp,
    'geo': {
      'country_iso_code': 'US',
      'city_name': 'New York',
      'location': {
        'lat': 40.7128,
        'lon': -74.0060
      }
    }
  },
  'destination': {
    'ip': '192.168.1.20',
    'port': 3389
  },
  'related': {
    'user': ['johndoe'],
    'ip': ['203.0.113.45', '192.168.1.20']
  },
  'log': {
    'level': 'information',
    'source': 'Active Directory'
  },
  'tags': ['successful-login', 'host-login', 'authentication']
});

const createPrivilegeDoc = ({ username = 'adminuser', targetUsername = 'mahopki', groupName = 'Domain Admins', timestamp }: { username?: string, groupName?: string, targetUsername?: string, timestamp?: string }) => ({
  '@timestamp': timestamp || new Date().toISOString(),
  'event': {
    'action': 'group-add',
    'category': 'privilege-escalation',
    'outcome': 'success',
    'kind': 'event',
    'id': '4e1a4b89-1c9d-4bb9-8301-fb9b2aaf7a17',
    'provider': 'Microsoft-Windows-Security-Auditing'
  },
  'log': {
    'level': 'information',
    'source': 'Active Directory'
  },
  'user': {
    'name': username,
    'id': '1234' + username,
  },
  'target': {
    'user': {
      'name': targetUsername,
      'id': '1234' + targetUsername,
    }
  },
  'group': {
    'name': groupName,
    'id': 'S-1-5-21-123456789-987654321-543216789-512'
  },
  'source': {
    'ip': '192.168.1.10',
    'geo': {
      'country': 'United States',
      'city': 'Seattle',
      'lat': 47.6062,
      'lon': -122.3321
    }
  },
  'azure': {
    'auditlogs': {
      'identity': 'Active Directory Administrator',
      'operation_name': 'Add Member to Group',
      'properties': {
        'activity_display_name': 'Add Member to Group',
        'activity_datetime': '2025-01-09T12:34:56.789Z',
        'target_resources': [
          {
            'type': 'Group',
            'display_name': 'AD Domain Admin',
            'id': 'S-1-5-21-123456789-987654321-543216789-512',
            'modified_properties': [
              {
                'display_name': 'Member Added',
                'new_value': 'johndoe (S-1-5-21-123456789-987654321-543216789-1001)'
              }
            ]
          }
        ],
        'initiated_by': {
          'user': {
            'display_name': 'admin',
            'id': 'S-1-5-21-123456789-987654321-543216789-500'
          }
        },
        'correlation_id': 'cdef1234-abcd-5678-efgh-0987654321ij'
      }
    }
  },
  'tags': ['elevated-privileges', 'mitre-attack:T1098', 'domain-admin']
});

const BATCH_SIZE = 1000;

const bulkCreate = async (docs: unknown[], index: string) => {
  const ops = docs.flatMap((doc) => [{ create: { _index: index } }, doc]);

  if (!client) {
    throw new Error('failed to create ES client');
  }
  const progress = new cliProgress.SingleBar({
    format: `Indexing ${index} | {bar} | {percentage}% | {value}/{total} Docs`
  }, cliProgress.Presets.shades_classic);

  for (let i = 0; i < ops.length; i += BATCH_SIZE) {
    const body = ops.slice(i, i + BATCH_SIZE);
    try {
      const result = await client.bulk({ body, refresh: true });
      if(result.errors){
        console.log('Bulk error: ', JSON.stringify(result));
        process.exit(1);
      }
      progress.update(i / ops.length);
    } catch (err) {
      console.log('Error: ', err);
      process.exit(1);
    }
  }

  progress.stop();

  console.log(`Indexed ${docs.length} docs into ${index}`);
};

const bulkCreateLogins = async (docs: unknown[], namespace: string) => {
  await bulkCreate(docs, getPrivmonLoginsIndex(namespace));
}

const bulkCreatePrivileges = async (docs: unknown[], namespace: string) => {
  await bulkCreate(docs, getPrivmonPrivilegesIndex(namespace));
}

const callInit = async () => {
  console.log('Initializing Privmon');
  await initPrivmon();
  await enableRiskScore();
}

export const loginToCriticalAsset = async ({namespace = 'default', username, init, hostname = 'critical_host' }: {username: string, namespace?: string, init?: boolean, hostname?: string}) => {
  if (init) {
    await callInit();
  }
  console.log(`Assigning asset criticality to host ${hostname}`);

  await assignAssetCriticality([{ id_field: 'host.name', id_value: hostname, criticality_level: 'extreme_impact' }]);

  console.log(`Creating login event for user ${username} to critical asset`);

  const docs = [createLoginDoc({ username, hostname, ip: faker.internet.ip(), sourceIp: faker.internet.ip() })];

  await bulkCreateLogins(docs, namespace);
}

const multipleLoginsOverTime = async ({namespace = 'default', count = 10, username, init}: {count?: number, username: string, namespace?: string, init?: boolean}) => {
  if (init) {
    await callInit();
  }

  console.log(`Creating ${count} login events for user ${username}`);
  const ip = faker.internet.ip();
  const sourceIp = faker.internet.ip();
  const docs = Array(count)
    .fill(null)
    .map(() => createLoginDoc({ username, ip, sourceIp }));

  await bulkCreateLogins(docs, namespace);
}

export const multipleLoginsFromDifferentIps = async ({namespace = 'default', count, username, init}: {count: number, username: string, namespace?: string, init?: boolean}) => {
  if (init) {
    await callInit();
  }

  console.log(`Creating ${count} login events for user ${username}`);

  const userDocs = Array(count)
    .fill(null)
    .map(() => createLoginDoc({ username, ip: faker.internet.ip(), sourceIp: faker.internet.ip() }));

  console.log(`Creating ${count * 10} login events for other users`);
  
  const otherUserDocs = Array(count * 10)
    .fill(null)
    .map(() => createLoginDoc({ username: faker.internet.userName(), ip: faker.internet.ip(), sourceIp: faker.internet.ip() }));

  await bulkCreateLogins([
    ...userDocs,
    ...otherUserDocs
  ], namespace);
}

export const privilegeEscalation = async ({namespace = 'default', username, init}: {username: string, namespace?: string, init?: boolean}) => {
  const NON_PRIVILEGED_GROUPS = ['Domain Users', 'Guests', 'Authenticated Users'];
  const PRIVILEGED_GROUPS = ['AD Domain Admin'];

  if (init) {
    await callInit();
  }

  console.log(`Creating privilege escalation events for user ${username}`);

  // distribute non privleged group events over the last year to give a behavior of normal user activity
  const NON_PRIVLEGED_GROUP_TIMESTAMPS = Array(NON_PRIVILEGED_GROUPS.length)
    .fill(null)
    .map(() => faker.date.past({ years: 1 }).toISOString());

  const docs = [
    ...NON_PRIVILEGED_GROUPS.map((groupName, i) => createPrivilegeDoc({ targetUsername: username, groupName, timestamp: NON_PRIVLEGED_GROUP_TIMESTAMPS[i] })),
    ...PRIVILEGED_GROUPS.map((groupName) => createPrivilegeDoc({ targetUsername: username, groupName })),
  ];

  await bulkCreatePrivileges(docs, namespace);
}

export const createSimilarUsers = async ({ namespace = 'default', init }: { namespace?: string, init?: boolean }) => {
  if (init) {
    await callInit();
  }

  const variants = [
    'johndoe',
    'johndoe@elastic.co',
    'john.doe@elastic.co',
    'john.doe',
  ];

  for (const username of variants) {
    await privilegeEscalation({ username, namespace });
    await multipleLoginsOverTime({ count: 10, username, namespace });
  }
}

export const createPrivmonData = async ({namespace = 'default', loginsCount, username, init}: {loginsCount: number, username: string, namespace?: string, init?: boolean}) => {
  if (init) {
    await callInit();
  }
  await multipleLoginsFromDifferentIps({ count: loginsCount, username, namespace });
  await privilegeEscalation({ username, namespace });
  await loginToCriticalAsset({ username, namespace });
  await createSimilarUsers({ namespace });
}

export const deleteAllPrivmonData = async () => {
  if (!client) {
    throw new Error('failed to create ES client');
  }

  await client.indices.delete({
    index: `${PRIVMON_INDEX_PREFIX}.*`,
    ignore_unavailable: true,
  });
}



