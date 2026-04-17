import { flatMap, range } from 'lodash-es';
import { DED_JOB_IDS } from '../ml_modules_setup.ts';
import { faker } from '@faker-js/faker';
import { generateCommonFields } from './utils.ts';
import type { HostIdentityForDed, UserIdentityForDed } from '../../../utils/entity_store.ts';

/** Optional host/user pools from Entity Store. */
export interface DedEntityCorpus {
  hosts?: HostIdentityForDed[];
  users?: UserIdentityForDed[];
}

/** Discriminated union: which identity type (if any) to apply to a record. `none` means keep the record's generated names as-is. */
type CorrelateBranch =
  | { kind: 'none' }
  | { kind: 'host'; host: HostIdentityForDed }
  | { kind: 'user'; user: UserIdentityForDed };

/**
 * Picks a user, host, or synthetic branch for record index `ndx`.
 * Alternates between users and hosts when both pools are available.
 * Pass `hostOnly: true` to force host selection (for host-partitioned jobs).
 */
const resolveCorrelateBranch = (
  corpus: DedEntityCorpus | undefined,
  ndx: number,
  hostOnly = false,
): CorrelateBranch => {
  const hosts = corpus?.hosts?.length ? corpus.hosts : [];
  const users = corpus?.users?.length ? corpus.users : [];
  if (hostOnly) {
    return hosts.length > 0 ? { kind: 'host', host: hosts[ndx % hosts.length]! } : { kind: 'none' };
  }
  if (hosts.length === 0 && users.length === 0) return { kind: 'none' };
  if (hosts.length > 0 && users.length > 0) {
    return ndx % 2 === 0
      ? { kind: 'user', user: users[ndx % users.length]! }
      : { kind: 'host', host: hosts[ndx % hosts.length]! };
  }
  if (users.length > 0) return { kind: 'user', user: users[ndx % users.length]! };
  return { kind: 'host', host: hosts[ndx % hosts.length]! };
};

/** Best display name for a host, used as the influencer value. */
const hostLabel = (h: HostIdentityForDed): string => h.name ?? h.id ?? 'host';

/** ECS fields to inject into a record for a given host identity. */
const buildHostFields = (h: HostIdentityForDed): Record<string, string[]> => {
  const fields: Record<string, string[]> = {};
  const effectiveName = h.name ?? h.id;
  if (effectiveName) fields['host.name'] = [effectiveName];
  if (h.id) fields['host.id'] = [h.id];
  return fields;
};

/** Value aligned with `user.name` influencer / doc for applyV2Fields. */
const userInfluencerPrimary = (u: UserIdentityForDed): string =>
  u.ecsArrays['user.name']?.[0] ??
  u.ecsArrays['user.id']?.[0] ??
  u.ecsArrays['user.email']?.[0] ??
  u.displayLabel;

type Influencer = { influencer_field_name: string; influencer_field_values: string[] };

// These jobs are partitioned by host.name in the real ML configuration, so only host identities are injected.
const HOST_ONLY_JOB_IDS = new Set([
  'ded_high_bytes_written_to_external_device',
  'ded_high_bytes_written_to_external_device_airdrop',
]);

/**
 * Overwrites the identity fields (user.name / host.name and related) on an
 * already-generated synthetic record with real Entity Store values.
 * Keeps every other field unchanged.
 */
const applyCorpusToRecord = (
  record: Record<string, unknown>,
  corpus: DedEntityCorpus,
  ndx: number,
): Record<string, unknown> => {
  const jobId = record.job_id as string | undefined;
  const br = resolveCorrelateBranch(corpus, ndx, Boolean(jobId && HOST_ONLY_JOB_IDS.has(jobId)));
  if (br.kind === 'none') return record;

  const result = { ...record };
  const influencers = (result.influencers as Influencer[] | undefined) ?? [];
  // Strip both identity fields from influencers; we'll add the winning one back.
  const otherInfluencers = influencers.filter(
    (inf) => inf.influencer_field_name !== 'user.name' && inf.influencer_field_name !== 'host.name',
  );

  if (br.kind === 'user') {
    const { ecsArrays } = br.user;
    const userName = userInfluencerPrimary(br.user);

    // Clear host fields so user EUID wins the COALESCE in the ES|QL query.
    delete result['host.name'];
    delete result['host.id'];

    // Inject real user ECS fields (user.name, user.id, event.module, …).
    Object.assign(result, ecsArrays);

    result.influencers = [
      ...otherInfluencers,
      { influencer_field_name: 'user.name', influencer_field_values: [userName] },
    ];

    // Some records are partitioned by host.name; flip to user.name.
    if (
      result.partition_field_name === 'host.name' ||
      result.partition_field_name === 'user.name'
    ) {
      result.partition_field_name = 'user.name';
      result.partition_field_value = userName;
    }
  } else {
    const label = hostLabel(br.host);
    const hostFields = buildHostFields(br.host);

    // Clear user fields so host EUID wins the COALESCE in the ES|QL query.
    delete result['user.name'];
    delete result['user.id'];
    delete result['event.module'];

    // Inject real host ECS fields (host.name, host.id).
    Object.assign(result, hostFields);

    result.influencers = [
      ...otherInfluencers,
      { influencer_field_name: 'host.name', influencer_field_values: [label] },
    ];

    // Keep (or set) partition_field keyed on host.name with the real label.
    if (
      result.partition_field_name === 'user.name' ||
      result.partition_field_name === 'host.name'
    ) {
      result.partition_field_name = 'host.name';
      result.partition_field_value = label;
    }
  }

  return result;
};

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
    'process.name': ['exfil.exe'],
    'user.name': [user],
    'source.ip': [sourceIp],
    'host.name': [host],
    'destination.ip': destinationIps,
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

export const generateDedRecords = (
  numDocs: number = 10,
  corpus?: DedEntityCorpus,
): Array<Record<string, unknown>> => {
  return flatMap(
    DED_JOB_IDS.map((jobId) => {
      return range(numDocs).map((val) => {
        let record: Record<string, unknown>;
        switch (jobId) {
          case 'ded_high_bytes_written_to_external_device':
            record = generateExternalDeviceRecord(val);
            break;
          case 'ded_high_bytes_written_to_external_device_airdrop':
            record = generateExternalDeviceAirdropRecord(val);
            break;
          case 'ded_high_sent_bytes_destination_geo_country_iso_code':
            record = generateDestinationGeoCountryRecord(val);
            break;
          case 'ded_high_sent_bytes_destination_ip':
            record = generateDestinationIpRecord(val);
            break;
          default:
            throw new Error(`Unexpected job ID: ${jobId}`);
        }
        return corpus ? applyCorpusToRecord(record, corpus, val) : record;
      });
    }),
  );
};
