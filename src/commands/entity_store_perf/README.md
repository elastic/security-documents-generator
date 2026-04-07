# Entity Store Performance Commands

## `create-perf-data`

Create an Entity Store performance JSONL data file.

### Usage

```bash
yarn start create-perf-data <name> <entity-count> <logs-per-entity> [start-index] [options]
```

### Options

- `--distribution <type>` (default: `standard`):
  - `equal`: 25% user, 25% host, 25% generic, 25% service (via ratios; service gets any remainder from rounding).
  - `standard`: 33% user, 33% host, 33% generic, 1% service (same remainder behavior for service).
  - `absolute`: exact counts per type; you **must** pass all four count flags below, and they **must sum** to `<entity-count>`.
- `--user-count <n>`: With `absolute` only — number of user entities.
- `--host-count <n>`: With `absolute` only — number of host entities.
- `--service-count <n>`: With `absolute` only — number of service entities.
- `--generic-count <n>`: With `absolute` only — number of generic entities.

With `equal` or `standard`, do not pass the `--*-count` flags (the command will error). With `absolute`, all four counts are required.

In generated perf data, the top-level `entity` field is emitted only for generic entities.

### Examples

```bash
yarn start create-perf-data large 100000 5
yarn start create-perf-data large 100000 5 0 --distribution equal
yarn start create-perf-data custom-mix 82000 5 0 \
  --distribution absolute \
  --user-count 60000 --host-count 2000 --service-count 17000 --generic-count 3000
```

## `upload-perf-data`

Upload one Entity Store performance data file.

### Usage

```bash
yarn start upload-perf-data [file] [--index <index>] [--delete] [options]
```

### Options

- `--index <index>`: Destination index override
- `--delete`: Delete existing entities/data before upload
- `--metrics`: Generate metrics logs under `./logs` for baseline comparison (same format/prefix style as interval mode)
- `--samplingInterval <seconds>`: Metrics sampling interval when `--metrics` is enabled (default: `5`)
- `--transformTimeout <minutes>`: Generic transform wait timeout in metrics mode for V1 flow (default: `30`)
- `--noTransforms`: Run Entity Store V2 / ESQL flow (enable V2, install V2, no transforms, v2 indices)

When `--metrics` is enabled, log files can be used with `create-baseline`/`compare-metrics` by passing the emitted prefix. In V2 mode (`--noTransforms`), transform stats are skipped.

### Example

```bash
yarn start upload-perf-data large --delete
yarn start upload-perf-data large --delete --noTransforms
yarn start upload-perf-data large --delete --metrics --samplingInterval 5
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
- `--noTransforms`: Run Entity Store V2 / ESQL flow (enable V2, install V2, no transforms, v2 indices). When set, the tool enables and installs Entity Store V2 via Kibana APIs and uses `.entities.v2.latest*` for entity delete/count; the default (no flag) runs the V1/transform flow.
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
