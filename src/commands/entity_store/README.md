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
- `--alert-risk-score-min <n>`: minimum `kibana.alert.risk_score` per alert, 0–100 (default `20`)
- `--alert-risk-score-max <n>`: maximum `kibana.alert.risk_score` per alert, 0–100 (default `100`)
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
- `--dangerous-clean`: clear alerts, entity docs, risk-score docs, and risk lookup docs in target space before run
- `--debug-resolution`: enable verbose resolution diagnostics (relationship sync/read traces)

### Follow-on actions

After the initial summary (TTY mode), you can choose:

- reset to zero (delete seeded alerts, rerun maintainer)
- post more alerts (same seeded entities, rerun maintainer)
- remove modifiers (clear watchlists and criticality, rerun maintainer)
- re-apply modifiers (new watchlists and criticality, rerun maintainer)
- refresh table (no data mutations; re-read latest risk/entity docs)
- run maintainer and refresh table (no data mutations beyond maintainer recalculation)
- graph summary (prints resolution groups, ownership edges, sampled resolution group sizes)
- explain resolution score for a single target (prints synthetic resolution key + contributors)
- link aliases / unlink entities in resolution groups
- mutate ownership links, clear all relationships, reapply default relationship topology

Each action prints a compact before/after comparison table with score, level, modifier, and relationship deltas.
The command also prints a dedicated **resolution scorecard** (with synthetic `resolution_key`) so parent-anchored resolution scores are visible and referenceable.

### Phase 2 sensible defaults

When phase2 is enabled (default) and no topology overrides are provided:

- resolution targets are generated with `resolution-group-rate=0.2`
- aliases are assigned with `avg-aliases-per-target=2`
- ownership links use `ownership-edge-rate=0.3` (only with `--propagation`)
- summary table page size defaults to `30` rows

## `seed-risk-score-history`

Populate `risk-score.risk-score-<space>` with two backdated batches to drive the **Risk Movers** and **Newly High/Critical** tiles on the EA home page. Reads entities already in the entity store and writes synthetic scoring runs at controllable timestamps.

### Usage

```bash
yarn start seed-risk-score-history [options]
```

### Options

- `--space <space>`: Kibana space ID (default `default`)
- `--count <n>`: max entities to use per entity type — user and host (default `10`)
- `--yesterday-hours <n>`: hours ago for the "yesterday" batch (default `36`)
- `--today-hours <n>`: hours ago for the "today" batch (default `2`)
- `--movers <n>`: entities guaranteed to have score delta ≥15 between batches (default `3`)
- `--newly-high <n>`: entities that move from Low/Medium → High/Critical between batches (default `2`)

### Scenario assignment

Entities are assigned scenarios in order:

| Scenario     | Yesterday score    | Today score           | Drives tile |
| ------------ | ------------------ | --------------------- | ----------- |
| `newly_high` | 21–58 (Low/Medium) | 65–98 (High/Critical) | Newly H/C   |
| `mover`      | 10–75              | yesterday + 15–50     | Risk Movers |
| `stable`     | 5–95               | yesterday ± 5         | —           |

### Example

```bash
# Requires entities to be in the store first (run risk-score-v2 if needed)
yarn start seed-risk-score-history --space default --count 10 --movers 4 --newly-high 3
```
