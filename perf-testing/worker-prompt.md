# Entity Analytics Perf Testing Worker Prompt (Template)

Use this as a template. The orchestrator must fill all placeholders before dispatch.

---

## Worker context

- Scenario: `<SCENARIO_LABEL>`
- Deployment: `<DEPLOYMENT_NAME>`
- Env file: `<ENV_PATH>`
- Users: `<USER_COUNT>`
- Hosts: `<HOST_COUNT>`
- Total entities: `<ENTITY_COUNT>`
- Alerts per entity: `<ALERTS_PER_ENTITY>`
- Approx total alerts: `<TOTAL_ALERTS>`
- pageSize target: `<PAGE_SIZE>`
- Results root: `<RESULTS_DIR>`

## Guardrails

- Entity Store V2 only.
- Do not modify source code.
- Do not call V1 endpoints:
  - `/api/entity_store/enable`
  - `/internal/entity_store/enable`
- If a step fails, capture output and continue only when explicitly safe.

---

## Step 1: Setup

```bash
cd ~/dev/security-documents-generator
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use

source <ENV_PATH>
mkdir -p "<RESULTS_DIR>"
```

Verify ES and Kibana reachability:

```bash
curl -s -o /dev/null -w "ES: HTTP %{http_code}\n" "$ELASTIC_NODE/_cluster/health" -u "$ELASTIC_USERNAME:$ELASTIC_PASSWORD"
curl -s -o /dev/null -w "Kibana: HTTP %{http_code}\n" "$KIBANA_NODE/api/status" -u "$KIBANA_USERNAME:$KIBANA_PASSWORD"
```

## Step 2: Preflight

```bash
yarn start ea-perf preflight --env-path <ENV_PATH> --fix 2>&1 | tee "<RESULTS_DIR>/preflight.txt"
```

## Step 3: Generate and upload scenario data

```bash
yarn start risk-engine create-perf-scenario <SCENARIO_NAME> \
  --user-count <USER_COUNT> \
  --host-count <HOST_COUNT> \
  --alerts-per-entity <ALERTS_PER_ENTITY> \
  --prefix <SCENARIO_PREFIX>

yarn start risk-engine upload-perf-scenario <SCENARIO_NAME> --replace-entities \
  2>&1 | tee "<RESULTS_DIR>/upload.txt"

yarn start ea-perf entity-store validate-seed \
  --env-path <ENV_PATH> \
  --prefix <SCENARIO_PREFIX> \
  --expected-count <ENTITY_COUNT> \
  2>&1 | tee "<RESULTS_DIR>/entity_validation.txt"
```

## Step 4: Ensure pageSize

Read SO:

```bash
SO_RESPONSE=$(curl -s "$KIBANA_NODE/api/saved_objects/_find?type=risk-engine-configuration&per_page=1" -u "$KIBANA_USERNAME:$KIBANA_PASSWORD")
SO_ID=$(echo "$SO_RESPONSE" | python3 -c "import json,sys; r=json.load(sys.stdin); print(r['saved_objects'][0]['id'] if r.get('saved_objects') else '')")
```

Set pageSize:

```bash
curl -s -X PUT \
  "$KIBANA_NODE/api/saved_objects/risk-engine-configuration/$SO_ID" \
  -H 'Content-Type: application/json' \
  -H 'kbn-xsrf: true' \
  -u "$KIBANA_USERNAME:$KIBANA_PASSWORD" \
  -d '{"attributes":{"pageSize":<PAGE_SIZE>}}' \
  | tee "<RESULTS_DIR>/config_update.json"
```

## Step 5: Identify log index

```bash
LOG_INDEX=$(curl -s "$ELASTIC_NODE/_cat/indices/.ds-elastic-cloud-logs-*?h=index&s=index:desc" \
  -u "$ELASTIC_USERNAME:$ELASTIC_PASSWORD" | head -1 | tr -d '[:space:]')
echo "LOG_INDEX=$LOG_INDEX" | tee "<RESULTS_DIR>/log_index.txt"
```

## Step 6: Warmup run

```bash
curl -s -X POST \
  "$KIBANA_NODE/internal/security/entity_store/entity_maintainers/run/risk-score?apiVersion=2" \
  -H 'kbn-xsrf: true' \
  -H 'x-elastic-internal-origin: kibana' \
  -H 'elastic-api-version: 2' \
  -H 'Content-Type: application/json' \
  -u "$KIBANA_USERNAME:$KIBANA_PASSWORD" \
  -d '{}'

yarn start extract-risk-scoring-metrics \
  --from-es \
  --env-path <ENV_PATH> \
  --log-index "$LOG_INDEX" \
  --wait-for-completion \
  --wait-timeout-ms 1800000 \
  --poll-interval-ms 10000 \
  2>&1 | tee "<RESULTS_DIR>/warmup.txt" || true
```

## Step 7: Measured scoring runs

Run `<RUN_COUNT>` measured cycles (usually 2). For each run:

1. capture ES pre stats
2. trigger scoring
3. extract metrics (or fallback timing if log shipping is unavailable)
4. capture ES post stats
5. capture monitoring window

Persist each run under:

```bash
<RESULTS_DIR>/run-<N>/
```

## Step 8: Functional verification (scoring)

- Verify final score count in `risk-score.risk-score-default`
- Sample scores to ensure non-empty meaningful fields
- Record result in `<RESULTS_DIR>/score_verification.txt`

## Step 9: Watchlist sync (if requested)

If watchlist testing is in scope for this scenario:

1. Create watchlist
2. Add index source (`.alerts-security.alerts-default`, `identifierField=user.name`)
3. Run 2 sync cycles
4. Record HTTP status + timing + entity counts
5. Verify entries in `.entity_analytics.watchlists.default`

Record under:

```bash
<RESULTS_DIR>/watchlist/
```

## Step 10: Lead generation + explore UI (if requested)

Lead gen:

```bash
yarn start ea-perf lead-generation trigger --env-path <ENV_PATH>
yarn start extract-lead-gen-metrics --from-es --env-path <ENV_PATH> --log-index "$LOG_INDEX" --wait-for-completion
```

Explore UI:

```bash
yarn start ea-perf ui measure-suite --env-path <ENV_PATH> --runs 3 --output-root "<RESULTS_DIR>/explore_flyout"
```

## Step 11: Handover

Write `<RESULTS_DIR>/handover.md` including:

1. Deployment details (id, size, stack version)
2. Scenario params (entities, alerts, pageSize)
3. Run durations (warmup + measured)
4. Scores written per run
5. Resource summary (ES heap/CPU, queue rejections, Kibana health if available)
6. Functional status (did scoring produce expected counts?)
7. Watchlist summary (if run)
8. Lead gen / Explore summary (if run)
9. Errors, caveats, and missing signals
10. Full artifact paths

---

## Required outputs checklist

- `<RESULTS_DIR>/preflight.txt`
- `<RESULTS_DIR>/upload.txt`
- `<RESULTS_DIR>/entity_validation.txt`
- `<RESULTS_DIR>/config_update.json`
- `<RESULTS_DIR>/log_index.txt`
- `<RESULTS_DIR>/warmup.txt`
- `<RESULTS_DIR>/run-1/...` and `<RESULTS_DIR>/run-2/...` (or configured run count)
- `<RESULTS_DIR>/score_verification.txt`
- `<RESULTS_DIR>/handover.md`
