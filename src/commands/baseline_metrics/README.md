# Baseline Metrics Commands

## `create-baseline`

Extract metrics from logs and save a baseline file.

### Usage

```bash
yarn start create-baseline <log-prefix> [options]
```

### Options

- `-e <entityCount>`: Entity count
- `-l <logsPerEntity>`: Logs per entity
- `-u <uploadCount>`: Upload count (interval tests)
- `-i <intervalMs>`: Interval in milliseconds (interval tests)
- `-n <name>`: Custom baseline name

### Examples

```bash
yarn start create-baseline small-2025-11-13T15:03:32 -e 100000 -l 5
yarn start create-baseline small-2025-11-13T15:03:32 -e 100000 -l 5 -n "baseline-v1_0-standard"
```

## `list-baselines`

List all saved baseline files.

```bash
yarn start list-baselines
```

## `compare-metrics`

Compare current run metrics against a baseline.

### Usage

```bash
yarn start compare-metrics <current-log-prefix> [options]
```

### Options

- `-b <baseline>`: Baseline file path or name pattern
- `-e <entityCount>`: Entity count for current run
- `-l <logsPerEntity>`: Logs per entity for current run
- `-u <uploadCount>`: Upload count for current run
- `-i <intervalMs>`: Interval in milliseconds for current run
- `--degradation-threshold <percent>`: Default `20`
- `--warning-threshold <percent>`: Default `10`
- `--improvement-threshold <percent>`: Default `10`
