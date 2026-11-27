import { faker } from '@faker-js/faker';
import {
  ENDPOINT_AGENT_VERSION,
  ENDPOINT_ALERTS_INDEX,
  POC_MOCK_TAG,
  type GeneratedDocument,
} from './types.ts';

/**
 * Elastic Defend alert types, with the `event.code` each one carries. Shapes follow the field lists in
 * endpoint-package `custom_documentation/doc/endpoint/alerts/linux/`. Never observed, so `poc-mock`.
 */
export type DefendAlertKind = 'malware' | 'memory_threat' | 'malicious_behavior';

const EVENT_CODE: Record<DefendAlertKind, string> = {
  malware: 'malicious_file',
  memory_threat: 'memory_signature',
  malicious_behavior: 'behavior',
};

const OS_DETAILS: Record<string, Record<string, string>> = {
  linux: {
    type: 'linux',
    family: 'amazon',
    name: 'Linux',
    platform: 'amzn',
    full: 'Amazon Linux 2023.9.20261118',
    kernel: '6.1.158-180.294.amzn2023.x86_64',
    version: '2023.9.20261118',
  },
  macos: {
    type: 'macos',
    family: 'darwin',
    name: 'macOS',
    platform: 'darwin',
    full: 'macOS 26.1',
    kernel: '25.1.0',
    version: '26.1',
  },
  windows: {
    type: 'windows',
    family: 'windows',
    name: 'Windows',
    platform: 'windows',
    full: 'Windows 11 Pro 24H2 (10.0.26100.7171)',
    kernel: '24H2 (10.0.26100.7171 Build 26100.7171)',
    version: '24H2 (10.0.26100.7171 Build 26100.7171)',
  },
};

export interface DefendAlertDetails {
  readonly kind: DefendAlertKind;
  /** Behaviour and memory threat rules are named. Malware alerts are named by their signature only. */
  readonly ruleName?: string;
  readonly signatureName: string;
  /** The file a malware alert is about. Defaults to the process executable. */
  readonly filePath?: string;
  readonly at?: number;
  readonly tactic?: { readonly id: string; readonly name: string };
  readonly technique?: { readonly id: string; readonly name: string };
}

const sha256 = (): string => faker.string.hexadecimal({ length: 64, casing: 'lower', prefix: '' });

type Source = Record<string, unknown>;

const PROCESS_EVENT_ONLY_FIELDS = ['end', 'exit_code', 'previous'];

/**
 * Builds a Defend alert on the process of an existing process event, copying `process` (with
 * `process.ai_agent`), `user`, `group` and `host` the way Defend attributes alerts. Malicious behaviour
 * alert docs don't list `process.ai_agent`, but their `process` is the primary event's, so it's kept.
 */
export const buildDefendAlert = (
  processEvent: GeneratedDocument,
  details: DefendAlertDetails,
): GeneratedDocument => {
  const event = processEvent.source;
  const at = details.at ?? Date.parse(String(event['@timestamp'])) + 120;
  const timestamp = new Date(at).toISOString();
  const host = event.host as { id: string; name: string; os: { type: string } };
  const agent = event.agent as { id: string };
  const process = { ...(event.process as Source) };
  for (const field of PROCESS_EVENT_ONLY_FIELDS) {
    delete process[field];
  }
  const executable = String(process.executable);
  const code = EVENT_CODE[details.kind];
  const severity = details.kind === 'malicious_behavior' ? 47 : 73;
  const ruleName =
    details.ruleName ?? (details.kind === 'malware' ? undefined : details.signatureName);
  const signature = {
    all_names: details.signatureName,
    identifier: `${details.signatureName.replace(/\./g, '_')}_${faker.string.alphanumeric(8).toLowerCase()}`,
    primary: {
      matches: [faker.string.hexadecimal({ length: 24, casing: 'lower', prefix: '' })],
      signature: {
        hash: { sha256: sha256() },
        id: faker.string.uuid(),
        name: details.signatureName,
      },
    },
    version: '1.0.0',
  };
  const filePath = details.filePath ?? executable;
  const fileName = filePath.split(/[/\\]/).pop() ?? filePath;

  const kindFields: Source =
    details.kind === 'malware'
      ? {
          file: {
            path: filePath,
            name: fileName,
            size: faker.number.int({ min: 2_000_000, max: 8_000_000 }),
            hash: {
              sha256: sha256(),
              sha1: faker.string.hexadecimal({ length: 40, casing: 'lower', prefix: '' }),
              md5: faker.string.hexadecimal({ length: 32, casing: 'lower', prefix: '' }),
            },
            Ext: {
              malware_classification: {
                identifier: 'endpointpe-v4-model',
                score: 0.99,
                threshold: 0.58,
                version: '4.0.42000',
              },
              malware_signature: signature,
              quarantine_result: false,
              quarantine_message: 'File quarantine is not supported on this platform',
            },
          },
        }
      : details.kind === 'memory_threat'
        ? {
            process: {
              ...process,
              Ext: {
                ...(process.Ext as Source),
                memory_region: {
                  allocation_base: faker.number.int({
                    min: 94_000_000_000_000,
                    max: 95_000_000_000_000,
                  }),
                  allocation_size: 2_097_152,
                  bytes_compressed_present: false,
                  malware_signature: signature,
                  region_protection: 'RWX',
                  region_size: 2_097_152,
                },
              },
            },
          }
        : {
            Events: [
              {
                '@timestamp': event['@timestamp'],
                _label: 'process_start',
                _state: 0,
                event: event.event,
                process,
                user: event.user,
              },
            ],
            threat: [
              {
                framework: 'MITRE ATT&CK',
                tactic: {
                  id: details.tactic?.id ?? 'TA0002',
                  name: details.tactic?.name ?? 'Execution',
                  reference: `https://attack.mitre.org/tactics/${details.tactic?.id ?? 'TA0002'}/`,
                },
                technique: [
                  {
                    id: details.technique?.id ?? 'T1059',
                    name: details.technique?.name ?? 'Command and Scripting Interpreter',
                    reference: `https://attack.mitre.org/techniques/${details.technique?.id ?? 'T1059'}/`,
                  },
                ],
              },
            ],
          };

  const message =
    details.kind === 'malware'
      ? 'Malware Detection Alert'
      : details.kind === 'memory_threat'
        ? `Memory Threat Detection Alert: ${details.signatureName}`
        : `Malicious Behavior Detection Alert: ${ruleName}`;

  return {
    index: ENDPOINT_ALERTS_INDEX,
    source: {
      '@timestamp': timestamp,
      agent: {
        id: agent.id,
        type: 'endpoint',
        version: ENDPOINT_AGENT_VERSION,
        build: { original: `version: ${ENDPOINT_AGENT_VERSION}` },
      },
      data_stream: { dataset: 'endpoint.alerts', namespace: 'default', type: 'logs' },
      ecs: { version: '8.10.0' },
      elastic: { agent: { id: agent.id } },
      Endpoint: {
        policy: {
          applied: {
            id: faker.string.uuid(),
            name: 'Defend AI agent hosts',
            version: '7',
            endpoint_policy_version: '3',
          },
        },
      },
      event: {
        kind: 'alert',
        module: 'endpoint',
        dataset: 'endpoint.alerts',
        code,
        action:
          details.kind === 'malware'
            ? ['execution']
            : details.kind === 'memory_threat'
              ? ['start']
              : ['rule_detection'],
        category:
          details.kind === 'malicious_behavior'
            ? ['malware', 'intrusion_detection', 'process']
            : ['malware', 'intrusion_detection'],
        type: ['info', 'allowed'],
        outcome: 'success',
        severity,
        risk_score: severity,
        created: timestamp,
        id: faker.string.alphanumeric(20),
      },
      host: {
        id: host.id,
        name: host.name,
        hostname: host.name,
        architecture: host.os.type === 'macos' ? 'arm64' : 'x86_64',
        os: OS_DETAILS[host.os.type] ?? OS_DETAILS.linux,
      },
      message,
      process,
      ...(ruleName && {
        rule: {
          id: faker.string.uuid(),
          name: ruleName,
          ruleset: 'production',
          ...(details.kind === 'malicious_behavior' && {
            description: `Identifies ${ruleName.toLowerCase()}.`,
            version: '1.0.0',
          }),
        },
      }),
      user: event.user,
      group: event.group,
      tags: [POC_MOCK_TAG],
      ...kindFields,
    },
  };
};
