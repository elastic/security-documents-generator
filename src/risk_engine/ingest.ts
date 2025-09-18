import { faker } from '@faker-js/faker';
import createAlerts from '../create_alerts';

import { getEsClient } from '../commands/utils/indices';
import { getAlertIndex, initializeSpace } from '../utils';
import { sleep } from '../utils/sleep';

import { Command } from 'commander';
import { parseIntBase10 } from '..';
import { deleteAllAlerts } from '../commands/documents';

export const ingestData = async (params: {
  batchMBytesSize: number;
  intervalMs: number;
  entityCount: number;
  alertsPerEntity: number;
}) => {
  const { batchMBytesSize, intervalMs, entityCount, alertsPerEntity } = params;
  const esClient = getEsClient();
  const index = getAlertIndex('default');

  const MAX_BYTES = batchMBytesSize * 1024 * 1024;
  const bytesPerAlert = Buffer.byteLength(
    JSON.stringify(createAlerts({})),
    'utf8',
  );
  const alertsPerBatch = Math.max(1, Math.floor(MAX_BYTES / bytesPerAlert));
  let runs = Math.ceil((entityCount * alertsPerEntity) / alertsPerBatch);

  while (runs > 0) {
    console.log(
      `Ingesting batch, approx. ${alertsPerBatch} alerts (~${(
        (alertsPerBatch * bytesPerAlert) /
        (1024 * 1024)
      ).toFixed(2)}MB), ${runs} batches remaining...`,
    );
    runs--;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await esClient.helpers.bulk<Record<string, any>>({
      datasource: alertsGenerator({
        entityCount,
        alertsPerEntity,
        limit: alertsPerBatch,
      }),
      onDocument: (doc) => {
        doc['@timestamp'] = new Date().toISOString();

        return [{ create: { _index: index } }, { ...doc }];
      },
      flushBytes: 1024 * 1024 * 1,
      flushInterval: 3000,
      onSuccess: () => {
        // progress.increment();
      },
      onDrop: (doc) => {
        console.log('Failed to index document:', doc);
        process.exit(1);
      },
    });
    await sleep(intervalMs);
  }
};

export async function* alertsGenerator(params: {
  entityCount: number;
  alertsPerEntity: number;
  limit?: number;
}) {
  const { entityCount, alertsPerEntity } = params;

  let generated = 0;
  const limit = params.limit ?? Number.MAX_SAFE_INTEGER;
  for (let i = 0; i < entityCount; i++) {
    const user = faker.internet.username();
    const host = faker.internet.domainName();
    const no_overrides = {};
    for (let j = 0; j < alertsPerEntity; j++) {
      if (generated >= limit) return;
      const doc = createAlerts(no_overrides, {
        userName: user,
        hostName: host,
      });
      yield doc;
      generated++;
    }
  }
}

export const getCmd = (root: Command) => {
  const riskEngine = root
    .command('risk-engine')
    .description('Risk engine utilities');

  riskEngine
    .command('ingest')
    .description('Generate and immediately ingest data into the risk engine')
    .argument('<number of entities>', 'number of entities', parseIntBase10)
    .option(
      '-n <n>',
      'number of alerts per entity (default: 50)',
      parseIntBase10,
    )
    .option('-b <b>', 'batch size in MB (default: 250MB)', parseIntBase10)
    .option(
      '-i <i>',
      'interval between batches in ms (default: 500ms)',
      parseIntBase10,
    )
    .option('-s <s>', 'space (will be created if it does not exist)')
    .description('Generate fake alerts')
    .action(async (entityCount, options) => {
      if (!entityCount || entityCount <= 0) {
        console.error('The number of entities must be a positive integer.');
        process.exit(1);
      }

      const alertsPerEntity = options.n || 50;
      const batchMBytesSize = options.b || 250;
      const intervalMs = options.i || 500;
      const space = options.s || 'default';

      if (space !== 'default') {
        await initializeSpace(space);
      }

      await deleteAllAlerts();
      console.log(
        `Ingesting data for ${entityCount} entities, ${alertsPerEntity} alerts each, in batches of ~${batchMBytesSize}MB every ${intervalMs}ms into space "${space}"...`,
      );

      await ingestData({
        batchMBytesSize,
        intervalMs,
        entityCount,
        alertsPerEntity,
      });
    });
};
