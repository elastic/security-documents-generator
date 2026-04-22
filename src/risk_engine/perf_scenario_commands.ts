import { type Command } from 'commander';
import fs from 'fs';
import { log } from '../utils/logger.ts';
import { wrapAction, parseOptionInt, handleCommandError } from '../commands/utils/cli_utils.ts';
import { deleteAllAlerts } from '../commands/documents/index.ts';
import { getEsClient } from '../commands/utils/indices.ts';
import { getAlertIndex } from '../utils/index.ts';
import {
  getEntityStoreLatestAlias,
  getRiskEnginePerfScenarioAlertsDir,
  getRiskEnginePerfScenarioEntitiesPath,
} from '../utils/data_paths.ts';
import { generateIdentityPool } from './identity_pool.ts';
import { generateScenarioAlerts } from './generate_scenario_data.ts';
import { generateEntityStoreData } from './generate_entity_store_data.ts';
import { uploadJsonlFile } from './perf_scenario_upload.ts';
import { getFileLineCount } from '../commands/utils/indices.ts';

const MS_PER_DAY = 86400000;
const DELETE_CHUNK_SIZE = 500;

interface ScenarioEntitySelectors {
  entityIds: string[];
  userNames: string[];
  hostNames: string[];
  serviceNames: string[];
  entityNames: string[];
}

const chunkValues = (values: string[], size: number): string[][] => {
  const chunks: string[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
};

const loadScenarioEntitySelectors = (entitiesPath: string): ScenarioEntitySelectors => {
  const entityIds = new Set<string>();
  const userNames = new Set<string>();
  const hostNames = new Set<string>();
  const serviceNames = new Set<string>();
  const entityNames = new Set<string>();

  for (const line of fs.readFileSync(entitiesPath, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const doc = JSON.parse(line) as {
      entity?: { id?: unknown; name?: unknown };
      user?: { name?: unknown };
      host?: { name?: unknown };
      service?: { name?: unknown };
    };

    if (typeof doc.entity?.id === 'string') entityIds.add(doc.entity.id);
    if (typeof doc.entity?.name === 'string') entityNames.add(doc.entity.name);
    if (typeof doc.user?.name === 'string') userNames.add(doc.user.name);
    if (typeof doc.host?.name === 'string') hostNames.add(doc.host.name);
    if (typeof doc.service?.name === 'string') serviceNames.add(doc.service.name);
  }

  return {
    entityIds: [...entityIds],
    userNames: [...userNames],
    hostNames: [...hostNames],
    serviceNames: [...serviceNames],
    entityNames: [...entityNames],
  };
};

const deleteExistingScenarioEntities = async (
  entityIndex: string,
  selectors: ScenarioEntitySelectors,
): Promise<number> => {
  const client = getEsClient();
  let totalDeleted = 0;

  const deleteByTerms = async (field: string, values: string[]) => {
    if (values.length === 0) return;

    for (const chunk of chunkValues(values, DELETE_CHUNK_SIZE)) {
      const response = await client.deleteByQuery({
        index: entityIndex,
        refresh: true,
        conflicts: 'proceed',
        query: {
          terms: {
            [field]: chunk,
          },
        },
      });
      totalDeleted += response.deleted ?? 0;
    }
  };

  await deleteByTerms('entity.id', selectors.entityIds);
  await deleteByTerms('user.name', selectors.userNames);
  await deleteByTerms('host.name', selectors.hostNames);
  await deleteByTerms('service.name', selectors.serviceNames);
  await deleteByTerms('entity.name', selectors.entityNames);

  await client.indices.refresh({ index: entityIndex, ignore_unavailable: true });
  return totalDeleted;
};

const attachPerfScenarioCommands = (riskEngine: Command) => {
  riskEngine
    .command('create-perf-scenario')
    .argument('<name>', 'scenario name (directory under data/risk_engine/perf/)')
    .option('--user-count <n>', 'number of user identities')
    .option('--host-count <n>', 'number of host identities')
    .option('--alerts-per-entity <n>', 'alerts generated per user and per host')
    .option('--resolution-pct <n>', 'percentage of users and of hosts in resolution groups (0–100)')
    .option('--resolution-group-size <n>', 'members per resolution group (first is target)')
    .option('--time-shift-days <n>', 'shift alert timestamps back by N days')
    .option(
      '--prefix <s>',
      'entity name prefix to match create-perf-data naming: {prefix}-user-{n} (e.g. "p90-baseline")',
    )
    .description(
      'Generate coordinated alert JSONL + entity store JSONL for risk score maintainer perf testing',
    )
    .action(
      wrapAction(async (name: string, options: Record<string, string | undefined>) => {
        const userCount = parseOptionInt(options.userCount, 1000);
        const hostCount = parseOptionInt(options.hostCount, 1000);
        const alertsPerEntity = parseOptionInt(options.alertsPerEntity, 50);
        const resolutionPct = parseOptionInt(options.resolutionPct, 0);
        const resolutionGroupSize = parseOptionInt(options.resolutionGroupSize, 3);
        const timeShiftDays = parseOptionInt(options.timeShiftDays, 0);
        const prefix = options.prefix;

        const pool = generateIdentityPool({
          userCount,
          hostCount,
          resolutionPct,
          resolutionGroupSize,
          prefix,
        });

        await generateScenarioAlerts({
          name,
          pool,
          alertsPerEntity,
          timeShiftMs: timeShiftDays * MS_PER_DAY,
        });
        await generateEntityStoreData({ name, pool });

        const totalAlerts = (userCount + hostCount) * alertsPerEntity;
        const totalEntities = userCount + hostCount;
        log.info(
          `Scenario "${name}" ready: ${totalEntities} entities (${userCount} users, ${hostCount} hosts), ` +
            `${totalAlerts} alerts (${alertsPerEntity} per user and per host), resolutionPct=${resolutionPct}.`,
        );
      }),
    );

  riskEngine
    .command('upload-perf-scenario')
    .argument('<name>', 'scenario name (matches create-perf-scenario)')
    .option(
      '--replace-entities',
      'Delete matching existing entity docs before uploading entities.jsonl',
    )
    .description('Delete all alerts, then upload scenario alert JSONL files and entities.jsonl')
    .action(
      wrapAction(async (name: string, options: { replaceEntities?: boolean }) => {
        const alertsDir = getRiskEnginePerfScenarioAlertsDir(name);
        const entitiesPath = getRiskEnginePerfScenarioEntitiesPath(name);
        const alertIndex = getAlertIndex('default');
        const entityIndex = getEntityStoreLatestAlias('default');

        const started = Date.now();
        await deleteAllAlerts();

        if (!fs.existsSync(alertsDir)) {
          log.error(`Alerts directory not found: ${alertsDir}`);
          process.exit(1);
        }

        const alertFiles = fs
          .readdirSync(alertsDir)
          .filter((f) => f.endsWith('.jsonl') || f.endsWith('.json'))
          .sort();

        if (alertFiles.length === 0) {
          log.error(`No .jsonl or .json alert files in ${alertsDir}`);
          process.exit(1);
        }

        let alertLines = 0;
        for (const file of alertFiles) {
          const filePath = `${alertsDir}/${file}`;
          try {
            const n = await getFileLineCount(filePath);
            alertLines += n;
            log.info(`Uploading ${file} (${n} lines) to ${alertIndex}`);
            await uploadJsonlFile(filePath, alertIndex);
          } catch (e) {
            handleCommandError(e, `Failed uploading alerts ${filePath}`);
          }
        }

        if (!fs.existsSync(entitiesPath)) {
          log.error(`Entities file not found: ${entitiesPath}`);
          process.exit(1);
        }

        const entityLines = await getFileLineCount(entitiesPath);
        if (options.replaceEntities) {
          const selectors = loadScenarioEntitySelectors(entitiesPath);
          const deleted = await deleteExistingScenarioEntities(entityIndex, selectors);
          log.info(`Deleted ${deleted} existing entity docs matching scenario "${name}".`);
        }
        log.info(`Uploading entities.jsonl (${entityLines} lines) to ${entityIndex}`);
        try {
          await uploadJsonlFile(entitiesPath, entityIndex);
        } catch (e) {
          handleCommandError(e, 'Failed uploading entities');
        }

        const elapsed = Date.now() - started;
        log.info(
          `Upload complete for "${name}": ${alertLines} alert docs, ${entityLines} entity docs in ${elapsed}ms.`,
        );
      }),
    );

  const shortcut = (
    cmd: string,
    description: string,
    params: {
      userCount: number;
      hostCount: number;
      alertsPerEntity: number;
      resolutionPct?: number;
      resolutionGroupSize?: number;
    },
  ) => {
    riskEngine
      .command(cmd)
      .option(
        '--prefix <s>',
        'entity name prefix to match create-perf-data naming (default: scenario name)',
      )
      .description(description)
      .action(
        wrapAction(async (options: Record<string, string | undefined>) => {
          const name = cmd;
          // Default prefix matches the scenario name so entity names align with
          // `create-perf-data <name>` output: {prefix}-user-{n}, {prefix}-host-{n}.
          const prefix = options.prefix ?? name;
          const pool = generateIdentityPool({
            userCount: params.userCount,
            hostCount: params.hostCount,
            resolutionPct: params.resolutionPct ?? 0,
            resolutionGroupSize: params.resolutionGroupSize ?? 3,
            prefix,
          });
          await generateScenarioAlerts({
            name,
            pool,
            alertsPerEntity: params.alertsPerEntity,
          });
          await generateEntityStoreData({ name, pool });
          const totalAlerts = (params.userCount + params.hostCount) * params.alertsPerEntity;
          log.info(
            `Shortcut "${cmd}" done: ${params.userCount + params.hostCount} entities, ${totalAlerts} alerts.`,
          );
        }),
      );
  };

  shortcut(
    'create-scenario-p90-baseline',
    'P90-style baseline: 36k users, 2k hosts, 50 alerts/entity',
    {
      userCount: 36000,
      hostCount: 2000,
      alertsPerEntity: 50,
    },
  );

  shortcut(
    'create-scenario-p90-high-card',
    'P90-style high cardinality: 36k users, 2k hosts, 500 alerts/entity',
    {
      userCount: 36000,
      hostCount: 2000,
      alertsPerEntity: 500,
    },
  );

  shortcut('create-scenario-p95', 'P95-style: 90k users, 8k hosts, 50 alerts/entity', {
    userCount: 90000,
    hostCount: 8000,
    alertsPerEntity: 50,
  });

  shortcut('create-scenario-resolution', 'P90 baseline + 10% resolution groups (size 3)', {
    userCount: 36000,
    hostCount: 2000,
    alertsPerEntity: 50,
    resolutionPct: 10,
    resolutionGroupSize: 3,
  });
};

/**
 * Attach perf-scenario commands to the existing `risk-engine` Commander node.
 * Caller must pass the same `Command` instance returned by `root.command('risk-engine')`.
 */
export const registerPerfScenarioRiskEngineCommands = (riskEngine: Command): void => {
  attachPerfScenarioCommands(riskEngine);
};
