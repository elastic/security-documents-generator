import fs from 'fs';
import path from 'path';
import { log } from '../../utils/logger.ts';
import { ensureSpace } from '../../utils/ensure_space.ts';
import { ensureSecurityDefaultDataView } from '../../utils/security_default_data_view.ts';
import { enableEntityStoreV2, installEntityStoreV2, kibanaFetch } from '../../utils/kibana_api.ts';
import { cleanScenario } from './clean.ts';
import { setupRules } from './rules.ts';
import { indexPhaseEvents } from './source_events.ts';
import {
  applyEntityModifiers,
  assignPrivilegedWatchlist,
  extractEntities,
  linkResolution,
  runRelationshipPhase,
} from './entities.ts';
import { indexAlerts } from './alerts.ts';
import { runRiskScore } from './risk.ts';
import {
  createAttackDiscoveries,
  createS2Case,
  indexVulnerabilities,
  installPackages,
  seedS1Lead,
  type AdMode,
  type AdResult,
  type CaseResult,
} from './extras.ts';
import { runMlStep } from './ml.ts';
import { runVerification, type CheckResult } from './verify.ts';
import { buildGroundTruth } from './ground_truth.ts';
import { RELATIONSHIP_PHASES, RISK_DAYS, buildAlerts } from './scenario.ts';
import { endOfDay, sleep } from './utils.ts';

export interface ExecBriefScenarioOptions {
  space: string;
  clean: boolean;
  /** commander `--no-ml` makes `ml` default to true. */
  ml: boolean;
  adMode: AdMode;
  anchor?: string;
  connector?: string;
  out: string;
  verify: boolean;
}

const isNetworkError = (error: unknown): boolean =>
  String(error).includes('Network request failed') || String(error).includes('ECONNREFUSED');

/** Kibana dev mode restarts on file changes; wait for it before retrying a step. */
const waitForKibana = async (timeoutMs: number = 10 * 60 * 1000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const status = await kibanaFetch<{ status?: { overall?: { level?: string } } }>(
        '/api/status',
        { method: 'GET' },
        { omitApiVersion: true, ignoreStatuses: [503] },
      );
      if (status.status?.overall?.level === 'available') return;
    } catch {
      // still restarting
    }
    await sleep(5000);
  }
  throw new Error('Kibana did not become available');
};

const MAX_STEP_ATTEMPTS = 3;

const timed = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
  const start = Date.now();
  log.info(`--- ${label}`);
  for (let attempt = 1; ; attempt++) {
    try {
      const result = await fn();
      log.info(`--- ${label} done in ${((Date.now() - start) / 1000).toFixed(1)}s`);
      return result;
    } catch (error) {
      if (isNetworkError(error) && attempt < MAX_STEP_ATTEMPTS) {
        log.warn(`--- ${label}: Kibana unreachable (attempt ${attempt}); waiting and retrying`);
        await waitForKibana();
        continue;
      }
      log.error(`--- ${label} FAILED: ${String(error)}`);
      throw error;
    }
  }
};

const printChecklist = (results: CheckResult[]): string => {
  const lines = results.map(
    (r) => `${r.pass ? 'PASS' : 'FAIL'}  [${r.id}] ${r.name}\n        ${r.detail}`,
  );
  const failed = results.filter((r) => !r.pass).length;
  lines.push('', `${results.length - failed}/${results.length} checks passed`);
  return lines.join('\n');
};

export const execBriefScenarioCommand = async (
  options: ExecBriefScenarioOptions,
): Promise<void> => {
  const { space, clean, ml, adMode, out } = options;
  const anchor = options.anchor ? new Date(options.anchor) : new Date();
  if (Number.isNaN(anchor.getTime())) throw new Error(`Invalid --anchor "${options.anchor}"`);
  if (options.connector) {
    log.warn(
      '--connector is ignored: this scenario never calls an LLM (leads are seeded as documents).',
    );
  }
  log.info(
    `exec-brief-scenario: space=${space} anchor=${anchor.toISOString()} ml=${ml} ad=${adMode}`,
  );

  await waitForKibana();
  if (clean) await timed('1. Clean', () => cleanScenario(space));

  const packages = await timed('2. Setup', async () => {
    await ensureSpace(space);
    await ensureSecurityDefaultDataView(space);
    await enableEntityStoreV2(space);
    await installEntityStoreV2(space);
    return installPackages(space);
  });

  const rules = await timed('3. Rules', () => setupRules(space));

  // 4-5, 7. Source events, entity extraction and relationship scans per phase (first-seen shaping)
  const expected = new Set<string>();
  for (const phase of RELATIONSHIP_PHASES) {
    await timed(
      `4/5/7. Phase D-${phase}: events, extraction, relationship maintainers`,
      async () => {
        const { logons, expectedEntityIds } = await indexPhaseEvents({ phase, anchor, space });
        expectedEntityIds.forEach((id) => expected.add(id));
        log.info(`Indexed ${logons} logon(s); expecting ${expected.size} entities so far`);
        await extractEntities({ anchor, space, expectedEntityIds: [...expected] });
        await runRelationshipPhase({ phase, anchor, space });
      },
    );
  }

  await timed('6. Resolution links', () => linkResolution(space));
  await timed('8. Modifiers (criticality, ownership, Privileged Users watchlist)', async () => {
    await applyEntityModifiers(space);
    await assignPrivilegedWatchlist(space);
  });

  await timed('9. Alerts and day-by-day risk', async () => {
    const alerts = buildAlerts();
    for (let daysAgo = 30; daysAgo >= 1; daysAgo--) {
      const dayAlerts = alerts.filter((a) => a.daysAgo === daysAgo);
      if (dayAlerts.length > 0) {
        await indexAlerts({ specs: dayAlerts, rules, anchor, space });
        log.info(`D-${daysAgo}: indexed ${dayAlerts.length} alert(s)`);
      }
      if ((RISK_DAYS as readonly number[]).includes(daysAgo)) {
        await runRiskScore({ space, stamp: endOfDay(anchor, daysAgo) });
      }
    }
  });

  await timed('10. Vulnerabilities and ML', async () => {
    const count = await indexVulnerabilities();
    log.info(`Indexed ${count} vulnerability doc(s)`);
  });
  const mlResult = ml ? await timed('10b. ML (best effort)', () => runMlStep(space)) : undefined;

  const ad: AdResult = await timed('11. Attack Discovery', () =>
    createAttackDiscoveries({ mode: adMode, anchor, space, rules }),
  );

  const caseResult: CaseResult = await timed('12. Case (S2)', () =>
    createS2Case({ anchor, space, rules }),
  );

  await timed('14. Final risk run (not rebadged)', async () => {
    await runRiskScore({ space });
  });

  const leadId = await timed('13. Leads (seeded documents, no LLM)', () =>
    seedS1Lead({ anchor, space }),
  );

  const mlEnabled = Boolean(mlResult?.ok);
  let results: CheckResult[] = [];
  if (options.verify) {
    results = await timed('15. Verification', () =>
      runVerification({ space, anchor, mlEnabled, caseId: caseResult.caseId }),
    );
  }

  const groundTruth = buildGroundTruth({
    anchor,
    space,
    rules,
    ad,
    caseResult,
    leadId,
    mlEnabled,
    packages,
  });
  fs.mkdirSync(out, { recursive: true });
  const checklist = printChecklist(results);
  fs.writeFileSync(path.join(out, 'ground_truth.json'), JSON.stringify(groundTruth, null, 2));
  fs.writeFileSync(
    path.join(out, 'verification.txt'),
    `exec-brief-scenario verification (space=${space}, anchor=${anchor.toISOString()})\n` +
      `ad: ${JSON.stringify({ ...ad, discoveryIds: ad.discoveryIds })}\n` +
      `ml: ${JSON.stringify(mlResult ?? 'skipped (--no-ml)')}\n\n${checklist}\n`,
  );
  log.info(`\n${checklist}`);
  log.info(`Ground truth written to ${path.join(out, 'ground_truth.json')}`);
};
