---
name: update-organization-integrations
description: Update existing integrations or add new integrations to the organization command using real data from the Elastic integrations repo, beats repo, cloudbeat repo, or endpoint-package repo. Use when the user asks to update an integration, add a new integration (including Elastic Defend / endpoint), fix integration field mappings, or align generated data with real integration data.
---

# Update Organization Integrations

## Overview

Updates existing integrations or creates new ones for the `yarn start organization` command,
using real field mappings and sample events from upstream Elastic repos as the source of truth.

## Before You Start

Ask the user to provide:

1. **Integration name** -- which integration to update or create (e.g. `okta`, `crowdstrike`, or a new one)
2. **Source repo and path** -- where the real data lives. One of:
   - **Integrations repo**: `/Users/johndoe/repos/integrations/packages/<name>/`
   - **Beats repo**: `/Users/johndoe/repos/beats/x-pack/filebeat/module/<name>/` (or auditbeat, etc.)
   - **Cloudbeat repo**: ask user for the path
   - **Endpoint-package repo**: `/Users/johndoe/repos/endpoint-package/` -- for the Elastic Defend (endpoint) integration. This package lives in its own dedicated repository, not in the integrations repo.

If the user points to a specific folder, use that directly.

## Workflow

Copy this checklist and track progress:

```
Task Progress:
- [ ] Step 1: Read real integration data
- [ ] Step 2: Read the existing integration (or base class for new)
- [ ] Step 3: Update or create the integration class
- [ ] Step 3b: Ensure cross-integration correlation
- [ ] Step 4: Register the integration (new integrations only)
- [ ] Step 5: Add detection rules
- [ ] Step 6: Verify the changes compile
- [ ] Step 7: Lint and format the code
```

### Step 1: Read Real Integration Data

Depending on the source repo, read these files:

**From the integrations repo** (`/Users/johndoe/repos/integrations/packages/<name>/`):

- `manifest.yml` -- package name, version, description
- `data_stream/*/fields/*.yml` -- ECS and custom field definitions
- `data_stream/*/sample_event.json` -- real sample documents
- `data_stream/*/manifest.yml` -- data stream type and dataset name

**From the beats repo** (`/Users/johndoe/repos/beats/x-pack/filebeat/module/<name>/`):

- `manifest.yml` -- module metadata
- `*/config/*.yml` -- dataset configuration
- `*/_meta/fields.yml` -- field definitions
- `*/_meta/sample_event.json` -- sample events (if available)

**From the endpoint-package repo** (`/Users/johndoe/repos/endpoint-package/`):

- `package/endpoint/manifest.yml` -- package name (`endpoint`), version, title ("Elastic Defend"), conditions
- `package/endpoint/data_stream/*/manifest.yml` -- per-data-stream type (logs or metrics) and dataset name
- `package/endpoint/data_stream/*/fields/fields.yml` -- full field definitions (generated from custom schemas/subsets)
- `package/endpoint/data_stream/*/sample_event.json` -- real sample documents (all streams except `collection`)
- `schemas/examples/v1/` -- additional realistic example events (e.g. `process_created_windows.json`, `malware_alert.json`, `network_outbound_connection_attempt_windows.json`)
- `custom_schemas/` -- custom ECS-extension field definitions (source of truth for non-ECS fields)
- `custom_subsets/elastic_endpoint/` -- subset definitions that control which fields each data stream uses

The endpoint package has 16 data streams:

| Data Stream      | Type    | Index Pattern                                 |
| ---------------- | ------- | --------------------------------------------- |
| alerts           | logs    | `logs-endpoint.alerts-default`                |
| process          | logs    | `logs-endpoint.events.process-default`        |
| file             | logs    | `logs-endpoint.events.file-default`           |
| network          | logs    | `logs-endpoint.events.network-default`        |
| security         | logs    | `logs-endpoint.events.security-default`       |
| registry         | logs    | `logs-endpoint.events.registry-default`       |
| library          | logs    | `logs-endpoint.events.library-default`        |
| device           | logs    | `logs-endpoint.events.device-default`         |
| api              | logs    | `logs-endpoint.events.api-default`            |
| actions          | logs    | `logs-endpoint.actions-default`               |
| action_responses | logs    | `logs-endpoint.action.responses-default`      |
| heartbeat        | logs    | `logs-endpoint.heartbeat-default`             |
| metadata         | metrics | `metrics-endpoint.metadata-default`           |
| metrics          | metrics | `metrics-endpoint.metrics-default`            |
| policy           | metrics | `metrics-endpoint.policy-default`             |
| collection       | logs    | `logs-endpoint.diagnostic.collection-default` |

Note: The endpoint package is typically a prerelease version (e.g. `9.4.0-prerelease.0`), so the integration class should set `prerelease = true`.

Extract from the real data:

- All **data stream names** and their index patterns (e.g. `logs-okta.system-default`)
- The **field mappings** -- which ECS fields and custom fields each data stream uses
- The **sample event structure** -- realistic document shapes with real field values
- The **Fleet package name** -- exact name used for `installPackage`

### Step 2: Read the Existing Integration

**For updates**, read the existing integration file:

```
src/commands/organization/integrations/<name>_integration.ts
```

Identify what needs to change: field names, data stream configs, document structure, etc.

**For new integrations**, read the base class and one existing integration as a reference:

- `src/commands/organization/integrations/base_integration.ts` -- abstract base class
- Pick a similar existing integration as a template (e.g. `slack_integration.ts` for audit log integrations, `entra_id_integration.ts` for entity analytics integrations)

### Step 3: Update or Create the Integration Class

Every integration class must:

1. **Extend `BaseIntegration`** from `./base_integration`
2. **Set `packageName`** -- the Fleet package name (from `manifest.yml`)
3. **Set `displayName`** -- human-readable name for CLI output
4. **Set `dataStreams`** -- array of `DataStreamConfig` objects:
   ```typescript
   readonly dataStreams: DataStreamConfig[] = [
     { name: 'Data Stream Name', index: 'logs-<package>.<dataset>-default' },
   ];
   ```
5. **Implement `generateDocuments(org, correlationMap)`** -- returns `Map<string, IntegrationDocument[]>` keyed by index name
6. **Set `prerelease = true`** if the package requires `?prerelease=true` for Fleet API

Key patterns for `generateDocuments`:

- Use `org.employees` to iterate over organization members
- Use `correlationMap` to link identities across integrations (e.g. `correlationMap.oktaUserIdToEmployee`)
- Use `this.getRandomTimestamp()` for realistic time distribution
- Each document must include `'@timestamp'` and the correct `data_stream`, `event`, and integration-specific fields
- Match the field structure from the real sample events as closely as possible
- **Use stable Employee/Device fields for correlated identifiers** -- see Step 3b below for the full rules on `user.id`, `host.mac`, `host.ip`, etc.

**Endpoint-specific guidance:**

- The `packageName` is `'endpoint'` and `displayName` should be `'Elastic Defend'`
- The endpoint package has many data streams; select the most relevant ones for the organization use case (typically: `process`, `file`, `network`, `security`, `alerts`, and optionally `registry`, `library`, `api`)
- Documents should include `agent.type: 'endpoint'` and `event.module: 'endpoint'`
- The existing `privileged_user_monitoring` command already generates endpoint process events and can serve as a reference for document structure (see `src/commands/privileged_user_monitoring/sample_documents.ts`)

### Step 3b: Ensure Cross-Integration Correlation

Every integration must use **stable, pre-generated identity fields** from the `Employee` and `Device`
objects so that the same user or device can be correlated across multiple integrations in Elastic
Security. Never generate random identifiers (SIDs, UIDs, MACs, IPs) per event with `faker`.

#### Stable fields on Employee

These fields are generated once in `organization_generator.ts` and must be reused by every
integration that references users:

| Field             | Description                                                                 | Example                                          |
| ----------------- | --------------------------------------------------------------------------- | ------------------------------------------------ |
| `userName`        | Primary user identifier across all integrations                             | `reese.doyle`                                    |
| `email`           | Corporate email address                                                     | `reese.doyle@acmecrm.com`                        |
| `windowsSid`      | Windows SID (shared domain prefix + per-employee RID)                       | `S-1-5-21-1199716861-1301547593-1626275133-1001` |
| `unixUid`         | Unix UID (integer, starts at 1000)                                          | `1000`                                           |
| `oktaUserId`      | Okta user ID                                                                | `00uAbCdEfGhIjKlMn`                              |
| `entraIdUserId`   | Microsoft Entra ID (Azure AD) user UUID                                     | `a1b2c3d4-...`                                   |
| `duoUserId`       | Cisco Duo user ID                                                           | `DUABCDEFGHIJKLMNOPQR`                           |
| `onePasswordUuid` | 1Password member UUID                                                       | `a1b2c3d4-...`                                   |
| `employeeNumber`  | HR employee number                                                          | `123456`                                         |
| `githubUsername`   | GitHub username (Engineering + Executive only)                              | `reese-doyle`                                    |

#### Stable fields on Device

| Field                | Description                                   | Example                            |
| -------------------- | --------------------------------------------- | ---------------------------------- |
| `id`                 | Device UUID, used as `host.id`                | `276e59a0-...`                     |
| `macAddress`         | Stable MAC address (dash-separated)           | `8a-d3-02-ed-99-a2`               |
| `ipAddress`          | Stable IPv4 address                           | `234.22.230.186`                   |
| `crowdstrikeAgentId` | CrowdStrike Falcon agent ID                   | `e045e02b...`                      |
| `crowdstrikeDeviceId`| CrowdStrike device ID                         | `efb573dc...`                      |
| `serialNumber`       | Hardware serial number                        | `A1B2C3D4E5F6`                     |

#### Correlation rules for ECS fields

When generating documents, map ECS fields to the stable Employee/Device values:

| ECS Field      | Rule                                                                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `user.id`      | Windows: `employee.windowsSid`. Mac/Linux: `String(employee.unixUid)`. **Never** generate random SIDs/UIDs per event.                     |
| `user.name`    | Always `employee.userName`.                                                                                                               |
| `user.email`   | Always `employee.email`.                                                                                                                  |
| `user.domain`  | Windows user-context: derive from employee (e.g. `employee.userName.split('.')[0].toUpperCase()`). Use `'NT AUTHORITY'` only for SYSTEM.   |
| `host.id`      | Always `device.id`.                                                                                                                       |
| `host.name`    | `${employee.userName}-${device.platform}` for employee devices.                                                                           |
| `host.mac`     | Always `device.macAddress`. Convert separator as needed (dash for ECS/endpoint, colon for Jamf). **Never** call `faker.internet.mac()`.    |
| `host.ip`      | Always `device.ipAddress` as the primary IP. **Never** call `faker.internet.ipv4()` for host IPs. Random IPs are OK for `source.ip`, `destination.ip`, or `external_ip`. |

#### When to extend the CorrelationMap

If the new integration introduces an identity type not already covered (e.g. a vendor-specific user ID),
extend the correlation infrastructure:

1. Add the new field to `Employee` or `Device` in `src/commands/organization/types.ts`
2. Generate the stable value in `src/commands/organization/organization_generator.ts`
3. Add a new `Map` entry to the `CorrelationMap` interface in `src/commands/organization/types.ts`
4. Populate it in `buildCorrelationMap()` in `src/commands/organization/correlation.ts`
5. Add it to `createEmptyCorrelationMap()` in `src/commands/organization/integrations/base_integration.ts`

### Step 4: Register the Integration (New Integrations Only)

For new integrations, update three files:

**`src/commands/organization/integrations/index.ts`**:

1. Add the import: `import { MyIntegration } from './my_integration';`
2. Add the export: `export { MyIntegration } from './my_integration';`
3. Register in `createIntegrationRegistry()`: `registry.set('my_integration', new MyIntegration());`
4. Add to `getAvailableIntegrations()` return array

**`src/commands/organization/types.ts`**:

Add the new name to the `IntegrationName` union type:

```typescript
export type IntegrationName =
  | 'okta'
  // ... existing names ...
  | 'my_integration';
```

**`src/commands/organization/organization.ts`** (optional):

If the integration should be included in the default set or quick mode, add it to the `validateOptions` integration list and/or `runOrganizationQuick`.

### Step 5: Add Detection Rules

Add sample detection rules so the integration produces alerts when `--detection-rules` is passed.

**Skip this step** for entity-store-only integrations listed in `EXCLUDED_INTEGRATIONS`
(okta, entra_id, active_directory, cloud_asset, workday, ping_directory).

**File**: `src/commands/organization/detection_rules.ts`

Add an entry to the `INTEGRATION_DETECTION_RULES` map keyed by the integration's `IntegrationName`.
Each entry is an array of `DetectionRuleDefinition` objects:

```typescript
interface DetectionRuleDefinition {
  name: string;
  description: string;
  query: string;                                           // KQL query
  severity: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number;                                       // 0-100
  index: string[];                                         // e.g. ['logs-<package>.<dataset>-*']
  generateMatchingEvents: (count: number) => IntegrationDocument[];
}
```

Guidelines:

- Add **2--5 rules** per integration covering key security scenarios (failed authentication,
  suspicious activity, high-severity alerts, policy violations, etc.)
- The `query` must be a valid KQL string that targets the integration's data stream index pattern
  (e.g. `data_stream.dataset: "okta.system" AND event.outcome: "failure"`)
- The `index` array should use wildcards matching the integration's indices
  (e.g. `['logs-okta.system-*']`)
- `generateMatchingEvents` uses the `baseEvent(dataset, overrides)` helper to produce documents
  with `@timestamp` and `data_stream` pre-filled -- the overrides must include fields that satisfy
  the KQL query so the rule fires
- Read existing entries in `INTEGRATION_DETECTION_RULES` as reference for the pattern

### Step 6: Verify the Changes Compile

Run from the project root:

```bash
yarn --ignore-engines build
```

Fix any TypeScript errors before finishing.

### Step 7: Lint and Format the Code

Run eslint and prettier to catch formatting and lint issues:

```bash
yarn --ignore-engines lint
yarn --ignore-engines prettier --check "src/**/*.ts"
```

If there are errors, auto-fix them:

```bash
yarn --ignore-engines prettier --write "src/**/*.ts"
```

Then re-run the lint check. For lint errors that prettier cannot fix (e.g. `no-useless-assignment`,
`no-unused-vars`), fix them manually in the source code and re-run until clean.

The CI runs `yarn checks` which chains `typecheck`, `lint`, and `prettier --check` -- all three
must pass before finishing.

## File Locations

| Resource                  | Path                                                                  |
| ------------------------- | --------------------------------------------------------------------- |
| Integration classes       | `src/commands/organization/integrations/`                             |
| Base class                | `src/commands/organization/integrations/base_integration.ts`          |
| Integration registry      | `src/commands/organization/integrations/index.ts`                     |
| Types (IntegrationName)   | `src/commands/organization/types.ts`                                  |
| Main command              | `src/commands/organization/organization.ts`                           |
| Organization generator    | `src/commands/organization/organization_generator.ts`                 |
| Correlation builder       | `src/commands/organization/correlation.ts`                            |
| Detection rules           | `src/commands/organization/detection_rules.ts`                        |
| Integrations repo         | `/Users/johndoe/repos/integrations/packages/`                         |
| Beats repo                | `/Users/johndoe/repos/beats/x-pack/filebeat/module/`                  |
| Endpoint-package repo     | `/Users/johndoe/repos/endpoint-package/`                              |
| Endpoint package manifest | `/Users/johndoe/repos/endpoint-package/package/endpoint/manifest.yml` |
| Endpoint data streams     | `/Users/johndoe/repos/endpoint-package/package/endpoint/data_stream/` |
| Endpoint example events   | `/Users/johndoe/repos/endpoint-package/schemas/examples/v1/`          |
| Existing endpoint samples | `src/commands/privileged_user_monitoring/sample_documents.ts`          |
