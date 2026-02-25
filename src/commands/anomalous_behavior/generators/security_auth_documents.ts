import { flatMap, range } from 'lodash-es';
import { SECURITY_AUTH_JOB_IDS } from '../ml_modules_setup';
import { faker } from '@faker-js/faker';
import { generateCommonFields } from './utils';

const generateRareHourForUserRecord = (ndx: number) => {
  const commonFields = generateCommonFields();
  const user = `user-${ndx}`;
  const host = `web-server-${ndx + 1}`;
  const sourceIp = faker.internet.ip();

  return {
    ...commonFields,
    job_id: 'auth_rare_hour_for_a_user',
    by_field_name: 'user.name',
    by_field_value: user,
    function: 'time_of_day',
    function_description: 'time_of_day',
    typical: [9.0],
    actual: [Math.ceil(Math.random() * 3)],
    influencers: [
      {
        influencer_field_name: 'user.name',
        influencer_field_values: [user],
      },
      {
        influencer_field_name: 'source.ip',
        influencer_field_values: [sourceIp],
      },
      {
        influencer_field_name: 'host.name',
        influencer_field_values: [host],
      },
    ],
    'user.name': [user],
    'source.ip': [sourceIp],
    'host.name': [host],
  };
};

const generateRareUserRecord = (ndx: number) => {
  const commonFields = generateCommonFields();
  const user = `rare-user-${ndx}`;
  const host = `web-server-${ndx + 1}`;
  const sourceIp = faker.internet.ip();

  return {
    ...commonFields,
    job_id: 'auth_rare_user',
    by_field_name: 'user.name',
    by_field_value: user,
    partition_field_name: 'user.name',
    partition_field_value: user,
    function: 'rare',
    function_description: 'rare',
    influencers: [
      {
        influencer_field_name: 'user.name',
        influencer_field_values: [user],
      },
      {
        influencer_field_name: 'source.ip',
        influencer_field_values: [sourceIp],
      },
      {
        influencer_field_name: 'host.name',
        influencer_field_values: [host],
      },
    ],
    'user.name': [user],
    'source.ip': [sourceIp],
    'host.name': [host],
  };
};

const generateSuspicousLoginRecord = (ndx: number) => {
  const commonFields = generateCommonFields();
  const numUsers = Math.ceil(Math.random() * 3);
  const users = range(numUsers).map(() => faker.internet.username());
  const host = `web-server-${ndx + 1}`;
  const sourceIps = range(numUsers).map(() => faker.internet.ip());

  return {
    ...commonFields,
    job_id: 'suspicious_login_activity',
    partition_field_name: 'host.name',
    partition_field_value: host,
    function: 'high_non_zero_count',
    function_description: 'high_non_zero_count',
    typical: [12.0],
    actual: [Math.ceil(Math.random() * 300)],
    influencers: [
      {
        influencer_field_name: 'host.name',
        influencer_field_values: [host],
      },
      {
        influencer_field_name: 'user.name',
        influencer_field_values: users,
      },
      {
        influencer_field_name: 'source.ip',
        influencer_field_values: sourceIps,
      },
    ],
    'host.name': [host],
    'user.name': users,
    'source.ip': sourceIps,
  };
};

const generateRareSourceIpForUserRecord = (ndx: number) => {
  const commonFields = generateCommonFields();
  const user = `svc-account-${ndx}`;
  const host = `web-server-${ndx + 1}`;
  const sourceIp = faker.internet.ip();
  const countryCode = faker.location.countryCode();
  const city = faker.location.city();

  return {
    ...commonFields,
    job_id: 'auth_rare_source_ip_for_a_user',
    partition_field_name: 'user.name',
    partition_field_value: user,
    function: 'rare',
    function_description: 'rare',
    field_name: 'source.ip',
    influencers: [
      {
        influencer_field_name: 'user.name',
        influencer_field_values: [user],
      },
      {
        influencer_field_name: 'source.ip',
        influencer_field_values: [sourceIp],
      },
      {
        influencer_field_name: 'source.geo.country_iso_code',
        influencer_field_values: [countryCode],
      },
      {
        influencer_field_name: 'host.name',
        influencer_field_values: [host],
      },
    ],
    'user.name': [user],
    'source.ip': [sourceIp],
    'source.geo.country_iso_code': [countryCode],
    'source.geo.region_name': [city],
    'source.geo.city_name': [city],
    'host.name': [host],
  };
};

export const generateSecurityAuthRecords = (
  numDocs: number = 10
): Array<Record<string, unknown>> => {
  return flatMap(
    SECURITY_AUTH_JOB_IDS.map((jobId) => {
      return range(numDocs).map((val) => {
        switch (jobId) {
          case 'auth_rare_source_ip_for_a_user':
            return generateRareSourceIpForUserRecord(val);
          case 'suspicious_login_activity':
            return generateSuspicousLoginRecord(val);
          case 'auth_rare_user':
            return generateRareUserRecord(val);
          case 'auth_rare_hour_for_a_user':
            return generateRareHourForUserRecord(val);
          default:
            throw new Error(`Unexpected job ID: ${jobId}`);
        }
      });
    })
  );
};
