import { flatMap, range } from 'lodash-es';
import { SECURITY_PACKETBEAT_JOB_IDS } from '../ml_modules_setup';
import { faker } from '@faker-js/faker';
import { generateCommonFields } from './utils';

const generateRareServerDomainRecord = (ndx: number) => {
  const commonFields = generateCommonFields();
  const user = `admin-${ndx}`;
  const serverDomain = faker.internet.domainName();
  const destinationDomain = faker.internet.domainName();

  return {
    ...commonFields,
    job_id: 'packetbeat_rare_server_domain',
    function: 'rare',
    function_description: 'rare',
    field_name: 'server.domain',
    influencers: [
      {
        influencer_field_name: 'user.name',
        influencer_field_values: [user],
      },
      {
        influencer_field_name: 'server.domain',
        influencer_field_values: [serverDomain],
      },
      {
        influencer_field_name: 'destination.domain',
        influencer_field_values: [destinationDomain],
      },
    ],
    'user.name': [user],
    'server.domain': [serverDomain],
    'destination.domain': [destinationDomain],
  };
};

export const generatePacketbeatRecords = (numDocs: number = 10): Array<Record<string, unknown>> => {
  return flatMap(
    SECURITY_PACKETBEAT_JOB_IDS.map((jobId) => {
      return range(numDocs).map((val) => {
        switch (jobId) {
          case 'packetbeat_rare_server_domain':
            return generateRareServerDomainRecord(val);
          default:
            throw new Error(`Unexpected job ID: ${jobId}`);
        }
      });
    })
  );
};
