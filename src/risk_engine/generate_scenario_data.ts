import fs from 'fs';
import cliProgress from 'cli-progress';
import createAlerts from '../generators/create_alerts.ts';
import { log } from '../utils/logger.ts';
import type { IdentityPool } from './identity_pool.ts';
import { getRiskEnginePerfScenarioAlertsDir } from '../utils/data_paths.ts';

export interface ScenarioDataParams {
  name: string;
  pool: IdentityPool;
  alertsPerEntity: number;
  /** Shift timestamps back by this many ms (e.g. stale data). */
  timeShiftMs?: number;
}

const MAX_FILE_BYTES = 250 * 1024 * 1024;

const getMultiFilePath = (alertsDir: string, idx: number, total: number) => {
  if (!fs.existsSync(alertsDir)) {
    fs.mkdirSync(alertsDir, { recursive: true });
  }
  const pad = String(total).length;
  return `${alertsDir}/${String(idx + 1).padStart(pad, '0')}.jsonl`;
};

const hostByName = (pool: IdentityPool, name: string | undefined) =>
  pool.hosts.find((h) => h.name === name) ?? pool.hosts[0];

export const generateScenarioAlerts = async (params: ScenarioDataParams): Promise<void> => {
  const { name, pool, alertsPerEntity } = params;
  const timeShiftMs = params.timeShiftMs ?? 0;
  const alertsDir = getRiskEnginePerfScenarioAlertsDir(name);

  if (!fs.existsSync(alertsDir)) {
    fs.mkdirSync(alertsDir, { recursive: true });
  } else {
    for (const f of fs.readdirSync(alertsDir)) {
      if (f.endsWith('.jsonl') || f.endsWith('.json')) {
        fs.unlinkSync(`${alertsDir}/${f}`);
      }
    }
  }

  const totalAlerts = (pool.users.length + pool.hosts.length) * alertsPerEntity;
  log.info(`Generating ${totalAlerts} scenario alerts under ${alertsDir}`);

  const sampleHost = pool.hosts[0];
  const sampleUser = pool.users[0];
  if (!sampleHost || !sampleUser) {
    throw new Error('Pool must contain at least one user and one host');
  }

  const sampleAlert = createAlerts(
    {
      '@timestamp': new Date().toISOString(),
      'event.module': 'local',
      'event.kind': 'event',
      'event.category': ['network'],
      'event.outcome': 'success',
      'host.id': sampleUser.pairedHostId ?? sampleHost.name,
    },
    { userName: sampleUser.name, hostName: sampleHost.name },
  );
  const bytesPerAlert = Buffer.byteLength(JSON.stringify(sampleAlert), 'utf8');
  const alertsPerFile = Math.max(1, Math.floor(MAX_FILE_BYTES / bytesPerAlert));
  const filesNumber = Math.max(1, Math.ceil(totalAlerts / alertsPerFile));

  log.info(
    [
      'Alert size estimation:',
      ` - Bytes per alert: ~${bytesPerAlert}B`,
      ` - Total alerts: ${totalAlerts}`,
      ` - Max per file: 250MB`,
      ` - Alerts per file (est.): ${alertsPerFile}`,
      ` - Files needed: ${filesNumber}`,
    ].join('\n'),
  );

  const multiBar = new cliProgress.MultiBar(
    {
      clearOnComplete: false,
      hideCursor: true,
      format: '{label} {bar} {value}/{total}',
    },
    cliProgress.Presets.shades_classic,
  );

  const fileBar = multiBar.create(filesNumber, 0, { label: 'files    ' });

  let currentFileIndex = 0;
  let alertsWrittenInCurrentFile = 0;
  let totalWritten = 0;

  const remainingAlerts = () => totalAlerts - totalWritten;
  let currentFileAlertTarget = Math.min(alertsPerFile, remainingAlerts());
  let alertBar = multiBar.create(currentFileAlertTarget, 0, {
    label: `file ${currentFileIndex + 1}`.padEnd(8, ' '),
  });

  const openWriteStream = (fileIndex: number) => {
    const path = getMultiFilePath(alertsDir, fileIndex, filesNumber);
    return { path, stream: fs.createWriteStream(path, { flags: 'a' }) };
  };

  let { stream: writeStream } = openWriteStream(currentFileIndex);

  const rotateFileIfNeeded = () => {
    if (alertsWrittenInCurrentFile >= currentFileAlertTarget) {
      writeStream.end();
      fileBar.increment();
      currentFileIndex++;
      if (currentFileIndex >= filesNumber || remainingAlerts() <= 0) {
        return;
      }
      alertsWrittenInCurrentFile = 0;
      currentFileAlertTarget = Math.min(alertsPerFile, remainingAlerts());
      alertBar.stop();
      alertBar = multiBar.create(currentFileAlertTarget, 0, {
        label: `file ${currentFileIndex + 1}`.padEnd(8, ' '),
      });
      const nextFile = openWriteStream(currentFileIndex);
      writeStream = nextFile.stream;
    }
  };

  const baseTimeMs = Date.now() - timeShiftMs;
  const isoAt = () => new Date(baseTimeMs).toISOString();

  const writeLine = (doc: ReturnType<typeof createAlerts>) => {
    writeStream.write(JSON.stringify(doc) + '\n');
    alertsWrittenInCurrentFile++;
    totalWritten++;
    alertBar.increment();
    rotateFileIfNeeded();
  };

  const run = async () => {
    for (let ui = 0; ui < pool.users.length; ui++) {
      const user = pool.users[ui];
      if (!user) {
        continue;
      }
      const pairedHost = hostByName(pool, user.pairedHostId);
      if (!pairedHost) {
        throw new Error('Host pool unexpectedly empty');
      }
      for (let j = 0; j < alertsPerEntity; j++) {
        const randomHostIdx = (ui + j * 17) % pool.hosts.length;
        const alertHost = pool.hosts[randomHostIdx] ?? pairedHost;
        const iso = isoAt();
        const doc = createAlerts(
          {
            '@timestamp': iso,
            'kibana.alert.start': iso,
            'kibana.alert.last_detected': iso,
            'kibana.alert.original_time': iso,
            'event.module': 'local',
            'event.kind': 'event',
            'event.category': ['network'],
            'event.outcome': 'success',
            'host.id': user.pairedHostId ?? pairedHost.name,
          },
          { userName: user.name, hostName: alertHost.name },
        );
        writeLine(doc);
      }
      await new Promise((resolve) => setImmediate(resolve));
    }

    for (let hi = 0; hi < pool.hosts.length; hi++) {
      const host = pool.hosts[hi];
      if (!host) {
        continue;
      }
      for (let j = 0; j < alertsPerEntity; j++) {
        const iso = isoAt();
        const doc = createAlerts(
          {
            '@timestamp': iso,
            'kibana.alert.start': iso,
            'kibana.alert.last_detected': iso,
            'kibana.alert.original_time': iso,
            'host.id': host.name,
            'user.name': null,
          },
          { hostName: host.name, hostId: host.name },
        );
        writeLine(doc);
      }
      await new Promise((resolve) => setImmediate(resolve));
    }

    if (!writeStream.closed) {
      writeStream.end();
    }

    alertBar.stop();
    multiBar.stop();
    log.info(`Created ${filesNumber} alert file(s) for ${name} (${totalWritten} alerts total).`);
  };

  await run().catch((err: unknown) => {
    log.error('Error generating scenario alerts:', err);
    throw err;
  });
};
