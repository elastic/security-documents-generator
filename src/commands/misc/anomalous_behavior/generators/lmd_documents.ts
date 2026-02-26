import { flatMap, range } from 'lodash-es';
import { LMD_JOB_IDS } from '../ml_modules_setup';
import { faker } from '@faker-js/faker';
import { generateCommonFields, getRandomValues } from './utils';

const processNames = ['scp', 'ftp', 'smbclient', 'rsync'];

const generateBigFileSizeRemoteFileTransferRecord = (ndx: number) => {
  const commonFields = generateCommonFields();
  const partitionFieldRand = Math.floor(Math.random() * 2);
  const user = `admin-${faker.internet.username()}`;
  const host = `db-server-prod-${ndx + 1}`;
  const processes = getRandomValues(processNames, 1);
  const sourceIp = faker.internet.ip();
  const destinationIp = faker.internet.ip();

  return {
    ...commonFields,
    job_id: 'lmd_high_file_size_remote_file_transfer',
    partition_field_name: partitionFieldRand === 0 ? 'user.name' : 'host.name',
    partition_field_value: partitionFieldRand === 0 ? user : host,
    function: 'high_sum',
    function_description: 'sum',
    field_name: 'file.size',
    typical: [10485760.0],
    actual: [Math.ceil(Math.random() * 2000000000.0)],
    influencers: [
      {
        influencer_field_name: partitionFieldRand === 0 ? 'user.name' : 'host.name',
        influencer_field_values: [partitionFieldRand === 0 ? user : host],
      },
      {
        influencer_field_name: partitionFieldRand === 0 ? 'host.name' : 'user.name',
        influencer_field_values: [partitionFieldRand === 0 ? host : user],
      },
      {
        influencer_field_name: 'process.name',
        influencer_field_values: processes,
      },
      {
        influencer_field_name: 'source.ip',
        influencer_field_values: [sourceIp],
      },
      {
        influencer_field_name: 'destination.ip',
        influencer_field_values: [destinationIp],
      },
    ],
    'user.name': [user],
    'host.name': [host],
    'process.name': processes,
    'source.ip': [sourceIp],
    'destination.ip': [destinationIp],
    'file.size': [1073741824],
  };
};

const generateHighCountRemoteFileTransferRecord = (ndx: number) => {
  const commonFields = generateCommonFields();
  const user = `svc-${ndx}`;
  const host = `web-server-${ndx + 1}`;
  const processes = getRandomValues(processNames, 1);
  const sourceIp = faker.internet.ip();
  const destinationIps = range(Math.ceil(Math.random() * 3)).map(() => faker.internet.ip());

  return {
    ...commonFields,
    job_id: 'lmd_high_count_remote_file_transfer',
    partition_field_name: 'user.name',
    partition_field_value: user,
    function: 'count',
    function_description: 'count',
    typical: [2.0],
    actual: [Math.ceil(Math.random() * 300)],
    influencers: [
      {
        influencer_field_name: 'user.name',
        influencer_field_values: [user],
      },
      {
        influencer_field_name: 'host.name',
        influencer_field_values: [host],
      },
      {
        influencer_field_name: 'process.name',
        influencer_field_values: processes,
      },
      {
        influencer_field_name: 'source.ip',
        influencer_field_values: [sourceIp],
      },
      {
        influencer_field_name: 'destination.ip',
        influencer_field_values: destinationIps,
      },
    ],
    'user.name': [user],
    'host.name': [host],
    'process.name': processes,
    'source.ip': [sourceIp],
    'destination.ip': destinationIps,
  };
};

export const generateLmdRecords = (numDocs: number = 10): Array<Record<string, unknown>> => {
  return flatMap(
    LMD_JOB_IDS.map((jobId) => {
      return range(numDocs).map((val) => {
        switch (jobId) {
          case 'lmd_high_count_remote_file_transfer':
            return generateHighCountRemoteFileTransferRecord(val);
          case 'lmd_high_file_size_remote_file_transfer':
            return generateBigFileSizeRemoteFileTransferRecord(val);
          default:
            throw new Error(`Unexpected job ID: ${jobId}`);
        }
      });
    })
  );
};
