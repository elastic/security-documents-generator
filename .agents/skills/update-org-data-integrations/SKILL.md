---
name: update-org-data-integrations
description: >-
  Create or modify integration classes in src/commands/org_data/integrations/
  that extend BaseIntegration for the `yarn start org-data`
  (generate-correlated-organization-data) command. These classes define Fleet
  package installation, data stream configs, and generateDocuments() methods
  that produce correlated user/device/service documents across the simulated
  organization.

  Use ONLY when the user explicitly asks to add, update, or fix an integration
  for the org-data command (e.g. "add GitLab to org-data", "update the
  okta_integration.ts field mappings for org-data", "fix correlation in the
  crowdstrike org-data integration").

  Do NOT use for: cloud security posture (csp), privileged user monitoring
  (privmon), entity store, or any other command.
---

# Update Org-Data Integrations

## Overview

Updates existing integrations or creates new ones for the `yarn start org-data` command,
using upstream field definitions and reference sample events from Elastic repos as the source of truth.

## Before You Start

Ask the user to provide:

1. **Integration name** -- which integration to update or create (e.g. `okta`, `crowdstrike`, or a new one)
2. **Source repo and path** -- where the upstream package definitions live. One of:
   - **Integrations repo**: `/Users/johndoe/repos/integrations/packages/<name>/`
   - **Beats repo**: `/Users/johndoe/repos/beats/x-pack/filebeat/module/<name>/` (or auditbeat, etc.)
   - **Cloudbeat repo**: ask user for the path
   - **Endpoint-package repo**: `/Users/johndoe/repos/endpoint-package/` -- for the Elastic Defend (endpoint) integration. This package lives in its own dedicated repository, not in the integrations repo.

If the user points to a specific folder, use that directly.

## Workflow

Copy this checklist and track progress:

```
Task Progress:
- [ ] Step 1: Read upstream package definitions
- [ ] Step 2: Read the existing integration (or base class for new)
- [ ] Step 3: Update or create the integration class
- [ ] Step 3b: Ensure cross-integration correlation
- [ ] Step 4: Register the integration (new integrations only)
- [ ] Step 5: Add detection rules
- [ ] Step 6: Verify the changes compile
- [ ] Step 7: Lint and format the code
- [ ] Step 8: Update this skill with session learnings
```

### Step 1: Read Upstream Package Definitions

Depending on the source repo, read these files:

**From the integrations repo** (`/Users/johndoe/repos/integrations/packages/<name>/`):

- `manifest.yml` -- package name, version, description
- `data_stream/*/fields/*.yml` -- ECS and custom field definitions
- `data_stream/*/sample_event.json` -- reference sample documents
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
- `package/endpoint/data_stream/*/sample_event.json` -- reference sample documents (all streams except `collection`)
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

Extract from the upstream definitions:

- All **data stream names** and their index patterns (e.g. `logs-okta.system-default`)
- The **field mappings** -- which ECS fields and custom fields each data stream uses
- The **sample event structure** -- realistic document shapes with reference field values
- The **Fleet package name** -- exact name used for `installPackage`

### Step 2: Read the Existing Integration

**For updates**, read the existing integration file:

```
src/commands/org_data/integrations/<name>_integration.ts
```

Identify what needs to change: field names, data stream configs, document structure, etc.

**For new integrations**, read the base class and one existing integration as a reference:

- `src/commands/org_data/integrations/base_integration.ts` -- abstract base class
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
- Each document must include `'@timestamp'` and the correct `data_stream`
- **Produce raw/pre-pipeline documents** -- see Step 3c below for the full rules
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

These fields are generated once in `org_data_generator.ts` and must be reused by every
integration that references users:

| Field             | Description                                           | Example                                          |
| ----------------- | ----------------------------------------------------- | ------------------------------------------------ |
| `userName`        | Primary user identifier across all integrations       | `reese.doyle`                                    |
| `email`           | Corporate email address                               | `reese.doyle@acmecrm.com`                        |
| `windowsSid`      | Windows SID (shared domain prefix + per-employee RID) | `S-1-5-21-1199716861-1301547593-1626275133-1001` |
| `unixUid`         | Unix UID (integer, starts at 1000)                    | `1000`                                           |
| `oktaUserId`      | Okta user ID                                          | `00uAbCdEfGhIjKlMn`                              |
| `entraIdUserId`   | Microsoft Entra ID (Azure AD) user UUID               | `a1b2c3d4-...`                                   |
| `duoUserId`       | Cisco Duo user ID                                     | `DUABCDEFGHIJKLMNOPQR`                           |
| `onePasswordUuid` | 1Password member UUID                                 | `a1b2c3d4-...`                                   |
| `employeeNumber`  | HR employee number                                    | `123456`                                         |
| `githubUsername`  | GitHub username (Engineering + Executive only)        | `reese-doyle`                                    |
| `gitlabUserId`    | GitLab numeric user ID (Engineering + Executive only) | `42518`                                          |

#### Stable fields on Device

| Field                 | Description                                    | Example             |
| --------------------- | ---------------------------------------------- | ------------------- |
| `id`                  | Device UUID, used as `host.id`                 | `276e59a0-...`      |
| `macAddress`          | Stable MAC address (dash-separated)            | `8a-d3-02-ed-99-a2` |
| `ipAddress`           | Stable IPv4 address                            | `234.22.230.186`    |
| `crowdstrikeAgentId`  | CrowdStrike Falcon agent ID                    | `e045e02b...`       |
| `crowdstrikeDeviceId` | CrowdStrike device ID                          | `efb573dc...`       |
| `serialNumber`        | Hardware serial number                         | `A1B2C3D4E5F6`      |
| `elasticAgentId`      | Elastic Agent UUID for local workstation agent | `c3f1a9d2-...`      |

#### Stable fields on Host

| Field            | Description                            | Example                  |
| ---------------- | -------------------------------------- | ------------------------ |
| `id`             | Host UUID                              | `a2b3c4d5-...`           |
| `name`           | Server hostname                        | `api-server-prod-a1b2c3` |
| `elasticAgentId` | Elastic Agent UUID for the server host | `d4e5f6a7-...`           |

#### Stable fields on Service

`org.services` is a catalog of platform services, SaaS apps, the org's identity provider, and (for medium / enterprise sizes) org-owned microservices. It's the source of truth for ECS `service.entity.id`. Generate services from `src/commands/org_data/data/services.ts` -- never invent service IDs in an integration.

| Field             | Description                                                                     | Example                                           |
| ----------------- | ------------------------------------------------------------------------------- | ------------------------------------------------- |
| `id`              | Service identifier matching the real eventSource / serviceName / SaaS app id    | `ec2.amazonaws.com`, `salesforce`, `checkout-api` |
| `name`            | Display name                                                                    | `Amazon EC2`, `Salesforce`, `Checkout API`        |
| `kind`            | One of `cloud_platform`, `saas_app`, `identity_provider`, `org_service`         | `cloud_platform`                                  |
| `provider`        | Cloud provider (only on `cloud_platform`)                                       | `aws`                                             |
| `entityId`        | Deterministic ECS `service.entity.id` value                                     | `service:cloud_platform:ec2.amazonaws.com`        |
| `ownerEmployeeId` | Employee who owns the service (only on `org_service`, medium / enterprise orgs) | `<Employee.id>`                                   |
| `hostIds`         | Hosts the service runs on (only on `org_service`, medium / enterprise orgs)     | `['<Host.id>', ...]`                              |

#### CentralAgent on Organization

The `org.centralAgent` represents a single Elastic Agent deployed on a central fleet
collector server. All cloud/SaaS integrations (Okta, GWS, GitHub, etc.) share this agent
identity in their documents.

| Field  | Description                      | Example              |
| ------ | -------------------------------- | -------------------- |
| `id`   | Stable UUID for the agent        | `b7c8d9e0-...`       |
| `name` | Hostname of the collector server | `fleet-collector-01` |

#### Correlation rules for ECS fields

When generating documents, map ECS fields to the stable Employee/Device values:

| ECS Field           | Rule                                                                                                                                                                                                                                                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user.id`           | Windows: `employee.windowsSid`. Mac/Linux: `String(employee.unixUid)`. **Never** generate random SIDs/UIDs per event.                                                                                                                                                                                                                    |
| `user.name`         | Always `employee.userName`.                                                                                                                                                                                                                                                                                                              |
| `user.email`        | Always `employee.email`.                                                                                                                                                                                                                                                                                                                 |
| `user.domain`       | Windows user-context: derive from employee (e.g. `employee.userName.split('.')[0].toUpperCase()`). Use `'NT AUTHORITY'` only for SYSTEM.                                                                                                                                                                                                 |
| `host.id`           | Always `device.id`.                                                                                                                                                                                                                                                                                                                      |
| `host.name`         | `${employee.userName}-${device.platform}` for employee devices.                                                                                                                                                                                                                                                                          |
| `host.mac`          | Always `device.macAddress`. Convert separator as needed (dash for ECS/endpoint, colon for Jamf). **Never** call `faker.internet.mac()`.                                                                                                                                                                                                  |
| `host.ip`           | Always `device.ipAddress` as the primary IP. **Never** call `faker.internet.ipv4()` for host IPs. Random IPs are OK for `source.ip`, `destination.ip`, or `external_ip`.                                                                                                                                                                 |
| `agent.id`          | Local workstation: `device.elasticAgentId`. Server: `host.elasticAgentId`. Centralized cloud: `org.centralAgent.id`. Use `buildLocalAgent()`, `buildServerAgent()`, or `buildCentralAgent()` helpers from `BaseIntegration`.                                                                                                             |
| `agent.name`        | Local workstation: `${employee.userName}-${device.platform}` (same as `host.name`). Server: `host.name`. Centralized cloud: `org.centralAgent.name` (`fleet-collector-01`).                                                                                                                                                              |
| `agent.type`        | `'endpoint'` for Elastic Defend, `'filebeat'` for all other integrations.                                                                                                                                                                                                                                                                |
| `agent.version`     | Always `ELASTIC_AGENT_VERSION` (`'8.17.4'`), exported from `base_integration.ts`.                                                                                                                                                                                                                                                        |
| `service.entity.id` | Look up by integration-specific identifier in `correlationMap.serviceIdToService` (e.g. CloudTrail `eventSource`, GCP `protoPayload.serviceName`, SaaS app id). For org-owned services, iterate `org.services` directly and use `service.entityId`. **Never** synthesize service entity IDs per event. See Step 3d for the full pattern. |

#### When to extend the CorrelationMap

If the new integration introduces an identity type not already covered (e.g. a vendor-specific user ID),
extend the correlation infrastructure:

1. Add the new field to `Employee` or `Device` in `src/commands/org_data/types.ts`
2. Generate the stable value in `src/commands/org_data/org_data_generator.ts`
3. Add a new `Map` entry to the `CorrelationMap` interface in `src/commands/org_data/types.ts`
4. Populate it in `buildCorrelationMap()` in `src/commands/org_data/correlation.ts`
5. Add it to `createEmptyCorrelationMap()` in `src/commands/org_data/integrations/base_integration.ts`

Service entities already use this pattern -- you do **not** need to repeat it for services. The
existing maps `correlationMap.serviceIdToService` (keyed by service id, e.g. AWS eventSource or GCP
serviceName), `serviceEntityIdToService`, and `hostIdToServices` are populated automatically for
every org. Use them directly to resolve `service.entity.id`. See Step 3d.

### Step 3c: Produce Pre-Pipeline (Raw) Document Format

**CRITICAL**: Documents generated by org-data integrations are indexed into Elasticsearch data streams that have ingest pipelines attached. The ingest pipeline transforms the raw input into ECS-compliant documents. Your generator must produce documents in the **raw format the pipeline expects**, NOT the final ECS format.

#### Why this matters

When a document is indexed to `logs-zoom.webhook-default`, the default ingest pipeline for that data stream runs automatically. If the generator produces a document that already has ECS fields like `event.action`, `user.email`, `source.ip`, etc., the pipeline will fail because it cannot find the raw fields it expects (e.g. `zoom.payload`, `message` with JSON, etc.). This results in `pipeline_error` documents.

#### How to determine the raw format

Before writing `generateDocuments()`, you MUST read the ingest pipeline YAML for each data stream:

1. **Find the pipeline**: `packages/<package>/data_stream/<dataset>/elasticsearch/ingest_pipeline/default.yml`
2. **Identify the input field**: Look for the first `json`, `rename`, `grok`, or `script` processor to determine what field the pipeline reads from. Common patterns:
   - **`message` field** (most common): Pipeline does `message` → `event.original` → JSON parse. Generator must put raw API JSON in `message`.
   - **`event.original` field**: Some pipelines read directly from `event.original`. Generator sets `event: { original: JSON.stringify(raw) }`.
   - **Special top-level fields**: Some pipelines expect specific structures:
     - Zoom: `zoom.event` + `zoom.payload`
     - Auth0: `json.data` (object, not stringified)
     - O365: `o365audit` (object)
     - MongoDB Atlas org: `response` (object)
     - ServiceNow: `message` + `_conf` (config object)
3. **Check field naming**: Raw fields often use different casing than the final ECS output:
   - BeyondInsight: CamelCase (`ActionType`, `AuditID`)
   - LastPass: PascalCase (`Action`, `Username`, `IP_Address`)
   - Island: camelCase (`allowedTenantsIds`, `createdDate`)
   - CyberArk PAS: CamelCase in syslog wrapper (`IsoTimestamp`, `MessageID`)
4. **Check date formats**: Different pipelines expect different timestamp formats:
   - Mattermost: `yyyy-MM-dd HH:mm:ss.SSS Z`
   - TI AbuseCH URL: `yyyy-MM-dd HH:mm:ss UTC`
   - MongoDB Atlas: `ts.$date` (ISO8601)
   - Most others: ISO8601
5. **Check for sub-pipeline routing**: Some pipelines route to sub-pipelines based on field values (e.g., `event.action`, `_conf.table_name`, `log.logger`). Your raw document must include these routing fields.

#### Reading an ingest pipeline

When examining a pipeline YAML, look for these processor types:

| Processor  | What to look for                                                                                    |
| ---------- | --------------------------------------------------------------------------------------------------- |
| `json`     | `field` (input) and `target_field` (output). The `field` value is what your document must provide.  |
| `rename`   | What raw field becomes what ECS field. If `ignore_missing: true` is NOT set, the field is required. |
| `date`     | `field` (source) and `formats` (expected format). Your raw data must use a matching format.         |
| `grok`     | `field` (input) and `patterns`. Your raw data must match the grok pattern.                          |
| `script`   | Check `ctx.*` references for required fields.                                                       |
| `drop`     | `if` condition shows what fields must exist to avoid document drops.                                |
| `pipeline` | Sub-pipeline routing. Check the `if` condition for routing fields.                                  |

#### Document structure template

```typescript
// CORRECT: Raw pre-pipeline format with agent metadata
return {
  '@timestamp': timestamp,
  agent: this.buildCentralAgent(org), // or buildLocalAgent(device, hostname) / buildServerAgent(host)
  message: JSON.stringify(rawApiPayload),
  data_stream: { namespace: 'default', type: 'logs', dataset: '<package>.<dataset>' },
} as IntegrationDocument;
```

Every document MUST include an `agent` field. Use the appropriate helper from `BaseIntegration`:

- **`buildCentralAgent(org)`** -- for cloud/SaaS integrations (Okta, GWS, GitHub, etc.)
- **`buildLocalAgent(device, hostname, agentType?)`** -- for per-workstation integrations (endpoint, crowdstrike, jamf_pro, island_browser, zscaler_zia)
- **`buildServerAgent(host)`** -- for per-server integrations (system)

#### What NOT to include

Do NOT pre-set any fields that the ingest pipeline derives:

- `event.action`, `event.category`, `event.type`, `event.kind`, `event.outcome`, `event.dataset`, `event.module`
- `user.id`, `user.email`, `user.name`, `user.domain`
- `source.ip`, `source.geo.*`
- `destination.ip`, `destination.geo.*`
- `related.ip`, `related.user`, `related.hosts`
- `observer.vendor`, `observer.product`
- `tags` (unless the pipeline expects them as input)
- Integration-specific namespaced fields (e.g. `google_workspace.*`, `okta.*`, `zoom.*` in their final form)

These are ALL populated by the pipeline from the raw input.

#### Exceptions

Some integrations do NOT have ingest pipelines or use non-standard flows:

- **Entity analytics** (active_directory, entra_id, okta entityanalytics): Use the entity store format. These may include ECS fields directly since the pipeline is minimal or absent.
- **Endpoint (Elastic Defend)**: Produces full ECS documents. The pipeline only does minor enrichment (geoip).
- **Cloud Asset Inventory**: No ingest pipeline. Produces documents in the asset inventory format.

When in doubt, always check the pipeline YAML first.

### Step 3d: Attach `service.entity.id` When Applicable

ECS `service.entity.id` is used to correlate logs from the same service across data streams. The
`org.services` catalog already models the services that exist in the simulated org (see Step 3b).
Integrations should attach `service.entity.id` only when the events they emit clearly originate
from a known service.

Pattern depends on the data shape:

#### Cloud platform audit logs (CloudTrail, GCP audit, Azure activitylogs)

Each event names the platform service in a raw payload field. Look it up in
`correlationMap.serviceIdToService` and attach `service.entity.id` to every doc. ECS `service.name`
is still derived by the ingest pipeline from the raw payload (CloudTrail's `eventSource`, GCP's
`protoPayload.serviceName`, Azure's `properties.resource_provider`), so do not pre-set it on the
generator side.

The recommended pattern adds a private map field on the integration class and a small helper:

```typescript
import { type Service, ... } from '../types.ts';

export class CloudTrailIntegration extends BaseIntegration {
  private serviceIdToService?: Map<string, Service>;

  private serviceAttachmentFor(eventSource: string): { entity: { id: string } } | undefined {
    const svc = this.serviceIdToService?.get(eventSource);
    return svc ? { entity: { id: svc.entityId } } : undefined;
  }

  generateDocuments(org: Organization, correlationMap: CorrelationMap) {
    this.serviceIdToService = correlationMap.serviceIdToService;
    // ... emit docs ...
  }

  private createApiCallEvent(...) {
    const service = this.serviceAttachmentFor(serviceConfig.eventSource);
    return {
      '@timestamp': timestamp,
      message: JSON.stringify(rawEvent),
      data_stream: { ... },
      ...(service && { service }),
    } as IntegrationDocument;
  }
}
```

See `src/commands/org_data/integrations/cloudtrail_integration.ts` for the full implementation
and `src/commands/org_data/integrations/gcp_integration.ts` for the GCP audit variant.

When the integration owns a fixed list of platform services (like GCP audit), source it from the
shared catalog (`CLOUD_PLATFORM_SERVICES.<provider>` in `data/services.ts`) rather than redefining
service IDs locally. Keep audit-specific data (method names, weights, etc.) in a separate map keyed
by the catalog id.

#### SaaS app sign-ins (Azure signinlogs, Okta SAML, GWS SAML)

A fraction of sign-in events represent a SaaS app authenticating to the IdP rather than a user
sign-in. Pick a SaaS service from `org.services.filter(s => s.kind === 'saas_app')`, inject the
vendor-specific raw fields the pipeline expects so it can derive `service.name`, and attach
`service.entity.id` directly on the doc.

Example from `src/commands/org_data/integrations/azure_integration.ts` (signinlogs):

```typescript
const isServicePrincipalSignIn =
  this.saasServices.length > 0 &&
  faker.helpers.weightedArrayElement([
    { value: true, weight: 25 },
    { value: false, weight: 75 },
  ]);
const saasService = isServicePrincipalSignIn
  ? faker.helpers.arrayElement(this.saasServices)
  : undefined;

// ...

const rawAzureJson = {
  // ...
  properties: {
    // ... user fields ...
    ...(saasService && {
      servicePrincipalName: saasService.name, // pipeline -> service.name
      servicePrincipalId: saasService.id,
    }),
  },
};

return {
  '@timestamp': timestamp,
  message: JSON.stringify(rawAzureJson),
  data_stream: { ... },
  ...(saasService && { service: { entity: { id: saasService.entityId } } }),
} as IntegrationDocument;
```

#### Pipeline-only integrations (namespaced `service.name`)

Some integrations only populate a namespaced field like `google_workspace.admin.service.name`
(not the top-level ECS `service.name`). For these, just include the raw field the pipeline
renames -- e.g. a `SERVICE_NAME` parameter in `events.parameters` for Google Workspace admin --
and do **not** attach a top-level `service.entity.id` (the namespaced field doesn't represent an
ECS Service entity).

See `src/commands/org_data/integrations/google_workspace_integration.ts:adminDoc()` for the
example.

#### When to skip

Do **not** attach `service.entity.id` when:

- The event isn't clearly attributable to a single service (e.g. a generic firewall log, an
  endpoint process event).
- The integration's `service.name` is namespaced (see previous section).

When in doubt, leave it off rather than synthesizing entity IDs that wouldn't exist in real data.

### Step 4: Register the Integration (New Integrations Only)

For new integrations, update three files:

**`src/commands/org_data/integrations/index.ts`**:

1. Add the import: `import { MyIntegration } from './my_integration';`
2. Add the export: `export { MyIntegration } from './my_integration';`
3. Register in `createIntegrationRegistry()`: `registry.set('my_integration', new MyIntegration());`
4. Add to `getAvailableIntegrations()` return array

**`src/commands/org_data/types.ts`**:

Add the new name to the `IntegrationName` union type:

```typescript
export type IntegrationName =
  | 'okta'
  // ... existing names ...
  | 'my_integration';
```

**`src/commands/org_data/org_data.ts`** (optional):

If the integration should be included in the default set or quick mode, add it to the `validateOptions` integration list and/or `runOrgDataQuick`.

### Step 5: Add Detection Rules

Add sample detection rules so the integration produces alerts when `--detection-rules` is passed.

**Skip this step** for entity-store-only integrations listed in `EXCLUDED_INTEGRATIONS`
(okta, entra_id, active_directory, cloud_asset, workday, ping_directory).

**File**: `src/commands/org_data/detection_rules.ts`

Add an entry to the `INTEGRATION_DETECTION_RULES` map keyed by the integration's `IntegrationName`.
Each entry is an array of `DetectionRuleDefinition` objects:

```typescript
interface DetectionRuleDefinition {
  name: string;
  description: string;
  query: string; // KQL query
  severity: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number; // 0-100
  index: string[]; // e.g. ['logs-<package>.<dataset>-*']
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

### Step 8: Update This Skill

After completing the integration work, update this skill file to reflect any changes made during
the session. This keeps the skill accurate for future use.

Review and update the following sections if any of them changed:

1. **Stable fields on Employee / Device** (Step 3b tables) -- if you added a new vendor-specific
   ID field (e.g. `gitlabUserId`), add it to the corresponding table.

2. **CorrelationMap extension steps** (Step 3b "When to extend") -- if the file paths or interface
   shape changed, update the instructions.

3. **Endpoint data streams table** (Step 1) -- if new data streams were added or removed in the
   endpoint-package repo, update the table.

4. **Registration steps** (Step 4) -- if the registration pattern changed (e.g. new files to
   update, changed function names), update accordingly.

5. **Detection rules pattern** (Step 5) -- if the `DetectionRuleDefinition` interface or
   `INTEGRATION_DETECTION_RULES` structure changed, reflect it.

6. **Service catalog and `service.entity.id` patterns** (Step 3b "Stable fields on Service" and
   Step 3d) -- if the integration introduced a new SaaS app, cloud platform service, or org-service
   template, add it to `src/commands/org_data/data/services.ts`. If the attachment pattern changed
   or a new pattern emerged (beyond the cloud-platform / SaaS-sign-in / pipeline-only cases), add
   a matching subsection to Step 3d.

7. **File locations table** -- if any paths moved or new key files were created, update the table
   at the bottom.

Only update sections where the session produced actual changes. Do not speculatively rewrite
unaffected sections.

## File Locations

| Resource                  | Path                                                                  |
| ------------------------- | --------------------------------------------------------------------- |
| Integration classes       | `src/commands/org_data/integrations/`                                 |
| Base class                | `src/commands/org_data/integrations/base_integration.ts`              |
| Integration registry      | `src/commands/org_data/integrations/index.ts`                         |
| Types (IntegrationName)   | `src/commands/org_data/types.ts`                                      |
| Main command              | `src/commands/org_data/org_data.ts`                                   |
| Organization generator    | `src/commands/org_data/org_data_generator.ts`                         |
| Correlation builder       | `src/commands/org_data/correlation.ts`                                |
| Detection rules           | `src/commands/org_data/detection_rules.ts`                            |
| Service catalog           | `src/commands/org_data/data/services.ts`                              |
| Integrations repo         | `/Users/johndoe/repos/integrations/packages/`                         |
| Beats repo                | `/Users/johndoe/repos/beats/x-pack/filebeat/module/`                  |
| Endpoint-package repo     | `/Users/johndoe/repos/endpoint-package/`                              |
| Endpoint package manifest | `/Users/johndoe/repos/endpoint-package/package/endpoint/manifest.yml` |
| Endpoint data streams     | `/Users/johndoe/repos/endpoint-package/package/endpoint/data_stream/` |
| Endpoint example events   | `/Users/johndoe/repos/endpoint-package/schemas/examples/v1/`          |
| Existing endpoint samples | `src/commands/privileged_user_monitoring/sample_documents.ts`         |
