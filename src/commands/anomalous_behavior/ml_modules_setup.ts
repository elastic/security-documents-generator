import pRetry from 'p-retry';
import {
  setupMlModule,
  installIntegrationAndCreatePolicy,
  forceStartDatafeeds,
  getMlJobsSummary,
} from '../../utils/kibana_api';
export const SECURITY_AUTH_MODULE = 'security_auth';
export const SECURITY_AUTH_JOB_IDS = [
  'auth_rare_source_ip_for_a_user',
  'suspicious_login_activity',
  'auth_rare_user',
  'auth_rare_hour_for_a_user',
];

export const PAD_MODULE = 'pad-ml';
export const PAD_JOB_IDS = [
  'pad_linux_rare_process_executed_by_user',
  'pad_linux_high_count_privileged_process_events_by_user',
];

export const LMD_MODULE = 'lmd-ml';
export const LMD_JOB_IDS = [
  'lmd_high_count_remote_file_transfer',
  'lmd_high_file_size_remote_file_transfer',
];

export const SECURITY_PACKETBEAT_MODULE = 'security_packetbeat';
export const SECURITY_PACKETBEAT_JOB_IDS = ['packetbeat_rare_server_domain'];

export const DED_MODULE = 'ded-ml';
export const DED_JOB_IDS = [
  'ded_high_bytes_written_to_external_device',
  'ded_high_bytes_written_to_external_device_airdrop',
  'ded_high_sent_bytes_destination_geo_country_iso_code',
  'ded_high_sent_bytes_destination_ip',
];

export const ALL_ANOMALY_JOB_IDS = [
  ...SECURITY_AUTH_JOB_IDS,
  ...PAD_JOB_IDS,
  ...LMD_JOB_IDS,
  ...SECURITY_PACKETBEAT_JOB_IDS,
  ...DED_JOB_IDS,
];

const DEFAULT_INDEX_PATTERN = 'ecs_compliant,auditbeat-*,winlogbeat-*';

const setupMlModulesWithRetry = (moduleId: string, indexPatternName: string, space?: string) =>
  pRetry(
    async () => {
      const response = (await setupMlModule(moduleId, indexPatternName, space)) as {
        jobs: Array<{ success: boolean; error?: { status: number; message: string } }>;
      };

      const allJobsSucceeded = response?.jobs.every((job) => {
        return job.success || (job.error?.status && job.error.status < 500);
      });

      if (!allJobsSucceeded) {
        throw new Error(
          `Expected all jobs to set up successfully, but got ${JSON.stringify(response)}`
        );
      }

      return response;
    },
    { retries: 5 }
  );

export const setupAnomalyMlModulesAndStartDatafeeds = async (
  space: string,
  modulesOnly: boolean
): Promise<void> => {
  try {
    // Security Auth (built-in, no Fleet integration)
    console.log('Setting up ML module: security_auth');
    await setupMlModulesWithRetry(SECURITY_AUTH_MODULE, DEFAULT_INDEX_PATTERN, space);
  } catch (err) {
    console.warn('Failed to setup Security Auth ML module:', err);
  }

  // PAD (requires Fleet integration)
  try {
    console.log('Installing PAD integration and creating policy');
    await installIntegrationAndCreatePolicy('pad', space);
    console.log('Setting up ML module: pad-ml');
    await setupMlModulesWithRetry(PAD_MODULE, DEFAULT_INDEX_PATTERN, space);
  } catch (err) {
    console.warn('Failed to setup PAD ML module:', err);
  }

  // LMD (requires Fleet integration)
  try {
    console.log('Installing LMD integration and creating policy');
    await installIntegrationAndCreatePolicy('lmd', space);
    console.log('Setting up ML module: lmd-ml');
    await setupMlModulesWithRetry(LMD_MODULE, DEFAULT_INDEX_PATTERN, space);
  } catch (err) {
    console.warn('Failed to setup LMD ML module:', err);
  }

  // Security Packetbeat (built-in)
  try {
    console.log('Setting up ML module: security_packetbeat');
    await setupMlModulesWithRetry(SECURITY_PACKETBEAT_MODULE, DEFAULT_INDEX_PATTERN, space);
  } catch (err) {
    console.warn('Failed to setup Security Packetbeat ML module:', err);
  }

  // DED (requires Fleet integration)
  try {
    console.log('Installing DED integration and creating policy');
    await installIntegrationAndCreatePolicy('ded', space);
    console.log('Setting up ML module: ded-ml');
    await setupMlModulesWithRetry(DED_MODULE, DEFAULT_INDEX_PATTERN, space);
  } catch (err) {
    console.warn('Failed to setup DED ML module:', err);
  }

  if (!modulesOnly) {
    // Start all datafeeds again so any that failed earlier can be retried together
    console.log('Starting all anomaly job datafeeds');
    await forceStartDatafeeds(
      ALL_ANOMALY_JOB_IDS.map((id) => `datafeed-${id}`),
      space
    );
    console.log('ML modules setup and datafeeds started.');
  } else {
    console.log(
      'ML modules setup completed. Skipping datafeed start and anomaly record generation due to --modules-only flag.'
    );
  }
};

const enabledStates = ['started', 'opened'];
const isJobStarted = (jobState: string, datafeedState: string): boolean => {
  return enabledStates.includes(jobState) && enabledStates.includes(datafeedState);
};

export const waitForAllJobsToStart = async (jobIds: string[], space?: string): Promise<void> => {
  const timeoutMs = 5 * 60 * 1000; // 5 minutes in milliseconds
  const startTime = Date.now();

  console.log(`Waiting for ${jobIds.length} job(s) to start: ${jobIds.join(', ')}`);

  await pRetry(
    async () => {
      // Check if we've exceeded the timeout
      const elapsed = Date.now() - startTime;
      if (elapsed > timeoutMs) {
        throw new Error(`waitForAllJobsToStart exceeded timeout of ${timeoutMs}ms`);
      }

      const jobs = (await getMlJobsSummary(jobIds, space)) as Array<{
        id: string;
        jobState: string;
        datafeedState: string;
      }>;

      // Check if all jobs are found
      if (jobs.length !== jobIds.length) {
        const foundJobIds = jobs.map((job) => job.id);
        const missingJobIds = jobIds.filter((id) => !foundJobIds.includes(id));
        if (missingJobIds.length > 0) {
          const errorMsg = `Not all jobs found. Missing: ${missingJobIds.join(', ')}.`;
          console.warn(errorMsg);
          throw new Error(errorMsg);
        }
      }

      // Check if all the jobs we care about are started
      const notStartedJobs = jobs.filter(
        (job) => jobIds.includes(job.id) && !isJobStarted(job.jobState, job.datafeedState)
      );
      const startedCount = jobs.length - notStartedJobs.length;

      if (notStartedJobs.length > 0) {
        const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
        console.log(
          `[${elapsedSeconds}s] Status: ${startedCount}/${
            jobs.length
          } jobs started. Waiting for: ${notStartedJobs.map((job) => job.id).join(', ')}`
        );
        const jobStates = notStartedJobs.map(
          (job) => `${job.id} (jobState: ${job.jobState}, datafeedState: ${job.datafeedState})`
        );
        throw new Error(`Not all jobs are started. Jobs not started: ${jobStates.join(', ')}`);
      }

      const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
      console.log(`[${elapsedSeconds}s] All ${jobs.length} job(s) are now started!`);
      return jobs;
    },
    {
      retries: 10, // High number of retries to allow for the 5 minute timeout
      minTimeout: 2000, // 2 seconds minimum between retries
      maxTimeout: 10000, // 10 seconds maximum between retries
      factor: 1.5, // Exponential backoff factor
      onFailedAttempt: (error) => {
        console.log(error);
        const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
        console.log(
          `[${elapsedSeconds}s] Retry attempt ${error.attemptNumber} failed. ${error.retriesLeft} retries left. Error: ${error}`
        );
      },
    }
  );
};
