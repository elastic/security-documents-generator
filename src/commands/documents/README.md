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
- `--time-spread <duration>`: Spread alert `@timestamp` values randomly over this duration, ending
  now (e.g. `7d`, `12h`, `30m`). Without it every alert lands at the moment of generation, which
  collapses any alerts-over-time view into a single bucket.

Alerts cycle through a handful of rule names so `kibana.alert.rule.name` aggregates into more than
one bucket. Generator-created alerts remain identifiable by `kibana.alert.rule.description`.

### Example

```bash
# 500 alerts across 20 hosts and 20 users, spread over the last 14 days
yarn start generate-alerts -n 500 -h 20 -u 20 --time-spread 14d
```

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
