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
import { User, UserGenerator } from '../privileged_access_detection_ml/event_generator';
import { createRule, enableRiskScore } from '../../utils/kibana_api';
import { createSampleFullSyncEvents, makeDoc } from '../utils/integrations_sync_utils';
import {
  PRIVILEGED_USER_MONITORING_OPTIONS,
  PrivilegedUserMonitoringOption,
} from '../../constants';
import { generatePrivilegedAccessDetectionData } from '../privileged_access_detection_ml/privileged_access_detection_ml';
import { generateCSVFile } from './generate_csv_file';

const endpointLogsDataStreamName = 'logs-endpoint.events.process-default';
const systemLogsDataStreamName = 'logs-system.security-default';
const oktaLogsDataStreamName = 'logs-okta.system-default';
const oktaLogsUsersDataStreamName = 'logs-entityanalytics_okta.user-default';
const oktaLogsEntityDataStreamName = 'logs-entityanalytics_okta.entity-default';

const getSampleEndpointLogs = (users: User[]) => {
  return faker.helpers.multiple(
    () => {
      return GRANTED_RIGHTS_LINUX_SAMPLE_DOCUMENT(
        faker.helpers.arrayElement(users).userName,
        TimeWindows.toRandomTimestamp(TimeWindows.last30DayWindow())
      );
    },
    { count: 100 }
  );
};

const getSampleEndpointAccountSwitchLogs = (users: User[]) => {
  return faker.helpers.multiple(
    () => {
      return ACCOUNT_SWITCH_LINUX_SAMPLE_DOCUMENT(
        faker.helpers.arrayElement(users).userName,
        TimeWindows.toRandomTimestamp(TimeWindows.last30DayWindow())
      );
    },
    { count: 100 }
  );
};

const getSampleSystemLogs = (users: User[]) => {
  return faker.helpers.multiple(
    () => {
      return GRANTED_RIGHTS_WINDOWS_SAMPLE_DOCUMENT(
        faker.helpers.arrayElement(users).userName,
        TimeWindows.toRandomTimestamp(TimeWindows.last30DayWindow())
      );
    },
    { count: 100 }
  );
};

const getSampleOktaLogs = (users: User[]) => {
  return faker.helpers.multiple(
    () => {
      return GRANTED_RIGHTS_OKTA_SAMPLE_DOCUMENT(
        faker.helpers.arrayElement(users).userName,
        TimeWindows.toRandomTimestamp(TimeWindows.last30DayWindow())
      );
    },
    { count: 100 }
  );
};

const getSampleOktaUsersLogs = (count: number) => {
  const adminCount = Math.round((50 / 100) * count);
  const nonAdminCount = Math.max(0, count - adminCount);
  console.log(
    `Generating ${adminCount} admin users and ${nonAdminCount} non-admin users (total ${count})`
  );
  const adminDocs = Array.from({ length: adminCount }, () => makeDoc(true));
  const userDocs = Array.from({ length: nonAdminCount }, () => makeDoc(false));
  const docs = adminDocs.concat(userDocs);
  return docs;
};

const getSampleOktaEntityLogs = (count: number, syncInterval: number) => {
  const docs = createSampleFullSyncEvents({
    count,
    syncWindowMs: syncInterval,
  });
  return docs;
};

const getSampleOktaAuthenticationLogs = (users: User[]) => {
  return faker.helpers.multiple(
    () => {
      return OKTA_AUTHENTICATION(
        faker.helpers.arrayElement(users).userName,
        TimeWindows.toRandomTimestamp(TimeWindows.last30DayWindow())
      );
    },
    { count: 100 }
  );
};

const quickEnableRiskEngineAndRule = async () => {
  try {
    await createRule();
    await enableRiskScore();
  } catch (e) {
    console.log(e);
  }
};

const generatePrivilegedUserMonitoringData = async ({ users }: { users: User[] }) => {
  try {
    await reinitializeDataStream(endpointLogsDataStreamName, [
      ...getSampleEndpointLogs(users),
      ...getSampleEndpointAccountSwitchLogs(users),
    ]);

    await reinitializeDataStream(systemLogsDataStreamName, getSampleSystemLogs(users));

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
const generatePrivilegedUserIntegrationsSyncData = async ({
  usersCount,
  syncEventsCount = 10,
}: {
  usersCount: number;
  syncEventsCount?: number;
}) => {
  try {
    const sampleDocuments = getSampleOktaUsersLogs(usersCount);
    const sampleEntityDocuments = getSampleOktaEntityLogs(
      syncEventsCount,
      24 * 60 * 60 * 1000 // 1 day interval
    );
    await reinitializeDataStream(oktaLogsUsersDataStreamName, sampleDocuments);
    await reinitializeDataStream(oktaLogsEntityDataStreamName, sampleEntityDocuments);
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

const reinitializeDataStream = async (indexName: string, documents: Array<object>) => {
  await deleteDataStream(indexName);
  await createDataStream(indexName);
  await ingestIntoSourceIndex(indexName, documents);
};

export const privmonCommand = async ({
  options,
  userCount,
}: {
  options: PrivilegedUserMonitoringOption[];
  userCount: number;
}) => {
  const users = UserGenerator.getUsers(userCount);
  if (options.includes(PRIVILEGED_USER_MONITORING_OPTIONS.integrationSyncSourceEventData)) {
    await generatePrivilegedUserIntegrationsSyncData({
      usersCount: userCount,
    });
  }

  if (options.includes(PRIVILEGED_USER_MONITORING_OPTIONS.sourceEventData)) {
    await generatePrivilegedUserMonitoringData({ users });
  }

  if (options.includes(PRIVILEGED_USER_MONITORING_OPTIONS.anomalyData)) {
    await generatePrivilegedAccessDetectionData({ users });
  }

  await generateCSVFile({
    users,
    upload: options.includes(PRIVILEGED_USER_MONITORING_OPTIONS.csvFile),
  });

  if (options.includes(PRIVILEGED_USER_MONITORING_OPTIONS.riskEngineAndRule)) {
    await quickEnableRiskEngineAndRule();
  }
};
