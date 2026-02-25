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

Detailed command documentation is colocated with command code under `src/commands`.

| Command | Summary | Details |
| --- | --- | --- |
| `generate-alerts` | Generate synthetic detection alerts | `src/commands/documents/README.md` |
| `generate-events` | Generate synthetic events in `eventIndex` | `src/commands/documents/README.md` |
| `generate-graph` | Generate fake graph data | `src/commands/documents/README.md` |
| `delete-alerts` | Delete all generated alerts | `src/commands/documents/README.md` |
| `delete-events` | Delete all generated events | `src/commands/documents/README.md` |
| `entity-resolution-demo` | Load entity resolution demo dataset | `src/commands/entity_store/README.md` |
| `entity-store` | Interactive Entity Store generation flow | `src/commands/entity_store/README.md` |
| `quick-entity-store` | Quick non-interactive Entity Store setup | `src/commands/entity_store/README.md` |
| `clean-entity-store` | Clean Entity Store data | `src/commands/entity_store/README.md` |
| `test-risk-score` | Run risk score API test call | `src/commands/misc/README.md` |
| `generate-entity-insights` | Generate entity vulnerabilities and misconfigurations | `src/commands/misc/README.md` |
| `generate-asset-criticality` | Generate asset criticality assignments | `src/commands/misc/README.md` |
| `generate-legacy-risk-score` | Install and generate legacy risk score data | `src/commands/misc/README.md` |
| `single-entity` | Create one entity with optional setup flows | `src/commands/misc/README.md` |
| `privileged-user-monitoring` | Interactive privileged user monitoring dataset generation | `src/commands/privileged_user_monitoring/README.md` |
| `privmon-quick` | Fast privileged user monitoring generation | `src/commands/privileged_user_monitoring/README.md` |
| `rules` | Generate detection rules and events | `src/commands/rules/README.md` |
| `delete-rules` | Delete detection rules | `src/commands/rules/README.md` |
| `risk-engine ingest` | Generate and ingest risk-engine data in batches | `src/commands/risk_engine/README.md` |
| `esql-stress-test` | Stress test ESQL queries | `src/commands/risk_engine/README.md` |
| `painless-stress-test` | Stress test scripted metric risk scoring | `src/commands/risk_engine/README.md` |
| `create-risk-engine-data` | Build risk engine perf data file | `src/commands/risk_engine/README.md` |
| `create-risk-engine-dataset` | Build named risk engine perf datasets | `src/commands/risk_engine/README.md` |
| `upload-risk-engine-dataset` | Upload all files from a perf dataset directory | `src/commands/risk_engine/README.md` |
| `upload-risk-engine-data-interval` | Repeatedly upload risk engine data file | `src/commands/risk_engine/README.md` |
| `create-perf-data` | Create Entity Store perf JSONL data file | `src/commands/entity_store_perf/README.md` |
| `upload-perf-data` | Upload perf data once | `src/commands/entity_store_perf/README.md` |
| `upload-perf-data-interval` | Upload perf data repeatedly at intervals | `src/commands/entity_store_perf/README.md` |
| `create-baseline` | Extract and save baseline metrics from logs | `src/commands/baseline_metrics/README.md` |
| `list-baselines` | List saved baseline metric files | `src/commands/baseline_metrics/README.md` |
| `compare-metrics` | Compare a run against baseline metrics | `src/commands/baseline_metrics/README.md` |
| `generate-cloud-security-posture` (`csp`) | Generate CSP findings across sources | `src/commands/generate_cloud_security_posture/README.md` |
| `organization` | Generate realistic organization security integration data | `src/commands/organization/` |
| `organization-quick` | Quick organization generation with defaults | `src/commands/organization/` |

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
- **Organization**
  - `organization`, `organization-quick`

## Cursor skills

### `/update-organization-integrations`

Updates existing integrations or creates new ones for the `organization` command, using real field
mappings and sample events from upstream Elastic repos as the source of truth. Recommended to use in
**Plan mode** so the agent proposes changes before applying them.

## Performance and baselines

Perf-data generation and baseline workflows are documented in command-specific pages:

- `src/commands/entity_store_perf/README.md`
- `src/commands/baseline_metrics/README.md`
