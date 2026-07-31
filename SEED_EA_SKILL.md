# `/seed-ea` — Claude Code Skill

A [Claude Code](https://claude.ai/code) skill that helps you populate every Entity Analytics page in Kibana using `security-documents-generator` commands.

Instead of remembering which command covers which page, you describe what you want and the skill gives you the exact `yarn start` command to run — or runs it for you.

---

## Requirements

- [Claude Code](https://claude.ai/code) installed — this skill uses the `.claude/commands/` format and is **Claude Code only**. It will not work in Cursor or other AI editors.
- This repo cloned locally and opened in Claude Code (the skill is auto-discovered from `.claude/commands/seed-ea.md`)
- A running Kibana instance with a valid `config.json` in the repo root ([see setup](README.md#configuration))
- The correct Node version active — run `nvm use` from the repo root before invoking the skill. The repo includes an `.nvmrc` that pins the required version, so this avoids version mismatch errors at runtime.

---

## Usage

Type `/seed-ea` followed by what you want to populate. Claude Code will respond with the exact command(s) to run.

### Examples

```
/seed-ea populate all EA pages end-to-end
```

```
/seed-ea I want to populate the privileged user monitoring page
```

```
/seed-ea seed host and user flyouts in a non-default space called my-space
```

```
/seed-ea what command do I need for the AI summary panel?
```

```
/seed-ea give me a quick host-only seed, entity store is already set up
```

```
/seed-ea seed into my BC environment
```

> **Targeting a specific cluster:** the generator reads connection details from `config.json` in the repo root. If you want to seed a different environment, update `config.json` to point at the right cluster before running — or keep separate config files (e.g. `config.bc.json`) and swap them in as needed.

---

## What it covers

| Page                                                     | Commands used                                                           |
| -------------------------------------------------------- | ----------------------------------------------------------------------- |
| Home page (entities table, risk KPI/history, watchlists) | `risk-score-v2`                                                         |
| Entity store management                                  | `risk-score-v2`                                                         |
| Asset criticality                                        | `risk-score-v2` or `generate-asset-criticality`                         |
| Privileged user monitoring                               | `privmon-quick`                                                         |
| Threat hunting leads                                     | `leads`                                                                 |
| AI summary / anomalies                                   | `generate-entity-ai-insights --v2`                                      |
| Entity flyouts — host/user/service                       | `generate-entity-maintainers-data` + `generate-entity-ai-insights --v2` |
| Entity flyout — generic                                  | `quick-entity-store`                                                    |
| Explore pages (hosts/users/network)                      | `risk-score-v2` alerts + `generate-alerts`                              |
| CSP / cloud posture                                      | `csp --data-sources elastic_all`                                        |

### Known gaps

- **Generic flyout**: `risk-score-v2` doesn't seed generic entities — the skill will direct you to `quick-entity-store` instead
- **Threat hunting leads**: requires an inference connector configured in Kibana before the `leads` command can generate anything
- **Anomalies panel**: `generate-entity-ai-insights` seeds anomaly records for the UI but does not run real ML jobs

---

## Full end-to-end sequence

If you ask to populate everything, the skill recommends these commands in order:

```bash
# 1. Core — entity store, risk engine, criticality, watchlists
yarn start risk-score-v2 --entity-kinds host,idp_user,local_user,service \
  --hosts 20 --users 20 --services 10 --alerts-per-entity 10

# 2. Risk history, relationships, anomaly behaviours (flyouts + home history panel)
yarn start generate-entity-maintainers-data --space default --quick

# 3. Privileged user monitoring
yarn start privmon-quick --space default

# 4. AI insights + anomaly records (ai_summary, entity flyout panels)
yarn start generate-entity-ai-insights --v2 --correlate-with-entity-store \
  -h 20 -u 20 -s default

# 5. Threat hunting leads (inference connector required)
yarn start leads --space default
# → choose "Generate leads now"

# 6. Generic entities (for the generic entity flyout)
yarn start quick-entity-store --space default
```

---

## How it works

The skill is defined in `.claude/commands/seed-ea.md`. When Claude Code opens this repo, it auto-discovers the file and registers `/seed-ea` as an available slash command. The skill instructs Claude to map your request to the right generator command, explain what it populates, and optionally execute it for you from the repo root.

No additional setup is needed beyond having Claude Code installed and the repo open.
