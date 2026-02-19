# `risk-engine ingest`

Generate and ingest risk-engine alerts in batches.

## Usage

```bash
yarn start risk-engine ingest <entityCount> [options]
```

## Arguments

- `<entityCount>`: Number of entities

## Options

- `-n <n>`: Alerts per entity (default: `50`)
- `-b <b>`: Batch size in MB (default: `250`)
- `-i <i>`: Interval between batches in ms (default: `500`)
- `-s <space>`: Kibana space (created if missing)
