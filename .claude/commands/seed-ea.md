---
name: seed-ea
description: Populate Entity Analytics pages using security-documents-generator. Helps pick the right commands for the EA pages or data you want to seed.
---

# Seed EA Data

Use `security-documents-generator` to populate Entity Analytics pages for development or testing.

Run commands from the repo root with: `yarn start <command>`

Before running any command, ensure the correct Node version is active. The repo includes an `.nvmrc` pinned to the required version — if you have nvm installed, run `nvm use` from the repo root first to avoid version mismatch errors.

## Input

The user will either:
- Name a specific EA page or feature they want to populate (e.g. "home page", "flyouts", "PUM", "AI summary")
- Ask for a full end-to-end seed of all EA pages
- Provide flags or modifications (e.g. "more hosts", "non-default space", "skip setup")
- Ask what command to use for something specific
- Specify a target cluster (e.g. "seed into my BC environment" or "use the cloud deployment in config.bc.json")

If no input is given, ask what they want to populate. If a target cluster is mentioned, remind the user that the generator reads from `config.json` in the repo root — they should ensure that file points to the right cluster before running.

## Page → Command Mapping

Use this to recommend the right command(s):

| Page / Feature | Command(s) |
|---|---|
| Home page — entities table, risk KPI/history, watchlists | `risk-score-v2` |
| Entity store management page | `risk-score-v2` (sets up entity store) |
| Asset criticality | `risk-score-v2` (includes criticality) or `generate-asset-criticality` separately |
| Privileged user monitoring | `privmon-quick` or `privileged-user-monitoring` (interactive) |
| Threat hunting leads | `leads` (interactive, needs inference connector pre-configured) |
| AI summary / anomalies panel | `generate-entity-ai-insights --v2 --correlate-with-entity-store` |
| Entity flyouts — host/user/service right panels | `generate-entity-maintainers-data --quick` + `generate-entity-ai-insights --v2` |
| Entity flyout — generic right panel | `quick-entity-store` (includes generic; `risk-score-v2` does not) |
| Explore pages (hosts/users/network) | Covered by `risk-score-v2` alerts; top up with `generate-alerts` if empty |
| Risk score history snapshots | `generate-entity-maintainers-data --quick` |
| CSP / cloud posture findings | `csp --data-sources elastic_all --csp-scores` |
| All EA pages end-to-end | See full sequence below |

## Full End-to-End Sequence

When the user wants everything populated, recommend these in order:

```bash
# 1. Core: entity store, risk engine, criticality, watchlists
yarn start risk-score-v2 --entity-kinds host,idp_user,local_user,service --hosts 20 --users 20 --services 10 --alerts-per-entity 10

# 2. Risk history + relationships + anomaly behaviours (flyouts, home history panel)
yarn start generate-entity-maintainers-data --space default --quick

# 3. Privileged user monitoring
yarn start privmon-quick --space default

# 4. AI insights + anomaly records (ai_summary, flyout panels)
yarn start generate-entity-ai-insights --v2 --correlate-with-entity-store -h 20 -u 20 -s default

# 5. Threat hunting leads (requires inference connector pre-configured in Kibana)
yarn start leads --space default
# → choose "Generate leads now"

# 6. Generic entities (for generic flyout — not covered by risk-score-v2)
yarn start quick-entity-store --space default
```

## Key Flags

- `--no-setup` — skip entity store installation (use when already installed)
- `--space <id>` — target a non-default space
- `--dangerous-clean` — wipe existing data before seeding (use with care)
- `--perf` — scale preset: 1000 users, 1000 hosts, 50 alerts each
- `--hosts <n>` / `--users <n>` / `--services <n>` — control entity counts
- `--alerts-per-entity <n>` — controls how many alerts drive risk scoring

## Known Gaps

- **Generic flyout**: `risk-score-v2` doesn't seed generic entities — use `quick-entity-store` instead
- **Threat hunting leads**: requires an inference connector to be set up in Kibana first
- **Anomalies panel**: `generate-entity-ai-insights` seeds anomaly *records* but doesn't run actual ML jobs

## Output

Give the user the exact `yarn start` command(s) to run, with a note on what each one populates. If they want to run them, offer to do so using Bash from the repo root. Always confirm before running any command with `--dangerous-clean`.
