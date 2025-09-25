import { generateNewSeed } from '../constants';
import { faker } from '@faker-js/faker';
import { ingest } from './utils/indices';
import createVulnerabilities, {
  CreateVulnerabilitiesParams,
} from '../create_vulnerability';
import createMisconfigurations, {
  CreateMisconfigurationsParams,
} from '../create_misconfigurations';
import { installPackage } from '../utils/kibana_api';

const VULNERABILITY_INDEX_NAME =
  'logs-cloud_security_posture.vulnerabilities_latest-default';

const MISCONFIGURATION_INDEX_NAME =
  'security_solution-cloud_security_posture.misconfiguration_latest';

const PACKAGE_TO_INSTALL = 'cloud_security_posture';

export const generateInsights = async ({
  users,
  hosts,
  space,
  seed = generateNewSeed(),
}: {
  users: number;
  hosts: number;
  seed?: number;
  space: string;
}) => {
  faker.seed(seed);
  const usersData = Array.from({ length: users }, () => ({
    username: faker.internet.username(),
  }));

  const hostsData = Array.from({ length: hosts }, () => ({
    hostname: faker.internet.domainName(),
  }));

  console.log('Installing cloud posture package');
  await installPackage({ packageName: PACKAGE_TO_INSTALL, space });

  await ingest(
    VULNERABILITY_INDEX_NAME,
    generateDocs(usersData, space, createVulnerabilities),
  );
  await ingest(
    VULNERABILITY_INDEX_NAME,
    generateDocs(hostsData, space, createVulnerabilities),
  );

  await ingest(
    MISCONFIGURATION_INDEX_NAME,
    generateDocs(usersData, space, createMisconfigurations),
  );
  await ingest(
    MISCONFIGURATION_INDEX_NAME,
    generateDocs(hostsData, space, createMisconfigurations),
  );
};

interface EntityData {
  username?: string;
  hostname?: string;
}

export const generateDocs = (
  entityData: EntityData[],
  space: string,
  createDocs: (
    param: CreateVulnerabilitiesParams | CreateMisconfigurationsParams,
  ) => object,
) => {
  const eventsPerEntity = 2;
  const acc: object[] = [];
  return entityData.reduce((acc, data) => {
    const events = faker.helpers.multiple(
      () => createDocs({ space, ...data }),
      {
        count: eventsPerEntity,
      },
    );
    acc.push(...events);
    return acc;
  }, acc);
};
