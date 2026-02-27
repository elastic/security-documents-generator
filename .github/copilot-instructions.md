# Copilot PR Review Guardrails

These instructions apply to GitHub Copilot suggestions and PR review feedback in this repository.

## 1) Prefer extending existing commands

- Before suggesting a new top-level command module, first check whether the feature can be added to an existing command surface.
- Existing command modules are centrally registered in `src/index.ts`; adding new top-level modules should be rare and justified.
- Prefer extension patterns already used in the repo:
  - Add integrations through `src/commands/org_data/integrations/index.ts` registry entries.
  - Add focused utilities as subcommands in existing command groups (for example in `src/commands/misc/index.ts`).

If a PR introduces a new top-level command, request a short justification explaining why existing modules cannot be extended.

## 2) Reuse Elasticsearch helpers (no ad-hoc bulk logic)

When reviewing or suggesting Elasticsearch ingest/upload code, map use cases to existing helpers:

- In-memory document arrays:
  - Prefer `ingest(...)` from `src/commands/utils/indices.ts`
  - Or `bulkIngest(...)` from `src/commands/shared/elasticsearch.ts` for lower-level control
- Async streams / iterables:
  - Use `streamingBulkIngest(...)` from `src/commands/shared/elasticsearch.ts`
- Pre-built bulk operation bodies or custom `_id` behavior:
  - Use `bulkUpsert(...)` from `src/commands/shared/elasticsearch.ts`
- Index-wide deletes:
  - Use `deleteAllByIndex(...)` from `src/commands/shared/elasticsearch.ts`
- Data stream deletes:
  - Use `deleteDataStreamSafe(...)` from `src/commands/shared/elasticsearch.ts`

Do not suggest custom `client.bulk()` or `client.helpers.bulk()` flows when an existing helper fits. If direct bulk APIs are necessary, require a brief justification in PR notes.

## 3) PR review checklist (Copilot)

Use this checklist when reviewing PRs:

- Does this PR add a new command where an existing command/module could be extended?
- Does this PR duplicate Elasticsearch ingest/upload logic already covered by shared helpers?
- If a new top-level command is introduced, is there a clear domain-boundary rationale?
- If direct bulk APIs are used, is there a specific reason shared helpers were insufficient?

## 4) Feedback style expectations

- Flag violations as concrete action items, not generic preferences.
- Point authors to the exact existing module/helper to use (with file path and function name).
- Favor consistency with existing command architecture and shared ingest utilities over introducing parallel patterns.
