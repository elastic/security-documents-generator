---
name: update-organization-integrations
description: Update existing integrations or add new integrations to the organization command using real data from the Elastic integrations repo, beats repo, or cloudbeat repo. Use when the user asks to update an integration, add a new integration, fix integration field mappings, or align generated data with real integration data.
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

If the user points to a specific folder, use that directly.

## Workflow

Copy this checklist and track progress:

```
Task Progress:
- [ ] Step 1: Read real integration data
- [ ] Step 2: Read the existing integration (or base class for new)
- [ ] Step 3: Update or create the integration class
- [ ] Step 4: Register the integration (new integrations only)
- [ ] Step 5: Verify the changes compile
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

### Step 5: Verify the Changes Compile

Run from the project root:

```bash
yarn build
```

Fix any TypeScript errors before finishing.

## File Locations

| Resource                | Path                                                         |
| ----------------------- | ------------------------------------------------------------ |
| Integration classes     | `src/commands/organization/integrations/`                    |
| Base class              | `src/commands/organization/integrations/base_integration.ts` |
| Integration registry    | `src/commands/organization/integrations/index.ts`            |
| Types (IntegrationName) | `src/commands/organization/types.ts`                         |
| Main command            | `src/commands/organization/organization.ts`                  |
| Organization generator  | `src/commands/organization/organization_generator.ts`        |
| Correlation builder     | `src/commands/organization/correlation.ts`                   |
| Integrations repo       | `/Users/johndoe/repos/integrations/packages/`                |
| Beats repo              | `/Users/johndoe/repos/beats/x-pack/filebeat/module/`         |
