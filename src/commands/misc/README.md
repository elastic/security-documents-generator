# Misc Commands

## `test-risk-score`

Run the risk score API timing/response test.

```bash
yarn start test-risk-score
```

## `generate-entity-ai-insights`

Generate vulnerabilities, misconfigurations and anomalous behavior for entities.

```bash
yarn start generate-entity-ai-insights
```

## `generate-asset-criticality`

Generate asset criticality assignments.

```bash
yarn start generate-asset-criticality -h <hosts> -u <users> -s <space>
```

## `generate-legacy-risk-score`

Install and generate legacy risk score data.

```bash
yarn start generate-legacy-risk-score
```

## `single-entity`

Create one entity with optional supporting setup flows.

```bash
yarn start single-entity [options]
```

Options:

- `-s, --space <space>`: Kibana space (default: `default`)
- `-t, --type <type>`: `user | host | service | generic`
- `-n, --name <name>`: Entity name
- `--no-entity-store`: Skip Entity Store and security data view setup
- `--no-risk-score`: Skip risk score setup
