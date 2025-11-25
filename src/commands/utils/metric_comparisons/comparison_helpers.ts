import { ComparisonResult, ComparisonThresholds } from '../metrics_comparison';

/**
 * Determine status based on effective difference percentage.
 * After normalization via effectiveDiffPercent:
 * - Negative values = worse (degradation/warning)
 * - Positive values = better (improvement)
 * - Near zero = stable
 */
export const determineStatus = (
  effectiveDiffPercent: number,
  thresholds: ComparisonThresholds
): ComparisonResult['status'] => {
  if (effectiveDiffPercent < -thresholds.degradationThreshold) {
    return 'degradation';
  } else if (effectiveDiffPercent < -thresholds.warningThreshold) {
    return 'warning';
  } else if (effectiveDiffPercent > thresholds.improvementThreshold) {
    return 'improvement';
  } else {
    return 'stable';
  }
};

/**
 * Helper to create comparison result.
 * Calculates percentage difference and normalizes based on metric type.
 */
export const createResult = (
  metric: string,
  baselineValue: number,
  currentValue: number,
  lowerIsBetter: boolean,
  thresholds: ComparisonThresholds
): ComparisonResult => {
  const diff = currentValue - baselineValue;

  // Calculate percentage difference
  // Handle edge case: when baseline is 0, use a sentinel value to indicate change
  let diffPercent: number;
  if (baselineValue === 0) {
    if (currentValue === 0) {
      diffPercent = 0; // No change
    } else {
      // Significant change from zero baseline - use 100% as sentinel
      // The effectiveDiffPercent will handle the direction based on lowerIsBetter
      diffPercent = 100;
    }
  } else {
    diffPercent = (diff / baselineValue) * 100;
  }

  // Normalize the difference percentage based on metric type
  // For "lower is better" metrics (latency, errors):
  //   - Flip sign so negative = worse, positive = better
  // For "higher is better" metrics (throughput, efficiency):
  //   - Keep sign as-is so positive = better, negative = worse
  const effectiveDiffPercent = lowerIsBetter ? -diffPercent : diffPercent;

  // Determine status using normalized percentage
  // Since effectiveDiffPercent is normalized, we can use the same logic for both cases
  const status = determineStatus(effectiveDiffPercent, thresholds);

  return {
    metric,
    baseline: baselineValue,
    current: currentValue,
    diff,
    diffPercent: effectiveDiffPercent,
    status,
  };
};

/**
 * Helper to create informational result (values only, no status comparison)
 * Used for volatile metrics like p99 and max where status labels are less meaningful
 */
export const createInfoResult = (
  metric: string,
  baselineValue: number,
  currentValue: number
): ComparisonResult => {
  const diff = currentValue - baselineValue;
  const diffPercent = baselineValue !== 0 ? (diff / baselineValue) * 100 : 0;

  return {
    metric,
    baseline: baselineValue,
    current: currentValue,
    diff,
    diffPercent,
    status: 'info',
  };
};

/**
 * Convert bytes to megabytes
 */
export const bytesToMB = (bytes: number): number => {
  return bytes / (1024 * 1024);
};

