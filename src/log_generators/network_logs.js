import { faker } from '@faker-js/faker';
import { generateTimestamp } from '../utils/timestamp_utils';
const COMMON_PORTS = [
    80, 443, 22, 23, 21, 25, 53, 110, 143, 993, 995, 3389, 5985, 5986,
];
const SUSPICIOUS_PORTS = [4444, 1234, 31337, 8080, 9999, 6666, 1337];
const DNS_QUERY_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'PTR'];
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'];
const HTTP_STATUS_CODES = [
    200, 201, 301, 302, 400, 401, 403, 404, 500, 502, 503,
];
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
    'curl/7.68.0', // Suspicious
    'python-requests/2.25.1', // Suspicious
    'Wget/1.20.3', // Suspicious
];
export const generateNetworkConnectionLog = (config = {}) => {
    const { hostName = faker.internet.domainName(), userName = faker.internet.username(), timestampConfig, } = config;
    const sourceIp = faker.internet.ip();
    const destIp = faker.internet.ip();
    const destPort = faker.helpers.arrayElement([
        ...COMMON_PORTS,
        ...SUSPICIOUS_PORTS,
    ]);
    const protocol = faker.helpers.arrayElement(['tcp', 'udp', 'icmp']);
    const action = faker.helpers.arrayElement(['allowed', 'blocked', 'dropped']);
    return {
        '@timestamp': generateTimestamp(timestampConfig),
        'agent.type': 'packetbeat',
        'agent.version': '8.15.0',
        'data_stream.dataset': 'network.flows',
        'data_stream.namespace': 'default',
        'data_stream.type': 'logs',
        'ecs.version': '8.11.0',
        'event.action': action,
        'event.category': ['network'],
        'event.dataset': 'network.flows',
        'event.duration': faker.number.int({ min: 1000000, max: 10000000 }), // nanoseconds
        'event.kind': 'event',
        'event.module': 'network',
        'event.outcome': action === 'allowed' ? 'success' : 'failure',
        'event.type': ['connection'],
        'host.name': hostName,
        'network.bytes': faker.number.int({ min: 64, max: 1048576 }),
        'network.community_id': faker.string.alphanumeric(32),
        'network.direction': faker.helpers.arrayElement(['inbound', 'outbound']),
        'network.packets': faker.number.int({ min: 1, max: 1000 }),
        'network.protocol': protocol,
        'network.transport': protocol === 'icmp' ? 'icmp' : protocol,
        'source.ip': sourceIp,
        'source.port': faker.internet.port(),
        'destination.ip': destIp,
        'destination.port': destPort,
        'related.ip': [sourceIp, destIp],
        'user.name': userName,
    };
};
export const generateDNSLog = (config = {}) => {
    const { hostName = faker.internet.domainName(), userName = faker.internet.username(), timestampConfig, } = config;
    const queryType = faker.helpers.arrayElement(DNS_QUERY_TYPES);
    const domain = faker.internet.domainName();
    const responseCode = faker.helpers.arrayElement([
        'NOERROR',
        'NXDOMAIN',
        'SERVFAIL',
        'REFUSED',
    ]);
    return {
        '@timestamp': generateTimestamp(timestampConfig),
        'agent.type': 'packetbeat',
        'agent.version': '8.15.0',
        'data_stream.dataset': 'network.dns',
        'data_stream.namespace': 'default',
        'data_stream.type': 'logs',
        'dns.answers': responseCode === 'NOERROR'
            ? [
                {
                    class: 'IN',
                    data: queryType === 'A' ? faker.internet.ip() : domain,
                    name: domain,
                    ttl: faker.number.int({ min: 300, max: 86400 }),
                    type: queryType,
                },
            ]
            : [],
        'dns.header_flags': ['RD', 'RA'],
        'dns.id': faker.number.int({ min: 1, max: 65535 }),
        'dns.op_code': 'QUERY',
        'dns.question.class': 'IN',
        'dns.question.name': domain,
        'dns.question.registered_domain': domain.split('.').slice(-2).join('.'),
        'dns.question.subdomain': domain.split('.')[0],
        'dns.question.top_level_domain': domain.split('.').pop(),
        'dns.question.type': queryType,
        'dns.response_code': responseCode,
        'ecs.version': '8.11.0',
        'event.category': ['network'],
        'event.dataset': 'network.dns',
        'event.duration': faker.number.int({ min: 1000000, max: 100000000 }),
        'event.kind': 'event',
        'event.module': 'network',
        'event.outcome': responseCode === 'NOERROR' ? 'success' : 'failure',
        'event.type': ['protocol'],
        'host.name': hostName,
        'network.community_id': faker.string.alphanumeric(32),
        'network.protocol': 'dns',
        'network.transport': 'udp',
        'source.ip': faker.internet.ip(),
        'source.port': faker.internet.port(),
        'destination.ip': '8.8.8.8',
        'destination.port': 53,
        'user.name': userName,
        'related.hosts': [domain],
    };
};
export const generateHTTPLog = (config = {}) => {
    const { hostName = faker.internet.domainName(), userName = faker.internet.username(), timestampConfig, } = config;
    const method = faker.helpers.arrayElement(HTTP_METHODS);
    const statusCode = faker.helpers.arrayElement(HTTP_STATUS_CODES);
    const userAgent = faker.helpers.arrayElement(USER_AGENTS);
    const url = `https://${faker.internet.domainName()}${faker.internet.url()}`;
    return {
        '@timestamp': generateTimestamp(timestampConfig),
        'agent.type': 'filebeat',
        'agent.version': '8.15.0',
        'data_stream.dataset': 'apache.access',
        'data_stream.namespace': 'default',
        'data_stream.type': 'logs',
        'ecs.version': '8.11.0',
        'event.category': ['web'],
        'event.dataset': 'apache.access',
        'event.kind': 'event',
        'event.module': 'apache',
        'event.outcome': statusCode < 400 ? 'success' : 'failure',
        'event.type': ['access'],
        'host.name': hostName,
        'http.request.body.bytes': faker.number.int({ min: 0, max: 10240 }),
        'http.request.method': method,
        'http.request.referrer': faker.helpers.maybe(() => faker.internet.url(), {
            probability: 0.6,
        }),
        'http.response.body.bytes': faker.number.int({ min: 200, max: 1048576 }),
        'http.response.status_code': statusCode,
        'http.version': '1.1',
        'log.file.path': '/var/log/apache2/access.log',
        'source.address': faker.internet.ip(),
        'source.ip': faker.internet.ip(),
        'url.domain': faker.internet.domainName(),
        'url.original': url,
        'url.path': faker.internet.url(),
        'url.query': faker.helpers.maybe(() => `q=${faker.lorem.word()}`, {
            probability: 0.4,
        }),
        'user.name': userName,
        'user_agent.device.name': 'Other',
        'user_agent.name': userAgent.includes('Mozilla') ? 'Chrome' : 'Other',
        'user_agent.original': userAgent,
        'user_agent.os.name': faker.helpers.arrayElement([
            'Windows',
            'macOS',
            'Linux',
        ]),
        'related.ip': [faker.internet.ip()],
        'related.user': [userName],
    };
};
export const generateFirewallLog = (config = {}) => {
    const { hostName = faker.internet.domainName(), timestampConfig } = config;
    const action = faker.helpers.arrayElement(['ACCEPT', 'DROP', 'REJECT']);
    const protocol = faker.helpers.arrayElement(['TCP', 'UDP', 'ICMP']);
    const sourceIp = faker.internet.ip();
    const destIp = faker.internet.ip();
    return {
        '@timestamp': generateTimestamp(timestampConfig),
        'agent.type': 'filebeat',
        'agent.version': '8.15.0',
        'data_stream.dataset': 'iptables.log',
        'data_stream.namespace': 'default',
        'data_stream.type': 'logs',
        'ecs.version': '8.11.0',
        'event.action': action.toLowerCase(),
        'event.category': ['network'],
        'event.dataset': 'iptables.log',
        'event.kind': 'event',
        'event.module': 'iptables',
        'event.outcome': action === 'ACCEPT' ? 'success' : 'failure',
        'event.type': ['denied'],
        'host.name': hostName,
        'iptables.input_device': faker.helpers.arrayElement([
            'eth0',
            'wlan0',
            'lo',
        ]),
        'iptables.output_device': faker.helpers.arrayElement([
            'eth0',
            'wlan0',
            'lo',
        ]),
        'log.file.path': '/var/log/iptables.log',
        'log.level': 'info',
        'network.bytes': faker.number.int({ min: 40, max: 1500 }),
        'network.community_id': faker.string.alphanumeric(32),
        'network.iana_number': protocol === 'TCP' ? '6' : protocol === 'UDP' ? '17' : '1',
        'network.packets': 1,
        'network.transport': protocol.toLowerCase(),
        'rule.name': `${action}_${protocol}`,
        'source.ip': sourceIp,
        'source.port': faker.internet.port(),
        'destination.ip': destIp,
        'destination.port': faker.helpers.arrayElement([
            ...COMMON_PORTS,
            ...SUSPICIOUS_PORTS,
        ]),
        'related.ip': [sourceIp, destIp],
    };
};
export default function createNetworkLog(override = {}, config = {}) {
    const logGenerators = [
        generateNetworkConnectionLog,
        generateDNSLog,
        generateHTTPLog,
        generateFirewallLog,
    ];
    // Weight different log types for realism
    const weightedGenerators = [
        ...Array(4).fill(generateNetworkConnectionLog),
        ...Array(3).fill(generateHTTPLog),
        ...Array(2).fill(generateDNSLog),
        generateFirewallLog,
    ];
    const selectedGenerator = faker.helpers.arrayElement(weightedGenerators);
    const baseLog = selectedGenerator(config);
    return {
        ...baseLog,
        ...override,
    };
}
