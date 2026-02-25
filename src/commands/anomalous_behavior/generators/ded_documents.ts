import { flatMap, range } from 'lodash-es';
import { DED_JOB_IDS } from '../ml_modules_setup';
import { faker } from '@faker-js/faker';
import { generateCommonFields } from './utils';

const generateDestinationIpRecord = (ndx: number) => {
  const commonFields = generateCommonFields();
  const sourceIp = faker.internet.ip();
  const destinationIp = faker.internet.ip();
  const user = `insider-${ndx}`;
  const host = `server-${ndx + 1}`;

  return {
    ...commonFields,
    job_id: 'ded_high_sent_bytes_destination_ip',
    function: 'high_sum',
    function_description: 'sum',
    field_name: 'source.bytes',
    over_field_name: 'destination.ip',
    over_field_value: destinationIp,
    causes: [
      {
        probability: 0.018332756775264587,
        function: 'high_sum',
        function_description: 'sum',
        typical: [105276079.03787479],
        actual: [Math.ceil(Math.random() * 2000000000.0)],
        field_name: 'source.bytes',
        over_field_name: 'destination.ip',
        over_field_value: destinationIp,
      },
    ],
    influencers: [
      {
        influencer_field_name: 'host.name',
        influencer_field_values: [host],
      },
      {
        influencer_field_name: 'source.ip',
        influencer_field_values: [sourceIp],
      },
      {
        influencer_field_name: 'destination.ip',
        influencer_field_values: [destinationIp],
      },
      {
        influencer_field_name: 'user.name',
        influencer_field_values: [user],
      },
    ],
    'process.name': ['svchost.exe'],
    'user.name': [user],
    'source.ip': [sourceIp],
    'host.name': [host],
    'destination.ip': [destinationIp],
  };
};

const generateDestinationGeoCountryRecord = (ndx: number) => {
  const commonFields = generateCommonFields();
  const country = faker.location.country();
  const countryCode = faker.location.countryCode();
  const sourceIp = faker.internet.ip();
  const destinationIps = range(Math.ceil(Math.random() * 3)).map(() => faker.internet.ip());
  const user = `insider-${ndx}`;
  const host = `server-${ndx + 1}`;

  return {
    ...commonFields,
    job_id: 'ded_high_sent_bytes_destination_geo_country_iso_code',
    function: 'high_sum',
    function_description: 'sum',
    field_name: 'source.bytes',
    over_field_name: 'destination.geo.country_iso_code',
    over_field_value: countryCode,
    causes: [
      {
        probability: 0.018332756775264587,
        function: 'high_sum',
        function_description: 'sum',
        typical: [105276079.03787479],
        actual: [Math.ceil(Math.random() * 2000000000.0)],
        field_name: 'source.bytes',
        over_field_name: 'destination.geo.country_iso_code',
        over_field_value: countryCode,
      },
    ],
    influencers: [
      {
        influencer_field_name: 'host.name',
        influencer_field_values: [host],
      },
      {
        influencer_field_name: 'destination.geo.country_name',
        influencer_field_values: [country],
      },
      {
        influencer_field_name: 'source.ip',
        influencer_field_values: [sourceIp],
      },
      {
        influencer_field_name: 'destination.ip',
        influencer_field_values: destinationIps,
      },
      {
        influencer_field_name: 'destination.geo.country_iso_code',
        influencer_field_values: [countryCode],
      },
      {
        influencer_field_name: 'process.name',
        influencer_field_values: ['exfil.exe'],
      },
      {
        influencer_field_name: 'user.name',
        influencer_field_values: [user],
      },
    ],
  };
};

const generateExternalDeviceAirdropRecord = (ndx: number) => {
  const commonFields = generateCommonFields();
  const user = `insider-${ndx}`;
  const host = `mac-server-${ndx + 1}`;
  const filename = `${faker.word.noun()}_${faker.system.fileName()}`;
  const filepath = `${faker.system.directoryPath()}${filename}`;

  return {
    ...commonFields,
    job_id: 'ded_high_bytes_written_to_external_device_airdrop',
    multi_bucket_impact: -5,
    partition_field_name: 'host.name',
    partition_field_value: host,
    function: 'high_sum',
    function_description: 'sum',
    typical: [2932993.9753766167],
    actual: [Math.ceil(Math.random() * 2000000000.0)],
    field_name: 'file.size',
    influencers: [
      {
        influencer_field_name: 'host.name',
        influencer_field_values: [host],
      },
      {
        influencer_field_name: 'file.path',
        influencer_field_values: [filepath],
      },
      {
        influencer_field_name: 'file.name',
        influencer_field_values: [filename],
      },
      {
        influencer_field_name: 'process.name',
        influencer_field_values: ['sharingd'],
      },
      {
        influencer_field_name: 'user.name',
        influencer_field_values: [user],
      },
    ],
    anomaly_score_explanation: {
      single_bucket_impact: 2,
      lower_confidence_bound: 43597.936156599026,
      typical_value: 2932993.9753766167,
      upper_confidence_bound: 197306734.93763757,
    },
    'process.name': ['sharingd'],
    'file.path': [filepath],
    'file.name': [filename],
    'user.name': [user],
    'host.name': [host],
  };
};

const generateExternalDeviceRecord = (ndx: number) => {
  const commonFields = generateCommonFields();
  const user = `insider-${ndx}`;
  const host = `web-server-${ndx + 1}`;
  const filename = `${faker.word.noun()}_${faker.system.fileName()}`;
  const filepath = `${faker.system.directoryPath()}${filename}`;
  const processname = `${faker.hacker.verb()}${faker.hacker.noun()}.exe`;

  return {
    ...commonFields,
    job_id: 'ded_high_bytes_written_to_external_device',
    multi_bucket_impact: -5,
    partition_field_name: 'host.name',
    partition_field_value: host,
    function: 'high_sum',
    function_description: 'sum',
    typical: [56066317.38093647],
    actual: [Math.ceil(Math.random() * 2000000000.0)],
    field_name: 'file.size',
    influencers: [
      {
        influencer_field_name: 'host.name',
        influencer_field_values: [host],
      },
      {
        influencer_field_name: 'file.path',
        influencer_field_values: [filepath],
      },
      {
        influencer_field_name: 'file.name',
        influencer_field_values: [filename],
      },
      {
        influencer_field_name: 'process.name',
        influencer_field_values: [processname],
      },
      {
        influencer_field_name: 'file.Ext.device.bus_type',
        influencer_field_values: ['USB'],
      },
      {
        influencer_field_name: 'user.name',
        influencer_field_values: [user],
      },
    ],
    anomaly_score_explanation: {
      single_bucket_impact: 2,
      lower_confidence_bound: 0,
      typical_value: 56066317.38093647,
      upper_confidence_bound: 554606210.0092009,
    },
    'process.name': [processname],
    'file.path': [filepath],
    'file.Ext.device.bus_type': ['USB'],
    'file.name': [filename],
    'user.name': [user],
    'host.name': [host],
  };
};

export const generateDedRecords = (numDocs: number = 10): Array<Record<string, unknown>> => {
  return flatMap(
    DED_JOB_IDS.map((jobId) => {
      return range(numDocs).map((val) => {
        switch (jobId) {
          case 'ded_high_bytes_written_to_external_device':
            return generateExternalDeviceRecord(val);
          case 'ded_high_bytes_written_to_external_device_airdrop':
            return generateExternalDeviceAirdropRecord(val);
          case 'ded_high_sent_bytes_destination_geo_country_iso_code':
            return generateDestinationGeoCountryRecord(val);
          case 'ded_high_sent_bytes_destination_ip':
            return generateDestinationIpRecord(val);
          default:
            throw new Error(`Unexpected job ID: ${jobId}`);
        }
      });
    })
  );
};
