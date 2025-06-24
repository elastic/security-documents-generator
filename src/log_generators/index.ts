// Main log generator exports
export { default as createSystemLog } from './system_logs';
export { default as createAuthLog } from './auth_logs';
export { default as createNetworkLog } from './network_logs';
export { default as createEndpointLog } from './endpoint_logs';

// Type exports
export type { SystemLogConfig } from './system_logs';
export type { AuthLogConfig } from './auth_logs';
export type { NetworkLogConfig } from './network_logs';
export type { EndpointLogConfig } from './endpoint_logs';

// Unified log generator that randomly selects from all types
import { faker } from '@faker-js/faker';
import createSystemLog from './system_logs';
import createAuthLog from './auth_logs';
import createNetworkLog from './network_logs';
import createEndpointLog from './endpoint_logs';

export interface UnifiedLogConfig {
  hostName?: string;
  userName?: string;
  timestampConfig?: import('../utils/timestamp_utils').TimestampConfig;
  logTypeWeights?: {
    system?: number;
    auth?: number;
    network?: number;
    endpoint?: number;
  };
  namespace?: string;
  sessionView?: boolean;
  visualAnalyzer?: boolean;
}

export function createRealisticLog(
  override = {},
  config: UnifiedLogConfig = {},
) {
  const {
    hostName = faker.internet.domainName(),
    userName = faker.internet.username(),
    timestampConfig,
    logTypeWeights = {
      system: 30,
      auth: 20,
      network: 35,
      endpoint: 15,
    },
    namespace = 'default',
    sessionView = false,
    visualAnalyzer = false,
  } = config;

  // Create weighted array of generators
  const generators = [
    ...Array(logTypeWeights.system || 30).fill(() =>
      createSystemLog(
        {},
        {
          hostName,
          userName,
          timestampConfig,
          namespace,
          sessionView,
          visualAnalyzer,
        },
      ),
    ),
    ...Array(logTypeWeights.auth || 20).fill(() =>
      createAuthLog(
        {},
        {
          hostName,
          userName,
          timestampConfig,
          namespace,
          sessionView,
          visualAnalyzer,
        },
      ),
    ),
    ...Array(logTypeWeights.network || 35).fill(() =>
      createNetworkLog(
        {},
        {
          hostName,
          userName,
          timestampConfig,
          namespace,
          sessionView,
          visualAnalyzer,
        },
      ),
    ),
    ...Array(logTypeWeights.endpoint || 15).fill(() =>
      createEndpointLog(
        {},
        {
          hostName,
          userName,
          timestampConfig,
          namespace,
          sessionView,
          visualAnalyzer,
        },
      ),
    ),
  ];

  const selectedGenerator = faker.helpers.arrayElement(generators);
  const baseLog = selectedGenerator();

  return {
    ...baseLog,
    ...override,
  };
}

// Helper function to get appropriate index name based on log type
export function getLogIndexForType(
  logType: string,
  namespace = 'default',
): string {
  const indexMap: Record<string, string> = {
    system: `logs-system.system-${namespace}`,
    auth: `logs-system.auth-${namespace}`,
    network: `logs-network.traffic-${namespace}`,
    endpoint: `logs-endpoint.events-${namespace}`,
    web: `logs-apache.access-${namespace}`,
    dns: `logs-network.dns-${namespace}`,
    firewall: `logs-iptables.log-${namespace}`,
  };

  return indexMap[logType] || `logs-generic-${namespace}`;
}

// Helper to get the correct dataset value for data streams
export function getDatasetForLogType(logType: string): string {
  const datasetMap: Record<string, string> = {
    system: 'system.system',
    auth: 'system.auth',
    network: 'network.traffic',
    endpoint: 'endpoint.events',
    web: 'apache.access',
    dns: 'network.dns',
    firewall: 'iptables.log',
  };

  return datasetMap[logType] || 'generic.log';
}

// Helper to determine log type from log content
export function detectLogType(log: any): string {
  if (log['data_stream.dataset']) {
    const dataset = log['data_stream.dataset'];
    if (dataset.includes('system')) return 'system';
    if (dataset.includes('auth') || dataset.includes('security')) return 'auth';
    if (
      dataset.includes('network') ||
      dataset.includes('dns') ||
      dataset.includes('apache')
    )
      return 'network';
    if (dataset.includes('endpoint')) return 'endpoint';
  }

  if (log['event.category']) {
    const categories = Array.isArray(log['event.category'])
      ? log['event.category']
      : [log['event.category']];
    if (categories.includes('authentication')) return 'auth';
    if (categories.includes('network') || categories.includes('web'))
      return 'network';
    if (categories.includes('process') || categories.includes('malware'))
      return 'endpoint';
    if (categories.includes('system')) return 'system';
  }

  return 'generic';
}
