import moment from 'moment';
import { getEsClient } from '../utils';
import { generators } from './generators';
import { GeneratorDoc } from './types';
import cliProgress from 'cli-progress';
import fs from 'fs';
import path, { dirname } from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const QUERIES_INDEX = 'threat-hunting-queries';

const bulkIndexData = async (generatorDocs: GeneratorDoc[]) => {
  const progress = new cliProgress.SingleBar(
    {
      format:
        'Indexing |' + '{bar}' + '| {percentage}% || {value}/{total} Chunks',
    },
    cliProgress.Presets.shades_classic,
  );

  const esClient = getEsClient();

  progress.start(generatorDocs.length, 0);

  await esClient.helpers.bulk<GeneratorDoc>({
    datasource: generatorDocs,
    flushBytes: 1024 * 1024 * 1,
    flushInterval: 3000,
    onSuccess: () => {
      progress.increment();
    },
    onDocument: (doc) => {
      return [{ create: { _index: doc.index } }, doc.source];
    },
    onDrop: (doc) => {
      console.log('Failed to index document:', doc);
      process.exit(1);
    },
  });

  progress.stop();
};

const getWindow = (hours: number) => {
  const now = moment();

  const minTimestamp = now.clone().subtract(hours, 'hours').toISOString();

  const maxTimestamp = now.toISOString();
  return {
    minTimestamp,
    maxTimestamp,
  };
};

interface QueryJsonlLine {
  _source: object;
}

const importQueries = async () => {
  // queries are in ./threat_hunting_queries.jsonl
  // mapping is in ./threat_hunting_queries_mapping.json

  const esClient = getEsClient();

  const exists = await esClient.indices.exists({
    index: QUERIES_INDEX,
  });

  if (exists) {
    console.log(`Index ${QUERIES_INDEX} already exists. Skipping import.`);
    return;
  }

  const generatorDocs: GeneratorDoc[] = [];

  // Read the mapping file

  const directoryName = dirname(fileURLToPath(import.meta.url));

  const mappingFile = path.resolve(
    directoryName,
    'threat_hunting_queries_mapping.json',
  );
  const mapping = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));

  await esClient.indices.create({
    index: QUERIES_INDEX,
    body: mapping,
  });

  console.log(`Created index ${QUERIES_INDEX} with mapping.`);

  const jsonlPath = path.resolve(directoryName, 'threat_hunting_queries.jsonl');

  const fileStream = fs.createReadStream(jsonlPath);

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  // Process each line
  for await (const line of rl) {
    if (line.trim()) {
      const query = JSON.parse(line) as QueryJsonlLine;
      generatorDocs.push({
        index: QUERIES_INDEX,
        source: query._source,
      });
    }
  }

  console.log(`Read ${generatorDocs.length} queries from file.`);

  // Index the documents
  await bulkIndexData(generatorDocs);
  console.log(`Successfully imported queries to ${QUERIES_INDEX}.`);
};

export const generateThreatHuntingQueryData = async ({
  minTimestampHours = 24,
}: {
  minTimestampHours: number;
}) => {
  const timeWindow = getWindow(minTimestampHours);

  await importQueries();

  const data = [];

  for (const generator of generators) {
    const generatorData = await generator.generate({
      timeWindow,
    });

    console.log(
      `Generated ${generatorData.length} documents for generator: ${generator.id} ✅`,
    );

    data.push(...generatorData);
  }

  await bulkIndexData(data);
};
