# Entity Analytics Perf Testing Handover

This folder packages the minimum reproducible handover for running Entity Analytics performance tests with an orchestrator/worker flow.

It is intentionally lightweight:

- reusable test mechanics and prompts live in repo
- test outputs, `.env.*`, and ad hoc notes stay local

## What is included

- `orchestrator-prompt.md` — orchestrator role and flow
- `worker-prompt.md` — generic worker template the orchestrator fills in
- `default-scenarios.md` — recommended default scenario matrix and sizing rationale
- `example.env` — sanitized environment template (variable names only)
- `create_perf_env.sh` — Elastic Cloud deployment provisioning helper

## Prerequisites

- Node `24.15.0`
- Yarn `^1.22.22`
- `EC_API_KEY` for `https://staging.found.no`
- Access to Kibana/Elasticsearch test deployments

Setup:

```bash
cd ~/dev/security-documents-generator
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use
yarn install
```

## Quick start

1. Provision an environment (or reuse an existing one):

```bash
cd ~/dev/security-documents-generator/perf-testing
EC_API_KEY=<your-key> ./create_perf_env.sh --name ea-perf-scaling --size medium
```

2. Give `orchestrator-prompt.md` to an orchestrator agent.
   - The orchestrator must first present the defaults in `default-scenarios.md` and ask whether to proceed or customize.

3. Orchestrator generates scenario-specific worker prompts from `worker-prompt.md`, and workers execute them.

4. Orchestrator collates results and asks how the user wants output summarized (canvas, markdown, html, etc.).

## Where results go

Current local convention:

```bash
~/Desktop/performance_testing/results
```

This repo does not commit generated results.

## Notes

- This flow targets **Entity Store V2** only.
- Do not use V1 `entity_store/enable` APIs.
- See `.cursor/rules/entity-store-v2-perf-testing.mdc` for guardrails.
