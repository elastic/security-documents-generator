import { readFileSync } from 'node:fs';
import { API_VERSIONS, DETECTION_ENGINE_RULES_URL } from '../../constants.ts';
import { kibanaFetch } from '../../utils/kibana_api.ts';
import { ensureSpace } from '../../utils/ensure_space.ts';
import { log } from '../../utils/logger.ts';

const INITIALIZE_URL = '/api/security_solution/initialize';
const REVIEW_INSTALL_URL = '/internal/detection_engine/prebuilt_rules/installation/_review';
const PERFORM_INSTALL_URL = '/internal/detection_engine/prebuilt_rules/installation/_perform';
const RULES_DIR = new URL('./rules/', import.meta.url);

/** Fires on every process an agent's tree starts, so `demo` leaves it off. */
const MCP_CHILD_COPY = '616dd7cb-cee9-5220-a5d9-213116358999';

/**
 * Fields taken from the installed original onto its copy. Everything else (id, version,
 * immutable, rule_source and so on) belongs to the original.
 */
const COPY_FIELDS = [
  'type',
  'language',
  'index',
  'data_view_id',
  'filters',
  'from',
  'interval',
  'to',
  'max_signals',
  'severity',
  'severity_mapping',
  'risk_score',
  'risk_score_mapping',
  'description',
  'note',
  'setup',
  'references',
  'false_positives',
  'threat',
  'author',
  'license',
  'building_block_type',
  'timestamp_override',
  'timestamp_override_fallback_disabled',
  'rule_name_override',
  'new_terms_fields',
  'history_window_start',
  'event_category_override',
  'tiebreaker_field',
  'timestamp_field',
  'alert_suppression',
  'investigation_fields',
  'related_integrations',
] as const;

export const RULE_SETS = ['none', 'promotion', 'originals', 'copies', 'demo', 'all'] as const;
export type RuleSet = (typeof RULE_SETS)[number];

interface ManifestRule {
  slug: string;
  rule_id: string;
  name: string;
  copy?: { rule_id: string; query_file: string };
  no_copy_reason?: string;
}

interface Manifest {
  copy_tag: string;
  promotion_rule: { rule_id: string; name: string };
  rules: ManifestRule[];
}

type Rule = Record<string, unknown> & {
  rule_id: string;
  name: string;
  enabled: boolean;
  description: string;
  tags?: string[];
  type: string;
};

export const loadRulesManifest = (): Manifest =>
  JSON.parse(readFileSync(new URL('rules.json', RULES_DIR), 'utf8')) as Manifest;

const readQuery = (file: string): string =>
  `${readFileSync(new URL(file, RULES_DIR), 'utf8').trim()}\n`;

const findRule = async (space: string, ruleId: string): Promise<Rule | undefined> => {
  const found = await kibanaFetch<Partial<Rule>>(
    `${DETECTION_ENGINE_RULES_URL}?rule_id=${encodeURIComponent(ruleId)}`,
    { method: 'GET' },
    { apiVersion: API_VERSIONS.public.v1, space, ignoreStatuses: 404 },
  );
  return found.rule_id ? (found as Rule) : undefined;
};

/** Installs the given prebuilt rules that aren't installed yet. Returns those not in the package. */
const installOriginals = async (space: string, ruleIds: string[]): Promise<string[]> => {
  await kibanaFetch(
    INITIALIZE_URL,
    { method: 'POST', body: JSON.stringify({ flows: ['init-prebuilt-rules'] }) },
    { apiVersion: API_VERSIONS.public.v1, space },
  );
  const installed = new Set<string>();
  for (const ruleId of ruleIds) {
    if (await findRule(space, ruleId)) installed.add(ruleId);
  }
  const wanted = ruleIds.filter((ruleId) => !installed.has(ruleId));
  const versions = new Map<string, number>();
  for (let page = 1; wanted.length > 0; page++) {
    const review = await kibanaFetch<{
      rules: Array<{ rule_id: string; version: number }>;
      total: number;
      per_page: number;
    }>(
      REVIEW_INSTALL_URL,
      { method: 'POST', body: JSON.stringify({ page, per_page: 500 }) },
      { apiVersion: API_VERSIONS.internal.v1, space },
    );
    review.rules
      .filter(({ rule_id }) => wanted.includes(rule_id))
      .forEach(({ rule_id, version }) => versions.set(rule_id, version));
    if (page * review.per_page >= review.total) break;
  }
  if (versions.size > 0) {
    await kibanaFetch(
      PERFORM_INSTALL_URL,
      {
        method: 'POST',
        body: JSON.stringify({
          mode: 'SPECIFIC_RULES',
          rules: [...versions].map(([rule_id, version]) => ({ rule_id, version })),
        }),
      },
      { apiVersion: API_VERSIONS.internal.v1, space },
    );
  }
  log.info(`Prebuilt rules: ${versions.size} installed, ${installed.size} already there`);
  const missing = wanted.filter((ruleId) => !versions.has(ruleId));
  missing.forEach((ruleId) => log.warn(`Not in the installed rules package: ${ruleId}`));
  return missing;
};

export const buildCopy = (original: Rule, entry: ManifestRule, manifest: Manifest) => {
  if (!entry.copy) throw new Error(`${entry.name} has no copy`);
  const body: Record<string, unknown> = {};
  COPY_FIELDS.forEach((field) => {
    if (original[field] !== undefined && original[field] !== null) body[field] = original[field];
  });
  Object.assign(body, {
    rule_id: entry.copy.rule_id,
    name: original.name,
    tags: [...new Set([...(original.tags ?? []), manifest.copy_tag])].sort(),
    query: readQuery(entry.copy.query_file),
    enabled: false,
    description: `${original.description.trimEnd()}\n\nPoC copy: the process name lists that identify agents are replaced with process.ai_agent.name and process.ai_agent.is_descendant. Original rule_id ${entry.rule_id}.`,
  });
  if (body.type === 'esql') delete body.index;
  return body;
};

const upsertCopies = async (space: string, manifest: Manifest): Promise<string[]> => {
  const written: string[] = [];
  for (const entry of manifest.rules) {
    if (!entry.copy) continue;
    const original = await findRule(space, entry.rule_id);
    if (!original) {
      log.warn(`Skipping the copy of ${entry.name}: the original isn't installed`);
      continue;
    }
    const body = buildCopy(original, entry, manifest);
    const existing = await findRule(space, entry.copy.rule_id);
    if (existing) body.enabled = existing.enabled;
    await kibanaFetch(
      DETECTION_ENGINE_RULES_URL,
      { method: existing ? 'PUT' : 'POST', body: JSON.stringify(body) },
      { apiVersion: API_VERSIONS.public.v1, space },
    );
    written.push(entry.copy.rule_id);
  }
  log.info(`Agent-field copies written: ${written.length}`);
  return written;
};

/** The rule IDs each `--enable` choice turns on. */
export const rulesToEnable = (set: RuleSet, manifest: Manifest, copies: string[]): string[] => {
  const promotion = manifest.promotion_rule.rule_id;
  const originals = manifest.rules.map(({ rule_id }) => rule_id);
  switch (set) {
    case 'none':
      return [];
    case 'promotion':
      return [promotion];
    case 'originals':
      return [promotion, ...originals];
    case 'copies':
      return [promotion, ...copies];
    case 'demo':
      return [
        promotion,
        ...copies.filter((ruleId) => ruleId !== MCP_CHILD_COPY),
        ...manifest.rules.filter(({ copy }) => !copy).map(({ rule_id }) => rule_id),
      ];
    case 'all':
      return [promotion, ...originals, ...copies];
  }
};

export interface InstallAiAgentRulesOptions {
  space: string;
  enable: RuleSet;
  /** Sets each enabled rule's `from` to `now-<lookback>`, so its first run covers data just loaded. */
  lookback?: string;
}

/**
 * Installs the Defend GenAI prebuilt rules and the promotion rule, writes the copies keyed on
 * `process.ai_agent.*` as disabled custom rules, then enables the chosen set.
 */
export const installAiAgentRules = async ({
  space,
  enable,
  lookback,
}: InstallAiAgentRulesOptions): Promise<void> => {
  await ensureSpace(space);
  const manifest = loadRulesManifest();
  const missing = await installOriginals(space, [
    manifest.promotion_rule.rule_id,
    ...manifest.rules.map(({ rule_id }) => rule_id),
  ]);
  const copies = await upsertCopies(space, manifest);
  const targets = rulesToEnable(enable, manifest, copies).filter(
    (ruleId) => !missing.includes(ruleId),
  );
  for (const ruleId of targets) {
    await kibanaFetch(
      DETECTION_ENGINE_RULES_URL,
      {
        method: 'PATCH',
        body: JSON.stringify({
          rule_id: ruleId,
          enabled: true,
          ...(lookback ? { from: `now-${lookback}` } : {}),
        }),
      },
      { apiVersion: API_VERSIONS.public.v1, space },
    );
  }
  log.info(
    `Enabled ${targets.length} rules in ${space}${lookback ? ` with from now-${lookback}` : ''}`,
  );
};
