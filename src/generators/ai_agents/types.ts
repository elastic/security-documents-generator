export type AiAgentName = 'claude_code' | 'cursor';

/** How the agent's session was started, which drives the Defend session context. */
export type SessionKind = 'interactive' | 'ssh_scripted' | 'cron';

/** Whether the OS user's login shell sources nvm, which changes the size of Claude's Bash preamble. */
export type ShellProfile = 'nvm' | 'plain';

export interface PosixGroup {
  readonly name: string;
  readonly id: number;
}

/** Only Linux was observed. macOS and Windows hosts are inferred and their documents are `poc-mock`. */
export type HostOs = 'linux' | 'macos' | 'windows';

export interface AgentHost {
  /** Defend `host.id`: a 32 character hex machine ID on Linux. */
  readonly id: string;
  readonly name: string;
  readonly ip: string;
  readonly resolverIp: string;
  readonly elasticAgentId: string;
  /** Defaults to `linux`. */
  readonly os?: HostOs;
}

export interface OsUser {
  readonly name: string;
  readonly id: number;
  readonly home: string;
  readonly supplementalGroups: readonly PosixGroup[];
  readonly shellProfile: ShellProfile;
  readonly nodeVersion: string;
}

export interface AgentIdentity {
  readonly email: string;
  /**
   * `during` signs in partway through an interactive session, so earlier events carry no email.
   * `never` is an install that only uses an API key, so no event carries an email (extrapolated).
   */
  readonly signIn: 'before' | 'during' | 'never';
}

export interface GeneratedDocument {
  readonly index: string;
  readonly source: Record<string, unknown>;
}

export const ENDPOINT_PROCESS_INDEX = 'logs-endpoint.events.process-default';
export const ENDPOINT_FILE_INDEX = 'logs-endpoint.events.file-default';
export const ENDPOINT_NETWORK_INDEX = 'logs-endpoint.events.network-default';
export const ENDPOINT_ALERTS_INDEX = 'logs-endpoint.alerts-default';
export const OSQUERY_RESULT_INDEX = 'logs-osquery_manager.result-default';
export const CLAUDE_CODE_OTEL_INDEX = 'logs-claude_code.events.otel-default';
export const CURSOR_AUDIT_INDEX = 'logs-cursor.audit-default';
export const OKTA_USER_INDEX = 'logs-entityanalytics_okta.user-default';
export const ENTRA_USER_INDEX = 'logs-entityanalytics_entra_id.user-default';

/** Marks documents shaped only from published schemas or inferred, never observed. */
export const POC_MOCK_TAG = 'poc-mock';

export const CLAUDE_CODE_VERSION = '2.1.332';
export const CURSOR_AGENT_VERSION = '2026.11.22-e9042b2';
export const ENDPOINT_AGENT_VERSION = '9.6.0';
export const OSQUERY_AGENT_VERSION = '9.6.0';
