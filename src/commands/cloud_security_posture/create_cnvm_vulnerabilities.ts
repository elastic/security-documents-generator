import { faker } from '@faker-js/faker';
import moment from 'moment';
import { CSP_AGENT_VERSION, getRandomCve, pickSeverity, CSPMAccount } from './csp_utils';

export interface CreateCNVMVulnerabilityParams {
  account?: CSPMAccount;
}

// CNVM = Cloud Native Vulnerability Management (AWS only)
export default function createCNVMVulnerability({ account }: CreateCNVMVulnerabilityParams = {}) {
  const now = moment().format('yyyy-MM-DDTHH:mm:ss.SSSSSSZ');
  const cve = getRandomCve();
  const severity = pickSeverity();
  const accountId = account?.id || faker.string.numeric(12);
  const accountName = account?.name || `aws-account-${faker.word.noun()}`;
  const agentId = faker.string.uuid();
  const instanceId = `i-${faker.string.alphanumeric(17)}`;
  const hostname = `ip-${faker.number.int({ min: 10, max: 192 })}-${faker.number.int({ min: 0, max: 255 })}-${faker.number.int({ min: 0, max: 255 })}-${faker.number.int({ min: 1, max: 254 })}.ec2.internal`;

  // Package info
  const packageTypes = ['rpm', 'deb', 'apk', 'gobinary', 'jar', 'npm', 'pip'];
  const packageType = faker.helpers.arrayElement(packageTypes);
  const packageVersion = `${faker.number.int({ min: 1, max: 5 })}.${faker.number.int({ min: 0, max: 30 })}.${faker.number.int({ min: 0, max: 99 })}`;

  const region = faker.helpers.arrayElement([
    'us-east-1',
    'us-west-2',
    'eu-west-1',
    'eu-central-1',
    'ap-southeast-1',
  ]);

  return {
    '@timestamp': now,
    agent: {
      ephemeral_id: faker.string.uuid(),
      id: agentId,
      name: hostname,
      type: 'cloudbeat',
      version: CSP_AGENT_VERSION,
    },
    cloud: {
      Security: {
        security_groups: {
          group_id: `sg-${faker.string.alphanumeric(17)}`,
          group_name: `security-group-${faker.word.noun()}`,
        },
      },
      Tags: {
        Name: `${faker.word.adjective()}-${faker.word.noun()}-instance`,
        deployment: faker.word.noun(),
        division: 'engineering',
        ec2_type: 'cnvm',
        id: faker.string.uuid(),
        org: faker.helpers.arrayElement(['security', 'platform', 'data']),
        owner: 'cloudbeat',
        project: faker.word.noun(),
        provisioner: faker.helpers.arrayElement(['terraform', 'cloudformation', 'cdk']),
        team: 'cloud-security-posture',
      },
      account: {
        id: accountId,
        name: accountName,
      },
      availability_zone: `${region}${faker.helpers.arrayElement(['a', 'b', 'c'])}`,
      instance: {
        id: instanceId,
        name: `${faker.word.adjective()}-instance-${faker.string.alphanumeric(3)}`,
      },
      machine: {
        Authentication: {
          key: `cloudbeat-generated-${faker.string.uuid()}`,
        },
        Image: `ami-${faker.string.alphanumeric(17)}`,
        Launch_time: moment()
          .subtract(faker.number.int({ min: 1, max: 365 }), 'days')
          .format('yyyy-MM-DDTHH:mm:ss.SSSSSSZ'),
        type: faker.helpers.arrayElement([
          't3.micro',
          't3.small',
          't3.medium',
          'm5.large',
          'm5.xlarge',
          'c5.xlarge',
          'c5.2xlarge',
        ]),
      },
      provider: 'aws',
      region,
      service: {
        name: 'AWS EC2',
      },
    },
    cloud_security_posture: {
      package_policy: {
        id: faker.string.uuid(),
        revision: faker.number.int({ min: 1, max: 20 }),
      },
    },
    cloudbeat: {
      commit_time: '0001-01-01T00:00:00.000Z',
      version: CSP_AGENT_VERSION,
    },
    data_stream: {
      dataset: 'cloud_security_posture.vulnerabilities',
      namespace: 'default',
      type: 'logs',
    },
    ecs: {
      version: '8.6.0',
    },
    elastic_agent: {
      id: agentId,
      version: CSP_AGENT_VERSION,
      snapshot: false,
    },
    event: {
      agent_id_status: 'verified',
      category: ['vulnerability'],
      created: now,
      dataset: 'cloud_security_posture.vulnerabilities',
      id: faker.string.uuid(),
      ingested: now,
      kind: 'state',
      outcome: 'success',
      sequence: faker.number.int({ min: 1000000000, max: 9999999999 }),
      type: ['info'],
    },
    host: {
      architecture: faker.helpers.arrayElement(['x86_64', 'aarch64']),
      name: hostname,
      os: {
        platform: 'Linux/UNIX',
        family: 'linux',
        name: faker.helpers.arrayElement([
          'Amazon Linux 2',
          'Amazon Linux 2023',
          'Ubuntu',
          'RHEL',
          'CentOS',
        ]),
        version: faker.helpers.arrayElement(['2', '2023', '22.04', '8.8', '7.9']),
      },
    },
    network: {
      Mac_addresses: [faker.internet.mac()],
      Private_ip: faker.internet.ip(),
      Public_ip: faker.internet.ip(),
    },
    observer: {
      vendor: 'Elastic',
    },
    package: {
      fixed_version: cve.fixedVersion,
      name: cve.package,
      path: generatePackagePath(packageType, cve.package),
      type: packageType,
      version: packageVersion,
    },
    resource: {
      id: instanceId,
      name: hostname,
    },
    vulnerability: {
      category: getCveCategory(packageType),
      class: getCveCategory(packageType),
      classification: 'CVSS',
      cvss: generateCvssScores(severity),
      data_source: {
        ID: getDataSourceId(packageType),
        Name: getDataSourceName(packageType),
        URL: getDataSourceUrl(packageType),
      },
      description: generateVulnerabilityDescription(cve),
      enumeration: 'CVE',
      id: cve.id,
      package: {
        fixed_version: cve.fixedVersion,
        name: cve.package,
        version: packageVersion,
      },
      published_date: moment()
        .subtract(faker.number.int({ min: 30, max: 365 }), 'days')
        .format('yyyy-MM-DDTHH:mm:ss.SSSZ'),
      reference: `https://nvd.nist.gov/vuln/detail/${cve.id}`,
      report_id: `1.${faker.number.int({ min: 1000000000, max: 9999999999 })}E9`,
      scanner: {
        vendor: 'Trivy',
        version: 'v0.35.0',
      },
      score: {
        base: severityToScore(severity),
        version: '3.1',
      },
      severity,
      title: cve.title,
    },
  };
}

function generatePackagePath(packageType: string, packageName: string): string {
  switch (packageType) {
    case 'rpm':
    case 'deb':
      return `/usr/lib/${packageName}`;
    case 'apk':
      return `/usr/lib/apk/db/${packageName}`;
    case 'gobinary':
      return `/usr/local/bin/${packageName}`;
    case 'jar':
      return `/opt/app/lib/${packageName}.jar`;
    case 'npm':
      return `/app/node_modules/${packageName}`;
    case 'pip':
      return `/usr/local/lib/python3.10/site-packages/${packageName}`;
    default:
      return `/usr/lib/${packageName}`;
  }
}

function getCveCategory(packageType: string): string {
  switch (packageType) {
    case 'gobinary':
      return 'lang-pkgs';
    case 'jar':
      return 'lang-pkgs';
    case 'npm':
      return 'lang-pkgs';
    case 'pip':
      return 'lang-pkgs';
    default:
      return 'os-pkgs';
  }
}

function getDataSourceId(packageType: string): string {
  switch (packageType) {
    case 'gobinary':
      return 'govulndb';
    case 'jar':
      return 'ghsa';
    case 'npm':
      return 'npm';
    case 'pip':
      return 'osv';
    default:
      return 'nvd';
  }
}

function getDataSourceName(packageType: string): string {
  switch (packageType) {
    case 'gobinary':
      return 'The Go Vulnerability Database';
    case 'jar':
      return 'GitHub Security Advisory';
    case 'npm':
      return 'NPM Security Advisories';
    case 'pip':
      return 'Open Source Vulnerabilities';
    default:
      return 'National Vulnerability Database';
  }
}

function getDataSourceUrl(packageType: string): string {
  switch (packageType) {
    case 'gobinary':
      return 'https://pkg.go.dev/vuln/';
    case 'jar':
      return 'https://github.com/advisories';
    case 'npm':
      return 'https://www.npmjs.com/advisories';
    case 'pip':
      return 'https://osv.dev/';
    default:
      return 'https://nvd.nist.gov/';
  }
}

function generateCvssScores(severity: string): object {
  const score = severityToScore(severity);
  const vector = generateCvssVector();

  return {
    nvd: {
      V3Vector: vector,
      V3Score: score,
    },
    redhat: {
      V3Vector: vector,
      V3Score: score,
    },
  };
}

function severityToScore(severity: string): number {
  switch (severity) {
    case 'CRITICAL':
      return faker.number.float({ min: 9.0, max: 10.0, fractionDigits: 1 });
    case 'HIGH':
      return faker.number.float({ min: 7.0, max: 8.9, fractionDigits: 1 });
    case 'MEDIUM':
      return faker.number.float({ min: 4.0, max: 6.9, fractionDigits: 1 });
    case 'LOW':
      return faker.number.float({ min: 0.1, max: 3.9, fractionDigits: 1 });
    default:
      return 5.0;
  }
}

function generateCvssVector(): string {
  const av = faker.helpers.arrayElement(['N', 'A', 'L', 'P']); // Attack Vector
  const ac = faker.helpers.arrayElement(['L', 'H']); // Attack Complexity
  const pr = faker.helpers.arrayElement(['N', 'L', 'H']); // Privileges Required
  const ui = faker.helpers.arrayElement(['N', 'R']); // User Interaction
  const s = faker.helpers.arrayElement(['U', 'C']); // Scope
  const c = faker.helpers.arrayElement(['N', 'L', 'H']); // Confidentiality
  const i = faker.helpers.arrayElement(['N', 'L', 'H']); // Integrity
  const a = faker.helpers.arrayElement(['N', 'L', 'H']); // Availability

  return `CVSS:3.1/AV:${av}/AC:${ac}/PR:${pr}/UI:${ui}/S:${s}/C:${c}/I:${i}/A:${a}`;
}

function generateVulnerabilityDescription(cve: { id: string; title: string }): string {
  return `${cve.title}. This vulnerability (${cve.id}) could allow an attacker to compromise the affected system. Affected components should be updated to the latest patched version.`;
}
