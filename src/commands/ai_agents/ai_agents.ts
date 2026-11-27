import { faker } from '@faker-js/faker';
import { merge } from 'lodash-es';
import { type MappingProperty } from '@elastic/elasticsearch/lib/api/types';
import fs from 'fs/promises';
import {
  CLAUDE_CODE_OTEL_INDEX,
  CURSOR_AUDIT_INDEX,
  ENDPOINT_PROCESS_INDEX,
  ENTRA_USER_INDEX,
  OKTA_USER_INDEX,
  resequenceEndpointEvents,
  seedClaudeCodeOtel,
  seedCursorAudit,
  type GeneratedDocument,
} from '../../generators/ai_agents/index.ts';
import { resetSyntheticIdentities } from './synthetic_identities.ts';
import { createSpace, doesSpaceExist, installPackage } from '../../utils/kibana_api.ts';
import { log } from '../../utils/logger.ts';
import { bulkIngest } from '../shared/elasticsearch.ts';
import { getEsClient } from '../utils/indices.ts';
import {
  ALL_SCENARIOS,
  buildScenario,
  EXTRAPOLATED_SCENARIOS,
  POC_MOCK_SCENARIOS,
  SCENARIO_GROUPS,
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
  readonly cursorAudit: boolean;
  readonly outputFile?: string;
  readonly space: string;
  /** Data stream namespace for every `-default` index. Defaults to the space, so a space's maintainers read it. */
  readonly namespace: string;
  readonly seed?: number;
  readonly domain: string;
  /** `latest` follows the registry. The default matches the lab, where `session_id` is unmapped. */
  readonly endpointVersion: string;
}

const SCENARIO_GAP_MS = 60_000;

export const DEFAULT_ENDPOINT_VERSION = '9.6.1';

const isScenario = (name: string): name is AiAgentScenario =>
  (ALL_SCENARIOS as readonly string[]).includes(name);

/** Scenario names and group names (`all`, `rule_trips`, `demo` and so on), expanded and deduplicated in order. */
export const parseScenarios = (input: string): AiAgentScenario[] => {
  const names = input
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  const unknown = names.filter((name) => !isScenario(name) && !(name in SCENARIO_GROUPS));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown scenario(s): ${unknown.join(', ')}. Groups: ${Object.keys(SCENARIO_GROUPS).join(', ')}. Scenarios: ${ALL_SCENARIOS.join(', ')}`,
    );
  }
  const expanded = names.flatMap((name) => (isScenario(name) ? [name] : SCENARIO_GROUPS[name]));
  return [...new Set(expanded)];
};

/** Moves a document from its `-default` data stream to `namespace`. */
export const applyNamespace = (doc: GeneratedDocument, namespace: string): GeneratedDocument => {
  if (namespace === 'default' || !doc.index.endsWith('-default')) {
    return doc;
  }
  const dataStream = doc.source.data_stream as { namespace?: string } | undefined;
  if (dataStream) {
    dataStream.namespace = namespace;
  }
  return { index: `${doc.index.slice(0, -'default'.length)}${namespace}`, source: doc.source };
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
  > &
    Partial<Pick<AiAgentDataOptions, 'cursorAudit' | 'namespace'>>,
  now: number = Date.now(),
): BuiltScenario[] => {
  resetSyntheticIdentities();
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
        cursorAudit: options.cursorAudit ?? false,
      });
      built.push({
        scenario,
        documents: output.documents.map((doc) =>
          applyNamespace(doc, options.namespace ?? 'default'),
        ),
      });
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
  resequenceEndpointEvents(built.flatMap(({ documents }) => documents));
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

const installAgentPackages = async (
  space: string,
  claudeOtel: boolean,
  endpointVersion: string,
): Promise<void> => {
  const packages = [
    { packageName: 'endpoint', version: endpointVersion, prerelease: endpointVersion === 'latest' },
    { packageName: 'osquery_manager', version: 'latest', prerelease: false },
    ...(claudeOtel ? [{ packageName: 'claude_code', version: 'latest', prerelease: true }] : []),
  ];
  for (const { packageName, version, prerelease } of packages) {
    log.info(`Installing ${packageName} package (${version})...`);
    try {
      await installPackage({ packageName, version, space, prerelease });
    } catch (error) {
      if (!(error instanceof Error && error.message.includes('409'))) {
        throw error;
      }
    }
  }
};

/** Endpoint templates are `dynamic: false`, so the PoC's scenario label and tags need mapping to be queryable. */
const POC_PROPERTIES: Record<string, MappingProperty> = {
  labels: {
    properties: {
      poc_scenario: { type: 'keyword', ignore_above: 1024 },
      poc_install_shape: { type: 'keyword', ignore_above: 1024 },
    },
  },
  tags: { type: 'keyword', ignore_above: 1024 },
};

const SESSION_ID_PROPERTY: Record<string, MappingProperty> = {
  process: {
    properties: {
      ai_agent: { properties: { session_id: { type: 'keyword', ignore_above: 1024 } } },
    },
  },
};

/**
 * Merges `properties` into `endpoint@custom`, which every Endpoint events and alerts template uses,
 * and into the current Endpoint backing indices.
 */
const mapEndpointFields = async (properties: Record<string, MappingProperty>): Promise<void> => {
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
    ...(existing?.version !== undefined && { version: existing.version }),
    template: {
      ...template,
      mappings: merge({}, template.mappings ?? {}, { properties }),
    },
  });
  await client.indices.putMapping({
    index: 'logs-endpoint.*',
    allow_no_indices: true,
    ignore_unavailable: true,
    properties,
  });
};

/** The `endpoint@custom` workaround for package 9.6.1. */
const mapSessionIdField = async (): Promise<void> => {
  const existing = await getEsClient()
    .cluster.getComponentTemplate({ name: 'endpoint@custom' })
    .then((response) => response.component_templates[0]?.component_template)
    .catch(() => undefined);
  const currentType = (
    existing?.template.mappings?.properties?.process as
      | { properties?: { ai_agent?: { properties?: { session_id?: { type?: string } } } } }
      | undefined
  )?.properties?.ai_agent?.properties?.session_id?.type;
  if (currentType && currentType !== 'keyword') {
    log.warn(
      `endpoint@custom maps process.ai_agent.session_id as ${currentType}. Replacing it with keyword.`,
    );
  }
  await mapEndpointFields(SESSION_ID_PROPERTY);
  log.info('Mapped process.ai_agent.session_id as keyword through endpoint@custom');
};

/** Indices written in the integrations' stored shape, or not owned by any integration, skip ingest pipelines. */
const NO_PIPELINE_PREFIXES = [
  CLAUDE_CODE_OTEL_INDEX,
  CURSOR_AUDIT_INDEX,
  OKTA_USER_INDEX,
  ENTRA_USER_INDEX,
].map((index) => index.slice(0, -'default'.length));

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
    seedClaudeCodeOtel(options.seed);
    seedCursorAudit(options.seed);
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
  const mock = options.scenarios.filter((scenario) => POC_MOCK_SCENARIOS.has(scenario));
  if (mock.length > 0 || options.cursorAudit) {
    log.warn(
      `Documents tagged poc-mock (inferred shapes): ${[...mock, ...(options.cursorAudit ? ['Cursor audit'] : [])].join(', ')}`,
    );
  }

  const built = buildAiAgentDocuments(options);
  const documents = built.flatMap(({ documents: scenarioDocuments }) => scenarioDocuments);
  for (const { scenario, documents: scenarioDocuments } of built) {
    log.info(`  ${scenario}: ${scenarioDocuments.length} documents`);
  }

  if (options.outputFile) {
    if (options.mapSessionId) {
      log.warn('--map-session-id changes cluster mappings, so it does nothing with --output-file');
    }
    await writeOutputFile(options.outputFile, documents);
    log.info(`Wrote ${documents.length} documents to ${options.outputFile}`);
    return;
  }

  if (options.space !== 'default' && !(await doesSpaceExist(options.space))) {
    await createSpace(options.space);
    log.info(`Created Kibana space ${options.space}`);
  }
  if (options.installPackages) {
    await installAgentPackages(options.space, options.claudeOtel, options.endpointVersion);
  }
  if (options.mapSessionId) {
    await mapSessionIdField();
  }
  await mapEndpointFields(POC_PROPERTIES);

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
      pipeline: NO_PIPELINE_PREFIXES.some((prefix) => index.startsWith(prefix))
        ? '_none'
        : undefined,
    });
  }

  const counts = countByIndex(documents);
  const processIndex = applyNamespace(
    { index: ENDPOINT_PROCESS_INDEX, source: {} },
    options.namespace,
  ).index;
  log.info(
    `Done. ${documents.length} documents, ${counts.get(processIndex) ?? 0} of them process events.`,
  );
};
