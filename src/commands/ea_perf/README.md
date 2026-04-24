# `ea-perf`

Entity Analytics performance orchestration utilities.

This command group is the repo-owned home for reusable performance-testing mechanism that spans multiple Entity Analytics features. It does **not** replace lower-level domain commands such as:

- `risk-engine ...`
- `watchlist ...`
- `create-perf-data`
- `upload-perf-data`

Instead, `ea-perf` acts as the orchestration layer over those building blocks.

## What lives here

The repo currently owns:

- run directory bookkeeping
- UI benchmark execution for Explore/Flyout scenarios
- UI result summarization
- a stable command surface for local and staging perf runs

The local folder still owns:

- results trees
- AI prompts and planning docs
- ad hoc run handoffs
- `.env.*` files

That split is deliberate: code and repeatable mechanics live here; outputs and coordination remain local.

## Reproducible handover bundle

For a minimal orchestrator/worker handover package (prompts, default scenarios, env template, and deployment script), see:

- `perf-testing/README.md`

## Current command surface

### `ea-perf run record`

Creates the next sequential `run-N` directory and writes `params.json`.

### `ea-perf ui measure-explore`

Runs the Playwright-based Explore/Flyout benchmark and writes a raw JSON result file.

### `ea-perf ui record-explore-results`

Appends summary statistics to a raw benchmark JSON file and writes a canonical `metrics.json`.

## Prerequisites

### Node / Yarn

This repo expects:

- Node `24.14.1`
- Yarn `1.22.x`

Before running any commands:

```bash
cd ~/dev/security-documents-generator
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use
```

### Dependencies

Install repo dependencies:

```bash
cd ~/dev/security-documents-generator
yarn install
```

### Playwright browser

For UI runs, install Chromium once:

```bash
cd ~/dev/security-documents-generator
npx playwright install chromium
```

### Local env file

The UI runner expects a local env file with Kibana credentials. Example:

```bash
KIBANA_NODE=http://localhost:5601/mark
KIBANA_USERNAME=elastic
KIBANA_PASSWORD=changeme
```

Current local convention:

- `~/Desktop/performance_testing/.env.localhost`

Important: the `ea-perf` CLI uses `--env-path`, not `--env-file`, to avoid colliding with Node runtime flags.

## Results root

By default, `ea-perf` writes run outputs under:

```bash
~/Desktop/performance_testing/results
```

Override with either:

- `EA_PERF_RESULTS_DIR`
- `PERF_RESULTS_DIR`
- `--results-root` on `ea-perf run record`

## Result contract

Every run directory is expected to contain:

- `params.json`
- `es_stats_pre.json`
- `es_stats_post.json`
- `metrics.json`
- `raw_logs.txt`
- `notes.md`

For UI-only runs, `metrics.json` contains summarized Playwright timings.

The detailed local convention still lives in:

- `~/Desktop/performance_testing/results/README.md`

## Commands

### 1. Create a run directory

Create the next sequential `run-N` directory and write `params.json`:

```bash
yarn start ea-perf run record explore_flyout flyout-comparison \
  --env-path ~/Desktop/performance_testing/.env.localhost
```

Print only the created run directory:

```bash
yarn start ea-perf run record explore_flyout flyout-comparison \
  --print-run-dir-only
```

Typical shell pattern:

```bash
RUN_DIR="$(
  yarn --silent start ea-perf run record explore_flyout flyout-comparison \
    --env-path ~/Desktop/performance_testing/.env.localhost \
    --note "localhost flyout comparison" \
    --print-run-dir-only
)"
```

### 2. Run the Explore/Flyout benchmark

Run all scenarios:

```bash
yarn start ea-perf ui measure-explore \
  --env-path ~/Desktop/performance_testing/.env.localhost
```

Run a single scenario:

```bash
yarn start ea-perf ui measure-explore \
  --env-path ~/Desktop/performance_testing/.env.localhost \
  --scenario hosts-list \
  --runs 5
```

Run the flyout comparison:

```bash
yarn start ea-perf ui measure-explore \
  --env-path ~/Desktop/performance_testing/.env.localhost \
  --scenario flyout-comparison \
  --store-entity perf-store-host-1 \
  --observed-entity perf-observed-host-1 \
  --runs 3 \
  --output "$RUN_DIR"
```

Run headed for debugging:

```bash
yarn start ea-perf ui measure-explore \
  --env-path ~/Desktop/performance_testing/.env.localhost \
  --scenario flyout-comparison \
  --store-entity perf-store-host-1 \
  --observed-entity perf-observed-host-1 \
  --runs 1 \
  --output "$RUN_DIR" \
  --headed
```

Optional debug flag:

```bash
--capture-query-stats
```

This captures extra parsed metadata from entity-store and search requests and is useful for methodology validation, not just timings.

### 3. Summarize raw benchmark output into `metrics.json`

After `measure-explore`, identify the raw benchmark JSON file it wrote, then summarize it:

```bash
yarn start ea-perf ui record-explore-results \
  --input "$RUN_DIR/flyout-comparison_<timestamp>.json" \
  --output "$RUN_DIR/metrics.json"
```

This writes summary statistics into the output JSON and prints a markdown table to stdout.

## Localhost flyout comparison recipe

This is the current high-value localhost workflow for validating the UI benchmark mechanism.

### Goal

Compare:

- a store-backed host flyout
- an observed-only host flyout

### Current localhost evidence

There are three important localhost references:

- `run-2`: clean badge-valid baseline using manual entity injection
- `run-3`: successful no-manual-injection follow-up using deterministic `force_log_extraction`

`run-3` initially showed a badge mismatch (store host rendered as `Observed`) because the natural host events used a hashed `host.id` that differed from the `host.id` in scenario alerts. After aligning the identities (`generate-host-events` now defaults `host.id` to the entity name, matching scenario alert conventions), the methodology is **locally validated**.

### Current preferred methodology

When trying the less-brittle path, prefer:

- store-backed host enters naturally via recent events
- observed host stays out via old events outside the lookback window
- deterministic `force_log_extraction` is allowed
- no manual entity injection unless you are explicitly choosing the fallback method
- **host identity alignment**: `generate-host-events` must produce `host.id` values that match what scenario alerts use (this is now the default)

### Typical flow

1. Prepare data with SDG domain commands
   - `generate-host-events` (defaults `host.id` to entity name)
   - alert generation via existing risk-engine scenario tooling
   - entity store setup via Kibana APIs

2. Create a run directory:

```bash
RUN_DIR="$(
  yarn --silent start ea-perf run record explore_flyout flyout-comparison \
    --env-path ~/Desktop/performance_testing/.env.localhost \
    --note "localhost natural-extraction rerun" \
    --print-run-dir-only
)"
```

3. Run a headed smoke:

```bash
yarn start ea-perf ui measure-explore \
  --env-path ~/Desktop/performance_testing/.env.localhost \
  --scenario flyout-comparison \
  --store-entity perf-store-host-1 \
  --observed-entity perf-observed-host-1 \
  --runs 1 \
  --output "$RUN_DIR" \
  --headed
```

4. Run the official headless benchmark:

```bash
yarn start ea-perf ui measure-explore \
  --env-path ~/Desktop/performance_testing/.env.localhost \
  --scenario flyout-comparison \
  --store-entity perf-store-host-1 \
  --observed-entity perf-observed-host-1 \
  --runs 3 \
  --output "$RUN_DIR"
```

5. Summarize the official raw JSON into `metrics.json`:

```bash
yarn start ea-perf ui record-explore-results \
  --input "$OFFICIAL_BENCHMARK_JSON" \
  --output "$RUN_DIR/metrics.json"
```

6. Fill in the remaining run artifacts:

- `es_stats_pre.json`
- `es_stats_post.json`
- `raw_logs.txt`
- `notes.md`

### Important caution

If the store host appears in the entity index but still renders `Observed`, first check host identity alignment:

- the `host.id` in generated log events must match the `host.id` in scenario alerts
- `generate-host-events` defaults `host.id` to the entity name (matching scenario alerts)
- if you override `--host-id`, make sure it matches what the scenario alerts use

If identities are aligned and the badge still mismatches, investigate the flyout's EUID lookup path.

## Current scenario support

`ea-perf ui measure-explore` currently supports:

- `hosts-list`
- `host-detail`
- `flyout`
- `flyout-comparison`
- `all`

The benchmark implementation lives in:

- `src/ea_perf/ui/measure_explore_perf.ts`

## Relationship to existing SDG commands

Keep using feature-native commands for setup and data generation:

- `yarn start generate-host-events`
- `yarn start risk-engine create-perf-scenario ...`
- `yarn start risk-engine upload-perf-scenario ...`
- `yarn start capture-es-stats ...`
- `yarn start collect-results ...`
- `yarn start watchlist ...`

`ea-perf` is for orchestration and repeatable perf mechanics, not for replacing feature ownership.

## Current limitations

At the moment, `ea-perf` only covers:

- run bookkeeping
- Explore/Flyout Playwright benchmark execution
- UI result summarization

It does **not yet** replace:

- environment creation/destruction scripts
- backend scenario orchestration
- all result-file generation
- the local coordination markdown/process docs

Those can migrate later once this structure has broader staging and multi-feature coverage.

## Recommended first-run checklist

If someone is running this for the first time:

1. `nvm use`
2. `yarn install`
3. `npx playwright install chromium`
4. ensure `~/Desktop/performance_testing/.env.localhost` exists
5. ensure local Kibana and Elasticsearch are already running
6. create a run directory with `ea-perf run record`
7. run a headed smoke with `ea-perf ui measure-explore`
8. run the official benchmark headless
9. summarize raw JSON into `metrics.json`
10. complete `notes.md`, `raw_logs.txt`, and any missing run artifacts
