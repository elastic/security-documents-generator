import { faker } from '@faker-js/faker';
import { ingestIntoSourceIndex } from '../privileged_access_detection_ml/index_management';
import { getEsClient } from '../utils/indices';
import {
  ACCOUNT_SWITCH_LINUX_SAMPLE_DOCUMENT,
  GRANTED_RIGHTS_LINUX_SAMPLE_DOCUMENT,
  GRANTED_RIGHTS_OKTA_SAMPLE_DOCUMENT,
  GRANTED_RIGHTS_WINDOWS_SAMPLE_DOCUMENT,
  OKTA_AUTHENTICATION,
} from './sample_documents';
import { TimeWindows } from '../utils/time_windows';
import { User } from '../privileged_access_detection_ml/event_generator';

const endpointLogsDataStreamName = 'logs-endpoint.events.process-default';
const systemLogsDataStreamName = 'logs-system.security-default';
const oktaLogsDataStreamName = 'logs-okta.system-default';

const getSampleEndpointLogs = (users: User[]) => {
  return faker.helpers.multiple(
    () => {
      return GRANTED_RIGHTS_LINUX_SAMPLE_DOCUMENT(
        faker.helpers.arrayElement(users).userName,
        TimeWindows.toRandomTimestamp(TimeWindows.last30DayWindow()),
      );
    },
    { count: 100 },
  );
};

const getSampleEndpointAccountSwitchLogs = (users: User[]) => {
  return faker.helpers.multiple(
    () => {
      return ACCOUNT_SWITCH_LINUX_SAMPLE_DOCUMENT(
        faker.helpers.arrayElement(users).userName,
        TimeWindows.toRandomTimestamp(TimeWindows.last30DayWindow()),
      );
    },
    { count: 100 },
  );
};

const getSampleSystemLogs = (users: User[]) => {
  return faker.helpers.multiple(
    () => {
      return GRANTED_RIGHTS_WINDOWS_SAMPLE_DOCUMENT(
        faker.helpers.arrayElement(users).userName,
        TimeWindows.toRandomTimestamp(TimeWindows.last30DayWindow()),
      );
    },
    { count: 100 },
  );
};

const getSampleOktaLogs = (users: User[]) => {
  return faker.helpers.multiple(
    () => {
      return GRANTED_RIGHTS_OKTA_SAMPLE_DOCUMENT(
        faker.helpers.arrayElement(users).userName,
        TimeWindows.toRandomTimestamp(TimeWindows.last30DayWindow()),
      );
    },
    { count: 100 },
  );
};

const getSampleOktaAuthenticationLogs = (users: User[]) => {
  return faker.helpers.multiple(
    () => {
      return OKTA_AUTHENTICATION(
        faker.helpers.arrayElement(users).userName,
        TimeWindows.toRandomTimestamp(TimeWindows.last30DayWindow()),
      );
    },
    { count: 100 },
  );
};

export const generatePrivilegedUserMonitoringData = async ({
  users,
}: {
  users: User[];
}) => {
  try {
    await deleteDataStream(endpointLogsDataStreamName);
    await createDataStream(endpointLogsDataStreamName);
    await ingestIntoSourceIndex(endpointLogsDataStreamName, [
      ...getSampleEndpointLogs(users),
      ...getSampleEndpointAccountSwitchLogs(users),
    ]);

    await deleteDataStream(systemLogsDataStreamName);
    await createDataStream(systemLogsDataStreamName);
    await ingestIntoSourceIndex(
      systemLogsDataStreamName,
      getSampleSystemLogs(users),
    );

    await deleteDataStream(oktaLogsDataStreamName);
    await createDataStream(oktaLogsDataStreamName);
    await ingestIntoSourceIndex(oktaLogsDataStreamName, [
      ...getSampleOktaLogs(users),
      ...getSampleOktaAuthenticationLogs(users),
    ]);
  } catch (e) {
    console.log(e);
  }
};

const createDataStream = async (indexName: string) => {
  await getEsClient().indices.createDataStream({
    name: indexName,
  });
};

const deleteDataStream = async (indexName: string) => {
  try {
    await getEsClient().indices.deleteDataStream({ name: indexName });
  } catch (e: unknown) {
    const error = e as { meta: { statusCode: number } };

    if (error.meta.statusCode === 404)
      console.log('Resource does not yet exist, and will be created.');
    else throw e;
  }
  // Wait in order to ensure no race conditions after deletion
  await new Promise((r) => setTimeout(r, 1000));
};
