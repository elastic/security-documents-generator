import { faker } from '@faker-js/faker';
import { merge } from 'lodash-es';
import fs from 'fs/promises';
import {
  CLAUDE_CODE_OTEL_INDEX,
  ENDPOINT_PROCESS_INDEX,
  type GeneratedDocument,
} from '../../generators/ai_agents/index.ts';
import { installPackage } from '../../utils/kibana_api.ts';
import { log } from '../../utils/logger.ts';
import { bulkIngest } from '../shared/elasticsearch.ts';
import { getEsClient } from '../utils/indices.ts';
import {
  AI_AGENT_SCENARIOS,
  buildScenario,
  EXTRAPOLATED_SCENARIOS,
  type AiAgentScenario,
} from './scenarios.ts';

export interface AiAgentDataOptions {
  readonly scenarios: readonly AiAgentScenario[];
  readonly repeat: number;
  readonly timeWindowMs: number;
  readonly claudeOtel: boolean;
  readonly mapSessionId: boolean;
  readonly sessionData: boolean;
  readonly installPackages: boolean;
  readonly outputFile?: string;
  readonly space: string;
  readonly seed?: number;
  readonly domain: string;
}

const SCENARIO_GAP_MS = 60_000;

export const parseScenarios = (input: string): AiAgentScenario[] => {
  const names = input
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  if (names.length === 1 && names[0] === 'all') {
    return [...AI_AGENT_SCENARIOS];
  }
  const unknown = names.filter((name) => !(AI_AGENT_SCENARIOS as readonly string[]).includes(name));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown scenario(s): ${unknown.join(', ')}. Available: ${AI_AGENT_SCENARIOS.join(', ')}`,
    );
  }
  return names as AiAgentScenario[];
};

export interface BuiltScenario {
  readonly scenario: AiAgentScenario;
  readonly documents: GeneratedDocument[];
}

/** Builds every scenario back to back from `now - timeWindowMs`, so nothing lands in the future. */
export const buildAiAgentDocuments = (
  options: Pick<
    AiAgentDataOptions,
    'scenarios' | 'repeat' | 'timeWindowMs' | 'claudeOtel' | 'sessionData' | 'domain'
  >,
  now: number = Date.now(),
): BuiltScenario[] => {
  const organizationId = faker.string.uuid();
  const built: BuiltScenario[] = [];
  let cursor = now - options.timeWindowMs;
  for (let copy = 0; copy < options.repeat; copy++) {
    for (const scenario of options.scenarios) {
      const output = buildScenario(scenario, {
        start: cursor,
        domain: options.domain,
        organizationId,
        claudeOtel: options.claudeOtel,
        sessionData: options.sessionData,
      });
      built.push({ scenario, documents: output.documents });
      cursor = output.end + SCENARIO_GAP_MS;
    }
  }
  const latest = built.reduce(
    (max, { documents }) =>
      documents.reduce(
        (inner, doc) => Math.max(inner, Date.parse(String(doc.source['@timestamp']))),
        max,
      ),
    0,
  );
  if (latest > now) {
    throw new Error(
      `The selected scenarios need about ${Math.ceil((latest - now + options.timeWindowMs) / 60_000)} minutes. Increase --time-window.`,
    );
  }
  return built;
};

const byTimestamp = (a: GeneratedDocument, b: GeneratedDocument): number =>
  String(a.source['@timestamp']).localeCompare(String(b.source['@timestamp']));

const writeOutputFile = async (path: string, documents: GeneratedDocument[]): Promise<void> => {
  const lines = [...documents]
    .sort(byTimestamp)
    .map((doc) => JSON.stringify({ _index: doc.index, _source: doc.source }));
  await fs.writeFile(path, lines.join('\n') + '\n', 'utf8');
};

const installAgentPackages = async (space: string, claudeOtel: boolean): Promise<void> => {
  const packages = [
    { packageName: 'endpoint', prerelease: true },
    { packageName: 'osquery_manager', prerelease: false },
    ...(claudeOtel ? [{ packageName: 'claude_code', prerelease: true }] : []),
  ];
  for (const { packageName, prerelease } of packages) {
    log.info(`Installing ${packageName} package...`);
    try {
      await installPackage({ packageName, space, prerelease });
    } catch (error) {
      if (!(error instanceof Error && error.message.includes('409'))) {
        throw error;
      }
    }
  }
};

const SESSION_ID_PROPERTY = {
  process: {
    properties: {
      ai_agent: { properties: { session_id: { type: 'keyword', ignore_above: 1024 } } },
    },
  },
} as const;

/** The `endpoint@custom` workaround for package 9.6.1, merged into any existing component template. */
const mapSessionIdField = async (): Promise<void> => {
  const client = getEsClient();
  const name = 'endpoint@custom';
  const existing = await client.cluster
    .getComponentTemplate({ name })
    .then((response) => response.component_templates[0]?.component_template)
    .catch((error: { meta?: { statusCode?: number } }) => {
      if (error.meta?.statusCode === 404) {
        return undefined;
      }
      throw error;
    });
  const template = existing?.template ?? {};
  await client.cluster.putComponentTemplate({
    name,
    ...(existing?._meta && { _meta: existing._meta }),
    template: {
      ...template,
      mappings: merge({}, template.mappings ?? {}, { properties: SESSION_ID_PROPERTY }),
    },
  });
  await client.indices.putMapping({
    index: 'logs-endpoint.events.*',
    allow_no_indices: true,
    ignore_unavailable: true,
    properties: SESSION_ID_PROPERTY,
  });
  log.info('Mapped process.ai_agent.session_id as keyword through endpoint@custom');
};

const countByIndex = (documents: readonly GeneratedDocument[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const doc of documents) {
    counts.set(doc.index, (counts.get(doc.index) ?? 0) + 1);
  }
  return counts;
};

export const generateAiAgentData = async (options: AiAgentDataOptions): Promise<void> => {
  if (options.seed !== undefined) {
    faker.seed(options.seed);
  }
  const extrapolated = options.scenarios.filter((scenario) => EXTRAPOLATED_SCENARIOS.has(scenario));
  if (extrapolated.length > 0) {
    log.warn(
      `Extrapolated scenarios selected (not observed in the lab): ${extrapolated.join(', ')}`,
    );
  }
  if (options.claudeOtel) {
    log.warn(
      'Claude Code OTel events are extrapolated from the package fixtures, not observed data',
    );
  }

  const built = buildAiAgentDocuments(options);
  const documents = built.flatMap(({ documents: scenarioDocuments }) => scenarioDocuments);
  for (const { scenario, documents: scenarioDocuments } of built) {
    log.info(`  ${scenario}: ${scenarioDocuments.length} documents`);
  }

  if (options.outputFile) {
    await writeOutputFile(options.outputFile, documents);
    log.info(`Wrote ${documents.length} documents to ${options.outputFile}`);
    return;
  }

  if (options.installPackages) {
    await installAgentPackages(options.space, options.claudeOtel);
  }
  if (options.mapSessionId) {
    await mapSessionIdField();
  }

  const byIndex = new Map<string, GeneratedDocument[]>();
  for (const doc of documents) {
    const indexDocuments = byIndex.get(doc.index) ?? [];
    indexDocuments.push(doc);
    byIndex.set(doc.index, indexDocuments);
  }
  for (const [index, indexDocuments] of byIndex) {
    log.info(`Indexing ${indexDocuments.length} documents into ${index}`);
    await bulkIngest({
      index,
      documents: [...indexDocuments].sort(byTimestamp).map((doc) => doc.source),
      action: 'create',
      metadata: true,
      showProgress: true,
      pipeline: index === CLAUDE_CODE_OTEL_INDEX ? '_none' : undefined,
    });
  }

  const counts = countByIndex(documents);
  log.info(
    `Done. ${documents.length} documents, ${counts.get(ENDPOINT_PROCESS_INDEX) ?? 0} of them process events.`,
  );
};
