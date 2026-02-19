# `upload-perf-data-interval`

Upload one performance data file repeatedly while collecting metrics.

## Usage

```bash
yarn start upload-perf-data-interval [file] [options]
```

## Options

- `--interval <seconds>`: Upload interval (default: `30`)
- `--count <count>`: Number of uploads (default: `10`)
- `--deleteData`: Delete entities and data stream/index first
- `--deleteEngines`: Delete entity engines first
- `--transformTimeout <minutes>`: Generic transform wait timeout (default: `30`)
- `--samplingInterval <seconds>`: Metrics sampling interval (default: `5`)
- `--noTransforms`: Skip transform wait and transform stats logging
- `--index <index>`: Destination index override

## Examples

```bash
# Default interval and count
yarn start upload-perf-data-interval large --deleteData

# Custom interval/count
yarn start upload-perf-data-interval large --deleteData --interval 60 --count 100

# Custom metrics sampling interval
yarn start upload-perf-data-interval large --deleteData --interval 60 --count 100 --samplingInterval 10

# Skip transform-related operations (ESQL workflows)
yarn start upload-perf-data-interval large --deleteData --noTransforms
```

## Output logs

During interval uploads, metrics logs are written to `./logs`:

- `*-cluster-health.log`
- `*-transform-stats.log` (only when transforms are enabled)
- `*-node-stats.log`
- `*-kibana-stats.log`

## Notes

- This workflow is intended for sustained load testing.
- Prefer cloud or freshly provisioned environments for stable comparisons.
