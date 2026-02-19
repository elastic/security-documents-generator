# Documents Commands

## `generate-alerts`

Generate synthetic detection alerts.

### Usage

```bash
yarn start generate-alerts -n <alerts> -h <hosts> -u <users> -s <space>
```

### Options

- `-n <n>`: Number of alerts (default: `1`)
- `-h <h>`: Number of hosts (default: `1`)
- `-u <u>`: Number of users (default: `1`)
- `-s <space>`: Kibana space (created if it does not exist)

## `generate-events`

Generate synthetic events into the configured event index.

### Usage

```bash
yarn start generate-events <count>
```

### Arguments

- `<count>`: Number of events to generate

## `generate-graph`

Generate fake graph data.

### Usage

```bash
yarn start generate-graph
```

## `delete-alerts`

Delete all alerts created by generator workflows.

### Usage

```bash
yarn start delete-alerts
```

## `delete-events`

Delete all events from the configured event index.

### Usage

```bash
yarn start delete-events
```
