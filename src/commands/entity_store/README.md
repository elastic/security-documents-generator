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

## `risk-score-v2`

End-to-end Entity Store V2 risk scoring test flow with optional interactive follow-on actions.

### Usage

```bash
yarn start risk-score-v2 [options]
```

### Common options

- `--entity-kinds <kinds>`: `host,idp_user,local_user,service`
- `--users <n>`, `--hosts <n>`, `--local-users <n>`, `--services <n>`
- `--alerts-per-entity <n>`
- `--seed-source <source>`: `basic|org`
- `--perf`: high-volume preset
- `--no-setup`, `--no-criticality`, `--no-watchlists`, `--no-alerts`
- `--follow-on` / `--no-follow-on`: enable or skip interactive post-run action menu
- phase2 relationships are enabled by default
- `--no-phase2`: disable relationship + entity-resolution flows throughout the command
- `--no-resolution`: disable resolution linking when `--phase2` is enabled
- propagation ownership links are enabled by default when phase2 is on
- `--no-propagation`: disable ownership relationship writes when `--phase2` is enabled
- `--resolution-group-rate <n>`: default `0.2`
- `--avg-aliases-per-target <n>`: default `2`
- `--ownership-edge-rate <n>`: default `0.3`
- `--table-page-size <n>`: rows per page in summary tables

### Follow-on actions

After the initial summary (TTY mode), you can choose:

- reset to zero (delete seeded alerts, rerun maintainer)
- post more alerts (same seeded entities, rerun maintainer)
- remove modifiers (clear watchlists and criticality, rerun maintainer)
- re-apply modifiers (new watchlists and criticality, rerun maintainer)
- refresh table (no data mutations; re-read latest risk/entity docs)
- run maintainer and refresh table (no data mutations beyond maintainer recalculation)
- graph summary (prints resolution groups, ownership edges, sampled resolution group sizes)
- link aliases / unlink entities in resolution groups
- mutate ownership links, clear all relationships, reapply default relationship topology

Each action prints a compact before/after comparison table with score, level, modifier, and relationship deltas.

### Phase 2 sensible defaults

When phase2 is enabled (default) and no topology overrides are provided:

- resolution targets are generated with `resolution-group-rate=0.2`
- aliases are assigned with `avg-aliases-per-target=2`
- ownership links use `ownership-edge-rate=0.3` (only with `--propagation`)
- summary table page size defaults to `30` rows
