import { seedAlertDeltas } from './seed_alert_deltas.ts';

export interface SeedAlertDeltasCommandOptions {
  space: string;
  count: number;
  anomalyCount?: number;
}

// Thin wrapper for already-seeded clusters, where re-running nat-perf would re-seed everything.
export const seedAlertDeltasCommand = async (
  opts: SeedAlertDeltasCommandOptions,
): Promise<void> => {
  await seedAlertDeltas({
    space: opts.space,
    count: opts.count,
    anomalyCount: opts.anomalyCount,
  });
};
