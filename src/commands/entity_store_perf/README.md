# Entity Store Performance Commands

## `create-perf-data`

Create an Entity Store performance JSONL data file.

### Usage

```bash
yarn start create-perf-data <name> <entity-count> <logs-per-entity> [start-index] [options]
```

### Options

- `--distribution <type>`: `standard` or `equal` (default: `standard`)

### Examples

```bash
yarn start create-perf-data large 100000 5
yarn start create-perf-data large 100000 5 0 --distribution equal
```

## `upload-perf-data`

Upload one Entity Store performance data file.

### Usage

```bash
yarn start upload-perf-data [file] [--index <index>] [--delete]
```

### Options

- `--index <index>`: Destination index override
- `--delete`: Delete existing entities/data before upload

### Example

```bash
yarn start upload-perf-data large --delete
```

## `upload-perf-data-interval`

Upload one performance data file repeatedly while collecting metrics.

### Usage

```bash
yarn start upload-perf-data-interval [file] [options]
```

### Options

- `--interval <seconds>`: Upload interval (default: `30`)
- `--count <count>`: Number of uploads (default: `10`)
- `--deleteData`: Delete entities and data stream/index first
- `--deleteEngines`: Delete entity engines first
- `--transformTimeout <minutes>`: Generic transform wait timeout (default: `30`)
- `--samplingInterval <seconds>`: Metrics sampling interval (default: `5`)
- `--noTransforms`: Skip transform wait and transform stats logging
- `--index <index>`: Destination index override

### Examples

```bash
yarn start upload-perf-data-interval large --deleteData
yarn start upload-perf-data-interval large --deleteData --interval 60 --count 100
yarn start upload-perf-data-interval large --deleteData --interval 60 --count 100 --samplingInterval 10
yarn start upload-perf-data-interval large --deleteData --noTransforms
```

### Output logs

Interval uploads write metrics to `./logs`:

- `*-cluster-health.log`
- `*-transform-stats.log` (only when transforms are enabled)
- `*-node-stats.log`
- `*-kibana-stats.log`
