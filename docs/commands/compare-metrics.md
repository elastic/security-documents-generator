# `compare-metrics`

Compare current run metrics against a baseline.

## Usage

```bash
yarn start compare-metrics <current-log-prefix> [options]
```

## Options

- `-b <baseline>`: Baseline file path or name pattern
- `-e <entityCount>`: Entity count for current run
- `-l <logsPerEntity>`: Logs per entity for current run
- `-u <uploadCount>`: Upload count for current run
- `-i <intervalMs>`: Interval in milliseconds for current run
- `--degradation-threshold <percent>`: Default `20`
- `--warning-threshold <percent>`: Default `10`
- `--improvement-threshold <percent>`: Default `10`

## Examples

```bash
# Compare against latest matching baseline
yarn start compare-metrics standard-2025-11-27T07:51 -e 100000 -l 5

# Compare against specific baseline pattern
yarn start compare-metrics standard-2025-11-27T07:51 -b "baseline-v1_0" -e 100000 -l 5
```
