import { generateNewSeed } from '../../constants.ts';
import { faker } from '@faker-js/faker';
import { log } from '../../utils/logger.ts';
import { ingest } from '../utils/indices.ts';
import createVulnerabilities, {
  type CreateVulnerabilitiesParams,
} from '../../generators/create_vulnerability.ts';
import createMisconfigurations, {
  type CreateMisconfigurationsParams,
} from '../../generators/create_misconfigurations.ts';
import { installPackage } from '../../utils/kibana_api.ts';
import { generateAnomalousBehaviorDataWithMlJobs } from './anomalous_behavior/index.ts';
import { fetchHostIdentitiesForDed, fetchUserIdentitiesForDed } from '../utils/entity_store.ts';

const VULNERABILITY_INDEX_NAME = 'logs-cloud_security_posture.vulnerabilities_latest-default';

const MISCONFIGURATION_INDEX_NAME =
  'security_solution-cloud_security_posture.misconfiguration_latest';

const PACKAGE_TO_INSTALL = 'cloud_security_posture';

// Mirror the cap the anomaly (DED) correlation uses so all correlated data is drawn from
// the same bounded slice of the entity store.
const ENTITY_STORE_CORRELATION_MAX = 10;

interface EntityData {
  username?: string;
  hostname?: string;
  hostId?: string;
}

interface GenerateAiInsightsOpts {
  users: number;
  hosts: number;
  records: number;
  space: string;
  generateAnomalies: boolean;
  generateAnomalyData: boolean;
  v2?: boolean;
  seed?: number;
  correlateWithEntityStore?: boolean;
}

// Faked host/user names — the default source for vulnerability + misconfiguration docs.
const buildFakedInsightEntities = (
  users: number,
  hosts: number,
): { usersData: EntityData[]; hostsData: EntityData[] } => ({
  usersData: Array.from({ length: users }, () => ({ username: faker.internet.username() })),
  hostsData: Array.from({ length: hosts }, () => ({ hostname: faker.internet.domainName() })),
});

// Reuse the same entity-store identities the anomaly (DED) correlation uses so the CSP docs
// land on real entities. For hosts we carry `host.id` through so the vulnerability/misconfig
// doc's computed EUID (`host:<host.id>`) equals the host entity's `entity.id` — that is how
// the v2 entity flyout / AI summary matches vulnerabilities (host-only, EUID-based). Falls
// back to `host.name` when the entity has no id. Returns empty arrays when the store has no
// usable identities.
const buildCorrelatedInsightEntities = async (
  space: string,
): Promise<{ usersData: EntityData[]; hostsData: EntityData[] }> => {
  const [hostIdentities, userIdentities] = await Promise.all([
    fetchHostIdentitiesForDed(space, ENTITY_STORE_CORRELATION_MAX),
    fetchUserIdentitiesForDed(space, ENTITY_STORE_CORRELATION_MAX),
  ]);

  const hostsData = hostIdentities
    .filter((host) => Boolean(host.name || host.id))
    .map((host) => ({ hostname: host.name, hostId: host.id }));

  const usersData = userIdentities
    .map((user) => user.ecsArrays['user.name']?.[0] ?? user.displayLabel)
    .filter((username): username is string => Boolean(username))
    .map((username) => ({ username }));

  return { usersData, hostsData };
};

export const generateAiInsights = async ({
  users,
  hosts,
  records,
  space,
  generateAnomalies,
  generateAnomalyData,
  v2 = false,
  seed = generateNewSeed(),
  correlateWithEntityStore = false,
}: GenerateAiInsightsOpts) => {
  faker.seed(seed);

  let { usersData, hostsData } = buildFakedInsightEntities(users, hosts);

  if (correlateWithEntityStore) {
    log.info('Correlating vulnerabilities and misconfigurations with entity-store entities');
    const correlated = await buildCorrelatedInsightEntities(space);
    if (correlated.hostsData.length === 0 && correlated.usersData.length === 0) {
      log.warn(
        'No entity-store host/user identities found to correlate against; falling back to generated names. Populate the entity store first (e.g. `risk-score-v2`).',
      );
    } else {
      ({ usersData, hostsData } = correlated);
    }
  }

  log.info('Installing cloud posture package');
  await installPackage({ packageName: PACKAGE_TO_INSTALL, space });

  await ingest(VULNERABILITY_INDEX_NAME, generateDocs(usersData, space, createVulnerabilities));
  await ingest(VULNERABILITY_INDEX_NAME, generateDocs(hostsData, space, createVulnerabilities));

  await ingest(
    MISCONFIGURATION_INDEX_NAME,
    generateDocs(usersData, space, createMisconfigurations),
  );
  await ingest(
    MISCONFIGURATION_INDEX_NAME,
    generateDocs(hostsData, space, createMisconfigurations),
  );

  if (generateAnomalies) {
    log.info(`Generating anomalous behavior data with ML jobs`);
    await generateAnomalousBehaviorDataWithMlJobs(
      space,
      records,
      generateAnomalyData,
      v2,
      correlateWithEntityStore,
    );
  } else {
    log.info('Skipping anomalous behavior ML job and data generation due to --no-anomalies flag');
  }
};

export const generateDocs = (
  entityData: EntityData[],
  space: string,
  createDocs: (param: CreateVulnerabilitiesParams | CreateMisconfigurationsParams) => object,
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
