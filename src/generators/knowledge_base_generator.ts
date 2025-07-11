import { faker } from '@faker-js/faker';
import {
  loadMitreData,
  selectMitreTechniques,
} from '../utils/mitre_attack_service';

export interface KnowledgeBaseDocument {
  '@timestamp': string;
  content: string;
  title: string;
  summary: string;
  suggested_questions: string[];
  category: string;
  subcategory: string;
  tags: string[];
  source: string;
  confidence: number;
  language: string;
  version: string;
  last_updated: string;
  author: string;
  access_level: string;
  security: {
    domain: string;
    classification: string;
    severity: string;
    tlp: string;
  };
  mitre?: {
    technique_ids: string[];
    tactic_ids: string[];
    framework: string;
  };
  metadata: {
    format: string;
    size_bytes: number;
    checksum: string;
    references: string;
    related_documents: string[];
  };
}

const SECURITY_CATEGORIES = [
  'threat_intelligence',
  'incident_response',
  'vulnerability_management',
  'network_security',
  'endpoint_security',
  'cloud_security',
  'compliance',
  'forensics',
  'malware_analysis',
  'behavioral_analytics',
];

const SUBCATEGORIES: Record<string, string[]> = {
  threat_intelligence: [
    'ioc_analysis',
    'apt_profiles',
    'campaign_tracking',
    'attribution',
  ],
  incident_response: [
    'playbooks',
    'procedures',
    'escalation_matrix',
    'communication',
  ],
  vulnerability_management: [
    'cve_analysis',
    'patch_management',
    'assessment_reports',
  ],
  network_security: [
    'firewall_rules',
    'ids_signatures',
    'traffic_analysis',
    'dns_security',
  ],
  endpoint_security: ['edr_rules', 'behavioral_patterns', 'process_monitoring'],
  cloud_security: [
    'aws_security',
    'azure_security',
    'gcp_security',
    'container_security',
  ],
  compliance: ['pci_dss', 'sox', 'gdpr', 'hipaa', 'iso27001'],
  forensics: [
    'memory_analysis',
    'disk_forensics',
    'network_forensics',
    'timeline_analysis',
  ],
  malware_analysis: [
    'static_analysis',
    'dynamic_analysis',
    'reverse_engineering',
    'sandbox_reports',
  ],
  behavioral_analytics: [
    'user_analytics',
    'entity_analytics',
    'anomaly_detection',
  ],
};

const TLP_LEVELS = ['white', 'green', 'amber', 'red'];
const SECURITY_DOMAINS = [
  'cybersecurity',
  'threat_hunting',
  'incident_response',
  'vulnerability_assessment',
  'compliance',
];
const CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'];
const SEVERITIES = ['low', 'medium', 'high', 'critical'];
const ACCESS_LEVELS = ['public', 'team', 'organization', 'restricted'];

function generateSuggestedQuestions(
  category: string,
  subcategory: string,
  _title: string,
): string[] {
  const baseQuestions = [
    `What are the key takeaways from this ${category.replace('_', ' ')} document?`,
    `How does this relate to current security best practices?`,
    `What are the immediate action items from this analysis?`,
  ];

  const categorySpecificQuestions: Record<string, Record<string, string[]>> = {
    threat_intelligence: {
      ioc_analysis: [
        'What IOCs should we immediately block in our environment?',
        'How confident are we in the attribution of this threat?',
        'What detection rules should we create based on these indicators?',
        'Are there any false positive risks with these IOCs?',
        'What hunting queries can we run to find related activity?',
      ],
      apt_profiles: [
        'What TTPs from this APT group should we prioritize detection for?',
        "How does this group's targeting align with our organization's profile?",
        'What defensive measures are most effective against this threat actor?',
        'Are there any industry-specific insights we should consider?',
        'What threat hunting activities should we prioritize?',
      ],
      campaign_tracking: [
        'How does this campaign relate to previous threat activities?',
        'What infrastructure patterns can we use for detection?',
        "What are the campaign's primary objectives?",
        'How can we track the evolution of this campaign?',
      ],
      attribution: [
        'What evidence supports the attribution assessment?',
        'How reliable is the source of this attribution?',
        'What geopolitical context is relevant to this attribution?',
        'How should this attribution influence our defensive posture?',
      ],
    },
    incident_response: {
      playbooks: [
        'What are the key decision points in this incident response process?',
        'How do we customize this playbook for our environment?',
        'What tools and resources are required for each phase?',
        'How do we measure the effectiveness of this response process?',
        'What training is needed for the IR team to execute this playbook?',
      ],
      procedures: [
        'What are the prerequisites for executing these procedures?',
        'How do these procedures integrate with our existing workflows?',
        'What approval processes are required for these procedures?',
        'How do we validate that these procedures were followed correctly?',
      ],
      escalation_matrix: [
        'Who should be contacted first in different incident scenarios?',
        'What information is required before escalating an incident?',
        'How do we handle escalations outside business hours?',
        'What are the communication requirements for each escalation level?',
      ],
      communication: [
        'What communication templates should we prepare in advance?',
        'How do we balance transparency with security in communications?',
        'What are the legal and regulatory communication requirements?',
        'How do we coordinate communications across multiple stakeholders?',
      ],
    },
    vulnerability_management: {
      cve_analysis: [
        'What is the exploitability of this vulnerability in our environment?',
        'What systems in our infrastructure are affected by this CVE?',
        'What is the recommended patching timeline for this vulnerability?',
        'Are there effective workarounds while patching is in progress?',
        'How should we prioritize this vulnerability against others?',
      ],
      patch_management: [
        'What is the testing process for these patches?',
        'What are the rollback procedures if patches cause issues?',
        'How do we coordinate patching across different system owners?',
        'What are the business impact considerations for this patch cycle?',
      ],
      assessment_reports: [
        'What are the highest priority vulnerabilities from this assessment?',
        'How do these findings compare to previous assessments?',
        'What resource requirements are needed to address these vulnerabilities?',
        'How do we track remediation progress for these findings?',
      ],
    },
    network_security: {
      firewall_rules: [
        'How do these firewall rules impact legitimate business traffic?',
        'What logging and monitoring should be enabled for these rules?',
        'How do we test these rules before production deployment?',
        'What is the review and maintenance schedule for these rules?',
      ],
      ids_signatures: [
        'What is the false positive rate expected for these signatures?',
        'How do these signatures integrate with our SIEM platform?',
        'What tuning may be required for our specific environment?',
        'How do we validate the effectiveness of these signatures?',
      ],
      traffic_analysis: [
        'What patterns in this traffic analysis indicate potential threats?',
        'How can we automate the detection of similar traffic patterns?',
        'What baseline measurements should we establish?',
        'How does this traffic analysis inform our network security strategy?',
      ],
      dns_security: [
        'What DNS queries should we consider suspicious or malicious?',
        'How can we implement DNS filtering based on this analysis?',
        'What DNS monitoring capabilities should we enhance?',
        'How do we balance security with DNS performance?',
      ],
    },
  };

  const categoryQuestions =
    categorySpecificQuestions[category]?.[subcategory] || [];
  const selectedQuestions = faker.helpers.arrayElements(categoryQuestions, {
    min: 2,
    max: 4,
  });

  return [...baseQuestions, ...selectedQuestions].slice(0, 6);
}

function generateSecurityKnowledgeContent(
  category: string,
  subcategory: string,
): { title: string; content: string; summary: string } {
  const templates = {
    threat_intelligence: {
      ioc_analysis: {
        title: () =>
          `IOC Analysis: ${faker.hacker.noun().toUpperCase()}-${faker.number.int({ min: 1000, max: 9999 })}`,
        content: () => `
# Indicator of Compromise Analysis

## Executive Summary
This analysis covers newly identified indicators associated with ${faker.company.name()} campaign targeting ${faker.hacker.noun()} infrastructure.

## IOC Details
- **Hash**: ${faker.string.alphanumeric(64)}
- **IP Address**: ${faker.internet.ip()}
- **Domain**: ${faker.internet.domainName()}
- **File Path**: C:\\\\${faker.system.directoryPath()}\\\\${faker.system.fileName()}

## Analysis
The malware sample exhibits ${faker.hacker.adjective()} behavior patterns consistent with ${faker.hacker.noun()} operations.
Network communications indicate C2 infrastructure hosted on ${faker.internet.domainName()}.

## Recommendations
1. Block identified IOCs at network perimeter
2. Hunt for similar patterns in environment
3. Update detection rules with new signatures
4. Monitor for lateral movement indicators

## Attribution
Likely associated with ${faker.company.name()} APT group based on TTPs and infrastructure overlap.
        `,
        summary: () =>
          `IOC analysis for ${faker.hacker.noun()} campaign with ${faker.number.int({ min: 5, max: 25 })} indicators identified`,
      },
      apt_profiles: {
        title: () =>
          `APT Profile: ${faker.company.name()} (${faker.string.alpha({ length: { min: 3, max: 6 }, casing: 'upper' })})`,
        content: () => `
# Advanced Persistent Threat Profile

## Group Overview
**Aliases**: ${faker.company.name()}, ${faker.string.alpha({ length: { min: 3, max: 8 }, casing: 'upper' })}-${faker.number.int({ min: 10, max: 99 })}
**First Observed**: ${faker.date.past({ years: 5 }).getFullYear()}
**Suspected Attribution**: ${faker.location.country()}

## Targeting
- **Industries**: ${faker.company.buzzNoun()}, ${faker.company.buzzNoun()}
- **Geographies**: ${faker.location.country()}, ${faker.location.country()}
- **Motivation**: Espionage, ${faker.hacker.noun()} theft

## Tactics, Techniques, and Procedures (TTPs)
### Initial Access
- Spear-phishing emails with ${faker.hacker.noun()} attachments
- Watering hole attacks on ${faker.company.buzzNoun()} websites
- Supply chain compromises

### Persistence
- Registry modifications
- Scheduled tasks
- Service installation

### Command and Control
- HTTPS communication to legitimate domains
- DNS tunneling via ${faker.internet.domainName()}
- Encrypted communication protocols

## Indicators
- File hashes: ${faker.string.alphanumeric(32)}
- Network signatures: ${faker.internet.ip()}/24
- Registry keys: HKLM\\\\Software\\\\${faker.company.name()}

## Defense Recommendations
1. Monitor for specific TTPs in SIEM
2. Implement network segmentation
3. Deploy endpoint detection capabilities
4. Regular threat hunting exercises
        `,
        summary: () =>
          `Comprehensive APT profile covering TTPs, indicators, and defensive recommendations`,
      },
    },
    incident_response: {
      playbooks: {
        title: () =>
          `IR Playbook: ${faker.hacker.noun().charAt(0).toUpperCase() + faker.hacker.noun().slice(1)} Incident Response`,
        content: () => `
# Incident Response Playbook

## Incident Type: ${faker.hacker.noun().toUpperCase()} Security Incident

### Phase 1: Preparation
- [ ] IR team notification
- [ ] Evidence preservation
- [ ] Stakeholder communication
- [ ] Legal/compliance notification

### Phase 2: Identification
**Detection Sources:**
- SIEM alerts
- EDR notifications
- User reports
- Threat intelligence feeds

**Initial Assessment:**
1. Determine incident scope
2. Classify incident severity
3. Identify affected systems
4. Document timeline

### Phase 3: Containment
**Short-term Containment:**
- Isolate affected systems
- Disable compromised accounts
- Block malicious network traffic
- Preserve evidence

**Long-term Containment:**
- Apply security patches
- Rebuild compromised systems
- Implement additional monitoring
- Update security controls

### Phase 4: Eradication
- Remove malware/artifacts
- Close attack vectors
- Apply security patches
- Update configurations

### Phase 5: Recovery
- Restore systems from clean backups
- Implement monitoring
- Gradual service restoration
- Validate system integrity

### Phase 6: Lessons Learned
- Post-incident review
- Update procedures
- Training recommendations
- Control improvements

## Escalation Matrix
- **L1**: ${faker.person.fullName()} - ${faker.phone.number()}
- **L2**: ${faker.person.fullName()} - ${faker.phone.number()}
- **Management**: ${faker.person.fullName()} - ${faker.phone.number()}

## Communication Templates
- Executive briefing template
- Customer notification template
- Regulatory reporting template
        `,
        summary: () =>
          `Comprehensive incident response playbook with 6-phase methodology and escalation procedures`,
      },
    },
    vulnerability_management: {
      cve_analysis: {
        title: () =>
          `CVE Analysis: CVE-${faker.date.recent().getFullYear()}-${faker.number.int({ min: 1000, max: 99999 })}`,
        content: () => `
# CVE Vulnerability Analysis

## Vulnerability Details
**CVE ID**: CVE-${faker.date.recent().getFullYear()}-${faker.number.int({ min: 1000, max: 99999 })}
**CVSS Score**: ${faker.number.float({ min: 1.0, max: 10.0, fractionDigits: 1 })}
**Severity**: ${faker.helpers.arrayElement(['Low', 'Medium', 'High', 'Critical'])}

## Affected Systems
- **Vendor**: ${faker.company.name()}
- **Product**: ${faker.commerce.productName()}
- **Versions**: ${faker.system.semver()} - ${faker.system.semver()}
- **Platforms**: ${faker.helpers.arrayElements(['Windows', 'Linux', 'macOS', 'Android', 'iOS'], { min: 1, max: 3 }).join(', ')}

## Technical Analysis
### Vulnerability Type
${faker.helpers.arrayElement(['Buffer Overflow', 'SQL Injection', 'Cross-Site Scripting', 'Remote Code Execution', 'Privilege Escalation'])}

### Attack Vector
The vulnerability can be exploited through ${faker.hacker.noun()} by sending specially crafted ${faker.hacker.noun()} to the affected application.

### Impact Assessment
- **Confidentiality**: ${faker.helpers.arrayElement(['None', 'Partial', 'Complete'])}
- **Integrity**: ${faker.helpers.arrayElement(['None', 'Partial', 'Complete'])}
- **Availability**: ${faker.helpers.arrayElement(['None', 'Partial', 'Complete'])}

## Exploitation
### Proof of Concept
A working exploit has been ${faker.helpers.arrayElement(['published', 'reported', 'observed in the wild'])}.
Exploit complexity is rated as ${faker.helpers.arrayElement(['Low', 'Medium', 'High'])}.

### Threat Intelligence
- **Active Exploitation**: ${faker.datatype.boolean() ? 'Yes' : 'No'}
- **Exploit Kit Integration**: ${faker.datatype.boolean() ? 'Yes' : 'No'}
- **APT Usage**: ${faker.datatype.boolean() ? 'Yes' : 'No'}

## Remediation
### Vendor Patch
- **Patch Available**: ${faker.datatype.boolean() ? 'Yes' : 'No'}
- **Release Date**: ${faker.date.recent().toISOString().split('T')[0]}
- **Patch Complexity**: ${faker.helpers.arrayElement(['Simple', 'Moderate', 'Complex'])}

### Workarounds
1. Disable affected service if not required
2. Implement network-level filtering
3. Apply compensating controls
4. Monitor for exploitation attempts

## Risk Assessment
**Organizational Risk**: ${faker.helpers.arrayElement(['Low', 'Medium', 'High', 'Critical'])}
**Patching Priority**: ${faker.helpers.arrayElement(['Low', 'Medium', 'High', 'Emergency'])}
**SLA**: ${faker.number.int({ min: 1, max: 90 })} days

## Asset Inventory Impact
- **Total Affected Assets**: ${faker.number.int({ min: 1, max: 500 })}
- **Critical Systems**: ${faker.number.int({ min: 0, max: 50 })}
- **Internet-Facing**: ${faker.number.int({ min: 0, max: 100 })}

## References
- [Vendor Advisory](https://example.com/advisory)
- [CVE Details](https://cve.mitre.org/cgi-bin/cvename.cgi)
- [Exploitation Timeline](https://example.com/timeline)
        `,
        summary: () =>
          `Detailed CVE analysis including technical details, impact assessment, and remediation guidance`,
      },
    },
  };

  const categoryTemplates = templates[category as keyof typeof templates];
  if (!categoryTemplates) {
    return {
      title: `Security Knowledge: ${category}`,
      content: `# Security Knowledge Document\n\nThis document contains security information related to ${category}.`,
      summary: `Security knowledge document for ${category}`,
    };
  }

  const subcategoryTemplate =
    categoryTemplates[subcategory as keyof typeof categoryTemplates];
  if (!subcategoryTemplate) {
    return {
      title: `${category}: ${subcategory}`,
      content: `# ${category.replace('_', ' ').toUpperCase()}\n\nThis document contains information about ${subcategory}.`,
      summary: `Security information about ${subcategory}`,
    };
  }

  // Type assertion since we've checked subcategoryTemplate exists and has the required methods
  const template = subcategoryTemplate as {
    title: () => string;
    content: () => string;
    summary: () => string;
  };

  return {
    title: template.title(),
    content: template.content(),
    summary: template.summary(),
  };
}

export function generateKnowledgeBaseDocument(
  includeMitre: boolean = false,
  constrainedCategories?: string[],
): KnowledgeBaseDocument {
  const availableCategories =
    constrainedCategories && constrainedCategories.length > 0
      ? constrainedCategories.filter((cat) => SECURITY_CATEGORIES.includes(cat))
      : SECURITY_CATEGORIES;

  const category = faker.helpers.arrayElement(availableCategories);
  const subcategory = faker.helpers.arrayElement(
    SUBCATEGORIES[category] || ['general'],
  );
  const { title, content, summary } = generateSecurityKnowledgeContent(
    category,
    subcategory,
  );

  const suggested_questions = generateSuggestedQuestions(
    category,
    subcategory,
    title,
  );

  const doc: KnowledgeBaseDocument = {
    '@timestamp': faker.date.recent().toISOString(),
    content,
    title,
    summary,
    suggested_questions,
    category,
    subcategory,
    tags: faker.helpers.arrayElements(
      [
        'security',
        'cybersecurity',
        'threat',
        'analysis',
        'detection',
        'response',
        'vulnerability',
        'malware',
        'incident',
        'forensics',
        'compliance',
        'risk',
      ],
      { min: 3, max: 8 },
    ),
    source: faker.helpers.arrayElement([
      'internal',
      'external',
      'vendor',
      'community',
      'research',
    ]),
    confidence: faker.number.float({ min: 0.6, max: 1.0, fractionDigits: 2 }),
    language: 'en',
    version: `${faker.number.int({ min: 1, max: 5 })}.${faker.number.int({ min: 0, max: 9 })}`,
    last_updated: faker.date.recent().toISOString(),
    author: faker.person.fullName(),
    access_level: faker.helpers.arrayElement(ACCESS_LEVELS),
    security: {
      domain: faker.helpers.arrayElement(SECURITY_DOMAINS),
      classification: faker.helpers.arrayElement(CLASSIFICATIONS),
      severity: faker.helpers.arrayElement(SEVERITIES),
      tlp: faker.helpers.arrayElement(TLP_LEVELS),
    },
    metadata: {
      format: 'markdown',
      size_bytes: content.length,
      checksum: faker.string.alphanumeric(64),
      references: faker.internet.url(),
      related_documents: faker.helpers.arrayElements(
        [faker.string.uuid(), faker.string.uuid(), faker.string.uuid()],
        { min: 0, max: 3 },
      ),
    },
  };

  // Add MITRE ATT&CK information if requested
  if (includeMitre) {
    const mitreData = loadMitreData();
    if (mitreData) {
      const selectedTechniques = selectMitreTechniques(
        mitreData,
        faker.number.int({ min: 1, max: 4 }),
      );
      doc.mitre = {
        technique_ids: selectedTechniques.map((t) => t.technique),
        tactic_ids: selectedTechniques.map((t) => t.tactic),
        framework: 'MITRE ATT&CK',
      };
    }
  }

  return doc;
}

export function generateMultipleKnowledgeBaseDocuments(
  count: number,
  includeMitre: boolean = false,
): KnowledgeBaseDocument[] {
  return Array.from({ length: count }, () =>
    generateKnowledgeBaseDocument(includeMitre),
  );
}
