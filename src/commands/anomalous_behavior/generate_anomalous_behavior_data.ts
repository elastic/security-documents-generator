import { MappingTypeMapping } from '@elastic/elasticsearch/lib/api/types';
import { indexCheck } from '../utils/indices';
import { bulkIngest } from '../shared/elasticsearch';
import {
  ALL_ANOMALY_JOB_IDS,
  waitForAllJobsToStart,
  setupAnomalyMlModulesAndStartDatafeeds,
} from './ml_modules_setup';
import windowsServicesMappings from './mappings/windowsServicesMappings.json' assert { type: 'json' };
import auditbeatHostsMappings from './mappings/auditbeatHostsMappings.json' assert { type: 'json' };
import ecsCompliantMappings from './mappings/ecsCompliantMappings.json' assert { type: 'json' };
import securityAuthAnomaliesMappings from './mappings/securityAuthAnomaliesMappings.json' assert { type: 'json' };
import padAnomaliesMappings from './mappings/padAnomaliesMappings.json' assert { type: 'json' };
import lmdAnomaliesMappings from './mappings/lmdAnomaliesMappings.json' assert { type: 'json' };
import packetbeatAnomaliesMappings from './mappings/packetbeatAnomaliesMappings.json' assert { type: 'json' };
import sharedAnomaliesMappings from './mappings/sharedAnomaliesMappings.json' assert { type: 'json' };
import { createAlertsIndex } from '../../utils/kibana_api';
import {
  generateSecurityAuthRecords,
  generatePadRecords,
  generateLmdRecords,
  generateDedRecords,
  generatePacketbeatRecords,
  generateSourceData,
} from './generators';

const WINDOWS_SERVICES_INDEX = 'winlogbeat-windows-services';
const AUDITBEAT_HOSTS_INDEX = 'auditbeat-hosts';
const ECS_COMPLIANT_INDEX = 'ecs_compliant';
const SECURITY_AUTH_ANOMALIES_INDEX = '.ml-anomalies-security_auth';
const PAD_ANOMALIES_INDEX = '.ml-anomalies-pad';
const LMD_ANOMALIES_INDEX = '.ml-anomalies-lmd';
const PACKETBEAT_ANOMALIES_INDEX = '.ml-anomalies-packetbeat';
const SHARED_ANOMALIES_INDEX = '.ml-anomalies-shared';

const generateSecurityAuthRecordData = async (recordCount: number): Promise<void> => {
  console.log('Generating and indexing source data for Security Auth ML module...');
  const records = generateSecurityAuthRecords(recordCount);
  await bulkIngest({
    index: SECURITY_AUTH_ANOMALIES_INDEX,
    documents: records as object[],
    chunkSize: 100,
    action: 'index',
    showProgress: true,
    metadata: false,
    refresh: true,
  });
  console.log(`Indexed ${records.length} anomaly record(s) into ${SECURITY_AUTH_ANOMALIES_INDEX}`);
};

const generatePadRecordData = async (recordCount: number): Promise<void> => {
  console.log('Generating and indexing source data for PAD ML module...');
  const records = generatePadRecords(recordCount);
  await bulkIngest({
    index: PAD_ANOMALIES_INDEX,
    documents: records as object[],
    chunkSize: 100,
    action: 'index',
    showProgress: true,
    metadata: false,
    refresh: true,
  });
  console.log(`Indexed ${records.length} anomaly record(s) into ${PAD_ANOMALIES_INDEX}`);
};

const generateLmdRecordData = async (recordCount: number): Promise<void> => {
  console.log('Generating and indexing source data for LMD ML module...');
  const records = generateLmdRecords(recordCount);
  await bulkIngest({
    index: LMD_ANOMALIES_INDEX,
    documents: records as object[],
    chunkSize: 100,
    action: 'index',
    showProgress: true,
    metadata: false,
    refresh: true,
  });
  console.log(`Indexed ${records.length} anomaly record(s) into ${LMD_ANOMALIES_INDEX}`);
};

const generatePacketbeatRecordData = async (recordCount: number): Promise<void> => {
  console.log('Generating and indexing source data for Packetbeat ML module...');
  const records = generatePacketbeatRecords(recordCount);
  await bulkIngest({
    index: PACKETBEAT_ANOMALIES_INDEX,
    documents: records as object[],
    chunkSize: 100,
    action: 'index',
    showProgress: true,
    metadata: false,
    refresh: true,
  });
  console.log(`Indexed ${records.length} anomaly record(s) into ${PACKETBEAT_ANOMALIES_INDEX}`);
};

const generateDedRecordData = async (recordCount: number): Promise<void> => {
  console.log('Generating and indexing source data for DED ML module...');
  const records = generateDedRecords(recordCount);
  await bulkIngest({
    index: SHARED_ANOMALIES_INDEX,
    documents: records as object[],
    chunkSize: 100,
    action: 'index',
    showProgress: true,
    metadata: false,
    refresh: true,
  });
  console.log(`Indexed ${records.length} anomaly record(s) into ${SHARED_ANOMALIES_INDEX}`);
};

const generateAnomalousBehaviorRecords = async (recordCount: number): Promise<void> => {
  console.log('Generating and indexing anomalous behavior ML records...');

  await generateSecurityAuthRecordData(recordCount);
  await generatePadRecordData(recordCount);
  await generateLmdRecordData(recordCount);
  await generatePacketbeatRecordData(recordCount);
  await generateDedRecordData(recordCount);

  console.log(`Finished: generating anomalous behavior records`);
};

const generateSource = async (): Promise<void> => {
  console.log('Generating source data for anomaly detection ML modules...');
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
  console.log('Setting up indices and mappings for anomalies data...');
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
  modulesOnly: boolean
): Promise<void> => {
  await setupIndexMappings(space);
  await generateSource();
  await setupAnomalyMlModulesAndStartDatafeeds(space, modulesOnly);

  if (!modulesOnly) {
    await generateAnomalousBehaviorRecords(recordCount);
    await waitForAllJobsToStart(ALL_ANOMALY_JOB_IDS, space);
  }
};
