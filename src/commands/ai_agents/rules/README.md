# GenAI rule copies keyed on `process.ai_agent.*`

Copies of the installed prebuilt rules (package `security_detection_engine` 9.6.2, which matches detection-rules main at `29aaacb49` for these rules except where noted). `yarn start ai-agents-rules` installs them, see the command README.

Each copy is a custom rule with the original's name, tagged `PoC: AI agent`, and its description says which original it replaces. Only the clauses that identify agents by name or path changed. Each `.diff` next to the query shows the exact change against the installed original.

The same two substitutions are used throughout:

- A `process.name` list naming the agent itself becomes `process.ai_agent.name != null and process.ai_agent.is_descendant == false`, the agent's own process.
- A `process.parent.name` list naming the agent becomes `process.ai_agent.is_descendant == true`, any process the agent started, at any depth.

Entries that name model runners (Ollama, LM Studio, textgen, KoboldCpp, llama.cpp, GPT4All, Jan), editors (VS Code) and package runners (`npx`, `pnpm`, `yarn`, `bunx`, `deno`, and `node` or `python` with a framework on the command line) stay as they were. They don't identify a coding agent, and nothing suggests Defend tags them. Agent entries for tools other than Claude Code and Cursor (Codex, Copilot, Gemini CLI, Windsurf, Kiro and so on) are replaced too, because the copies only test whether the agent fields are present, not which value they hold. Defend's values for those tools haven't been checked.

Two differences apply to every copy:

- **Depth.** `is_descendant` is true at any depth, while `process.parent.name` matches direct children only. With the two agent fields alone a rule can't ask for a direct child, because a child event doesn't carry its parent's agent fields.
- **Older stacks.** Endpoint package 9.5.0 added `process.ai_agent.*` to process events and 9.6.0 to file and network events. On older data the copies match nothing from agents.

| Copy                                 | Original rule ID                       | Copy rule ID                           | What changed                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------ | -------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `genai_suspicious_tld.eql`           | `a1b2c3d4-e5f6-7890-abcd-ef1234567890` | `ffcd5fd6-2db8-5b79-a7ba-781d7ebb5ff3` | Agent names in the `process.name` list replaced with the agent's own process. Model runners and package runners kept. The macOS and Windows filter is unchanged, so it can't fire on Linux                                                                                                                                                                                                 |
| `genai_unusual_domain.kql`           | `9050506c-df6d-4bdf-bc82-fcad0ef1e8c1` | `41da76fe-f783-5bca-b664-1a571d026289` | Same as above, in KQL. New terms on `destination.domain` over 7 days, macOS only, unchanged                                                                                                                                                                                                                                                                                                |
| `genai_sensitive_file_access.eql`    | `c0136397-f82a-45e5-9b9f-a3651d77e21a` | `8db87aaa-1737-581e-9939-91b7c69d8f6a` | Agent names replaced with the agent's own process. A descendant such as `cat ~/.aws/credentials` still isn't covered, as in the original                                                                                                                                                                                                                                                   |
| `genai_permission_bypass.eql`        | `c1326e45-6d3c-4a2d-9882-606a0c310299` | `5a08cea4-42e1-5b6e-93ef-8a143abb7213` | Each vendor's binary, path and `node` package checks replaced with the agent's own process. The flags are unchanged and no longer paired with a vendor, so Claude's flags would also match on Cursor. Cursor's own bypass flag (`--force`) isn't in the original and wasn't added                                                                                                          |
| `genai_compiling_executables.eql`    | `b2c3d4e5-f6a7-8901-bcde-f123456789ab` | `340f47bd-6e0e-5d78-99c8-f0f342a79a0a` | Agent names in the `process.parent.name` list replaced with any descendant                                                                                                                                                                                                                                                                                                                 |
| `genai_encoding_before_network.eql`  | `c3d4e5f6-a7b8-9012-cdef-123456789abc` | `e1964cbb-4109-5f10-afb9-9643e31152da` | Same change in the sequence's first event. The network event is unchanged                                                                                                                                                                                                                                                                                                                  |
| `destructive_aws_cli.kql`            | `2635d2ba-51e7-404a-9b17-db413a1351d5` | `986ccbb7-36bd-5cab-b9d1-3197615e1c28` | The whole agent block (parent names, Amazon Q paths, and shells whose command line has `.claude/shell-snapshots`, `.codex` and so on) replaced with `process.ai_agent.is_descendant : true`                                                                                                                                                                                                |
| `defend_alert_genai_descendant.esql` | `d4e5f6a7-b8c9-7d0e-1f2a-3b4c5d6e7f8a` | `13e27e89-7cf9-5b32-bb0a-3694d0f03af9` | The agent root comes from the agent's own process event (its `process.entity_id`) instead of a child's `process.parent.entity_id` with a named parent. Ollama kept by parent name. The ancestry intersection is unchanged. Package 9.6.2 ships an older version of this rule than main (no two-detection threshold, four exclusions, `KEEP *`), and the copy is based on the installed one |
| `mcp_server_child.eql`               | `b2c3d4e5-f6a7-8901-bcde-f23456789012` | `616dd7cb-cee9-5220-a5d9-213116358999` | Agent clients (Cursor, Claude, Windsurf, Codex, Copilot, Gemini CLI, OpenClaw and their helpers, plus OpenClaw through `node`) replaced with any descendant. VS Code, model runners and the MCP server clauses kept. Exclusions unchanged. Because of the depth difference this building block fires on every process an agent's tree starts                                               |

## Rules without a copy

Nine of the 18 have no agent list to swap. Reasons are in `../rules.json` (`no_copy_reason`) and the findings.

- Connection to Common Large Language Model Endpoints
- Package Runtime Secret File Access Followed by IMDS Request
- Claude Cowork VM Boot Image Tamper
- Unusual Process Modifying GenAI Configuration File
- Execution via OpenClaw Agent
- Potential Prompt Injection Coercing Shell Execution
- GenAI Agent Instruction File Written to Downloads
- Ollama API Accessed from External Network
- Ollama DNS Query to Untrusted Domain
