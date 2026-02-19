import { faker } from '@faker-js/faker';
import moment from 'moment';
import { getRandomCve, pickSeverity, CSPMAccount } from './csp_utils';

export interface CreateQualysVulnerabilityParams {
  account?: CSPMAccount;
}

export default function createQualysVulnerability({
  account,
}: CreateQualysVulnerabilityParams = {}) {
  const now = moment().format('yyyy-MM-DDTHH:mm:ss.SSSSSSZ');
  const cve = getRandomCve();
  const severity = pickSeverity();
  const accountId = account?.id || faker.string.numeric(12);
  const accountName = account?.name || `account-${faker.word.noun()}`;

  const qid = faker.number.int({ min: 10000, max: 99999 });
  const detectionId = String(faker.number.int({ min: 1, max: 9999999 }));
  const uniqueVulnId = String(faker.number.int({ min: 10000000, max: 99999999 }));

  // DNS data structure
  const hostnamePart = faker.word.noun().toLowerCase();
  const domainPart = `${faker.word.noun().toLowerCase()}.local`;
  const fqdn = `${hostnamePart}.${domainPart}`;
  const netbios = hostnamePart.toUpperCase();
  const ipAddress = faker.internet.ip();

  const packageVersion = `${faker.number.int({ min: 1, max: 5 })}.${faker.number.int({ min: 0, max: 30 })}.${faker.number.int({ min: 0, max: 99 })}`;
  const cvssScore = severityToScore(severity);
  const qualysSeverity = severityToQualysSeverity(severity);
  const titleCaseSeverity = severityToTitleCase(severity);

  const osName = faker.helpers.arrayElement([
    'Linux 4.15.0-72-generic',
    'Windows Server 2019',
    'Windows 2016/2019/10',
    'CentOS 7.9',
    'Ubuntu 22.04',
    'Red Hat Enterprise Linux 8',
  ]);
  const osPlatform = osName.toLowerCase().includes('windows') ? 'windows' : 'linux';

  const firstFoundDatetime = moment()
    .subtract(faker.number.int({ min: 30, max: 180 }), 'days')
    .format('yyyy-MM-DDTHH:mm:ss.SSSSSSZ');
  const lastFoundDatetime = now;
  const lastScanDatetime = now;

  // Knowledge base data (from separate Qualys knowledge base)
  const kbCategory = faker.helpers.arrayElement(['CGI', 'General', 'Ubuntu', 'Windows', 'CentOS']);
  const kbTitle = cve.title;
  const kbDiagnosis = `This QID reports the detection of ${cve.package} vulnerability.`;
  const kbConsequence = `Depending on the vulnerability being exploited, an unauthenticated remote attacker could execute arbitrary code, cause denial of service, or gain unauthorized access.`;
  const kbSolution = `Upgrade ${cve.package} to version ${cve.fixedVersion} or later.`;

  // Detection status
  const detectionStatus = faker.helpers.arrayElement(['Active', 'New', 'Re-Opened', 'Fixed']);
  const detectionType = faker.helpers.arrayElement(['Confirmed', 'Potential']);
  const timesFound = faker.number.int({ min: 1, max: 5000 });

  // QDS (Qualys Detection Score)
  const qdsScore = faker.number.int({ min: 1, max: 100 });
  const qdsSeverity = qdsScore >= 70 ? 'HIGH' : qdsScore >= 40 ? 'MEDIUM' : 'LOW';

  // CVSS vector
  const cvssVector = generateCvss3Vector();

  // Build document matching the actual Qualys VMDR integration schema
  return {
    '@timestamp': now,
    data_stream: {
      namespace: 'default',
      type: 'logs',
      dataset: 'qualys_vmdr.asset_host_detection',
    },
    ecs: {
      version: '8.11.0',
    },
    event: {
      created: now,
      kind: 'alert',
      id: uniqueVulnId,
      category: ['vulnerability'],
      type: ['info'],
      dataset: 'qualys_vmdr.asset_host_detection',
    },
    // Host fields
    host: {
      name: fqdn,
      hostname: hostnamePart,
      id: detectionId,
      domain: netbios,
      ip: [ipAddress],
      os: {
        full: osName,
        platform: osPlatform,
        type: osPlatform,
      },
    },
    // Related entities
    related: {
      hosts: [hostnamePart, fqdn, detectionId, netbios],
      ip: [ipAddress],
    },
    // Resource fields
    resource: {
      id: detectionId,
      name: fqdn,
    },
    // Observer
    observer: {
      vendor: 'Qualys VMDR',
    },
    // Package fields (arrays for multiple packages)
    package: {
      name: [cve.package],
      version: [packageVersion],
      fixed_version: [cve.fixedVersion],
    },
    // Vulnerability ECS fields
    vulnerability: {
      id: [cve.id], // Array of CVE IDs
      category: [kbCategory],
      classification: 'CVSS',
      enumeration: 'CVE',
      description: kbDiagnosis,
      title: kbTitle,
      severity: titleCaseSeverity, // Title case: Critical, High, Medium, Low
      score: {
        base: cvssScore,
        version: '3.1',
      },
      package: {
        name: [cve.package],
        version: [packageVersion],
        fixed_version: [cve.fixedVersion],
      },
      reference: [`https://cve.mitre.org/cgi-bin/cvename.cgi?name=${cve.id}`],
      scanner: {
        vendor: 'Qualys',
      },
    },
    // Cloud fields (optional)
    cloud: {
      account: {
        id: accountId,
        name: accountName,
      },
    },
    // Qualys VMDR-specific fields matching the actual integration schema
    qualys_vmdr: {
      asset_host_detection: {
        id: detectionId,
        dns: fqdn,
        dns_data: {
          domain: domainPart,
          fqdn,
          hostname: hostnamePart,
        },
        ip: ipAddress,
        netbios,
        os: osName,
        tracking_method: 'IP',
        last_scan_datetime: lastScanDatetime,
        last_vm_scanned_date: lastScanDatetime,
        last_vm_scanned_duration: faker.number.int({ min: 100, max: 2000 }),
        // Knowledge base data
        knowledge_base: {
          category: kbCategory,
          title: kbTitle,
          qid: String(qid),
          severity_level: titleCaseSeverity,
          patchable: faker.datatype.boolean(),
          pci_flag: faker.datatype.boolean(),
          vuln_type: 'Vulnerability',
          published_datetime: moment()
            .subtract(faker.number.int({ min: 60, max: 365 }), 'days')
            .format('yyyy-MM-DDTHH:mm:ss.SSSSSSZ'),
          discovery: {
            remote: faker.datatype.boolean() ? 1 : 0,
          },
          diagnosis: {
            value: kbDiagnosis,
          },
          consequence: {
            value: kbConsequence,
          },
          solution: {
            value: kbSolution,
          },
          cve_list: [cve.id],
          cvss: {
            base_obj: {
              '#text': String(cvssScore),
              source: 'service',
            },
            temporal: String((cvssScore * 0.9).toFixed(1)),
            vector_string: cvssVector,
          },
          software_list: [
            {
              product: cve.package,
              vendor: faker.helpers.arrayElement(['multi-vendor', 'apache', 'microsoft', 'linux']),
            },
          ],
          threat_intelligence: {
            intel: [
              {
                id: String(faker.number.int({ min: 1, max: 20 })),
              },
            ],
          },
        },
        // Vulnerability detection data
        vulnerability: {
          unique_vuln_id: uniqueVulnId,
          qid,
          type: detectionType,
          severity: qualysSeverity,
          status: detectionStatus,
          ssl: '0',
          affect_running_kernel: faker.helpers.arrayElement(['0', '1']),
          cve: [cve.id],
          first_found_datetime: firstFoundDatetime,
          last_found_datetime: lastFoundDatetime,
          last_test_datetime: lastFoundDatetime,
          last_update_datetime: lastFoundDatetime,
          last_processed_datetime: lastFoundDatetime,
          times_found: timesFound,
          is_ignored: false,
          is_disabled: false,
          results: `Package||Installed Version||Required Version;;${cve.package}||${packageVersion}||${cve.fixedVersion}`,
          latest_vulnerability_detection_source: faker.helpers.arrayElement([
            'Cloud Agent',
            'Internal Scanner',
          ]),
          vulnerability_detection_sources: faker.helpers.arrayElements(
            ['Cloud Agent', 'Internal Scanner'],
            { min: 1, max: 2 }
          ),
          qds: {
            score: qdsScore,
            severity: qdsSeverity,
          },
          qds_factors: [
            {
              name: 'CVSS',
              text: String(cvssScore),
            },
            {
              name: 'CVSS_version',
              text: 'v3.x',
            },
            {
              name: 'epss',
              text: faker.number.float({ min: 0, max: 1, fractionDigits: 5 }).toString(),
            },
            {
              name: 'CVSS_vector',
              text: cvssVector.replace('CVSS:3.1/', ''),
            },
          ],
          // MITRE ATT&CK mappings
          mitre_tactic_id: ['TA0008', 'TA0004'],
          mitre_tactic_name: ['lateral-movement', 'privilege-escalation'],
          mitre_technique_id: ['T1210', 'T1068'],
          mitre_technique_name: [
            'Exploitation of Remote Services',
            'Exploitation for Privilege Escalation',
          ],
          trurisk_elimination_status: detectionStatus === 'Fixed' ? 'FIXED' : 'OPEN',
        },
        // Package nested structure
        package_nested: [
          {
            name: cve.package,
            version: packageVersion,
            fixed_version: cve.fixedVersion,
          },
        ],
      },
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

function severityToQualysSeverity(severity: string): number {
  // Qualys uses 1-5 severity scale
  switch (severity) {
    case 'CRITICAL':
      return 5;
    case 'HIGH':
      return 4;
    case 'MEDIUM':
      return 3;
    case 'LOW':
      return faker.helpers.arrayElement([1, 2]);
    default:
      return 3;
  }
}

function severityToTitleCase(severity: string): string {
  // vulnerability.severity is title case
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

function generateCvss3Vector(): string {
  const av = faker.helpers.arrayElement(['N', 'A', 'L', 'P']);
  const ac = faker.helpers.arrayElement(['L', 'H']);
  const pr = faker.helpers.arrayElement(['N', 'L', 'H']);
  const ui = faker.helpers.arrayElement(['N', 'R']);
  const s = faker.helpers.arrayElement(['U', 'C']);
  const c = faker.helpers.arrayElement(['N', 'L', 'H']);
  const i = faker.helpers.arrayElement(['N', 'L', 'H']);
  const a = faker.helpers.arrayElement(['N', 'L', 'H']);

  return `CVSS:3.1/AV:${av}/AC:${ac}/PR:${pr}/UI:${ui}/S:${s}/C:${c}/I:${i}/A:${a}`;
}
