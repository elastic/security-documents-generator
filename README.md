# Security Documents Generator

Generate synthetic Security data for Elasticsearch and Kibana development, demos, and performance testing.

> Note: For Elasticsearch `8.18` and earlier, use tag `8.18-compatibility`.

## What this tool can generate

- Alerts and events
- Entity Store data (users, hosts, services, generic entities)
- Privileged User Monitoring datasets
- Detection rules and gap scenarios
- Risk engine datasets and ingest loads
- Cloud Security Posture (Elastic + third-party sources)
- Entity Store performance data + baseline comparison reports

## Requirements

- Node.js `24.13.1`
- Yarn `^1.22.22`
- Access to Elasticsearch and Kibana

## Install

```bash
yarn
```

## Configuration

On first run, the CLI creates `config.json` interactively if no valid config exists:

```bash
yarn start
```

You can authenticate with either:

- `username` + `password`
- `apiKey`

### Example `config.json` (API key)

```json
{
  "elastic": {
    "node": "https://example.es.us-west2.gcp.elastic-cloud.com",
    "apiKey": "your-elastic-api-key"
  },
  "kibana": {
    "node": "https://example.kb.us-west2.gcp.elastic-cloud.com:9243",
    "apiKey": "your-kibana-api-key"
  },
  "serverless": false,
  "eventIndex": "logs-testlogs-default"
}
```

### Example `config.json` (basic auth)

```json
{
  "elastic": {
    "node": "http://localhost:9200",
    "username": "elastic",
    "password": "changeme"
  },
  "kibana": {
    "node": "http://localhost:5601",
    "username": "elastic",
    "password": "changeme"
  },
  "serverless": false,
  "eventIndex": "logs-testlogs-default"
}
```

### Environment variable overrides

Environment variables override `config.json` values:

- `ELASTIC_NODE`, `ELASTIC_USERNAME`, `ELASTIC_PASSWORD`, `ELASTIC_API_KEY`
- `KIBANA_NODE`, `KIBANA_USERNAME`, `KIBANA_PASSWORD`, `KIBANA_API_KEY`
- `SERVERLESS`
- `EVENT_INDEX`
- `EVENT_DATE_OFFSET_HOURS`

## CLI help

```bash
yarn start help
```

## Quick start recipes

### Alerts + risk score API timing

```bash
yarn start delete-alerts
yarn start generate-alerts -n 10000 -h 100 -u 100
yarn start test-risk-score
```

### Entity Store (interactive)

```bash
yarn start entity-store
```

### Privileged User Monitoring (quick)

```bash
yarn start privmon-quick --space default
```

### Cloud Security Posture demo data

```bash
yarn start csp --data-sources all --findings-count 50
```

## Commands

Detailed command documentation lives in `docs/commands` with one file per command.

- Full command index (table + links): `docs/commands/README.md`
- Pattern: `docs/commands/<command-name>.md`

### Quick command list

- **Documents**
  - `generate-alerts`, `generate-events`, `generate-graph`, `delete-alerts`, `delete-events`
- **Entity Store**
  - `entity-resolution-demo`, `entity-store`, `quick-entity-store`, `clean-entity-store`
- **Risk and Security utilities**
  - `test-risk-score`, `generate-entity-insights`, `generate-asset-criticality`, `generate-legacy-risk-score`, `single-entity`
- **Privileged User Monitoring**
  - `privileged-user-monitoring` (`privmon`), `privmon-quick` (`quickmon`)
- **Rules**
  - `rules`, `delete-rules`
- **Risk engine**
  - `risk-engine ingest`, `esql-stress-test`, `painless-stress-test`, `create-risk-engine-data`, `create-risk-engine-dataset`, `upload-risk-engine-dataset`, `upload-risk-engine-data-interval`
- **Entity Store performance**
  - `create-perf-data`, `upload-perf-data`, `upload-perf-data-interval`
- **Baselines and metrics**
  - `create-baseline`, `list-baselines`, `compare-metrics`
- **Cloud Security Posture**
  - `generate-cloud-security-posture` (`csp`)

## Performance and baselines

Perf-data generation and baseline workflows are documented in command-specific pages:

- `docs/commands/create-perf-data.md`
- `docs/commands/upload-perf-data.md`
- `docs/commands/upload-perf-data-interval.md`
- `docs/commands/create-baseline.md`
- `docs/commands/list-baselines.md`
- `docs/commands/compare-metrics.md`
