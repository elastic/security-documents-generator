import { flatMap, range } from 'lodash-es';
import { PAD_JOB_IDS } from '../ml_modules_setup';
import { faker } from '@faker-js/faker';
import { generateCommonFields, getRandomValues } from './utils';

const generatePrivilegedProcessEventsRecord = (ndx: number) => {
  const commonFields = generateCommonFields();
  const user = `privileged-user-${faker.internet.username()}`;
  const host = `linux-server-${ndx + 1}`;

  return {
    ...commonFields,
    job_id: 'pad_linux_high_count_privileged_process_events_by_user',
    partition_field_name: 'user.name',
    partition_field_value: user,
    function: 'high_non_zero_count',
    function_description: 'high_non_zero_count',
    by_field_name: 'event.action',
    by_field_value: 'exec',
    typical: [3.0],
    actual: [Math.ceil(Math.random() * 300)],
    influencers: [
      {
        influencer_field_name: 'user.name',
        influencer_field_values: [user],
      },
      {
        influencer_field_name: 'event.action',
        influencer_field_values: ['exec'],
      },
      {
        influencer_field_name: 'host.name',
        influencer_field_values: [host],
      },
    ],
    'user.name': [user],
    'event.action': ['exec'],
    'host.name': [host],
  };
};

const processNames = [
  'nc',
  'wget',
  'curl',
  'python',
  '-c',
  "import os; os.system('rm -rf /tmp/*')",
];

const generateRareProcessRecord = (ndx: number) => {
  const commonFields = generateCommonFields();
  const user = `sudo-account-${ndx}`;
  const processes = getRandomValues(processNames, 3);

  return {
    ...commonFields,
    job_id: 'pad_linux_rare_process_executed_by_user',
    partition_field_name: 'user.name',
    partition_field_value: user,
    function: 'rare',
    function_description: 'rare',
    field_name: 'process.name',
    influencers: [
      {
        influencer_field_name: 'user.name',
        influencer_field_values: [user],
      },
      {
        influencer_field_name: 'process.name',
        influencer_field_values: processes,
      },
    ],
    'user.name': [user],
    'process.name': processes,
  };
};

export const generatePadRecords = (numDocs: number = 10): Array<Record<string, unknown>> => {
  return flatMap(
    PAD_JOB_IDS.map((jobId) => {
      return range(numDocs).map((val) => {
        switch (jobId) {
          case 'pad_linux_rare_process_executed_by_user':
            return generateRareProcessRecord(val);
          case 'pad_linux_high_count_privileged_process_events_by_user':
            return generatePrivilegedProcessEventsRecord(val);
          default:
            throw new Error(`Unexpected job ID: ${jobId}`);
        }
      });
    })
  );
};
