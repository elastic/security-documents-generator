import { faker } from '@faker-js/faker';
import moment from 'moment';
import { getRandomCve, pickSeverity, CSPMAccount } from './csp_utils';

export interface CreateTenableVulnerabilityParams {
  account?: CSPMAccount;
}

export default function createTenableVulnerability({
  account,
}: CreateTenableVulnerabilityParams = {}) {
  const now = moment().format('yyyy-MM-DDTHH:mm:ss.SSSSSSZ');
  const cve = getRandomCve();
  const severity = pickSeverity();
  const accountId = account?.id || faker.string.numeric(12);
  const accountName = account?.name || `account-${faker.word.noun()}`;

  const pluginId = faker.number.int({ min: 10000, max: 999999 });
  const assetUuid = faker.string.uuid();
  const scanUuid = faker.string.uuid();
  const scheduleUuid = faker.string.uuid();

  // Host/asset info
  const hostnamePart = faker.word.noun().toLowerCase();
  const domain = faker.internet.domainName();
  const fqdn = `${hostnamePart}.${domain}`;
  const ipv4 = faker.internet.ipv4();
  const ipv4Secondary = faker.internet.ipv4();
  const networkId = faker.string.uuid();

  const packageVersion = `${faker.number.int({ min: 1, max: 5 })}.${faker.number.int({ min: 0, max: 30 })}.${faker.number.int({ min: 0, max: 99 })}`;
  const cvssScore = severityToCvssScore(severity);
  const cvss3Score = severityToCvss3Score(severity);
  const vprScore = severityToVprScore(severity);
  const riskFactor = severityToRiskFactor(severity);
  const titleCaseSeverity = severityToTitleCase(severity);
  const lowercaseSeverity = severity.toLowerCase();

  const port = faker.helpers.arrayElement([0, 22, 80, 443, 3389, 8080, 8443]);
  const protocol = port === 0 ? 'TCP' : faker.helpers.arrayElement(['TCP', 'UDP']);

  const osName = faker.helpers.arrayElement([
    'Linux Kernel 4.15 on Ubuntu 18.04',
    'Linux Kernel 5.4 on Ubuntu 20.04',
    'CentOS Linux 7',
    'Windows Server 2019',
    'Mac OS X 10.15',
  ]);
  const osType = osName.toLowerCase().includes('windows')
    ? 'windows'
    : osName.toLowerCase().includes('mac')
      ? 'macos'
      : 'linux';
  const osPlatform = osType === 'macos' ? 'darwin' : osType;

  // Plugin family for vulnerability.category
  const pluginFamily = faker.helpers.arrayElement([
    'General',
    'Ubuntu Local Security Checks',
    'CentOS Local Security Checks',
    'Web Servers',
    'Databases',
    'CGI abuses',
    'Web Clients',
  ]);
  const pluginFamilyId = faker.number.int({ min: 1000000, max: 9999999 });

  // Dates
  const firstFound = moment()
    .subtract(faker.number.int({ min: 30, max: 180 }), 'days')
    .format('yyyy-MM-DDTHH:mm:ss.SSSSSSZ');
  const lastFound = now;
  const indexed = now;
  const scanStarted = moment()
    .subtract(faker.number.int({ min: 1, max: 24 }), 'hours')
    .format('yyyy-MM-DDTHH:mm:ss.SSSSSSZ');
  const scanCompleted = now;
  const vulnPublicationDate = moment()
    .subtract(faker.number.int({ min: 60, max: 365 }), 'days')
    .format('yyyy-MM-DDTHH:mm:ss.SSSSSSZ');
  const pluginPublicationDate = moment()
    .subtract(faker.number.int({ min: 30, max: 180 }), 'days')
    .format('yyyy-MM-DDTHH:mm:ss.SSSSSSZ');
  const pluginModificationDate = moment()
    .subtract(faker.number.int({ min: 1, max: 30 }), 'days')
    .format('yyyy-MM-DDTHH:mm:ss.SSSSSSZ');
  const patchPublicationDate = moment()
    .subtract(faker.number.int({ min: 1, max: 29 }), 'days')
    .format('yyyy-MM-DDTHH:mm:ss.SSSSSSZ');

  // Plugin details
  const pluginName = `${cve.package} < ${cve.fixedVersion} Security Vulnerability`;
  const synopsis = `The remote host is affected by ${cve.title.toLowerCase()}.`;
  const description = `${cve.title}. This vulnerability affects the ${cve.package} package and could allow an attacker to compromise the affected system.`;
  const solution = `Upgrade ${cve.package} to version ${cve.fixedVersion} or later.`;
  const seeAlso = [`https://nvd.nist.gov/vuln/detail/${cve.id}`];

  // Output for package extraction
  const packagePath = `/usr/lib/${cve.package}/`;
  const output = `\n  Path              : ${packagePath}\n  Installed version : ${packageVersion}\n  Fixed version     : ${cve.fixedVersion}\n`;

  // CVSS vectors
  const cvssVector = generateCvssVector();
  const cvss3Vector = generateCvss3Vector();

  // Severity IDs (0=info, 1=low, 2=medium, 3=high, 4=critical)
  const severityId = severityToId(severity);

  // State
  const state = faker.helpers.arrayElement(['OPEN', 'REOPENED', 'FIXED']);

  // Build document matching the actual Tenable.io integration schema
  return {
    '@timestamp': lastFound,
    data_stream: {
      namespace: 'default',
      type: 'logs',
      dataset: 'tenable_io.vulnerability',
    },
    ecs: {
      version: '8.11.0',
    },
    event: {
      created: indexed,
      kind: 'state',
      id: faker.string.uuid(),
      category: ['vulnerability'],
      type: ['info'],
      dataset: 'tenable_io.vulnerability',
    },
    // Host fields
    host: {
      id: assetUuid,
      name: fqdn.toLowerCase(),
      domain,
      ip: [ipv4, ipv4Secondary],
      os: {
        full: [osName],
        type: osType,
        platform: osPlatform,
      },
    },
    // Related entities
    related: {
      hosts: [fqdn.toLowerCase()],
      ip: [ipv4, ipv4Secondary],
    },
    // Resource fields
    resource: {
      id: assetUuid,
      name: fqdn.toLowerCase(),
    },
    // Observer vendor
    observer: {
      vendor: 'Tenable',
    },
    // Package fields (arrays with path)
    package: {
      name: [cve.package],
      version: [packageVersion],
      fixed_version: [cve.fixedVersion],
      path: [packagePath],
    },
    // Vulnerability ECS fields
    vulnerability: {
      id: [cve.id], // Array of CVE IDs
      category: [pluginFamily],
      classification: 'CVSS',
      enumeration: 'CVE',
      description,
      title: synopsis, // From plugin.synopsis
      severity: titleCaseSeverity, // Title case: Critical, High, Medium, Low
      published_date: vulnPublicationDate,
      reference: seeAlso, // Array
      report_id: scanUuid, // From scan.uuid
      score: {
        base: cvss3Score,
        temporal: cvss3Score * 0.9,
        version: '3.0',
      },
      scanner: {
        vendor: 'Tenable',
        name: pluginName,
        version: pluginModificationDate.split('T')[0],
      },
    },
    // Cloud fields (optional)
    cloud: {
      account: {
        id: accountId,
        name: accountName,
      },
    },
    // Tenable.io-specific fields matching the actual integration schema
    tenable_io: {
      vulnerability: {
        asset: {
          uuid: assetUuid,
          fqdn,
          ip_address: ipv4, // Converted from hostname if IP
          ipv4: ipv4Secondary,
          network_id: networkId,
          operating_system: [osName],
          tracked: true,
          device_type: faker.helpers.arrayElement(['general-purpose', 'workstation', 'server']),
        },
        first_found: firstFound,
        last_found: lastFound,
        indexed,
        state,
        output,
        // Package nested structure
        package_nested: [
          {
            name: cve.package,
            version: packageVersion,
            fixed_version: cve.fixedVersion,
            path: packagePath,
          },
        ],
        // Plugin data (extensive)
        plugin: {
          id: pluginId,
          name: pluginName,
          family: pluginFamily,
          family_id: pluginFamilyId,
          description,
          synopsis,
          solution,
          see_also: seeAlso,
          risk_factor: riskFactor,
          cve: [cve.id],
          // CVSS v2 data
          cvss: {
            base_score: cvssScore,
            temporal: {
              score: cvssScore * 0.9,
              vector: {
                exploitability: faker.helpers.arrayElement([
                  'Unproven',
                  'Proof-of-concept',
                  'Functional',
                  'High',
                ]),
                remediation_level: faker.helpers.arrayElement([
                  'Official-fix',
                  'Temporary-fix',
                  'Workaround',
                  'Unavailable',
                ]),
                report_confidence: faker.helpers.arrayElement([
                  'Confirmed',
                  'Reasonable',
                  'Unknown',
                ]),
                raw: `E:U/RL:OF/RC:C`,
              },
            },
            vector: {
              access: {
                complexity: cvssVector.access.complexity,
                vector: cvssVector.access.vector,
              },
              authentication: cvssVector.authentication,
              availability_impact: cvssVector.availability_impact,
              confidentiality_impact: cvssVector.confidentiality_impact,
              integrity_impact: cvssVector.integrity_impact,
              raw: cvssVector.raw,
            },
          },
          // CVSS v3 data (if available)
          cvss3: {
            base_score: cvss3Score,
            temporal: {
              score: cvss3Score * 0.9,
              vector: {
                exploit_code_maturity: faker.helpers.arrayElement([
                  'UNPROVEN',
                  'POC',
                  'FUNCTIONAL',
                  'HIGH',
                ]),
                remediation_level: faker.helpers.arrayElement([
                  'OFFICIAL',
                  'TEMPORARY',
                  'WORKAROUND',
                  'UNAVAILABLE',
                ]),
                report_confidence: faker.helpers.arrayElement([
                  'CONFIRMED',
                  'REASONABLE',
                  'UNKNOWN',
                ]),
                raw: `E:U/RL:O/RC:C`,
              },
            },
            vector: {
              attack: {
                vector: cvss3Vector.attack_vector,
                complexity: cvss3Vector.attack_complexity,
              },
              privileges_required: cvss3Vector.privileges_required,
              user_interaction: cvss3Vector.user_interaction,
              scope: cvss3Vector.scope,
              confidentiality_impact: cvss3Vector.confidentiality_impact,
              integrity_impact: cvss3Vector.integrity_impact,
              availability_impact: cvss3Vector.availability_impact,
              raw: cvss3Vector.raw,
            },
          },
          // VPR (Vulnerability Priority Rating)
          vpr: {
            score: vprScore,
            updated: moment()
              .subtract(faker.number.int({ min: 1, max: 30 }), 'days')
              .format('yyyy-MM-DDTHH:mm:ss.SSSSSSZ'),
            drivers: {
              age_of_vuln: {
                lower_bound: faker.number.int({ min: 0, max: 365 }),
                upper_bound: faker.number.int({ min: 366, max: 730 }),
              },
              cvss3_impact_score: cvss3Score * 0.6,
              cvss_impact_score_predicted: faker.datatype.boolean(),
              exploit_code_maturity: faker.helpers.arrayElement([
                'UNPROVEN',
                'POC',
                'FUNCTIONAL',
                'HIGH',
              ]),
              product_coverage: faker.helpers.arrayElement(['LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH']),
              threat_intensity_last28: faker.helpers.arrayElement([
                'VERY_LOW',
                'LOW',
                'MEDIUM',
                'HIGH',
                'VERY_HIGH',
              ]),
              threat_sources_last28: faker.helpers.arrayElements(
                ['Social Media', 'Dark Web', 'Exploit-DB', 'Metasploit', 'No recorded events'],
                { min: 1, max: 3 }
              ),
            },
          },
          // Additional plugin fields
          type: faker.helpers.arrayElement(['local', 'remote', 'combined']),
          version: pluginModificationDate.split('T')[0],
          vuln_publication_date: vulnPublicationDate,
          publication_date: pluginPublicationDate,
          modification_date: pluginModificationDate,
          patch_publication_date: patchPublicationDate,
          has_patch: faker.datatype.boolean(),
          exploit_available: faker.datatype.boolean(),
          exploitability_ease: faker.helpers.arrayElement([
            'No known exploits are available',
            'Exploits are available',
            'No exploit is required',
          ]),
          exploit_framework: {
            metasploit: faker.datatype.boolean(),
            canvas: faker.datatype.boolean(),
            core: faker.datatype.boolean(),
            d2_elliot: faker.datatype.boolean(),
          },
          exploited_by: {
            malware: faker.datatype.boolean(),
            nessus: faker.datatype.boolean(),
          },
          in_the_news: faker.datatype.boolean(),
          unsupported_by_vendor: faker.datatype.boolean(),
          cpe: [`cpe:/a:vendor:${cve.package}:${packageVersion}`],
        },
        // Port data
        port: {
          value: port,
          protocol,
          service: port === 0 ? 'general' : getServiceForPort(port),
        },
        // Scan data
        scan: {
          uuid: scanUuid,
          schedule_uuid: scheduleUuid,
          started_at: scanStarted,
          completed_at: scanCompleted,
        },
        // Severity data
        severity: {
          id: severityId,
          default_id: severityId,
          modification_type: 'NONE',
          value: lowercaseSeverity, // Lowercase in tenable_io namespace
        },
      },
    },
  };
}

function severityToCvssScore(severity: string): number {
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

function severityToCvss3Score(severity: string): number {
  return severityToCvssScore(severity);
}

function severityToVprScore(severity: string): number {
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

function severityToRiskFactor(severity: string): string {
  switch (severity) {
    case 'CRITICAL':
      return 'CRITICAL';
    case 'HIGH':
      return 'HIGH';
    case 'MEDIUM':
      return 'MEDIUM';
    case 'LOW':
      return 'LOW';
    default:
      return 'MEDIUM';
  }
}

function severityToTitleCase(severity: string): string {
  switch (severity) {
    case 'CRITICAL':
      return 'Critical';
    case 'HIGH':
      return 'High';
    case 'MEDIUM':
      return 'Medium';
    case 'LOW':
      return 'Low';
    default:
      return 'Medium';
  }
}

function severityToId(severity: string): number {
  switch (severity) {
    case 'CRITICAL':
      return 4;
    case 'HIGH':
      return 3;
    case 'MEDIUM':
      return 2;
    case 'LOW':
      return 1;
    default:
      return 0;
  }
}

interface CvssVector {
  raw: string;
  access: {
    complexity: string;
    vector: string;
  };
  authentication: string;
  availability_impact: string;
  confidentiality_impact: string;
  integrity_impact: string;
}

interface Cvss3Vector {
  raw: string;
  attack_vector: string;
  attack_complexity: string;
  privileges_required: string;
  user_interaction: string;
  scope: string;
  confidentiality_impact: string;
  integrity_impact: string;
  availability_impact: string;
}

function generateCvssVector(): CvssVector {
  const av = faker.helpers.arrayElement(['Network', 'Adjacent Network', 'Local']);
  const ac = faker.helpers.arrayElement(['Low', 'Medium', 'High']);
  const au = faker.helpers.arrayElement(['None required', 'Single instance', 'Multiple instances']);
  const c = faker.helpers.arrayElement(['None', 'Partial', 'Complete']);
  const i = faker.helpers.arrayElement(['None', 'Partial', 'Complete']);
  const a = faker.helpers.arrayElement(['None', 'Partial', 'Complete']);

  // Short codes for raw vector
  const avShort = av === 'Network' ? 'N' : av === 'Adjacent Network' ? 'A' : 'L';
  const acShort = ac === 'Low' ? 'L' : ac === 'Medium' ? 'M' : 'H';
  const auShort = au === 'None required' ? 'N' : au === 'Single instance' ? 'S' : 'M';
  const cShort = c === 'None' ? 'N' : c === 'Partial' ? 'P' : 'C';
  const iShort = i === 'None' ? 'N' : i === 'Partial' ? 'P' : 'C';
  const aShort = a === 'None' ? 'N' : a === 'Partial' ? 'P' : 'C';

  return {
    raw: `AV:${avShort}/AC:${acShort}/Au:${auShort}/C:${cShort}/I:${iShort}/A:${aShort}`,
    access: {
      complexity: ac,
      vector: av,
    },
    authentication: au,
    availability_impact: a,
    confidentiality_impact: c,
    integrity_impact: i,
  };
}

function generateCvss3Vector(): Cvss3Vector {
  const av = faker.helpers.arrayElement(['Network', 'Adjacent', 'Local', 'Physical']);
  const ac = faker.helpers.arrayElement(['Low', 'High']);
  const pr = faker.helpers.arrayElement(['None', 'Low', 'High']);
  const ui = faker.helpers.arrayElement(['None', 'Required']);
  const s = faker.helpers.arrayElement(['Unchanged', 'Changed']);
  const c = faker.helpers.arrayElement(['None', 'Low', 'High']);
  const i = faker.helpers.arrayElement(['None', 'Low', 'High']);
  const a = faker.helpers.arrayElement(['None', 'Low', 'High']);

  // Short codes for raw vector
  const avShort = av === 'Network' ? 'N' : av === 'Adjacent' ? 'A' : av === 'Local' ? 'L' : 'P';
  const acShort = ac === 'Low' ? 'L' : 'H';
  const prShort = pr === 'None' ? 'N' : pr === 'Low' ? 'L' : 'H';
  const uiShort = ui === 'None' ? 'N' : 'R';
  const sShort = s === 'Unchanged' ? 'U' : 'C';
  const cShort = c === 'None' ? 'N' : c === 'Low' ? 'L' : 'H';
  const iShort = i === 'None' ? 'N' : i === 'Low' ? 'L' : 'H';
  const aShort = a === 'None' ? 'N' : a === 'Low' ? 'L' : 'H';

  return {
    raw: `CVSS:3.0/AV:${avShort}/AC:${acShort}/PR:${prShort}/UI:${uiShort}/S:${sShort}/C:${cShort}/I:${iShort}/A:${aShort}`,
    attack_vector: av,
    attack_complexity: ac,
    privileges_required: pr,
    user_interaction: ui,
    scope: s,
    confidentiality_impact: c,
    integrity_impact: i,
    availability_impact: a,
  };
}

function getServiceForPort(port: number): string {
  const portServices: Record<number, string> = {
    22: 'ssh',
    80: 'http',
    443: 'https',
    3389: 'rdp',
    8080: 'http-proxy',
    8443: 'https-alt',
  };
  return portServices[port] || 'unknown';
}
