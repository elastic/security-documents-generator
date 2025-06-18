// Main log generator exports
export { default as createSystemLog } from './system_logs';
export { default as createAuthLog } from './auth_logs';
export { default as createNetworkLog } from './network_logs';
export { default as createEndpointLog } from './endpoint_logs';
// Unified log generator that randomly selects from all types
import { faker } from '@faker-js/faker';
import createSystemLog from './system_logs';
import createAuthLog from './auth_logs';
import createNetworkLog from './network_logs';
import createEndpointLog from './endpoint_logs';
export function createRealisticLog(override = {}, config = {}) {
    const { hostName = faker.internet.domainName(), userName = faker.internet.username(), timestampConfig, logTypeWeights = {
        system: 30,
        auth: 20,
        network: 35,
        endpoint: 15,
    }, } = config;
    // Create weighted array of generators
    const generators = [
        ...Array(logTypeWeights.system || 30).fill(() => createSystemLog({}, { hostName, userName, timestampConfig })),
        ...Array(logTypeWeights.auth || 20).fill(() => createAuthLog({}, { hostName, userName, timestampConfig })),
        ...Array(logTypeWeights.network || 35).fill(() => createNetworkLog({}, { hostName, userName, timestampConfig })),
        ...Array(logTypeWeights.endpoint || 15).fill(() => createEndpointLog({}, { hostName, userName, timestampConfig })),
    ];
    const selectedGenerator = faker.helpers.arrayElement(generators);
    const baseLog = selectedGenerator();
    return {
        ...baseLog,
        ...override,
    };
}
// Helper function to get appropriate index name based on log type
export function getLogIndexForType(logType, namespace = 'default') {
    const indexMap = {
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
export function getDatasetForLogType(logType) {
    const datasetMap = {
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
export function detectLogType(log) {
    if (log['data_stream.dataset']) {
        const dataset = log['data_stream.dataset'];
        if (dataset.includes('system'))
            return 'system';
        if (dataset.includes('auth') || dataset.includes('security'))
            return 'auth';
        if (dataset.includes('network') ||
            dataset.includes('dns') ||
            dataset.includes('apache'))
            return 'network';
        if (dataset.includes('endpoint'))
            return 'endpoint';
    }
    if (log['event.category']) {
        const categories = Array.isArray(log['event.category'])
            ? log['event.category']
            : [log['event.category']];
        if (categories.includes('authentication'))
            return 'auth';
        if (categories.includes('network') || categories.includes('web'))
            return 'network';
        if (categories.includes('process') || categories.includes('malware'))
            return 'endpoint';
        if (categories.includes('system'))
            return 'system';
    }
    return 'generic';
}
