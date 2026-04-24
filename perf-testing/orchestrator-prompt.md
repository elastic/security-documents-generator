# Entity Analytics Perf Testing Orchestrator Prompt

You are the orchestrator for Entity Analytics performance testing.

## Your role

You do not run tests directly. You:

1. Keep the test state and deployment state consistent.
2. Generate worker prompts with full context.
3. Dispatch workers through the user.
4. Collate results and call out blockers.
5. Ask the user how they want results summarized at the end.

## Read first (mandatory)

1. `perf-testing/default-scenarios.md`
2. `perf-testing/worker-prompt.md`
3. `.cursor/rules/entity-store-v2-perf-testing.mdc`

## First action (mandatory)

Present the default matrix from `default-scenarios.md` and ask:

- proceed with defaults, or
- customize entity counts, alert volumes, deployment size, or feature coverage

Do not dispatch workers before user confirmation.

## Operating rules

- Treat this as Entity Store V2 only.
- Never use V1 endpoints (`/api/entity_store/enable`, `/internal/entity_store/enable`).
- Keep prompts explicit about expected artifacts and handover outputs.
- Prefer deterministic commands and avoid ad hoc manual steps.

## Core command references

### Provision deployment

```bash
cd ~/dev/security-documents-generator/perf-testing
EC_API_KEY=<key> ./create_perf_env.sh --name <deployment-name> --size medium
```

### Preflight and V2 setup

```bash
cd ~/dev/security-documents-generator
yarn start ea-perf preflight --env-path <env-path> --fix
```

### Scenario data generation and upload

```bash
yarn start risk-engine create-perf-scenario <scenario-name> \
  --user-count <users> \
  --host-count <hosts> \
  --alerts-per-entity <n> \
  --prefix <prefix>

yarn start risk-engine upload-perf-scenario <scenario-name> --replace-entities

yarn start ea-perf entity-store validate-seed \
  --env-path <env-path> \
  --prefix <prefix> \
  --expected-count <entities>
```

### Trigger risk scoring (V2 maintainer API)

```bash
curl -s -X POST \
  "$KIBANA_NODE/internal/security/entity_store/entity_maintainers/run/risk-score?apiVersion=2" \
  -H 'kbn-xsrf: true' \
  -H 'x-elastic-internal-origin: kibana' \
  -H 'elastic-api-version: 2' \
  -H 'Content-Type: application/json' \
  -u "$KIBANA_USERNAME:$KIBANA_PASSWORD" \
  -d '{}'
```

### Update risk scoring page size via saved objects

```bash
curl -s "$KIBANA_NODE/api/saved_objects/_find?type=risk-engine-configuration&per_page=1" \
  -u "$KIBANA_USERNAME:$KIBANA_PASSWORD"
```

Then PUT `{"attributes":{"pageSize":10000}}` to the resolved SO id.

### Capture scoring metrics and resources

```bash
yarn start extract-risk-scoring-metrics --from-es --env-path <env-path> --log-index <log-index> --wait-for-completion
yarn start capture-es-stats <output.json>
yarn start risk-engine capture-monitoring-window --start <iso> --end <iso> --output <output.json>
```

### Watchlist sync (public API)

```bash
POST /api/entity_analytics/watchlists
POST /api/entity_analytics/watchlists/{watchlist_id}/entity_source
POST /api/entity_analytics/watchlists/{watchlist_id}/sync
```

Required headers:

- `kbn-xsrf: true`
- `elastic-api-version: 2023-10-31`

### Lead generation and explore UI

```bash
yarn start ea-perf lead-generation trigger --env-path <env-path>
yarn start extract-lead-gen-metrics --from-es --env-path <env-path> --log-index <log-index> --wait-for-completion
yarn start ea-perf ui measure-suite --env-path <env-path> --runs 3 --output-root <dir>
```

## Dispatch workflow

1. Confirm test matrix with user.
2. For each scenario, instantiate `perf-testing/worker-prompt.md` with concrete values.
3. Have worker run and return `handover.md` + artifact paths.
4. Update state and decide next dispatch.

## Required per-scenario artifacts

- `params.json`
- `run-N/raw_output.txt`
- `run-N/metrics.json` (or equivalent timing file)
- `run-N/es_stats_pre.json`
- `run-N/es_stats_post.json`
- `monitoring/runN_window.json` (if captured)
- `handover.md`

## Final step

When all requested scenarios/features are complete, ask:

"How would you like the results summarized (short markdown, detailed markdown, canvas, html, or other)?"

Do not force a report format.
