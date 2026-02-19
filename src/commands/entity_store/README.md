# Entity Store Commands

## `entity-resolution-demo`

Load sample data for entity resolution demos.

### Usage

```bash
yarn start entity-resolution-demo [options]
```

### Options

- `--mini`: Load a smaller dataset
- `--delete`: Delete old data before loading
- `--keep-emails`: Keep email variants disabled
- `--space <space>`: Kibana space (default: `default`)

## `entity-store`

Interactive Entity Store generation flow.

### Usage

```bash
yarn start entity-store [--space <space>]
```

### Prompts

- Generation options (seed, criticality, risk engine, rule, agents, API enrichment)
- Entity counts (users, hosts, services, generic entities)
- Event offset hours
- Seed value (optional)

## `quick-entity-store`

Create a default Entity Store dataset without interactive prompts.

### Usage

```bash
yarn start quick-entity-store [--space <space>]
```

### Defaults

- 10 users, 10 hosts, 10 services, 10 generic entities
- Includes asset criticality, risk engine, and rule setup

## `clean-entity-store`

Clean Entity Store data and related generated artifacts.

### Usage

```bash
yarn start clean-entity-store
```
