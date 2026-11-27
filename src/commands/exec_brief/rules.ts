import { kibanaFetch, createAlertsIndex } from '../../utils/kibana_api.ts';
import { API_VERSIONS } from '../../constants.ts';
import { log } from '../../utils/logger.ts';
import { RULES, type ScenarioRule } from './scenario.ts';
import { SCENARIO_TAG, getStatusCode } from './utils.ts';

const DETECTION_RULES_URL = '/api/detection_engine/rules';
const RULES_BULK_ACTION_URL = '/api/detection_engine/rules/_bulk_action';
const INITIALIZE_URL = '/api/security_solution/initialize';
const REVIEW_INSTALL_URL = '/internal/detection_engine/prebuilt_rules/installation/_review';
const PERFORM_INSTALL_URL = '/internal/detection_engine/prebuilt_rules/installation/_perform';

export type RuleSource = 'prebuilt' | 'custom-fallback';

/** Rule as read back from Kibana, which is the source of truth for alert rule fields. */
export interface InstalledRule {
  key: string;
  source: RuleSource;
  /** Saved object id (kibana.alert.rule.uuid). */
  uuid: string;
  ruleId: string;
  name: string;
  enabled: boolean;
  raw: Record<string, unknown>;
}

interface ReviewResponse {
  rules?: Array<{ rule_id?: string; name?: string; version?: number }>;
}

const getRuleByRuleId = async (
  ruleId: string,
  space: string,
): Promise<Record<string, unknown> | undefined> => {
  try {
    return await kibanaFetch<Record<string, unknown>>(
      `${DETECTION_RULES_URL}?rule_id=${encodeURIComponent(ruleId)}`,
      { method: 'GET' },
      { apiVersion: API_VERSIONS.public.v1, space },
    );
  } catch (error) {
    if (getStatusCode(error) === 404) return undefined;
    throw error;
  }
};

const installPrebuilt = async (space: string): Promise<Map<string, string>> => {
  // Maps scenario rule key -> rule_id that is available in the prebuilt package.
  const resolved = new Map<string, string>();
  try {
    await kibanaFetch(
      INITIALIZE_URL,
      { method: 'POST', body: JSON.stringify({ flows: ['init-prebuilt-rules'] }) },
      { apiVersion: API_VERSIONS.public.v1, space },
    );
  } catch (error) {
    log.warn(
      `Prebuilt rules initialization failed (${String(error)}); using custom fallback rules.`,
    );
    return resolved;
  }

  const review = await kibanaFetch<ReviewResponse>(
    REVIEW_INSTALL_URL,
    { method: 'POST', body: JSON.stringify({}) },
    { apiVersion: '1', space },
  );
  const available = review.rules ?? [];
  const toInstall: Array<{ rule_id: string; version: number }> = [];

  for (const rule of RULES) {
    const existing = await getRuleByRuleId(rule.ruleId, space);
    if (existing) {
      resolved.set(rule.key, rule.ruleId);
      continue;
    }
    const match =
      available.find((r) => r.rule_id === rule.ruleId) ??
      available.find((r) => r.name === rule.name);
    if (match?.rule_id && typeof match.version === 'number') {
      toInstall.push({ rule_id: match.rule_id, version: match.version });
      resolved.set(rule.key, match.rule_id);
    } else {
      log.warn(`Prebuilt rule "${rule.name}" (${rule.ruleId}) not found in the package.`);
    }
  }

  if (toInstall.length > 0) {
    log.info(`Installing ${toInstall.length} prebuilt rule(s)...`);
    await kibanaFetch(
      PERFORM_INSTALL_URL,
      { method: 'POST', body: JSON.stringify({ mode: 'SPECIFIC_RULES', rules: toInstall }) },
      { apiVersion: '1', space },
    );
  }
  return resolved;
};

const buildThreat = (rule: ScenarioRule) => [
  {
    framework: 'MITRE ATT&CK',
    tactic: {
      id: rule.tactic.id,
      name: rule.tactic.name,
      reference: `https://attack.mitre.org/tactics/${rule.tactic.id}/`,
    },
    technique: [
      {
        id: rule.technique.id,
        name: rule.technique.name,
        reference: `https://attack.mitre.org/techniques/${rule.technique.id}/`,
        ...(rule.subTechnique
          ? {
              subtechnique: [
                {
                  id: rule.subTechnique.id,
                  name: rule.subTechnique.name,
                  reference: `https://attack.mitre.org/techniques/${rule.subTechnique.id.replace('.', '/')}/`,
                },
              ],
            }
          : {}),
      },
    ],
  },
];

const createFallbackRule = async (
  rule: ScenarioRule,
  space: string,
): Promise<Record<string, unknown>> => {
  log.warn(`Creating custom fallback rule for "${rule.name}" (prebuilt package unavailable).`);
  try {
    return await kibanaFetch<Record<string, unknown>>(
      DETECTION_RULES_URL,
      {
        method: 'POST',
        body: JSON.stringify({
          rule_id: rule.ruleId,
          name: rule.name,
          description: `${rule.name} (exec-brief-scenario fallback rule)`,
          severity: rule.severity,
          risk_score: rule.riskScore,
          type: 'query',
          language: 'kuery',
          query: 'event.dataset: "exec_brief_scenario.noop"',
          index: ['logs-exec_brief_scenario.noop-*'],
          interval: '1h',
          from: 'now-2h',
          enabled: false,
          threat: rule.noRuleThreat ? [] : buildThreat(rule),
          related_integrations: rule.integrations.map((integration) => ({
            package: integration,
            version: '^1.0.0',
          })),
          tags: ['Elastic', 'exec-brief-fallback'],
        }),
      },
      { apiVersion: API_VERSIONS.public.v1, space, ignoreStatuses: [409] },
    );
  } catch (error) {
    throw new Error(`Failed to create fallback rule "${rule.name}": ${String(error)}`, {
      cause: error,
    });
  }
};

/** Install (or fall back to creating), read back and enable the scenario rules. */
export const setupRules = async (space: string): Promise<Map<string, InstalledRule>> => {
  await createAlertsIndex(space);
  const resolved = await installPrebuilt(space);
  const installed = new Map<string, InstalledRule>();

  for (const rule of RULES) {
    const ruleId = resolved.get(rule.key) ?? rule.ruleId;
    let raw = await getRuleByRuleId(ruleId, space);
    let source: RuleSource = 'prebuilt';
    if (!raw) {
      await createFallbackRule(rule, space);
      raw = await getRuleByRuleId(rule.ruleId, space);
      source = 'custom-fallback';
    }
    if (!raw) throw new Error(`Rule "${rule.name}" could not be read back after install`);
    installed.set(rule.key, {
      key: rule.key,
      source,
      uuid: String(raw.id),
      ruleId: String(raw.rule_id),
      name: String(raw.name),
      enabled: raw.enabled === true,
      raw,
    });
  }

  const toEnable = RULES.filter((r) => r.enable)
    .map((r) => installed.get(r.key))
    .filter((r): r is InstalledRule => r !== undefined && !r.enabled);
  if (toEnable.length > 0) {
    await kibanaFetch(
      RULES_BULK_ACTION_URL,
      {
        method: 'POST',
        body: JSON.stringify({ action: 'enable', ids: toEnable.map((r) => r.uuid) }),
      },
      { apiVersion: API_VERSIONS.public.v1, space },
    );
    toEnable.forEach((r) => {
      r.enabled = true;
    });
  }

  const summary = [...installed.values()].map(
    (r) => `${r.name} [${r.source}${r.enabled ? ', enabled' : ''}]`,
  );
  log.info(`Scenario rules ready (${installed.size}):\n  ${summary.join('\n  ')}`);
  return installed;
};

/** Rules for the "x/y rules working" tag used when cleaning scenario alerts. */
export const SCENARIO_RULE_TAGS = [SCENARIO_TAG];
