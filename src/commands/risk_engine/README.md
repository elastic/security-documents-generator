# Risk Engine Commands

## `risk-engine ingest`

Generate and ingest risk-engine alerts in batches.

### Usage

```bash
yarn start risk-engine ingest <entityCount> [options]
```

### Options

- `-n <n>`: Alerts per entity (default: `50`)
- `-b <b>`: Batch size in MB (default: `250`)
- `-i <i>`: Interval between batches in ms (default: `500`)
- `-s <space>`: Kibana space (created if missing)

## `esql-stress-test`

Run several ESQL queries in parallel to stress Elasticsearch.

```bash
yarn start esql-stress-test [-p <parallel>]
```

## `painless-stress-test`

Run scripted metric risk scoring queries in sequence.

```bash
yarn start painless-stress-test [-r <runs>]
```

## `create-risk-engine-data`

Create one risk engine performance data file.

```bash
yarn start create-risk-engine-data <name> <entity-count> <alerts-per-entity>
```

## `create-risk-engine-dataset`

Create a named risk engine dataset from preset sizes.

```bash
yarn start create-risk-engine-dataset <entity-magnitude> <cardinality>
```

## `upload-risk-engine-dataset`

Upload all JSON files in a risk engine dataset directory.

```bash
yarn start upload-risk-engine-dataset <dir>
```

## `upload-risk-engine-data-interval`

Upload one risk engine data file repeatedly at a fixed interval.

```bash
yarn start upload-risk-engine-data-interval <file> <interval-ms> <count>
```
