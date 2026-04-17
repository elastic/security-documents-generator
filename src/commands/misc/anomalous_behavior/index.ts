import { type MappingTypeMapping } from '@elastic/elasticsearch/lib/api/types';
import { indexCheck } from '../../utils/indices.ts';
import { log } from '../../../utils/logger.ts';
import { bulkIngest } from '../../shared/elasticsearch.ts';
import {
  ALL_ANOMALY_JOB_IDS,
  waitForAllJobsToStart,
  setupAnomalyMlModulesAndStartDatafeeds,
  ALL_ANOMALY_JOB_IDS_V2,
} from './ml_modules_setup.ts';
import windowsServicesMappings from './mappings/windowsServicesMappings.json' with { type: 'json' };
import auditbeatHostsMappings from './mappings/auditbeatHostsMappings.json' with { type: 'json' };
import ecsCompliantMappings from './mappings/ecsCompliantMappings.json' with { type: 'json' };
import securityAuthAnomaliesMappings from './mappings/securityAuthAnomaliesMappings.json' with { type: 'json' };
import padAnomaliesMappings from './mappings/padAnomaliesMappings.json' with { type: 'json' };
import lmdAnomaliesMappings from './mappings/lmdAnomaliesMappings.json' with { type: 'json' };
import packetbeatAnomaliesMappings from './mappings/packetbeatAnomaliesMappings.json' with { type: 'json' };
import sharedAnomaliesMappings from './mappings/sharedAnomaliesMappings.json' with { type: 'json' };
import { createAlertsIndex } from '../../../utils/kibana_api.ts';
import {
  generateSecurityAuthRecords,
  generatePadRecords,
  generateLmdRecords,
  generateDedRecords,
  generatePacketbeatRecords,
  generateSourceData,
  applyV2Fields,
  type DedEntityCorpus,
} from './generators/index.ts';
import { fetchHostIdentitiesForDed, fetchUserIdentitiesForDed } from '../../utils/entity_store.ts';

const ENTITY_STORE_CORRELATION_MAX = 10;

const WINDOWS_SERVICES_INDEX = 'winlogbeat-windows-services';
const AUDITBEAT_HOSTS_INDEX = 'auditbeat-hosts';
const ECS_COMPLIANT_INDEX = 'ecs_compliant';
const SECURITY_AUTH_ANOMALIES_INDEX = '.ml-anomalies-security_auth';
const PAD_ANOMALIES_INDEX = '.ml-anomalies-pad';
const LMD_ANOMALIES_INDEX = '.ml-anomalies-lmd';
const PACKETBEAT_ANOMALIES_INDEX = '.ml-anomalies-packetbeat';
const SHARED_ANOMALIES_INDEX = '.ml-anomalies-shared';

const generateSecurityAuthRecordData = async (recordCount: number, v2: boolean): Promise<void> => {
  log.info('Generating and indexing source data for Security Auth ML module...');
  const records = generateSecurityAuthRecords(recordCount);
  const finalRecords = v2 ? records.map(applyV2Fields) : records;
  await bulkIngest({
    index: SECURITY_AUTH_ANOMALIES_INDEX,
    documents: finalRecords as object[],
    chunkSize: 100,
    action: 'index',
    showProgress: true,
    metadata: false,
    refresh: true,
  });
  log.info(`Indexed ${records.length} anomaly record(s) into ${SECURITY_AUTH_ANOMALIES_INDEX}`);
};

const generatePadRecordData = async (recordCount: number, v2: boolean): Promise<void> => {
  log.info('Generating and indexing source data for PAD ML module...');
  const records = generatePadRecords(recordCount);
  const finalRecords = v2 ? records.map(applyV2Fields) : records;
  await bulkIngest({
    index: PAD_ANOMALIES_INDEX,
    documents: finalRecords as object[],
    chunkSize: 100,
    action: 'index',
    showProgress: true,
    metadata: false,
    refresh: true,
  });
  log.info(`Indexed ${records.length} anomaly record(s) into ${PAD_ANOMALIES_INDEX}`);
};

const generateLmdRecordData = async (recordCount: number, v2: boolean): Promise<void> => {
  log.info('Generating and indexing source data for LMD ML module...');
  const records = generateLmdRecords(recordCount);
  const finalRecords = v2 ? records.map(applyV2Fields) : records;
  await bulkIngest({
    index: LMD_ANOMALIES_INDEX,
    documents: finalRecords as object[],
    chunkSize: 100,
    action: 'index',
    showProgress: true,
    metadata: false,
    refresh: true,
  });
  log.info(`Indexed ${records.length} anomaly record(s) into ${LMD_ANOMALIES_INDEX}`);
};

const generatePacketbeatRecordData = async (recordCount: number, v2: boolean): Promise<void> => {
  log.info('Generating and indexing source data for Packetbeat ML module...');
  const records = generatePacketbeatRecords(recordCount);
  const finalRecords = v2 ? records.map(applyV2Fields) : records;
  await bulkIngest({
    index: PACKETBEAT_ANOMALIES_INDEX,
    documents: finalRecords as object[],
    chunkSize: 100,
    action: 'index',
    showProgress: true,
    metadata: false,
    refresh: true,
  });
  log.info(`Indexed ${records.length} anomaly record(s) into ${PACKETBEAT_ANOMALIES_INDEX}`);
};

const generateDedRecordData = async (
  recordCount: number,
  v2: boolean,
  dedCorpus?: DedEntityCorpus,
): Promise<void> => {
  log.info('Generating and indexing source data for DED ML module...');
  const records = generateDedRecords(recordCount, dedCorpus);
  const finalRecords = v2 ? records.map(applyV2Fields) : records;
  await bulkIngest({
    index: SHARED_ANOMALIES_INDEX,
    documents: finalRecords as object[],
    chunkSize: 100,
    action: 'index',
    showProgress: true,
    metadata: false,
    refresh: true,
  });
  log.info(`Indexed ${records.length} anomaly record(s) into ${SHARED_ANOMALIES_INDEX}`);
};

const generateAnomalousBehaviorRecords = async (
  recordCount: number,
  v2: boolean,
  dedCorpus?: DedEntityCorpus,
): Promise<void> => {
  log.info('Generating and indexing anomalous behavior ML records...');

  await generateSecurityAuthRecordData(recordCount, v2);
  await generatePadRecordData(recordCount, v2);
  await generateLmdRecordData(recordCount, v2);
  await generatePacketbeatRecordData(recordCount, v2);
  await generateDedRecordData(recordCount, v2, dedCorpus);

  log.info(`Finished: generating anomalous behavior records`);
};

const generateSource = async (): Promise<void> => {
  log.info('Generating source data for anomaly detection ML modules...');
  // Need to populate the source indices with some data so the ML modules have something to process when we start the datafeeds
  const records = await generateSourceData();
  await bulkIngest({
    index: WINDOWS_SERVICES_INDEX,
    documents: records as object[],
    chunkSize: 100,
    action: 'index',
    showProgress: true,
    metadata: false,
    refresh: true,
  });
};

const setupIndexMappings = async (space: string): Promise<void> => {
  log.info('Setting up indices and mappings for anomalies data...');
  await createAlertsIndex(space);
  await indexCheck(WINDOWS_SERVICES_INDEX, {
    mappings: windowsServicesMappings as MappingTypeMapping,
  });
  await indexCheck(AUDITBEAT_HOSTS_INDEX, {
    mappings: auditbeatHostsMappings as MappingTypeMapping,
  });
  await indexCheck(ECS_COMPLIANT_INDEX, {
    mappings: ecsCompliantMappings as MappingTypeMapping,
  });
  await indexCheck(SECURITY_AUTH_ANOMALIES_INDEX, {
    mappings: securityAuthAnomaliesMappings as MappingTypeMapping,
  });
  await indexCheck(PAD_ANOMALIES_INDEX, {
    mappings: padAnomaliesMappings as MappingTypeMapping,
  });
  await indexCheck(LMD_ANOMALIES_INDEX, {
    mappings: lmdAnomaliesMappings as MappingTypeMapping,
  });
  await indexCheck(PACKETBEAT_ANOMALIES_INDEX, {
    mappings: packetbeatAnomaliesMappings as MappingTypeMapping,
  });
  await indexCheck(SHARED_ANOMALIES_INDEX, {
    mappings: sharedAnomaliesMappings as MappingTypeMapping,
  });
};

export const generateAnomalousBehaviorDataWithMlJobs = async (
  space: string,
  recordCount: number,
  generateAnomalyData: boolean,
  v2 = false,
  correlateWithEntityStore = false,
): Promise<void> => {
  await setupIndexMappings(space);
  await generateSource();
  await setupAnomalyMlModulesAndStartDatafeeds(space, generateAnomalyData, v2);

  if (!generateAnomalyData) {
    let dedCorpus: DedEntityCorpus | undefined;

    if (correlateWithEntityStore) {
      const corpus: DedEntityCorpus = {};

      const hosts = await fetchHostIdentitiesForDed(space, ENTITY_STORE_CORRELATION_MAX);
      if (hosts.length === 0) {
        log.warn(`No usable host identities.`);
      } else {
        corpus.hosts = hosts;
      }

      const users = await fetchUserIdentitiesForDed(space, ENTITY_STORE_CORRELATION_MAX);
      if (users.length === 0) {
        log.warn(`No usable user identities.`);
      } else {
        corpus.users = users;
      }

      if (!corpus.hosts?.length && !corpus.users?.length) {
        log.error(
          `Could not build any correlated host or user identities after fetch. Make sure to populate the entity store before using --correlate-with-entity-store.`,
        );
        process.exit(1);
      }
      dedCorpus = corpus;
    }

    await generateAnomalousBehaviorRecords(recordCount, v2, dedCorpus);
    await waitForAllJobsToStart(v2 ? ALL_ANOMALY_JOB_IDS_V2 : ALL_ANOMALY_JOB_IDS, space);
  }
};
