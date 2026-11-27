# AI Agent Data Command

## `generate-ai-agent-data` (`ai-agents`)

Writes Elastic Defend, osquery and (optionally) Claude Code OTel documents for Claude Code and Cursor CLI, as a fixed set of named scenarios. The shapes, field population and process trees are copied from one lab run, so the data behaves like real agents do, for Entity Store, detection rule and AI agent feature work.

The lab was a single Amazon Linux 2023 host with Elastic Defend 9.6.0 (eBPF, Endpoint package 9.6.1, Linux session data on), Claude Code 2.1.332 and `cursor-agent` 2026.11.22. The lab scenarios (`all`) are Linux and Amazon Linux shaped. The demo scenarios add macOS and Windows hosts, install methods the lab didn't use, Defend alerts, Cursor audit, Okta and Entra ID documents. Those shapes are inferred, so their documents carry `tags: ["poc-mock"]` (see "Demo scenarios").

### Usage

```bash
yarn start ai-agents [options]
yarn start generate-ai-agent-data [options]
```

| Flag                       | Default       | Meaning                                                                                                                                                                          |
| -------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--scenarios <list>`       | `all`         | Comma-separated scenario or group names. Groups: `all` and `lab` (the lab scenarios), `rule_trips`, `defend_alerts`, `install_variants`, `demo`                                  |
| `--repeat <n>`             | `1`           | Copies of each scenario, each with its own synthetic users and hosts                                                                                                             |
| `--time-window <duration>` | `2h`          | Scenarios run back to back from this long before now. The command fails rather than write future timestamps                                                                      |
| `--claude-otel`            | off           | Also write Claude Code OTel events for every Claude session. Extrapolated                                                                                                        |
| `--cursor-audit`           | off           | Also write Cursor audit log events for each scenario's Cursor users and for the storyline, in `logs-cursor.audit-*`. `poc-mock`                                                  |
| `--history-days <n>`       | `0`           | Back-fill quiet sessions so the data covers `<n>` days ending with the generated window (see "History"). `0` writes none                                                         |
| `--map-session-id`         | off           | Map `process.ai_agent.session_id` as `keyword` through `endpoint@custom` before writing                                                                                          |
| `--no-session-data`        | on            | Leave out `entry_leader`, `session_leader`, `group_leader`, `interactive`, `tty` and `process.previous`, as Defend's default policy does                                         |
| `--no-install-packages`    | install       | Skip installing Endpoint, Osquery Manager and (with `--claude-otel`) Claude Code                                                                                                 |
| `--endpoint-version <v>`   | `9.6.1`       | Endpoint package version to install, or `latest`. 9.6.1 leaves `session_id` unmapped, as in the lab                                                                              |
| `--output-file <path>`     | none          | Write NDJSON, one `{"_index", "_source"}` per line, and don't contact any cluster                                                                                                |
| `--domain <domain>`        | `example.com` | Email domain for synthetic people                                                                                                                                                |
| `--space <space>`          | `default`     | Kibana space for package installs, created if it doesn't exist                                                                                                                   |
| `--namespace <ns>`         | the space     | Data stream namespace for every generated index, so the space's entity maintainers read it (`logs-endpoint.events.*-<space>`)                                                    |
| `--seed <n>`               | random        | For offline repeatability. Fixes IDs and names, not timestamps, so rerunning a seed into one cluster duplicates IDs. `--claude-otel` doesn't change the Endpoint data for a seed |

Install the packages (the default) on a fresh deployment. Without the Endpoint package's templates, `logs-endpoint.events.*` gets dynamic mappings and `session_id` would become searchable, which a real 9.6.1 cluster doesn't do.

`--output-file` still needs a valid config to start the CLI. Without a `config.json`, set the documented environment variables to any values, for example `ELASTIC_NODE=http://localhost:9200 KIBANA_NODE=http://localhost:5601 ELASTIC_USERNAME=x ELASTIC_PASSWORD=x KIBANA_USERNAME=x KIBANA_PASSWORD=x`.

### Scenarios

Every scenario has its own hosts and OS users. OS user names never equal the email's local part, because they didn't in the lab.

| Scenario                    | What it seeds                                                                                                                                                                                             | Lab run |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `developer_claude`          | Interactive Claude over SSH with a TTY. Signs in mid-session, start-up IDE scan, plugin marketplace sync, a `find` and a `grep` (Claude re-execs as `bfs` and `ugrep`) and a Bash call                    | 0, 4    |
| `developer_cursor`          | `cursor-agent -p --trust` running a command: git probes, `rg`, sandbox preflight, `worker-server`, two shell state dumps, one fd-5 shell, `typescript-language-server` through `npx`                      | 8       |
| `cursor_plugin_sync`        | Cursor read-only task that syncs a team plugin and `cursor/plugins` over `ssh` then `git-remote-https`. The language server writes its compile cache five minutes later                                   | 3       |
| `mcp_server`                | Claude print session with a stdio MCP server (`env node npx -y`, `sh -c`, `node`) and its first `npx` install. The prompt is in `process.args`                                                            | 1       |
| `agent_commit`              | Claude edits a file twice (tmp file renamed over it), runs it, commits with the `Co-Authored-By` trailer                                                                                                  | 7       |
| `curl_and_secret_read`      | Claude runs `curl` (DNS and connection events) and reads `~/.ssh/config`, which leaves no event. osquery catches the running Claude                                                                       | 2       |
| `unattended_cron`           | The same print prompt over scripted SSH, then from `crond`                                                                                                                                                | 5       |
| `api_key_session`           | Print run with an inline dummy `ANTHROPIC_API_KEY`. Exits with code 1 in about 2 s, still stamped with the OAuth email                                                                                    | 6       |
| `shared_email_two_users`    | One work email signed in under `ec2-user` and a personal account (through `sudo -iu`) on one host                                                                                                         | 0 to 4  |
| `shared_email_two_hosts`    | One work email on two hosts. **Extrapolated**                                                                                                                                                             | none    |
| `shared_os_user_two_emails` | A jump box: two people sign in to Claude Code one after the other under `ec2-user`, so one install carries two emails. **Extrapolated**                                                                   | none    |
| `sudo_to_root`              | Claude runs `sudo systemctl restart nginx` (root descendants), then an admin runs `claude` as root after `sudo -i`. **Extrapolated**                                                                      | none    |
| `service_accounts`          | A `jenkins` CI job running `claude -p` with an API key and no sign-in, so no email, and a dev container session as `node`. **Extrapolated**, including whether Defend reports a container's own user name | none    |

Lab runs: 0 interactive sign-in and session, 1 print session with an MCP server, 2 `curl` and `~/.ssh/config`, 3 `cursor-agent` read-only, 4 interactive session under a second OS user, 5 the same prompt over SSH and from cron, 6 dummy API key, 7 Claude edits and commits, 8 `cursor-agent` runs a command.

### Demo scenarios

Demo scenarios exist for the connected AI agent demo (`research/agent-experience-poc/demo-plan.md`). Every document of every scenario gets `labels.poc_scenario`, and Endpoint documents of a scenario with one install shape also get `labels.poc_install_shape` (`<install method> (<os>)`), because detection rules read every `logs-endpoint.*` namespace whatever the Kibana space. Endpoint templates are `dynamic: false`, so a cluster write first maps `labels.poc_scenario`, `labels.poc_install_shape` and `tags` as keywords through `endpoint@custom`, merged into any existing template and the current backing indices. The security alerts index doesn't map them, so alerts carry them in `_source` only.

```bash
# Rule trips, install variants and the storyline, with Cursor audit, into space and namespace gen-demo
yarn start ai-agents --scenarios demo --cursor-audit --space gen-demo --map-session-id --seed 11

# Only the storyline, or only the rule trips
yarn start ai-agents --scenarios storyline --cursor-audit --space gen-demo --map-session-id
yarn start ai-agents --scenarios rule_trips --space gen-demo --map-session-id
```

#### Install methods

`src/generators/ai_agents/mock_installs.ts` holds the agent image for each install method and `MockAgentRun`, a compact run that writes the agent's launch and only the behaviour under test, without the lab's git probes and login-shell trees. Only the first two rows were observed.

| Install method    | OS               | `process.name`           | `process.executable`                                                                        | Tool shell                                                             |
| ----------------- | ---------------- | ------------------------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `claude_native`   | Linux (observed) | `2.1.332`                | `~/.local/share/claude/versions/2.1.332`                                                    | `/bin/bash -c source ~/.claude/shell-snapshots/... && eval ...`        |
| `cursor_cli`      | Linux (observed) | `node`                   | `~/.local/share/cursor-agent/versions/<v>/node`                                             | `bash -O extglob -c` reading the command from fd 5                     |
| `claude_native`   | macOS            | `2.1.332`                | `/Users/<u>/.local/share/claude/versions/2.1.332`                                           | `/bin/zsh -c source ~/.claude/shell-snapshots/...`                     |
| `claude_homebrew` | macOS            | `claude`                 | `/opt/homebrew/Caskroom/claude-code/2.1.332/claude`                                         | zsh, as above                                                          |
| `claude_npm`      | Linux, macOS     | `node`                   | `<node prefix>/bin/node`, args `<prefix>/lib/node_modules/@anthropic-ai/claude-code/cli.js` | bash or zsh, as above                                                  |
| `claude_windows`  | Windows          | `claude.exe`             | `C:\Users\<u>\.local\bin\claude.exe`                                                        | Git Bash `bash.exe -c source /c/Users/<u>/.claude/shell-snapshots/...` |
| `cursor_cli`      | macOS            | `node`                   | as on Linux                                                                                 | zsh reading from fd 5                                                  |
| `cursor_ide`      | macOS            | `Cursor Helper (Plugin)` | `/Applications/Cursor.app/Contents/Frameworks/Cursor Helper (Plugin).app/...`               | `/bin/zsh -c <command>`, under the untagged `Cursor` app               |

macOS and Windows hosts have no Defend session data. Their file events have `event.outcome: success`, macOS network events have `destination.domain`, and Windows network activity is DNS lookups. Linux file events keep the lab's `event.outcome: unknown`.

#### Rule trips

`src/commands/ai_agents/rule_trip_scenarios.ts` has one scenario per behaviour and install shape, for the 18 Defend GenAI rules in `elastic/detection-rules` main at `29aaacb49`. `RULE_TRIP_EXPECTATIONS` records, for each scenario, which rule it should trip in its original form and in a copy keyed on `process.ai_agent.*`, and why. Linux scenarios on `claude_native` and `cursor_cli` use the lab-shaped session builders. The others, and four Linux ones that need an event or flag the lab never showed, are `poc-mock`.

| Scenario                                          | Rule                                                                              | Original | Agent fields |
| ------------------------------------------------- | --------------------------------------------------------------------------------- | -------- | ------------ |
| `rule_permission_bypass_native`                   | GenAI CLI Started with Unsafe Permission Bypass                                   | yes      | yes          |
| `rule_permission_bypass_npm`                      | GenAI CLI Started with Unsafe Permission Bypass                                   | yes      | yes          |
| `rule_permission_bypass_cursor_cli`               | GenAI CLI Started with Unsafe Permission Bypass (`--force`)                       | no       | no           |
| `rule_destructive_aws_native`                     | Potential Destructive AWS CLI Command Executed by GenAI Agent                     | yes      | yes          |
| `rule_destructive_aws_cursor_cli`                 | Potential Destructive AWS CLI Command Executed by GenAI Agent                     | no       | yes          |
| `rule_prompt_injection_native`                    | Potential Prompt Injection Coercing Shell Execution                               | yes      | yes          |
| `rule_prompt_injection_cursor_cli`                | Potential Prompt Injection Coercing Shell Execution                               | yes      | yes          |
| `rule_mcp_server_child_native`                    | GenAI or MCP Server Child Process Execution, Compiling, Encoding Prior to Network | yes      | yes          |
| `rule_mcp_server_child_cursor_ide`                | GenAI or MCP Server Child Process Execution                                       | yes      | yes          |
| `rule_compile_native`                             | GenAI Process Compiling or Generating Executables                                 | no       | yes          |
| `rule_compile_brew`                               | GenAI Process Compiling or Generating Executables                                 | no       | yes          |
| `rule_encoding_network_native`                    | GenAI Process Performing Encoding/Chunking Prior to Network Activity              | no       | yes          |
| `rule_config_modification_native`                 | Unusual Process Modifying GenAI Configuration File                                | yes      | yes          |
| `rule_config_modification_cursor_cli`             | Unusual Process Modifying GenAI Configuration File                                | yes      | yes          |
| `rule_instruction_file_native`                    | GenAI Agent Instruction File Written to Downloads                                 | yes      | yes          |
| `rule_sensitive_files_native`                     | GenAI Process Accessing Sensitive Files                                           | no       | no           |
| `rule_sensitive_files_native_macos`               | GenAI Process Accessing Sensitive Files                                           | no       | yes          |
| `rule_sensitive_files_brew`, `_windows`           | GenAI Process Accessing Sensitive Files                                           | yes      | yes          |
| `rule_secret_imds_native_macos`                   | Package Runtime Secret File Access Followed by IMDS Request                       | no       | yes          |
| `rule_secret_imds_npm_macos`, `_cursor_cli_macos` | Package Runtime Secret File Access Followed by IMDS Request                       | yes      | yes          |
| `rule_suspicious_domain_native_macos`             | Suspicious Top Level Domain, Unusual Domain                                       | no, no   | yes, yes     |
| `rule_suspicious_domain_brew`                     | Suspicious Top Level Domain, Unusual Domain                                       | yes, yes | yes, yes     |
| `rule_suspicious_domain_cursor_ide`               | Suspicious Top Level Domain, Unusual Domain                                       | no, yes  | yes, yes     |
| `rule_suspicious_domain_windows`                  | Suspicious Top Level Domain (Unusual Domain is macOS only)                        | yes      | yes          |
| `rule_llm_endpoint_native`                        | Connection to Common Large Language Model Endpoints (macOS and Windows only)      | no       | no           |
| `rule_llm_endpoint_native_macos`                  | Connection to Common Large Language Model Endpoints                               | yes      | yes          |
| `rule_cowork_vm_tamper_native_macos`              | Claude Cowork VM Boot Image Tamper                                                | yes      | yes          |
| `defend_alerts_native`                            | Elastic Defend Alerts from GenAI Utility or Descendant                            | no       | yes          |
| `defend_alerts_brew`                              | Elastic Defend Alerts from GenAI Utility or Descendant                            | yes      | yes          |

The two Ollama rules and Execution via OpenClaw Agent have no scenario (`SKIPPED_GENAI_RULES`): they key on the Ollama server or on OpenClaw's command line, which no Claude Code or Cursor install has. The GenAI or MCP Server Child Process Execution building block also fires on any direct child of a listed client, so every tool shell of Homebrew `claude` or `Cursor Helper (Plugin)` trips it.

`defend_alerts_*` write a malware, a memory threat and a malicious behaviour alert to `logs-endpoint.alerts-<namespace>` on a miner the agent downloads and runs (`src/generators/ai_agents/defend_alerts.ts`). Each alert copies the process event's `process`, including `process.ai_agent` with `is_descendant: true`, as endpoint-package documents for malware and memory threat alerts. The malicious behaviour alert docs don't list `process.ai_agent`, but its `process` is the primary event's, so it's kept.

#### Install variants

`install_claude_brew`, `install_claude_npm` (Linux), `install_claude_windows` and `install_cursor_ide` each write one ordinary session (vendor API connection, a read, `git status`, an edit, `python3 main.py`) for the inventory. All `poc-mock`.

#### Storyline

`storyline` (`src/commands/ai_agents/storyline.ts`) is the demo's story, with synthetic people from `STORYLINE_PEOPLE`:

- `ci-build-01`: Claude Code from cron as `ec2-user`, signed in as `avery.quinn@<domain>`, run as `claude -p "<issue text with 'Ignore previous instructions'>" --dangerously-skip-permissions`. Its tool shells download and unpack an agent kit into `~/Downloads` (a `CLAUDE.md`), run its `build-helper` (one Defend malware alert) and run `aws s3 rm s3://<org>-release-artifacts --recursive`. A second, ordinary interactive install as `jblake`, signed in as `jordan.blake@<domain>`.
- `dev-aquinn-01` (interactive, as `aquinn`) and `jump-01` (print mode, as `ec2-user`): the same email on two other Claude Code installs. The `dev-aquinn-01` session starts last and is still running when the data ends: its Claude process has no `end` event and leaves out what Claude does on exit (the `open` session option). Its tool commands end, and osquery lists it as running.
- Okta: `avery.quinn` `DEPROVISIONED` (`user.account.status.deprovisioned: true`), `jordan.blake` active. Entra ID: `avery.quinn` still enabled. No MFA state, because neither integration sends it. Both in the packages' stored shape, written with the `_none` pipeline, so Entity Store mints `user:<email>@okta` and `user:<email>@entra_id`.
- With `--cursor-audit`: Cursor web login and a user API key for `avery.quinn` three days ago, then a SCIM `remove_user` for them a day ago.

Host IDs change with the seed. Look hosts up by name.

#### History

`--history-days <n>` back-fills quiet sessions on four existing agents (`src/commands/ai_agents/history.ts`), so the data covers `<n>` days ending with the generated window. Days are UTC. The window's own day has only the live scenarios, so `--history-days 30` writes the 29 days before it.

| Agent                                          | History                                                                                                                                                                                                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Claude Code as `ec2-user` on `ci-build-01`     | The release bot's cron job at 02:15 every night, signed in as `avery.quinn`, triaging an ordinary issue (4492 up to 4520) with `--allowedTools Read "Bash(git status)" "Bash(git log:*)"`. It reads `RELEASING.md` and runs `git status` and `git log` |
| `install_claude_brew` (macOS)                  | Interactive sessions on weekdays, one to three a day starting 09:00 to 16:40                                                                                                                                                                           |
| `install_cursor_ide` (macOS)                   | The same, with no sessions 8 to 14 days before the window's day, as if on leave                                                                                                                                                                        |
| `install_claude_windows` (Windows, contractor) | The same, one or two a day                                                                                                                                                                                                                             |

With `--history-days 30` the storyline agent has 30 sessions in the last 30 days: 29 quiet nights and tonight's prompt-injected run, the only one with `--dangerously-skip-permissions`. Every history session ends. Laptop sessions repeat the install variant's session (vendor API connection, a read, `git status`, an edit, `python3 main.py`) with a few minutes between steps, and start with no `-p`.

History is written after every scenario's live sessions, so the live data is the same for a seed with or without it. Hosts boot an hour before the first history day, so `crond` and `sshd` start before every session.

Detection rules filter on `event.ingested`, so a rule reads the history when it's loaded, whatever its `@timestamp`. The history has nothing the demo rules match: no permission bypass, injected prompt, `Downloads` write, unusual domain or sensitive file. Entity Store extraction filters on `@timestamp`, and `ai-agents-context --extract 4` reads the last 4 hours, so the history adds no agent and doesn't move `entity.lifecycle.first_seen`. macOS and Windows Defend send no session data, so the flyout shows the laptop sessions' launch mode as unknown.

#### Accounts

Every person a scenario creates with `builder.person()` is an employee with an active Okta user (`poc-mock`), so their installs resolve to a person. A few aren't, through `builder.person(kind)`:

| Kind         | Email domain             | IdP user | Scenarios                                                                 |
| ------------ | ------------------------ | -------- | ------------------------------------------------------------------------- |
| `contractor` | `--domain`               | none     | `rule_llm_endpoint_native`, `rule_compile_brew`, `install_claude_windows` |
| `personal`   | `example.net` (reserved) | none     | `rule_prompt_injection_cursor_cli`, `rule_sensitive_files_brew`           |

Personal Cursor accounts get no Cursor audit events, because they aren't in the team. IdP documents draw from their own random source, so they don't change host names or IDs for a seed.

### `ai-agents-context`

Applies the storyline's Kibana-side context, which only Kibana APIs can set. The entity rows have to exist, so it can install the store and force extraction first.

```bash
yarn start ai-agents-context --space gen-demo --install-store --extract 4
```

| Step                                  | API                                                                                                                                                                                                                              |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Install the store (`--install-store`) | `POST /s/<space>/api/security/entity_store/install` with all five entity types                                                                                                                                                   |
| Extract (`--extract <hours>`)         | `POST /s/<space>/internal/security/entity_store/{host,user,ai_agent}/force_log_extraction` (API version 2)                                                                                                                       |
| `high_impact` on `ci-build-01`        | `PUT /s/<space>/api/security/entity_store/entities/bulk?force=true` with `asset.criticality` on `host:<host.id>`                                                                                                                 |
| Store query on Unsanctioned AI agents | After `.../watchlists/install`, `POST .../watchlists/unsanctioned-ai-agents-watchlist-id-<space>/entity_source` with a store query, "Accounts outside `<domain>`", unless it has one. Fails if the prebuilt watchlist is missing |
| `jordan.blake` on Privileged Users    | `POST /s/<space>/api/entity_analytics/watchlists/install`, then `.../watchlists/<id>/entities/assign` with `user:<email>@okta`                                                                                                   |
| `avery.quinn` on Departing Employees  | `POST .../watchlists` (risk modifier 1.5), or `PUT .../watchlists/<id>` if it exists, then `.../<id>/entities/assign` with `user:<email>@okta` and `user:<email>@entra_id`. No entity source: an analyst assigns people by hand  |

The legacy `POST /api/asset_criticality` route writes the V1 criticality index, which Entity Store V2 doesn't read, so the command uses the entity bulk update the V2 flyout uses.

### Indices

| Index                                                                                  | Pipeline                                                     |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `logs-endpoint.events.process-default`, `.file-default`, `.network-default`            | Package default                                              |
| `logs-osquery_manager.result-default`                                                  | Package default                                              |
| `logs-claude_code.events.otel-default` (with `--claude-otel`)                          | `_none`, because documents are in the package's stored shape |
| `logs-endpoint.alerts-default` (demo scenarios)                                        | Package default                                              |
| `logs-cursor.audit-default` (with `--cursor-audit`)                                    | `_none`, stored shape                                        |
| `logs-entityanalytics_okta.user-default`, `logs-entityanalytics_entra_id.user-default` | `_none`, stored shape                                        |

Okta users are written for every generated employee, Entra ID users for the storyline only.

`-default` becomes `-<namespace>` with `--namespace` or a non-default `--space`.

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
