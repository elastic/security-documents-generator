import { log } from '../../utils/logger.ts';
import { generateAnomalousBehaviorDataWithMlJobs } from '../misc/anomalous_behavior/index.ts';

const ML_TIMEOUT_MS = 4 * 60 * 1000;

/**
 * Best-effort ML step: installs the security ML modules and indexes anomaly records correlated with
 * the entity store. Never fails the run; a timeout or error leaves the stack in a "no ML" state.
 */
export const runMlStep = async (space: string): Promise<{ ok: boolean; detail: string }> => {
  try {
    await Promise.race([
      generateAnomalousBehaviorDataWithMlJobs(space, 6, false, true, true),
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error(`ML step timed out after ${ML_TIMEOUT_MS / 1000}s`)),
          ML_TIMEOUT_MS,
        );
      }),
    ]);
    return { ok: true, detail: 'ML modules set up and anomaly records indexed' };
  } catch (error) {
    log.warn(`ML step failed (continuing without ML): ${String(error).slice(0, 300)}`);
    return { ok: false, detail: String(error).slice(0, 300) };
  }
};
