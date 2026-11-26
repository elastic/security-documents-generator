# AI Agent Data Command

## `generate-ai-agent-data` (`ai-agents`)

Writes Elastic Defend, osquery and (optionally) Claude Code OTel documents for Claude Code and Cursor CLI, as a fixed set of named scenarios. The shapes, field population and process trees are copied from one lab run, so the data behaves like real agents do, for Entity Store, detection rule and AI agent feature work.

The lab was a single Amazon Linux 2023 host with Elastic Defend 9.6.0 (eBPF, Endpoint package 9.6.1, Linux session data on), Claude Code 2.1.332 and `cursor-agent` 2026.11.22. All generated data is Linux and Amazon Linux shaped. macOS, Windows, Codex and Cursor desktop aren't generated, because there's no observed data for them.

### Usage

```bash
yarn start ai-agents [options]
yarn start generate-ai-agent-data [options]
```

| Flag                       | Default       | Meaning                                                                                                                                                                          |
| -------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--scenarios <list>`       | `all`         | Comma-separated scenario names                                                                                                                                                   |
| `--repeat <n>`             | `1`           | Copies of each scenario, each with its own synthetic users and hosts                                                                                                             |
| `--time-window <duration>` | `2h`          | Scenarios run back to back from this long before now. The command fails rather than write future timestamps                                                                      |
| `--claude-otel`            | off           | Also write Claude Code OTel events for every Claude session. Extrapolated                                                                                                        |
| `--map-session-id`         | off           | Map `process.ai_agent.session_id` as `keyword` through `endpoint@custom` before writing                                                                                          |
| `--no-session-data`        | on            | Leave out `entry_leader`, `session_leader`, `group_leader`, `interactive`, `tty` and `process.previous`, as Defend's default policy does                                         |
| `--no-install-packages`    | install       | Skip installing Endpoint, Osquery Manager and (with `--claude-otel`) Claude Code                                                                                                 |
| `--endpoint-version <v>`   | `9.6.1`       | Endpoint package version to install, or `latest`. 9.6.1 leaves `session_id` unmapped, as in the lab                                                                              |
| `--output-file <path>`     | none          | Write NDJSON, one `{"_index", "_source"}` per line, and don't contact any cluster                                                                                                |
| `--domain <domain>`        | `example.com` | Email domain for synthetic people                                                                                                                                                |
| `--space <space>`          | `default`     | Kibana space for package installs                                                                                                                                                |
| `--seed <n>`               | random        | For offline repeatability. Fixes IDs and names, not timestamps, so rerunning a seed into one cluster duplicates IDs. `--claude-otel` doesn't change the Endpoint data for a seed |

Install the packages (the default) on a fresh deployment. Without the Endpoint package's templates, `logs-endpoint.events.*` gets dynamic mappings and `session_id` would become searchable, which a real 9.6.1 cluster doesn't do.

`--output-file` still needs a valid config to start the CLI. Without a `config.json`, set the documented environment variables to any values, for example `ELASTIC_NODE=http://localhost:9200 KIBANA_NODE=http://localhost:5601 ELASTIC_USERNAME=x ELASTIC_PASSWORD=x KIBANA_USERNAME=x KIBANA_PASSWORD=x`.

### Scenarios

Every scenario has its own hosts and OS users. OS user names never equal the email's local part, because they didn't in the lab.

| Scenario                 | What it seeds                                                                                                                                                                          | Lab run |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `developer_claude`       | Interactive Claude over SSH with a TTY. Signs in mid-session, start-up IDE scan, plugin marketplace sync, a `find` and a `grep` (Claude re-execs as `bfs` and `ugrep`) and a Bash call | 0, 4    |
| `developer_cursor`       | `cursor-agent -p --trust` running a command: git probes, `rg`, sandbox preflight, `worker-server`, two shell state dumps, one fd-5 shell, `typescript-language-server` through `npx`   | 8       |
| `cursor_plugin_sync`     | Cursor read-only task that syncs a team plugin and `cursor/plugins` over `ssh` then `git-remote-https`. The language server writes its compile cache five minutes later                | 3       |
| `mcp_server`             | Claude print session with a stdio MCP server (`env node npx -y`, `sh -c`, `node`) and its first `npx` install. The prompt is in `process.args`                                         | 1       |
| `agent_commit`           | Claude edits a file twice (tmp file renamed over it), runs it, commits with the `Co-Authored-By` trailer                                                                               | 7       |
| `curl_and_secret_read`   | Claude runs `curl` (DNS and connection events) and reads `~/.ssh/config`, which leaves no event. osquery catches the running Claude                                                    | 2       |
| `unattended_cron`        | The same print prompt over scripted SSH, then from `crond`                                                                                                                             | 5       |
| `api_key_session`        | Print run with an inline dummy `ANTHROPIC_API_KEY`. Exits with code 1 in about 2 s, still stamped with the OAuth email                                                                 | 6       |
| `shared_email_two_users` | One work email signed in under `ec2-user` and a personal account (through `sudo -iu`) on one host                                                                                      | 0 to 4  |
| `shared_email_two_hosts` | One work email on two hosts. **Extrapolated**                                                                                                                                          | none    |

Lab runs: 0 interactive sign-in and session, 1 print session with an MCP server, 2 `curl` and `~/.ssh/config`, 3 `cursor-agent` read-only, 4 interactive session under a second OS user, 5 the same prompt over SSH and from cron, 6 dummy API key, 7 Claude edits and commits, 8 `cursor-agent` runs a command.

### Indices

| Index                                                                       | Pipeline                                                     |
| --------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `logs-endpoint.events.process-default`, `.file-default`, `.network-default` | Package default                                              |
| `logs-osquery_manager.result-default`                                       | Package default                                              |
| `logs-claude_code.events.otel-default` (with `--claude-otel`)               | `_none`, because documents are in the package's stored shape |

Documents also get the repo's `_metadata` field, as `org-data` does. Endpoint mappings are `dynamic: false`, so it stays in `_source`.

### Stamping rules

`stampAiAgent` in `src/generators/ai_agents/stamping.ts` is the only code that writes `process.ai_agent.*`. Every Endpoint document goes through it.

- `name` and `is_descendant` on every tagged event. Claude's `rg`, `ugrep` and `bfs` re-execs and Cursor's `worker-server` are the agent (`is_descendant: false`), even when a shell starts them.
- `email` only on the agent's own events, at or after the credential file write. Never on descendants.
- `session_id` only on Claude events, from about 0.45 s after exec in print mode and from just after the start-up scan in interactive mode. Never on Cursor.
- `api_key_auth` never appears, as in every lab event.

A run reported as one `fork,exec,end` event is stamped with the state at exit, so it carries the session ID. A separate `fork,exec` event never does.

`yarn test` checks these rules and the tree shapes over every scenario, and `yarn checks` runs it.

`process.previous` lists a process's earlier images, starting with its parent's, on every event after it has exec'd. Defend only sends it with session data, so `--no-session-data` leaves it out.

### Grounded and extrapolated

"Observed" means copied from the lab. "Scaled" means observed with a fixed count. Code is under `src/generators/ai_agents/`.

| Pattern                                                                                                                 | Code                                                | Status                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Claude exec of `~/.local/share/claude/versions/<v>` named after the version                                             | `claude_code.ts`                                    | Observed                                                                                                                               |
| Cursor as `node` behind the `cursor-agent` bash launcher, with the launcher images in `process.previous`                | `cursor.ts` `launch`                                | Observed                                                                                                                               |
| Interactive start-up: `rpm -qf`, IDE scan, `rg --version`, `rg --files`                                                 | `interactiveStartup`                                | Observed                                                                                                                               |
| Plugin marketplace sync                                                                                                 | `pluginMarketplaceSync`, `PLUGIN_MARKETPLACE_FILES` | Scaled (925)                                                                                                                           |
| Claude git probes before the task                                                                                       | `PRINT_GIT_PROBES`                                  | Observed                                                                                                                               |
| Bash preamble once per session, then a snapshot shell per call                                                          | `bashPreamble`, `bashStep`                          | Observed. Script argument truncated to its opening lines                                                                               |
| Login-shell process trees under the Bash preamble, Cursor's state dump and Cursor's command shell, nested as in the lab | `shell_trees.ts`, `emitShellTree`                   | Observed, copied with paths and versions as placeholders. Cursor's state dump without `nvm` is only the OS profile part (extrapolated) |
| MCP server tree and first `npx` install                                                                                 | `startMcpServer`, `NPX_INSTALL_FILES`               | Observed tree, scaled install (1,600)                                                                                                  |
| Edit as tmp file renamed over the target                                                                                | `editStep`                                          | Observed                                                                                                                               |
| Commit with trailer, `.git` lock files, `git maintenance`                                                               | `claudeCommands.gitCommit`                          | Observed                                                                                                                               |
| Claude's own state files (locks, sessions, `.claude.json`, transcript)                                                  | `localStateFiles`, `endFiles`                       | Observed                                                                                                                               |
| Agent DNS and TLS to vendor APIs                                                                                        | `network_destinations.ts`                           | Observed domains, documentation-range IPs, so no `geo` or `as` from the pipeline                                                       |
| A flow's close event stamped with the state from when it opened                                                         | `connection` `openedAt`                             | Observed values, mechanism inferred                                                                                                    |
| Session context for interactive, scripted SSH, cron                                                                     | `session_context.ts`                                | Observed                                                                                                                               |
| Cursor git probes, `rg`, sandbox preflight                                                                              | `cursor.ts`                                         | Observed                                                                                                                               |
| One fd-5 shell per shell step, a state dump at start and before each shell step                                         | `fd5Shell`, `shellStateDump`                        | Observed trees. Counts inferred, because every lab task also had team hooks                                                            |
| Cursor plugin sync, one temporary clone per plugin that the agent deletes                                               | `pluginSync`                                        | Observed, synthetic team repo, scaled file counts                                                                                      |
| Language server compile cache as tmp files renamed into place                                                           | `startLanguageServer`                               | Scaled (1,074 files)                                                                                                                   |
| osquery `ai_processes_linux`, `ai_config_files_linux`, `ai_config_file_changes_linux`                                   | `osquery.ts`                                        | Observed. `action_data.query` and `cloud.*` left out                                                                                   |
| Claude Code OTel events                                                                                                 | `claude_code_otel.ts`                               | Extrapolated from the Claude Code package's system-test sample and pipeline tests. No `host.name` or `host.id`                         |
| Cursor team-managed hooks, which run through fd-5 shells                                                                | none                                                | Not generated, because they're organisation-specific                                                                                   |

### Checking output offline

```bash
yarn start ai-agents --output-file /tmp/ai.ndjson --seed 1
# Email on descendants (expect 0)
jq -c 'select(._source.process.ai_agent.is_descendant and ._source.process.ai_agent.email)' /tmp/ai.ndjson | wc -l
# Field population by agent, event type and role
jq -r '._source | select(.process.ai_agent) | [.process.ai_agent.name, .event.dataset, .process.ai_agent.is_descendant, (.process.ai_agent.email != null), (.process.ai_agent.session_id != null)] | @tsv' /tmp/ai.ndjson | sort | uniq -c
```
