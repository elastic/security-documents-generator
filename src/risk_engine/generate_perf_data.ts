import { faker } from '@faker-js/faker';
import fs from 'fs';
import cliProgress from 'cli-progress';
import createAlerts from '../generators/create_alerts';
import { uploadFile } from '../commands/entity_store_perf/entity_store_perf';
import { getAlertIndex } from '../utils';
import { getFileLineCount } from '../commands/utils/indices';

export const createPerfDataFile = ({
  entityCount,
  alertsPerEntity,
  name,
}: {
  name: string;
  alertsPerEntity: number;
  entityCount: number;
}) => {
  console.log(`Creating performance data file(s) for ${name}`);

  // Ensure base data directory exists
  if (!fs.existsSync(DATA_DIRECTORY)) {
    fs.mkdirSync(DATA_DIRECTORY, { recursive: true });
  }

  const totalAlerts = entityCount * alertsPerEntity;
  console.log(`Generating ${totalAlerts} alerts...`);

  const sampleAlert = createAlerts({ userName: 'test', hostName: 'test' });
  const bytesPerAlert = Buffer.byteLength(JSON.stringify(sampleAlert), 'utf8');

  const MAX_FILE_BYTES = 250 * 1024 * 1024; // 250MB
  const alertsPerFile = Math.max(1, Math.floor(MAX_FILE_BYTES / bytesPerAlert));
  const filesNumber = Math.max(1, Math.ceil(totalAlerts / alertsPerFile));
  const estimatedTotalBytes = totalAlerts * bytesPerAlert;

  console.log(
    [
      'Size estimation:',
      ` - Bytes per alert: ~${bytesPerAlert}B`,
      ` - Total alerts: ${totalAlerts}`,
      ` - Estimated total size: ${(estimatedTotalBytes / (1024 * 1024)).toFixed(2)}MB`,
      ` - Max per file: 250MB`,
      ` - Alerts per file (est.): ${alertsPerFile}`,
      ` - Files needed: ${filesNumber}`,
    ].join('\n')
  );
  if (filesNumber > 1) {
    console.log('Multiple files will be written to stay under 250MB per file.');
  }

  // NEW: create (or clean) per-dataset subdirectory and zero-padded naming
  const datasetDir = `${DATA_DIRECTORY}/${name}`;
  if (!fs.existsSync(datasetDir)) {
    fs.mkdirSync(datasetDir, { recursive: true });
  } else {
    // Clean previous .json files to avoid mixing old runs
    for (const f of fs.readdirSync(datasetDir)) {
      if (f.endsWith('.json')) {
        fs.unlinkSync(`${datasetDir}/${f}`);
      }
    }
  }

  // Replace single progress bar with multi-bar (files + per-file alerts)
  const multiBar = new cliProgress.MultiBar(
    {
      clearOnComplete: false,
      hideCursor: true,
      format: '{label} {bar} {value}/{total}',
    },
    cliProgress.Presets.shades_classic
  );

  const fileBar = multiBar.create(filesNumber, 0, { label: 'files    ' });

  let currentFileIndex = 0;
  let alertsWrittenInCurrentFile = 0;
  let totalWritten = 0;

  const remainingAlerts = () => entityCount * alertsPerEntity - totalWritten;
  let currentFileAlertTarget = Math.min(alertsPerFile, remainingAlerts());
  let alertBar = multiBar.create(currentFileAlertTarget, 0, {
    label: `file ${currentFileIndex + 1}`.padEnd(8, ' '),
  });

  const openWriteStream = (fileIndex: number) => {
    const path = getMultiFilePath(name, fileIndex, filesNumber);
    return { path, stream: fs.createWriteStream(path, { flags: 'a' }) };
  };

  let { stream: writeStream } = openWriteStream(currentFileIndex);

  const rotateFileIfNeeded = () => {
    if (alertsWrittenInCurrentFile >= currentFileAlertTarget) {
      writeStream.end();
      fileBar.increment();
      currentFileIndex++;
      if (currentFileIndex >= filesNumber || remainingAlerts() <= 0) {
        return; // No more files
      }
      alertsWrittenInCurrentFile = 0;
      currentFileAlertTarget = Math.min(alertsPerFile, remainingAlerts());
      alertBar.stop();
      alertBar = multiBar.create(currentFileAlertTarget, 0, {
        label: `file ${currentFileIndex + 1}`.padEnd(8, ' '),
      });
      const nextFile = openWriteStream(currentFileIndex);

      writeStream = nextFile.stream;
      // console.log(`Switched to file ${currentPath}`);
    }
  };

  const generateAlerts = async () => {
    for (let i = 0; i < entityCount; i++) {
      const user = faker.internet.username();
      const host = faker.internet.domainName();
      const no_overrides = {};
      for (let j = 0; j < alertsPerEntity; j++) {
        const doc = createAlerts(no_overrides, {
          userName: user,
          hostName: host,
        });
        writeStream.write(JSON.stringify(doc) + '\n');
        alertsWrittenInCurrentFile++;
        totalWritten++;
        alertBar.increment();
        rotateFileIfNeeded();
      }
      await new Promise((resolve) => setImmediate(resolve));
    }

    if (!writeStream.closed) {
      writeStream.end();
    }

    alertBar.stop();
    multiBar.stop();

    console.log(`Created ${filesNumber} files for ${name} (${totalWritten} alerts total).`);
  };

  return generateAlerts().catch((err) => {
    console.error('Error generating alerts:', err);
  });
};

export const uploadPerfData = async (file: string, interval: number, uploadCount: number) => {
  console.log(`Uploading performance data file ${file} every ${interval}ms ${uploadCount} times`);
  const filePath = getFilePath(file);
  if (!fs.existsSync(filePath)) {
    console.log(`Data file ${file} does not exist`);
    process.exit(1);
  }

  const lineCount = await getFileLineCount(filePath);

  const startTime = Date.now();

  await uploadFile({
    lineCount,
    filePath,
    index: getAlertIndex('default'),
  });

  const ingestTook = Date.now() - startTime;
  console.log(`Data file ${file} uploaded in ${ingestTook}ms`);
};

const DATA_DIRECTORY = process.cwd() + '/data/risk_engine/perf';
const getFilePath = (name: string) => `${DATA_DIRECTORY}/${name}.json`;

const getMultiFilePath = (name: string, idx: number, total: number) => {
  const dir = `${DATA_DIRECTORY}/${name}`;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const pad = String(total).length; // dynamic padding width
  return `${dir}/${String(idx + 1).padStart(pad, '0')}.json`;
};
