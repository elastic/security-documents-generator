# Command Documentation

This directory contains one README-style document per CLI command.

| Command | Summary | Details |
| --- | --- | --- |
| `generate-alerts` | Generate synthetic detection alerts | `docs/commands/generate-alerts.md` |
| `generate-events` | Generate synthetic events in `eventIndex` | `docs/commands/generate-events.md` |
| `generate-graph` | Generate fake graph data | `docs/commands/generate-graph.md` |
| `delete-alerts` | Delete all generated alerts | `docs/commands/delete-alerts.md` |
| `delete-events` | Delete all generated events | `docs/commands/delete-events.md` |
| `entity-resolution-demo` | Load entity resolution demo dataset | `docs/commands/entity-resolution-demo.md` |
| `entity-store` | Interactive Entity Store generation flow | `docs/commands/entity-store.md` |
| `quick-entity-store` | Quick non-interactive Entity Store setup | `docs/commands/quick-entity-store.md` |
| `clean-entity-store` | Clean Entity Store data | `docs/commands/clean-entity-store.md` |
| `test-risk-score` | Run risk score API test call | `docs/commands/test-risk-score.md` |
| `generate-entity-insights` | Generate entity vulnerabilities and misconfigurations | `docs/commands/generate-entity-insights.md` |
| `generate-asset-criticality` | Generate asset criticality assignments | `docs/commands/generate-asset-criticality.md` |
| `generate-legacy-risk-score` | Install and generate legacy risk score data | `docs/commands/generate-legacy-risk-score.md` |
| `single-entity` | Create one entity with optional setup flows | `docs/commands/single-entity.md` |
| `privileged-user-monitoring` | Interactive privileged user monitoring dataset generation | `docs/commands/privileged-user-monitoring.md` |
| `privmon-quick` | Fast privileged user monitoring generation | `docs/commands/privmon-quick.md` |
| `rules` | Generate detection rules and events | `docs/commands/rules.md` |
| `delete-rules` | Delete detection rules | `docs/commands/delete-rules.md` |
| `risk-engine ingest` | Generate and ingest risk-engine data in batches | `docs/commands/risk-engine-ingest.md` |
| `esql-stress-test` | Stress test ESQL queries | `docs/commands/esql-stress-test.md` |
| `painless-stress-test` | Stress test scripted metric risk scoring | `docs/commands/painless-stress-test.md` |
| `create-risk-engine-data` | Build risk engine perf data file | `docs/commands/create-risk-engine-data.md` |
| `create-risk-engine-dataset` | Build named risk engine perf datasets | `docs/commands/create-risk-engine-dataset.md` |
| `upload-risk-engine-dataset` | Upload all files from a perf dataset directory | `docs/commands/upload-risk-engine-dataset.md` |
| `upload-risk-engine-data-interval` | Repeatedly upload risk engine data file | `docs/commands/upload-risk-engine-data-interval.md` |
| `create-perf-data` | Create Entity Store perf JSONL data file | `docs/commands/create-perf-data.md` |
| `upload-perf-data` | Upload perf data once | `docs/commands/upload-perf-data.md` |
| `upload-perf-data-interval` | Upload perf data repeatedly at intervals | `docs/commands/upload-perf-data-interval.md` |
| `create-baseline` | Extract and save baseline metrics from logs | `docs/commands/create-baseline.md` |
| `list-baselines` | List saved baseline metric files | `docs/commands/list-baselines.md` |
| `compare-metrics` | Compare a run against baseline metrics | `docs/commands/compare-metrics.md` |
| `generate-cloud-security-posture` (`csp`) | Generate CSP findings across sources | `docs/commands/generate-cloud-security-posture.md` |

## Notes

- All commands are run via `yarn start <command> ...`.
- For global setup and authentication details, see the repository root `README.md`.
