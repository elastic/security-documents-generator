import { faker } from '@faker-js/faker';
import { getEsClient, indexCheck } from './utils';
import { chunk } from 'lodash-es';
import moment from 'moment';
import cliProgress from 'cli-progress';
import {
  BulkOperationContainer,
  BulkUpdateAction,
} from '@elastic/elasticsearch/lib/api/types';

const client = getEsClient();
const EVENT_INDEX_NAME = 'commands-privtest';
const USER_INDEX_NAME = 'privileged-users';

// how many commands should be sudo
const SU_COMMANDS_RATIO = 0.1;

interface User {
  '@timestamp': string;
  user: {
    name: string;
  };
  labels: { is_privileged: boolean };
}

interface TimeWindow {
  start: moment.Moment;
  end: moment.Moment;
}

const createPrivilegedUserIndex = async () => {
  try {
    await indexCheck(USER_INDEX_NAME, {
      settings: {
        'index.mode': 'lookup',
      },
      mappings: {
        properties: {
          '@timestamp': {
            type: 'date',
          },
          user: {
            properties: {
              name: {
                type: 'keyword',
                fields: {
                  text: {
                    type: 'text',
                  },
                },
              },
            },
          },
          is_privileged: {
            type: 'boolean',
          },
        },
      },
    });
    console.log('Privileged user index created');
  } catch (error) {
    console.log('Error: ', error);
  }
};

interface Event {
  '@timestamp': string;
  message: string;
  user: {
    name: string;
  };
}

const createCommandsIndex = async () => {
  try {
    await indexCheck(EVENT_INDEX_NAME, {
      mappings: {
        properties: {
          '@timestamp': {
            type: 'date',
          },
          message: {
            type: 'text',
          },
          user: {
            properties: {
              name: {
                type: 'keyword',
                fields: {
                  text: {
                    type: 'text',
                  },
                },
              },
            },
          },
        },
      },
    });
    console.log('Commands index created');
  } catch (error) {
    console.log('Error: ', error);
  }
};

const deleteIndices = async () => {
  try {
    await client.indices.delete({
      index: [EVENT_INDEX_NAME, USER_INDEX_NAME],
      ignore_unavailable: true,
    });
    console.log('Indices deleted');
  } catch (error) {
    console.log('Error: ', error);
  }
};

const createRandomUser = (): User => {
  return {
    '@timestamp': moment().format('yyyy-MM-DDTHH:mm:ss.SSSSSSZ'),
    user: { name: faker.internet.username() },
    labels: { is_privileged: true },
  };
};

const ingestEvents = async (events: Event[]) =>
  ingest(EVENT_INDEX_NAME, events);

const ingestUsers = async (users: User[]) => ingest(USER_INDEX_NAME, users);

type TDocument = object;
type TPartialDocument = Partial<TDocument>;

const ingest = async (index: string, documents: Array<object>) => {
  const progress = new cliProgress.SingleBar(
    {
      format: 'Progress | {value}/{total} docs',
    },
    cliProgress.Presets.shades_classic,
  );
  const chunks = chunk(documents, 10000);
  progress.start(documents.length, 0);

  for (const chunk of chunks) {
    try {
      const ingestRequest = chunk.reduce(
        (
          acc: (
            | BulkOperationContainer
            | BulkUpdateAction<TDocument, TPartialDocument>
            | TDocument
          )[],
          event,
        ) => {
          acc.push({ index: { _index: index } });
          acc.push(event);
          return acc;
        },
        [],
      );
      if (!client) throw new Error();
      await client.bulk({ operations: ingestRequest, refresh: true });
      progress.increment(chunk.length);
    } catch (err) {
      console.log('Error: ', err);
    }
  }
  progress.stop();
};

export const createRandomEventForUser = (
  name: string,
  sudo: boolean = true,
  timeWindow: TimeWindow,
): Event => {
  const timestamp = moment(
    faker.date.between({
      from: timeWindow.start.toDate(),
      to: timeWindow.end.toDate(),
    }),
  ).format('yyyy-MM-DDTHH:mm:ss.SSSSSSZ');

  // console.log('timestamp: ', timestamp);

  return {
    '@timestamp': timestamp,
    message: sudo ? 'sudo su' : 'ls -a',
    user: {
      name,
    },
  };
};

const generateEvents = (
  users: User[],
  eventsPerUser: number,
  timeWindow: TimeWindow,
): Event[] => {
  return users.reduce((acc, user) => {
    const events = new Array(eventsPerUser).fill(null).map((i) => {
      const isSudo = i < eventsPerUser * SU_COMMANDS_RATIO;
      return createRandomEventForUser(user.user.name, isSudo, timeWindow);
    });

    acc.push(...events);
    return acc;
  }, [] as Event[]);
};

const generateRandomEvents = (
  userCount: number,
  eventsPerUser: number,
  timeWindow: TimeWindow,
) => {
  const users = new Array(userCount).fill(null).map(createRandomUser);
  return generateEvents(users, eventsPerUser, timeWindow);
};

export const generatePrivilegedUserMonitoringData = async ({
  users,
  eventsPerUser,
}: {
  users: number;
  eventsPerUser: number;
}) => {
  const timeWindow = {
    start: moment().subtract(1, 'hour'),
    end: moment(),
  } as const;

  console.log('Deleting indices');
  await deleteIndices();
  console.log('Indices deleted');
  console.log('Creating indices');
  await createPrivilegedUserIndex();
  await createCommandsIndex();

  const generatedUsers = faker.helpers.multiple(createRandomUser, {
    count: users,
  });
  console.log('Users generated: ', generatedUsers.length);
  console.log('Ingesting users');
  await ingestUsers(generatedUsers);

  console.log('Users ingested, generating events');
  console.log('Events per user: ', eventsPerUser);
  console.log('Total events: ', generatedUsers.length * eventsPerUser);
  console.log('Ingesting events');
  const eventsForUsers = generateEvents(
    generatedUsers,
    eventsPerUser,
    timeWindow,
  );
  await ingestEvents(eventsForUsers);
  console.log('Adding some non privileged user events');
  const nonPrivilegedEvents = generateRandomEvents(
    Math.floor(users / 10),
    eventsPerUser,
    timeWindow,
  );
  await ingestEvents(nonPrivilegedEvents);
};
