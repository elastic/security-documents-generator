# Default Scenarios and Environment Sizing (Customizable)

This file defines the recommended default test matrix. The orchestrator should present this matrix first and ask the user whether to proceed as-is or customize it.

## Recommended hardware baseline

- Deployment size: **medium**
- Elasticsearch: **32 GB RAM**
- Kibana: **16 GB RAM**
- Stack: latest `9.4.x-SNAPSHOT` used by the test team

Reasoning:

- This is the realistic profile for P90/P95-style Entity Analytics deployments.
- It keeps cross-scenario comparisons meaningful on one hardware baseline.

## Production telemetry reference

Risk-scorable entity counts (users + hosts):

- P90: ~38K
- P95: ~98K
- P99: ~664K

Manager guidance on alert volumes:

- realistic testing range: **100K–500K alerts**
- 1M+ alerts in a month is an extreme outlier

## Default scenario matrix

| Scenario | Label  | Users | Hosts | Entities | Alerts/entity | Total alerts | Pages at pageSize=10K |
| -------- | ------ | ----: | ----: | -------: | ------------: | -----------: | --------------------: |
| A        | Medium |   36K |    2K |      38K |             5 |        ~190K |                     5 |
| B        | Large  |   90K |    8K |      98K |             4 |        ~350K |                    10 |
| C        | XL     |   90K |    8K |      98K |             5 |        ~500K |                    10 |

## What this matrix isolates

- A -> B: higher entity count and pages at still-realistic alert density.
- B -> C: same entities/pages, higher alert volume to isolate alert-scan cost.

## Default feature coverage

- Risk scoring: all scenarios (A/B/C)
- Watchlist sync: include where useful; note known terms limit issue above 65,536 entities
- Lead generation: at least one high-scale scenario
- Explore UI: at least one high-scale scenario

## Default page size

- pageSize: **10,000** (recommended upper bound and default target)

## Orchestrator instruction

Before dispatching workers, ask:

- proceed with these defaults, or
- customize deployment size, scenario sizes, alert volumes, run counts, and feature scope
