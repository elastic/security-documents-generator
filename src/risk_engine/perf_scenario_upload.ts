import readline from 'readline';
import fs from 'fs';
import { streamingBulkIngest } from '../commands/shared/elasticsearch.ts';
import { getFileLineCount } from '../commands/utils/indices.ts';
import { createProgressBar } from '../commands/utils/cli_utils.ts';
import { log } from '../utils/logger.ts';

/**
 * Stream JSONL into Elasticsearch without mutating document bodies (unlike
 * `uploadFile` in entity_store_perf, which overwrites `@timestamp`).
 */
export const uploadJsonlFile = async (filePath: string, index: string): Promise<void> => {
  if (!fs.existsSync(filePath)) {
    log.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const lineCount = await getFileLineCount(filePath);
  const stream = fs.createReadStream(filePath);
  const progress = createProgressBar('upload', {
    format: '{bar} | {percentage}% | {value}/{total} Documents Uploaded',
  });
  progress.start(lineCount, 0);

  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  const lineGenerator = async function* () {
    for await (const line of rl) {
      yield JSON.parse(line) as object;
    }
  };

  await streamingBulkIngest({
    index,
    datasource: lineGenerator(),
    flushBytes: 1024 * 1024,
    flushInterval: 3000,
    onDocument: (doc) => [{ create: { _index: index } }, doc],
    onSuccess: () => {
      progress.increment();
    },
    onDrop: (doc) => {
      log.error('Failed to index document:', doc);
      process.exit(1);
    },
  });

  progress.stop();
};
