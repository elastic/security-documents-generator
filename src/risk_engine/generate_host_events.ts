import { createHash } from 'node:crypto';
import { faker } from '@faker-js/faker';
import { streamingBulkIngest } from '../commands/shared/elasticsearch.ts';
import { ensureSecurityDefaultDataView } from '../utils/security_default_data_view.ts';
import { log } from '../utils/logger.ts';

export interface GenerateHostEventsParams {
  entityName: string;
  count: number;
  timestampStart: string;
  timestampEnd: string;
  hostId?: string;
  index?: string;
  space?: string;
}

const DEFAULT_INDEX = 'logs-generic-default';

const deterministicInt = (value: string): number => {
  const hash = createHash('sha256').update(value).digest();
  return hash.readUInt32BE(0);
};

const buildHostIp = (entityName: string, eventIndex: number): string => {
  const seed = deterministicInt(entityName);
  const thirdOctet = (seed % 200) + 20;
  const fourthOctet = (eventIndex % 253) + 2;
  return `10.42.${thirdOctet}.${fourthOctet}`;
};

const interpolateTimestamp = (
  startMs: number,
  endMs: number,
  eventIndex: number,
  count: number,
): string => {
  if (count <= 1 || endMs === startMs) {
    return new Date(startMs).toISOString();
  }
  const ratio = eventIndex / (count - 1);
  const timestampMs = Math.round(startMs + (endMs - startMs) * ratio);
  return new Date(timestampMs).toISOString();
};

export const generateHostEvents = async (params: GenerateHostEventsParams): Promise<void> => {
  const {
    entityName,
    count,
    timestampStart,
    timestampEnd,
    hostId: hostIdOverride,
    index = DEFAULT_INDEX,
    space = 'default',
  } = params;

  if (!entityName.trim()) {
    throw new Error('--entity-name must be provided');
  }
  if (!Number.isFinite(count) || count <= 0) {
    throw new Error('--count must be a positive integer');
  }

  const startMs = Date.parse(timestampStart);
  const endMs = Date.parse(timestampEnd);
  if (Number.isNaN(startMs)) {
    throw new Error(`Invalid --timestamp-start value: ${timestampStart}`);
  }
  if (Number.isNaN(endMs)) {
    throw new Error(`Invalid --timestamp-end value: ${timestampEnd}`);
  }
  if (endMs < startMs) {
    throw new Error('--timestamp-end must be greater than or equal to --timestamp-start');
  }

  await ensureSecurityDefaultDataView(space);

  // Default host.id to entityName so it matches how scenario alerts identify
  // hosts (host.id = host.name). Callers can still override for other setups.
  const hostId = hostIdOverride?.trim() ? hostIdOverride : entityName;
  const instanceId = `gce-${hostId}`;

  log.info(
    `Generating ${count} host events for "${entityName}" in ${index} between ${new Date(
      startMs,
    ).toISOString()} and ${new Date(endMs).toISOString()}`,
  );

  const datasource = async function* () {
    for (let i = 0; i < count; i++) {
      const processName = faker.helpers.arrayElement([
        'sshd',
        'bash',
        'systemd',
        'apt',
        'cron',
        'python3',
        'node',
      ]);

      yield {
        '@timestamp': interpolateTimestamp(startMs, endMs, i, count),
        host: {
          name: entityName,
          id: hostId,
          os: {
            name: 'Ubuntu',
            version: '22.04',
            family: 'debian',
            platform: 'linux',
          },
          ip: [buildHostIp(entityName, i)],
          architecture: 'x86_64',
          mac: ['00:1A:2B:3C:4D:5E'],
        },
        agent: {
          type: 'auditbeat',
          version: '9.4.0',
        },
        cloud: {
          provider: 'gcp',
          region: 'us-central1',
          instance: {
            id: instanceId,
          },
        },
        event: {
          kind: 'event',
          category: ['host'],
          module: 'system',
          action: 'process_started',
        },
        process: {
          name: processName,
          pid: faker.number.int({ min: 100, max: 65000 }),
        },
        message: faker.lorem.sentence(),
      };
    }
  };

  await streamingBulkIngest({
    index,
    datasource: datasource(),
    flushBytes: 1024 * 1024 * 5,
    flushInterval: 3000,
    onDocument: (doc) => [{ create: { _index: index } }, doc],
    onDrop: (doc) => {
      log.error('Failed to index host event document:', doc);
    },
  });

  log.info(`Completed host event ingest for "${entityName}" (${count} docs -> ${index})`);
};
