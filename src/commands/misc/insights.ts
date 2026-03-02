import { generateNewSeed } from '../../constants';
import { faker } from '@faker-js/faker';
import { ingest } from '../utils/indices';
import createVulnerabilities, {
  CreateVulnerabilitiesParams,
} from '../../generators/create_vulnerability';
import createMisconfigurations, {
  CreateMisconfigurationsParams,
} from '../../generators/create_misconfigurations';
import { installPackage } from '../../utils/kibana_api';
import { generateAnomalousBehaviorDataWithMlJobs } from './anomalous_behavior';

const VULNERABILITY_INDEX_NAME = 'logs-cloud_security_posture.vulnerabilities_latest-default';

const MISCONFIGURATION_INDEX_NAME =
  'security_solution-cloud_security_posture.misconfiguration_latest';

const PACKAGE_TO_INSTALL = 'cloud_security_posture';

interface GenerateAiInsightsOpts {
  users: number;
  hosts: number;
  records: number;
  space: string;
  generateAnomalies: boolean;
  generateAnomalyData: boolean;
  seed?: number;
}
export const generateAiInsights = async ({
  users,
  hosts,
  records,
  space,
  generateAnomalies,
  generateAnomalyData,
  seed = generateNewSeed(),
}: GenerateAiInsightsOpts) => {
  faker.seed(seed);
  const usersData = Array.from({ length: users }, () => ({
    username: faker.internet.username(),
  }));

  const hostsData = Array.from({ length: hosts }, () => ({
    hostname: faker.internet.domainName(),
  }));

  console.log('Installing cloud posture package');
  await installPackage({ packageName: PACKAGE_TO_INSTALL, space });

  await ingest(VULNERABILITY_INDEX_NAME, generateDocs(usersData, space, createVulnerabilities));
  await ingest(VULNERABILITY_INDEX_NAME, generateDocs(hostsData, space, createVulnerabilities));

  await ingest(
    MISCONFIGURATION_INDEX_NAME,
    generateDocs(usersData, space, createMisconfigurations)
  );
  await ingest(
    MISCONFIGURATION_INDEX_NAME,
    generateDocs(hostsData, space, createMisconfigurations)
  );

  if (generateAnomalies) {
    console.log(`Generating anomalous behavior data with ML jobs`);
    await generateAnomalousBehaviorDataWithMlJobs(space, records, generateAnomalyData);
  } else {
    console.log(
      'Skipping anomalous behavior ML job and data generation due to --no-anomalies flag'
    );
  }
};

interface EntityData {
  username?: string;
  hostname?: string;
}

export const generateDocs = (
  entityData: EntityData[],
  space: string,
  createDocs: (param: CreateVulnerabilitiesParams | CreateMisconfigurationsParams) => object
) => {
  const eventsPerEntity = 2;
  const acc: object[] = [];
  return entityData.reduce((acc, data) => {
    const events = faker.helpers.multiple(() => createDocs({ space, ...data }), {
      count: eventsPerEntity,
    });
    acc.push(...events);
    return acc;
  }, acc);
};
