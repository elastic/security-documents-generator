# `single-entity`

Create one entity with optional supporting setup flows.

## Usage

```bash
yarn start single-entity [options]
```

## Options

- `-s, --space <space>`: Kibana space (default: `default`)
- `-t, --type <type>`: `user | host | service | generic`
- `-n, --name <name>`: Entity name
- `--no-entity-store`: Skip Entity Store and security data view setup
- `--no-risk-score`: Skip risk score setup
