import { faker } from '@faker-js/faker';
import {
  loadMitreData,
  selectMitreTechniques,
} from '../utils/mitre_attack_service';
import { CasePostRequest } from '../utils/kibana_client';

export interface SecurityCaseData extends CasePostRequest {
  // Extended fields for security context
  security: {
    category: string;
    subcategory: string;
    incident_type: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
    impact_assessment: string;
    affected_systems: string[];
    threat_level: 'low' | 'medium' | 'high' | 'critical';
  };
  timeline: {
    discovery_time: string;
    first_occurrence?: string;
    last_occurrence?: string;
    estimated_containment?: string;
  };
  investigation: {
    lead_analyst: string;
    team: string[];
    status: 'open' | 'in-progress' | 'closed';
    findings?: string[];
    recommendations?: string[];
  };
  mitre?: {
    technique_ids: string[];
    tactic_ids: string[];
    framework: string;
    kill_chain_phases: string[];
  };
  metadata: {
    case_id: string;
    created_by: string;
    last_updated: string;
    escalation_level: number;
    alert_count: number;
    estimated_effort_hours?: number;
  };
}

// Security case categories and types
const SECURITY_CASE_CATEGORIES = [
  'security_incident',
  'threat_hunting',
  'vulnerability_investigation',
  'compliance_violation',
  'insider_threat',
  'malware_analysis',
  'data_breach',
  'network_intrusion',
  'phishing_investigation',
  'fraud_detection',
];

const CASE_SUBCATEGORIES: Record<string, string[]> = {
  security_incident: [
    'malware_infection',
    'data_exfiltration',
    'unauthorized_access',
    'system_compromise',
  ],
  threat_hunting: [
    'apt_activity',
    'suspicious_behavior',
    'ioc_investigation',
    'threat_actor_tracking',
  ],
  vulnerability_investigation: [
    'critical_vulnerability',
    'zero_day',
    'patch_verification',
    'exposure_assessment',
  ],
  compliance_violation: [
    'pci_dss_violation',
    'gdpr_breach',
    'sox_compliance',
    'hipaa_violation',
  ],
  insider_threat: [
    'data_theft',
    'policy_violation',
    'privilege_abuse',
    'suspicious_activity',
  ],
  malware_analysis: [
    'ransomware',
    'trojan',
    'rootkit',
    'backdoor',
    'cryptominer',
  ],
  data_breach: [
    'customer_data',
    'financial_data',
    'intellectual_property',
    'personal_information',
  ],
  network_intrusion: [
    'lateral_movement',
    'command_control',
    'persistence',
    'reconnaissance',
  ],
  phishing_investigation: [
    'spear_phishing',
    'credential_harvesting',
    'business_email_compromise',
    'social_engineering',
  ],
  fraud_detection: [
    'payment_fraud',
    'identity_theft',
    'account_takeover',
    'transaction_anomaly',
  ],
};

const INCIDENT_TYPES = [
  'Security Breach',
  'Malware Infection',
  'Data Exfiltration',
  'Unauthorized Access',
  'Phishing Attack',
  'Insider Threat',
  'Vulnerability Exploitation',
  'Network Intrusion',
  'Compliance Violation',
  'System Compromise',
  'Ransomware Attack',
  'Business Email Compromise',
];

const IMPACT_ASSESSMENTS = [
  'Low - Minimal business impact, isolated to single system',
  'Medium - Moderate impact to business operations, multiple systems affected',
  'High - Significant business disruption, critical systems compromised',
  'Critical - Severe business impact, potential regulatory violations, widespread compromise',
];

const ANALYST_NAMES = [
  'Sarah Chen',
  'Marcus Rodriguez',
  'Alex Thompson',
  'Jordan Kim',
  'Taylor Singh',
  'Morgan Davis',
  'Cameron Wilson',
  'Riley Martinez',
  'Avery Johnson',
  'Quinn Anderson',
];

const SECURITY_TEAMS = [
  'SOC Tier 1',
  'SOC Tier 2',
  'Incident Response',
  'Threat Hunting',
  'Malware Analysis',
  'Digital Forensics',
  'Vulnerability Management',
  'Compliance Team',
  'Red Team',
  'Blue Team',
];

// Generate realistic case titles based on category and subcategory
function generateCaseTitle(
  category: string,
  subcategory: string,
  incidentType: string,
): string {
  const titleTemplates: Record<string, string[]> = {
    security_incident: [
      `${incidentType} - Investigation Required`,
      `Suspected ${incidentType} on ${faker.company.name()} Network`,
      `Multiple Systems Affected - ${incidentType}`,
      `Urgent: ${incidentType} Response Required`,
    ],
    threat_hunting: [
      `Threat Hunt: ${subcategory.replace('_', ' ')} Detection`,
      `Proactive Hunt: Suspicious ${subcategory.replace('_', ' ')}`,
      `IOC Investigation: ${incidentType}`,
      `Advanced Threat Hunt: ${incidentType}`,
    ],
    vulnerability_investigation: [
      `Critical Vulnerability Assessment - ${incidentType}`,
      `CVE Investigation: ${incidentType}`,
      `Vulnerability Impact Analysis - ${subcategory.replace('_', ' ')}`,
      `Security Patch Verification Required`,
    ],
    compliance_violation: [
      `Compliance Investigation: ${subcategory.replace('_', ' ')}`,
      `Regulatory Violation Assessment`,
      `${incidentType} - Compliance Review`,
      `Audit Finding: ${subcategory.replace('_', ' ')}`,
    ],
    insider_threat: [
      `Insider Threat Investigation: ${subcategory.replace('_', ' ')}`,
      `Employee Security Violation - ${incidentType}`,
      `Privileged User Activity Review`,
      `Internal Security Breach Investigation`,
    ],
    malware_analysis: [
      `Malware Analysis: ${subcategory.charAt(0).toUpperCase() + subcategory.slice(1)} Detection`,
      `${incidentType} Sample Analysis`,
      `Reverse Engineering: ${subcategory} Variant`,
      `Malware Family Attribution - ${incidentType}`,
    ],
  };

  const templates = titleTemplates[category] || [
    `Security Investigation: ${incidentType}`,
    `${category.replace('_', ' ')} Case - ${incidentType}`,
    `Investigation Required: ${incidentType}`,
  ];

  return faker.helpers.arrayElement(templates);
}

// Generate detailed case description
function generateCaseDescription(
  category: string,
  subcategory: string,
  incidentType: string,
  severity: string,
  affectedSystems: string[],
): string {
  const timestamp = faker.date.recent({ days: 1 }).toISOString();
  const hostName = faker.internet.domainName();
  const userName = faker.internet.username();

  const descriptionTemplates: Record<string, () => string> = {
    security_incident: () =>
      `
**Incident Summary:**
A ${severity} severity security incident has been detected involving ${incidentType.toLowerCase()}. 

**Initial Observations:**
- First detected: ${timestamp}
- Affected systems: ${affectedSystems.join(', ')}
- Primary host: ${hostName}
- Potentially affected user: ${userName}

**Immediate Actions Required:**
1. Contain affected systems
2. Preserve evidence and logs
3. Assess scope of compromise
4. Implement recovery procedures

**Investigation Status:** 
Investigation is ongoing. Analyst assignment and detailed forensic analysis required.

**Business Impact:**
${faker.helpers.arrayElement(IMPACT_ASSESSMENTS)}
    `.trim(),

    threat_hunting: () =>
      `
**Threat Hunt Initiation:**
Proactive threat hunting activity initiated based on ${subcategory.replace('_', ' ')} indicators.

**Hunt Hypothesis:**
${faker.lorem.sentence()} Related to ${incidentType} activity patterns observed in similar environments.

**Scope:**
- Target systems: ${affectedSystems.join(', ')}
- Time range: Last 7 days
- Focus areas: Network traffic, process execution, file system changes

**Initial Findings:**
- Suspicious activity detected on ${hostName}
- Potential indicators requiring further analysis
- Correlation with external threat intelligence feeds needed

**Next Steps:**
1. Deep dive analysis of identified indicators
2. Timeline reconstruction
3. Attribution assessment
4. Threat actor profiling
    `.trim(),

    vulnerability_investigation: () =>
      `
**Vulnerability Assessment Case:**
Critical vulnerability identified requiring immediate investigation and remediation.

**Vulnerability Details:**
- Type: ${incidentType}
- Severity: ${severity.toUpperCase()}
- Affected systems: ${affectedSystems.join(', ')}
- Discovery method: ${faker.helpers.arrayElement(['Automated scan', 'Security research', 'Incident response', 'Penetration testing'])}

**Risk Assessment:**
${faker.helpers.arrayElement(IMPACT_ASSESSMENTS)}

**Technical Details:**
- CVE ID: CVE-${faker.date.recent().getFullYear()}-${faker.number.int({ min: 1000, max: 99999 })}
- CVSS Score: ${faker.number.float({ min: 4.0, max: 10.0, fractionDigits: 1 })}
- Exploitation likelihood: ${faker.helpers.arrayElement(['Low', 'Medium', 'High'])}

**Remediation Priority:**
Immediate patching required for critical systems. Temporary mitigations implemented where possible.
    `.trim(),

    malware_analysis: () =>
      `
**Malware Analysis Case:**
Suspected ${subcategory} detected on enterprise network requiring detailed analysis.

**Sample Information:**
- File hash: ${faker.string.alphanumeric(64)}
- Detection time: ${timestamp}
- Source: ${hostName}
- Initial classification: ${incidentType}

**Behavioral Indicators:**
- Network connections to suspicious domains
- Process injection attempts detected
- Registry modifications observed
- Potential data staging activities

**Analysis Objectives:**
1. Determine malware family and variant
2. Identify persistence mechanisms
3. Assess data exfiltration capabilities
4. Develop detection signatures
5. Attribution analysis

**Containment Status:**
Affected systems isolated pending detailed analysis.
    `.trim(),
  };

  const generator =
    descriptionTemplates[category] || descriptionTemplates.security_incident;
  return generator();
}

// Generate MITRE ATT&CK data for cases
async function generateMitreData(): Promise<{
  technique_ids: string[];
  tactic_ids: string[];
  framework: string;
  kill_chain_phases: string[];
}> {
  try {
    const mitreData = await loadMitreData();
    if (!mitreData) {
      throw new Error('MITRE data not available');
    }

    const techniques = selectMitreTechniques(
      mitreData,
      faker.number.int({ min: 1, max: 4 }),
    );

    const technique_ids = techniques.map((t) => t.technique);
    const tactic_ids = [...new Set(techniques.map((t) => t.tactic))];

    const kill_chain_phases = faker.helpers.arrayElements(
      [
        'reconnaissance',
        'weaponization',
        'delivery',
        'exploitation',
        'installation',
        'command-and-control',
        'actions-on-objectives',
      ],
      { min: 1, max: 3 },
    );

    return {
      technique_ids,
      tactic_ids,
      framework: 'MITRE ATT&CK',
      kill_chain_phases,
    };
  } catch (error) {
    // Fallback if MITRE data is not available
    return {
      technique_ids: [`T${faker.number.int({ min: 1000, max: 1999 })}`],
      tactic_ids: [
        `TA${faker.number.int({ min: 1, max: 12 }).toString().padStart(4, '0')}`,
      ],
      framework: 'MITRE ATT&CK',
      kill_chain_phases: ['exploitation'],
    };
  }
}

// Generate a single security case
export async function generateSecurityCase(
  includeMitre: boolean = false,
  owner: string = 'securitySolution',
): Promise<SecurityCaseData> {
  const category = faker.helpers.arrayElement(SECURITY_CASE_CATEGORIES);
  const subcategory = faker.helpers.arrayElement(
    CASE_SUBCATEGORIES[category] || ['general'],
  );
  const incidentType = faker.helpers.arrayElement(INCIDENT_TYPES);
  const severity = faker.helpers.arrayElement([
    'low',
    'medium',
    'high',
    'critical',
  ]) as 'low' | 'medium' | 'high' | 'critical';
  const priority = faker.helpers.arrayElement([
    'low',
    'medium',
    'high',
    'critical',
  ]) as 'low' | 'medium' | 'high' | 'critical';

  const affectedSystems = faker.helpers.arrayElements(
    [
      faker.internet.domainName(),
      faker.internet.ip(),
      `${faker.word.noun()}-server-${faker.number.int({ min: 1, max: 999 })}`,
      `workstation-${faker.number.int({ min: 1, max: 999 })}`,
      `database-${faker.number.int({ min: 1, max: 99 })}`,
      `web-${faker.number.int({ min: 1, max: 99 })}`,
    ],
    { min: 1, max: 4 },
  );

  const title = generateCaseTitle(category, subcategory, incidentType);
  const description = generateCaseDescription(
    category,
    subcategory,
    incidentType,
    severity,
    affectedSystems,
  );

  const tags = [
    category,
    subcategory,
    severity,
    incidentType.toLowerCase().replace(/\s+/g, '-'),
    ...faker.helpers.arrayElements(
      [
        'urgent',
        'escalated',
        'external-threat',
        'insider-threat',
        'automated-detection',
        'manual-investigation',
      ],
      { min: 0, max: 3 },
    ),
  ];

  const leadAnalyst = faker.helpers.arrayElement(ANALYST_NAMES);
  const team = faker.helpers.arrayElements(SECURITY_TEAMS, { min: 1, max: 3 });

  const now = new Date();
  const discoveryTime = faker.date.recent({ days: 2 });
  const firstOccurrence = faker.date.between({
    from: new Date(discoveryTime.getTime() - 24 * 60 * 60 * 1000),
    to: discoveryTime,
  });

  const baseCase: SecurityCaseData = {
    title,
    description,
    tags,
    severity,
    owner,
    assignees: [{ uid: leadAnalyst.toLowerCase().replace(/\s+/g, '.') }],
    connector: {
      id: 'none',
      name: 'None',
      type: '.none',
      fields: null,
    },
    settings: {
      syncAlerts: true,
    },
    security: {
      category,
      subcategory,
      incident_type: incidentType,
      priority,
      impact_assessment: faker.helpers.arrayElement(IMPACT_ASSESSMENTS),
      affected_systems: affectedSystems,
      threat_level: faker.helpers.arrayElement([
        'low',
        'medium',
        'high',
        'critical',
      ]) as 'low' | 'medium' | 'high' | 'critical',
    },
    timeline: {
      discovery_time: discoveryTime.toISOString(),
      first_occurrence: firstOccurrence.toISOString(),
      last_occurrence: faker.date
        .between({ from: firstOccurrence, to: discoveryTime })
        .toISOString(),
      estimated_containment: faker.date.future({ years: 0.1 }).toISOString(),
    },
    investigation: {
      lead_analyst: leadAnalyst,
      team,
      status: faker.helpers.arrayElement(['open', 'in-progress', 'closed']) as
        | 'open'
        | 'in-progress'
        | 'closed',
      findings: faker.helpers.maybe(
        () =>
          faker.helpers.arrayElements(
            [
              'Malicious process execution detected',
              'Unauthorized network connections identified',
              'Suspicious file modifications observed',
              'Credential compromise suspected',
              'Lateral movement indicators found',
              'Data exfiltration attempt blocked',
            ],
            { min: 1, max: 3 },
          ),
        { probability: 0.7 },
      ),
      recommendations: faker.helpers.maybe(
        () =>
          faker.helpers.arrayElements(
            [
              'Implement additional network segmentation',
              'Update endpoint detection rules',
              'Enhance user access controls',
              'Deploy additional monitoring',
              'Conduct security awareness training',
              'Review and update incident response procedures',
            ],
            { min: 1, max: 3 },
          ),
        { probability: 0.7 },
      ),
    },
    metadata: {
      case_id: faker.string.uuid(),
      created_by: faker.helpers.arrayElement(ANALYST_NAMES),
      last_updated: now.toISOString(),
      escalation_level: faker.number.int({ min: 1, max: 4 }),
      alert_count: faker.number.int({ min: 0, max: 25 }),
      estimated_effort_hours: faker.helpers.maybe(
        () => faker.number.int({ min: 2, max: 40 }),
        { probability: 0.8 },
      ),
    },
  };

  if (includeMitre) {
    baseCase.mitre = await generateMitreData();
    baseCase.tags.push(
      'mitre-attack',
      ...baseCase.mitre.technique_ids.slice(0, 2),
    );
  }

  return baseCase;
}

// Generate multiple security cases
export async function generateMultipleSecurityCases(
  count: number,
  includeMitre: boolean = false,
  owner: string = 'securitySolution',
): Promise<SecurityCaseData[]> {
  const cases: SecurityCaseData[] = [];

  for (let i = 0; i < count; i++) {
    const securityCase = await generateSecurityCase(includeMitre, owner);
    cases.push(securityCase);
  }

  return cases;
}

// Generate case based on specific alert information
export function generateCaseFromAlert(
  alertInfo: {
    rule_name: string;
    severity: string;
    host_name: string;
    user_name?: string;
    mitre_techniques?: string[];
    mitre_tactics?: string[];
  },
  owner: string = 'securitySolution',
): SecurityCaseData {
  const category = 'security_incident';
  const severity = alertInfo.severity as 'low' | 'medium' | 'high' | 'critical';

  // Determine incident type based on rule name
  let incidentType = 'Security Alert';
  if (alertInfo.rule_name.toLowerCase().includes('malware')) {
    incidentType = 'Malware Infection';
  } else if (alertInfo.rule_name.toLowerCase().includes('phishing')) {
    incidentType = 'Phishing Attack';
  } else if (alertInfo.rule_name.toLowerCase().includes('breach')) {
    incidentType = 'Data Breach';
  } else if (alertInfo.rule_name.toLowerCase().includes('intrusion')) {
    incidentType = 'Network Intrusion';
  }

  const title = `Investigation Required: ${alertInfo.rule_name}`;
  const description = `
**Alert-Driven Investigation:**
This case was automatically created in response to a ${severity} severity security alert.

**Alert Details:**
- Rule: ${alertInfo.rule_name}
- Severity: ${severity.toUpperCase()}
- Host: ${alertInfo.host_name}
${alertInfo.user_name ? `- User: ${alertInfo.user_name}` : ''}

**Investigation Scope:**
Initial assessment required to determine if this represents a genuine security incident or false positive.

**Next Steps:**
1. Validate alert accuracy
2. Assess potential impact
3. Determine investigation priority
4. Assign appropriate analyst resources

**Automatic Case Creation:**
This case was created automatically based on alert severity and pattern matching.
  `.trim();

  const now = new Date();

  const caseData: SecurityCaseData = {
    title,
    description,
    tags: [category, severity, 'alert-driven', 'auto-created'],
    severity,
    owner,
    connector: {
      id: 'none',
      name: 'None',
      type: '.none',
      fields: null,
    },
    settings: {
      syncAlerts: true,
    },
    security: {
      category,
      subcategory: 'alert_investigation',
      incident_type: incidentType,
      priority: severity,
      impact_assessment:
        'Assessment pending - case created from security alert',
      affected_systems: [alertInfo.host_name],
      threat_level: severity,
    },
    timeline: {
      discovery_time: now.toISOString(),
      first_occurrence: now.toISOString(),
    },
    investigation: {
      lead_analyst: 'Auto-Assignment Pending',
      team: ['SOC Tier 1'],
      status: 'open',
    },
    metadata: {
      case_id: faker.string.uuid(),
      created_by: 'System - Alert Automation',
      last_updated: now.toISOString(),
      escalation_level:
        severity === 'critical' ? 4 : severity === 'high' ? 3 : 2,
      alert_count: 1,
    },
  };

  // Add MITRE data if available from alert
  if (alertInfo.mitre_techniques?.length || alertInfo.mitre_tactics?.length) {
    caseData.mitre = {
      technique_ids: alertInfo.mitre_techniques || [],
      tactic_ids: alertInfo.mitre_tactics || [],
      framework: 'MITRE ATT&CK',
      kill_chain_phases: [],
    };
    caseData.tags.push('mitre-attack');
  }

  return caseData;
}
