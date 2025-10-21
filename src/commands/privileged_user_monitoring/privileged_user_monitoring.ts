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
import {
  assignAssetCriticality,
  createRule,
  enableRiskScore,
  forceStartDatafeeds,
  getPadStatus,
  initEntityEngineForEntityTypes,
  installPad,
  scheduleRiskEngineNow,
  setupPadMlModule,
} from '../../utils/kibana_api';
import {
  createSampleFullSyncEvents,
  makeAdUserDoc,
  makeDoc,
} from '../utils/integrations_sync_utils';
import {
  ASSET_CRITICALITY,
  AssetCriticality,
  PRIVILEGED_USER_MONITORING_OPTIONS,
  PrivilegedUserMonitoringOption,
} from '../../constants';
import { generatePrivilegedAccessDetectionData } from '../privileged_access_detection_ml/privileged_access_detection_ml';
import { generateCSVFile } from './generate_csv_file';
import { chunk } from 'lodash-es';
import { initializeSpace } from '../../utils';
import { getMetadataKQL } from '../../utils/doc_metadata';

//end point logs
const endpointLogsDataStreamName = 'logs-endpoint.events.process-default';

// system logs
const systemLogsDataStreamName = 'logs-system.security-default';
const oktaLogsDataStreamName = 'logs-okta.system-default';

// integrations sync user logs
const oktaLogsUsersDataStreamName = 'logs-entityanalytics_okta.user-default';
const adLogsUsersDataStreamName = 'logs-entityanalytics_ad.user-default';
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

const getSampleAdUsersLogs = (count: number) => {
  // implement here pls
  const adminCount = Math.round((50 / 100) * count);
  const nonAdminCount = Math.max(0, count - adminCount);
  console.log(
    `Generating ${adminCount} admin users and ${nonAdminCount} non-admin Active Directory users (total ${count})`
  );
  const userDocs = Array.from({ length: nonAdminCount }, (_, i) => makeAdUserDoc(false, i));
  const adminDocs = Array.from({ length: adminCount }, () => makeAdUserDoc(true));
  const docs = adminDocs.concat(userDocs);
  return docs;
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

const quickEnableRiskEngineAndRule = async (space: string) => {
  try {
    console.log('Enabling risk engine and rule...');
    await createRule({ space, query: getMetadataKQL() });
    await enableRiskScore(space);
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

export const generateADPrivilegedUserMonitoringData = async ({
  usersCount,
}: {
  usersCount: number;
}) => {
  try {
    await reinitializeDataStream(adLogsUsersDataStreamName, getSampleAdUsersLogs(usersCount));
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

const assignAssetCriticalityToUsers = async (opts: { users: User[]; space?: string }) => {
  const { users, space } = opts;
  const chunks = chunk(users, 1000);

  console.log(`Assigning asset criticality to ${users.length} users in ${chunks.length} chunks...`);

  const countMap: Record<AssetCriticality, number> = {
    unknown: 0,
    low_impact: 0,
    medium_impact: 0,
    high_impact: 0,
    extreme_impact: 0,
  };

  for (const chunk of chunks) {
    const records = chunk
      .map(({ userName }) => {
        const criticalityLevel = faker.helpers.arrayElement(ASSET_CRITICALITY);
        countMap[criticalityLevel]++;
        return {
          id_field: 'user.name',
          id_value: userName,
          criticality_level: criticalityLevel,
        };
      })
      .filter((r) => r.criticality_level !== 'unknown');

    if (records.length > 0) {
      await assignAssetCriticality(records, space);
    }
  }

  console.log('Assigned asset criticality counts:', countMap);
};

const runEngineEveryMinute = async (space: string) => {
  let stop = false;
  process.on('SIGINT', function () {
    console.log('Stopping risk engine scheduling...');
    stop = true;
  });

  while (!stop) {
    try {
      console.log('Scheduling risk engine to run now...');
      await scheduleRiskEngineNow(space);
      console.log('Scheduled risk engine, next run in 1 minute... (ctrl-c to stop)');
    } catch (e) {
      console.log('Error scheduling risk engine run:', e);
    }
    await new Promise((r) => setTimeout(r, 60 * 1000));
  }
};

const installPadAndStartJobs = async (space: string) => {
  console.log('Installing PAD...');
  const padRes = await installPad(space);
  console.log('PAD install response:', JSON.stringify(padRes));

  console.log('Setting up pad-ml module...');
  const mlRes = await setupPadMlModule(space);
  console.log('PAD ML setup response:', JSON.stringify(mlRes));

  const datafeedIds =
    mlRes?.datafeeds
      .sort((a, b) => (a.id < b.id ? -1 : 1)) // sort by id to ensure consistent order
      ?.filter((job) => job.success)
      .map((job) => job.id) ?? [];

  if (datafeedIds.length > 0) {
    console.log('Force starting PAD ML jobs:', datafeedIds);
    const first10DatafeedIds = datafeedIds.slice(0, 10);
    const startRes = await forceStartDatafeeds(first10DatafeedIds, space);
    console.log('Force start response:', JSON.stringify(startRes));
  } else {
    console.log('No PAD ML jobs to start');
  }

  const padStatus = await getPadStatus(space);
  console.log('PAD status:', JSON.stringify(padStatus));
};

export const privmonCommand = async ({
  options,
  userCount,
  space = 'default',
}: {
  options: PrivilegedUserMonitoringOption[];
  userCount: number;
  space: string;
}) => {
  console.log('Starting Privileged User Monitoring data generation in space:', space);

  await initializeSpace(space);

  const users = UserGenerator.getUsers(userCount);

  if (options.includes(PRIVILEGED_USER_MONITORING_OPTIONS.entityStore)) {
    await initEntityEngineForEntityTypes(['user', 'host', 'service'], space);
  }

  if (options.includes(PRIVILEGED_USER_MONITORING_OPTIONS.integrationSyncSourceEventData)) {
    await generatePrivilegedUserIntegrationsSyncData({
      usersCount: userCount,
    });
    await generateADPrivilegedUserMonitoringData({ usersCount: userCount });
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
    space,
  });

  if (options.includes(PRIVILEGED_USER_MONITORING_OPTIONS.assetCriticality)) {
    await assignAssetCriticalityToUsers({ users, space });
  }

  if (options.includes(PRIVILEGED_USER_MONITORING_OPTIONS.riskEngineAndRule)) {
    await quickEnableRiskEngineAndRule(space);
  }

  if (options.includes(PRIVILEGED_USER_MONITORING_OPTIONS.installPad)) {
    await installPadAndStartJobs(space);
  }

  console.log('Privileged User Monitoring data generation complete.');

  if (options.includes(PRIVILEGED_USER_MONITORING_OPTIONS.riskEngineAndRule)) {
    console.log('Scheduling risk engine to run every minute so risk scores are generated...');
    await runEngineEveryMinute(space);
  }
};
