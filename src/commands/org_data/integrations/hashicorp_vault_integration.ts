/**
 * HashiCorp Vault Integration
 * Generates audit and operational log documents for HashiCorp Vault
 * Based on the Elastic hashicorp_vault integration package
 */

import { BaseIntegration, IntegrationDocument, DataStreamConfig } from './base_integration';
import { Organization, Employee, CorrelationMap } from '../types';
import { faker } from '@faker-js/faker';

const VAULT_OPERATIONS: Array<{
  operation: string;
  path: string;
  weight: number;
}> = [
  { operation: 'read', path: 'secret/data/app-config', weight: 20 },
  { operation: 'read', path: 'secret/data/database/credentials', weight: 15 },
  { operation: 'read', path: 'secret/data/api-keys', weight: 12 },
  { operation: 'list', path: 'secret/metadata/', weight: 10 },
  { operation: 'read', path: 'secret/data/tls/certificates', weight: 8 },
  { operation: 'create', path: 'secret/data/app-config', weight: 5 },
  { operation: 'update', path: 'secret/data/api-keys', weight: 5 },
  { operation: 'create', path: 'auth/token/create', weight: 8 },
  { operation: 'read', path: 'auth/token/lookup-self', weight: 10 },
  { operation: 'update', path: 'sys/policy/default', weight: 3 },
  { operation: 'read', path: 'sys/policy/default', weight: 5 },
  { operation: 'delete', path: 'secret/data/deprecated-key', weight: 2 },
  { operation: 'read', path: 'pki/cert/ca', weight: 5 },
  { operation: 'create', path: 'pki/issue/server', weight: 3 },
  { operation: 'read', path: 'transit/keys/app-key', weight: 4 },
  { operation: 'create', path: 'transit/encrypt/app-key', weight: 4 },
];

const VAULT_TOKEN_TYPES = ['service', 'batch'] as const;

const VAULT_AUTH_METHODS = ['token', 'ldap', 'oidc', 'userpass', 'approle'] as const;

const VAULT_NAMESPACES = ['root', 'admin/', 'engineering/', 'operations/'] as const;

/** Raw Vault audit log format (pre-pipeline). Pipeline parses message → event.original → hashicorp_vault.audit */
interface RawVaultAuditEvent {
  time: string;
  type: 'request' | 'response';
  auth: {
    client_token: string;
    accessor: string;
    display_name: string;
    policies: string[];
    token_type: string;
    metadata: { email?: string; account_id?: string };
  };
  request: {
    id: string;
    operation: string;
    path: string;
    remote_address: string;
    remote_port: number;
    namespace: { id: string; path?: string };
    mount_accessor?: string;
    mount_type?: string;
  };
  response: { data?: Record<string, unknown> };
  error: string;
}

const LOG_MESSAGES: Array<{
  message: string;
  level: string;
  weight: number;
}> = [
  { message: 'core: sealed', level: 'info', weight: 2 },
  { message: 'core: unsealed with 3 key shares and target of 5', level: 'info', weight: 2 },
  { message: 'core: successfully setup plugin catalog', level: 'info', weight: 5 },
  { message: 'core: post-unseal setup complete', level: 'info', weight: 5 },
  { message: 'core: vault is unsealed', level: 'info', weight: 8 },
  { message: 'storage.raft: committed', level: 'debug', weight: 15 },
  { message: 'core: leadership acquired', level: 'info', weight: 3 },
  { message: 'core: leadership lost', level: 'warn', weight: 2 },
  { message: 'expiration: revoked lease', level: 'info', weight: 10 },
  { message: 'expiration: lease renewed', level: 'info', weight: 12 },
  { message: 'audit: request completed', level: 'debug', weight: 15 },
  { message: 'proxy environment', level: 'info', weight: 3 },
  { message: 'identity: entity created', level: 'info', weight: 4 },
  { message: 'identity: alias created', level: 'info', weight: 3 },
  { message: 'rollback: attempting rollback', level: 'info', weight: 5 },
  { message: 'connection attempt failed, retrying', level: 'warn', weight: 3 },
];

export class HashiCorpVaultIntegration extends BaseIntegration {
  readonly packageName = 'hashicorp_vault';
  readonly displayName = 'HashiCorp Vault';

  readonly dataStreams: DataStreamConfig[] = [
    { name: 'audit', index: 'logs-hashicorp_vault.audit-default' },
    { name: 'log', index: 'logs-hashicorp_vault.log-default' },
  ];

  generateDocuments(
    org: Organization,
    _correlationMap: CorrelationMap,
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const auditDocs: IntegrationDocument[] = [];
    const logDocs: IntegrationDocument[] = [];

    const vaultEmployees = org.employees.filter((e) => e.hasAwsAccess);

    for (const employee of vaultEmployees) {
      const auditCount = faker.number.int({ min: 2, max: 6 });
      for (let i = 0; i < auditCount; i++) {
        auditDocs.push(this.createAuditDocument(employee));
      }
    }

    const logCount = Math.max(5, Math.ceil(org.employees.length * 0.3));
    for (let i = 0; i < logCount; i++) {
      logDocs.push(this.createLogDocument());
    }

    documentsMap.set(this.dataStreams[0].index, auditDocs);
    documentsMap.set(this.dataStreams[1].index, logDocs);
    return documentsMap;
  }

  private createAuditDocument(employee: Employee): IntegrationDocument {
    const op = faker.helpers.weightedArrayElement(
      VAULT_OPERATIONS.map((o) => ({ value: o, weight: o.weight })),
    );
    const timestamp = this.getRandomTimestamp(72);
    const sourceIp = faker.internet.ipv4();
    const accessor = faker.string.alphanumeric(22);
    const clientToken = faker.string.alphanumeric(26);
    const authMethod = faker.helpers.arrayElement(VAULT_AUTH_METHODS);
    const tokenType = faker.helpers.arrayElement(VAULT_TOKEN_TYPES);
    const namespace = faker.helpers.arrayElement(VAULT_NAMESPACES);
    const policies = this.pickPolicies(op.operation);
    const mountType = this.getMountType(op.path);
    const mountAccessor = `${mountType}_${faker.string.alphanumeric(8)}`;
    const requestId = faker.string.uuid();

    const isError = faker.helpers.weightedArrayElement([
      { value: false, weight: 92 },
      { value: true, weight: 8 },
    ]);
    const errorMsg = isError ? 'permission denied' : undefined;

    const rawVaultAuditEvent: RawVaultAuditEvent = {
      time: timestamp,
      type: 'request',
      auth: {
        client_token: clientToken,
        accessor,
        display_name: `${authMethod}-${employee.userName}`,
        policies,
        token_type: tokenType,
        metadata: {
          email: employee.email,
          account_id: employee.employeeNumber,
        },
      },
      request: {
        id: requestId,
        operation: op.operation,
        path: op.path,
        remote_address: sourceIp,
        remote_port: faker.number.int({ min: 30000, max: 65535 }),
        namespace: {
          id: namespace === 'root' ? 'root' : faker.string.alphanumeric(5),
          path: namespace,
        },
        mount_accessor: mountAccessor,
        mount_type: mountType,
      },
      response: isError ? { data: { error: errorMsg } } : { data: {} },
      error: errorMsg ?? '',
    };

    return {
      '@timestamp': timestamp,
      message: JSON.stringify(rawVaultAuditEvent),
      data_stream: { namespace: 'default', type: 'logs', dataset: 'hashicorp_vault.audit' },
    } as IntegrationDocument;
  }

  private createLogDocument(): IntegrationDocument {
    const logEvt = faker.helpers.weightedArrayElement(
      LOG_MESSAGES.map((l) => ({ value: l, weight: l.weight })),
    );
    const timestamp = this.getRandomTimestamp(72);

    return {
      '@timestamp': timestamp,
      message: logEvt.message,
      data_stream: { namespace: 'default', type: 'logs', dataset: 'hashicorp_vault.log' },
    } as IntegrationDocument;
  }

  private pickPolicies(operation: string): string[] {
    const basePolicies = ['default'];
    if (operation === 'read' || operation === 'list') {
      basePolicies.push('secret-reader');
    }
    if (operation === 'create' || operation === 'update' || operation === 'delete') {
      basePolicies.push('secret-writer');
    }
    if (faker.datatype.boolean(0.2)) {
      basePolicies.push('admin');
    }
    return basePolicies;
  }

  private getMountType(path: string): string {
    if (path.startsWith('secret/')) return 'kv';
    if (path.startsWith('auth/')) return 'token';
    if (path.startsWith('sys/')) return 'system';
    if (path.startsWith('pki/')) return 'pki';
    if (path.startsWith('transit/')) return 'transit';
    return 'kv';
  }
}
