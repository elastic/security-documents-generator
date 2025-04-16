import moment from 'moment';
import { getEsClient } from '../utils';
import { generators } from './generators';
import { GeneratorDoc } from './types';
import cliProgress from 'cli-progress';

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

export const generateThreatHuntingQueryData = async ({
  minTimestampHours = 24,
}: {
  minTimestampHours: number;
}) => {
  const timeWindow = getWindow(minTimestampHours);

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
