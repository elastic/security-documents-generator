import fs from 'fs';
import path from 'path';
import { BaselineMetrics } from './types';
import { BASELINES_DIR, readFileSafely } from './utils';

/**
 * Save baseline to file
 */
export const saveBaseline = (baseline: BaselineMetrics): string => {
  const filename = `${baseline.testName}-${baseline.timestamp.replace(/[:.]/g, '-')}.json`;
  const filepath = path.join(BASELINES_DIR, filename);

  fs.writeFileSync(filepath, JSON.stringify(baseline, null, 2));
  console.log(`Baseline saved to: ${filepath}`);

  return filepath;
};

/**
 * Load baseline from file
 */
export const loadBaseline = (baselinePath: string): BaselineMetrics => {
  const content = readFileSafely(baselinePath, 'Baseline file');
  try {
    return JSON.parse(content) as BaselineMetrics;
  } catch (error) {
    throw new Error(
      `Failed to parse baseline file ${baselinePath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

/**
 * List all available baselines
 */
export const listBaselines = (): string[] => {
  if (!fs.existsSync(BASELINES_DIR)) {
    return [];
  }

  return fs
    .readdirSync(BASELINES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.join(BASELINES_DIR, f))
    .sort()
    .reverse(); // Most recent first
};

/**
 * Find baseline file by pattern (supports prefix matching)
 * If multiple files match, returns the latest modified one
 */
export const findBaselineByPattern = (pattern: string): string | null => {
  if (!fs.existsSync(BASELINES_DIR)) {
    return null;
  }

  // Normalize pattern - remove .json extension if present, handle paths
  let searchPattern = pattern;
  if (searchPattern.endsWith('.json')) {
    searchPattern = searchPattern.slice(0, -5);
  }

  // Remove baselines/ prefix if present (for convenience)
  if (searchPattern.startsWith('baselines/')) {
    searchPattern = searchPattern.slice(10);
  }

  // Handle absolute paths
  if (path.isAbsolute(searchPattern)) {
    const baselinesDirName = path.basename(BASELINES_DIR);
    if (searchPattern.includes(baselinesDirName)) {
      searchPattern = path.basename(searchPattern, '.json');
    }
  }

  // Get all baseline files
  const allFiles = fs
    .readdirSync(BASELINES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.join(BASELINES_DIR, f));

  // Find files matching the pattern (starts with pattern)
  const matchingFiles = allFiles.filter((filepath) => {
    const filename = path.basename(filepath, '.json');
    return filename.startsWith(searchPattern);
  });

  if (matchingFiles.length === 0) {
    return null;
  }

  // If exact match exists, use it
  const exactMatch = matchingFiles.find((filepath) => {
    const filename = path.basename(filepath, '.json');
    return filename === searchPattern;
  });
  if (exactMatch) {
    return exactMatch;
  }

  // If multiple matches, return the latest modified file
  if (matchingFiles.length > 1) {
    const filesWithStats = matchingFiles.map((filepath) => ({
      filepath,
      mtime: fs.statSync(filepath).mtime.getTime(),
    }));
    filesWithStats.sort((a, b) => b.mtime - a.mtime); // Sort by modification time, newest first
    return filesWithStats[0].filepath;
  }

  return matchingFiles[0];
};

/**
 * Load baseline by pattern or path, with fallback to latest
 */
export const loadBaselineWithPattern = (
  baselinePattern?: string
): { baseline: BaselineMetrics; path: string } => {
  let baselinePath: string;
  let baseline: BaselineMetrics;

  if (baselinePattern) {
    // Try to find by pattern first
    const matchedPath = findBaselineByPattern(baselinePattern);
    if (!matchedPath) {
      // If pattern matching fails, try direct path
      if (fs.existsSync(baselinePattern)) {
        baselinePath = baselinePattern;
        baseline = loadBaseline(baselinePath);
        console.log(`Using baseline: ${baselinePath}`);
      } else {
        console.error(`❌ Baseline not found: ${baselinePattern}`);
        console.error(`   Tried pattern matching and direct path, but no matches found.`);
        process.exit(1);
      }
    } else {
      baselinePath = matchedPath;
      baseline = loadBaseline(baselinePath);
      console.log(`Using baseline: ${baselinePath} (matched pattern: ${baselinePattern})`);
    }
  } else {
    // Use latest baseline
    const baselines = listBaselines();
    if (baselines.length === 0) {
      console.error('❌ No baselines found. Create one first with create-baseline command.');
      process.exit(1);
    }
    baselinePath = baselines[0];
    baseline = loadBaseline(baselinePath);
    console.log(`Using latest baseline: ${baselinePath}`);
  }

  return { baseline, path: baselinePath };
};

