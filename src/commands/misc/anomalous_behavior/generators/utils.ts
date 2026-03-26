import { faker } from '@faker-js/faker';

export const generateCommonFields = () => {
  return {
    timestamp: new Date().toISOString(),
    result_type: 'record',
    probability: Math.random(),
    record_score: Math.random() * 100,
    initial_record_score: Math.random() * 100,
    bucket_span: 3600,
    detector_index: 0,
    is_interim: false,
  };
};

type Influencer = { influencer_field_name: string; influencer_field_values: string[] };

const EVENT_MODULES = ['okta', 'entra_id', 'microsoft_365', 'active_directory'] as const;

const getEventModule = (): string => faker.helpers.arrayElement(EVENT_MODULES);

// Only certain jobs have V2 IDs that use the `_ea` suffix. We translate those
// known job IDs, and leave all others unchanged so they continue to match the
// actual installed job IDs (for example PAD/LMD/DED jobs that do not yet have
// V2 variants).
const JOB_IDS_WITH_EA_V2_SUFFIX = new Set<string>(['security_auth', 'packetbeat']);

export const applyV2Fields = (record: Record<string, unknown>): Record<string, unknown> => {
  const result = { ...record };
  const eventModule = getEventModule();

  const jobId = result['job_id'];
  if (typeof jobId === 'string' && JOB_IDS_WITH_EA_V2_SUFFIX.has(jobId)) {
    result['job_id'] = `${jobId}_ea`;
  }

  const userNames = result['user.name'] as string[] | undefined;
  const hostNames = result['host.name'] as string[] | undefined;

  if (userNames) {
    result['user.id'] = userNames.map((n) => `${n}-id`);
    result['event.module'] = [eventModule];
  }

  if (hostNames) {
    result['host.id'] = hostNames.map((n) => `${n}-id`);
  }

  const influencers = result.influencers as Influencer[] | undefined;
  if (influencers) {
    const additions: Influencer[] = [];
    for (const inf of influencers) {
      if (inf.influencer_field_name === 'user.name') {
        additions.push({
          influencer_field_name: 'user.id',
          influencer_field_values: inf.influencer_field_values.map((n) => `${n}-id`),
        });
        additions.push({
          influencer_field_name: 'event.module',
          influencer_field_values: [eventModule],
        });
      } else if (inf.influencer_field_name === 'host.name') {
        additions.push({
          influencer_field_name: 'host.id',
          influencer_field_values: inf.influencer_field_values.map((n) => `${n}-id`),
        });
      }
    }
    result.influencers = [...influencers, ...additions];
  }

  return result;
};

export const getRandomValues = (array: readonly string[], n: number): string[] => {
  if (array.length === 0 || n <= 0) return [];
  const copy = [...array];
  if (n >= copy.length) {
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(Math.random() * (copy.length - i));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
};
