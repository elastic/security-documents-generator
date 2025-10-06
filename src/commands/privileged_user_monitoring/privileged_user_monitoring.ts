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

import { makeAdUserDoc, makeDoc } from '../utils/integrations_utils';

//end point logs
const endpointLogsDataStreamName = 'logs-endpoint.events.process-default';

// system logs
const systemLogsDataStreamName = 'logs-system.security-default';
const oktaLogsDataStreamName = 'logs-okta.system-default';

// integrations sync user logs
const oktaLogsUsersDataStreamName = 'logs-entityanalytics_okta.user-default';
const adLogsUsersDataStreamName = 'logs-entityanalytics_ad.user-default';

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

// starting with DRY here, will refactor later
const getSampleAdUsersLogs = (count: number) => {
  // implement here pls
  const adminCount = Math.round((50 / 100) * count);
  const nonAdminCount = Math.max(0, count - adminCount);
  console.log(
    `Generating ${adminCount} admin users and ${nonAdminCount} non-admin Active Directory users (total ${count})`,
  );
  const userDocs = Array.from({ length: nonAdminCount }, (_, i) =>
    makeAdUserDoc(false, i),
  );
  const adminDocs = Array.from({ length: nonAdminCount }, () =>
    makeAdUserDoc(false),
  );
  const docs = adminDocs.concat(userDocs);
  return docs;
};

export function getSampleOktaUsersLogs(count: number) {
  const adminCount = Math.round((50 / 100) * count);
  const nonAdminCount = Math.max(0, count - adminCount);
  console.log(
    `Generating ${adminCount} admin users and ${nonAdminCount} non-admin Okta users (total ${count})`,
  );
  const adminDocs = Array.from({ length: adminCount }, () => makeDoc(true));
  const userDocs = Array.from({ length: nonAdminCount }, () => makeDoc(false));
  const docs = adminDocs.concat(userDocs);
  return docs;
}

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
    await reinitializeDataStream(endpointLogsDataStreamName, [
      ...getSampleEndpointLogs(users),
      ...getSampleEndpointAccountSwitchLogs(users),
    ]);

    await reinitializeDataStream(
      systemLogsDataStreamName,
      getSampleSystemLogs(users),
    );

    await reinitializeDataStream(oktaLogsDataStreamName, [
      ...getSampleOktaLogs(users),
      ...getSampleOktaAuthenticationLogs(users),
    ]);
  } catch (e) {
    console.log(e);
  }
};

/**
 * Generate data for integrations sync only.
 * Currently okta data only.
 */
export const generatePrivilegedUserIntegrationsSyncData = async ({
  usersCount,
}: {
  usersCount: number;
}) => {
  try {
    const sampleDocuments = getSampleOktaUsersLogs(usersCount);
    await reinitializeDataStream(oktaLogsUsersDataStreamName, sampleDocuments);
  } catch (e) {
    console.log(e);
  }
};

export const generateADPrivilegedUserMonitoringData = async ({
  usersCount,
}: {
  usersCount: number;
}) => {
  try {
    await reinitializeDataStream(
      adLogsUsersDataStreamName,
      getSampleAdUsersLogs(usersCount),
    );
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

const reinitializeDataStream = async (
  indexName: string,
  documents: Array<object>,
) => {
  await deleteDataStream(indexName);
  await createDataStream(indexName);
  await ingestIntoSourceIndex(indexName, documents);
};
