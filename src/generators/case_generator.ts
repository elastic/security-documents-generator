import { faker } from '@faker-js/faker';
import {
  loadMitreData,
  selectMitreTechniques,
} from '../utils/mitre_attack_service';
import { CasePostRequest } from '../utils/kibana_client';
import { getConfig } from '../get_config';
import { safeJsonParse } from '../utils/error_handling';
import { sanitizeJSONResponse } from '../utils/validation_service';
import { OpenAI } from 'openai';
import Anthropic from '@anthropic-ai/sdk';

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

// AI-powered case generation
async function generateAICase(theme?: string): Promise<any> {
  const config = getConfig();
  
  // Initialize AI client
  let openai: OpenAI | null = null;
  let claude: Anthropic | null = null;
  
  if (config.useClaudeAI && config.claudeApiKey) {
    claude = new Anthropic({ apiKey: config.claudeApiKey });
  } else if (config.useAzureOpenAI && config.azureOpenAIApiKey) {
    openai = new OpenAI({ 
      apiKey: config.azureOpenAIApiKey,
      baseURL: config.azureOpenAIEndpoint,
    });
  } else if (config.openaiApiKey) {
    openai = new OpenAI({ 
      apiKey: config.openaiApiKey,
    });
  }

  if (!openai && !claude) {
    // AI not configured - use varied template generation
    return generateVariedTemplateCase(theme);
  }

  const themeContext = theme ? generateThemePromptContext(theme) : '';
  
  const prompt = `Generate 1 security case as JSON:
{"title":"Brief incident title","description":"2-3 sentences describing the incident","severity":"high","affected_systems":["system1","system2"],"category":"security_incident","incident_type":"Malware Infection","lead_analyst":"Jane Doe","findings":["Key finding 1","Key finding 2"]}

Categories: security_incident, threat_hunting, malware_analysis, vulnerability_investigation, compliance_violation, insider_threat
Severities: low, medium, high, critical
Incident types: Security Breach, Malware Infection, Data Exfiltration, Phishing Attack, Insider Threat
${themeContext}

Return only valid JSON object.`;

  try {
    let response;
    if (claude) {
      const claudeResponse = await claude.messages.create({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
      });
      response = claudeResponse.content[0].type === 'text' ? claudeResponse.content[0].text : '';
    } else if (openai) {
      const openaiResponse = await openai.chat.completions.create({
        model: config.useAzureOpenAI ? (config.azureOpenAIDeployment || 'gpt-4o') : 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 1000,
      });
      response = openaiResponse.choices[0].message.content || '';
    }

    if (response) {
      const cleaned = sanitizeJSONResponse(response);
      return safeJsonParse(cleaned);
    }
  } catch (error) {
    // Silently fall back to varied template generation when AI fails
    return generateVariedTemplateCase(theme);
  }

  return null;
}

// Generate varied template-based case when AI fails
function generateVariedTemplateCase(theme?: string): any {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  
  const incidents = [
    'Suspicious Network Activity',
    'Potential Data Breach',
    'Malware Detection Alert',
    'Unauthorized Access Attempt',
    'Phishing Campaign Investigation',
    'Insider Threat Analysis',
    'Vulnerability Exploitation',
    'Ransomware Indicators',
    'Compliance Violation',
    'Security Policy Breach',
    'Anomalous User Behavior',
    'Credential Compromise',
    'Lateral Movement Detection',
    'Command and Control Activity',
    'Data Exfiltration Alert'
  ];
  
  const severities = ['low', 'medium', 'high', 'critical'];
  
  const incident = incidents[Math.floor(Math.random() * incidents.length)];
  const severity = severities[Math.floor(Math.random() * severities.length)];
  
  // Generate realistic themed context
  const { themeContext, themeLocation, themeSystems } = generateThemeContext(theme);
  
  return {
    title: `${incident}${themeLocation ? ` on ${themeLocation}` : ''}`,
    description: `Security investigation for ${incident.toLowerCase()} detected${themeContext ? ` in ${themeContext}` : ''} at ${new Date().toISOString()}. Requires immediate analysis and response.`,
    severity: severity,
    category: 'security_incident',
    incident_type: incident,
    lead_analyst: faker.helpers.arrayElement(ANALYST_NAMES),
    affected_systems: themeSystems,
    findings: [
      `Initial detection: ${incident}${themeContext ? ` in ${themeContext}` : ''}`,
      `Timestamp: ${new Date().toISOString()}`,
      `Investigation ID: ${random.toUpperCase()}`
    ]
  };
}

// Generate theme-specific prompt context for AI
function generateThemePromptContext(theme: string): string {
  const prompts: Record<string, string> = {
    marvel: `Theme: Marvel Universe. Use locations like Stark Tower, Avengers Compound, S.H.I.E.L.D. Helicarrier. Systems like stark-ai-core, avengers-database, shield-mainframe. Make it about superhero organizations and their technology.`,
    starwars: `Theme: Star Wars Universe. Use locations like Death Star, Rebel Base, Imperial Fleet, Jedi Temple. Systems like death-star-core, rebel-comms, imperial-database. Make it about galactic empires and rebel networks.`,
    nba: `Theme: NBA Basketball. Use locations like Staples Center, Chase Center, NBA HQ. Systems like nba-stats-db, lakers-network, warriors-systems. Make it about basketball organizations and sports networks.`,
    soccer: `Theme: Soccer/Football. Use locations like Old Trafford, Camp Nou, FIFA HQ, Wembley Stadium. Systems like manutd-network, barca-database, fifa-systems. Make it about football clubs and leagues.`,
    tech_companies: `Theme: Tech Companies. Use locations like Apple Park, Google Campus, Microsoft HQ. Systems like apple-icloud, google-search, microsoft-azure. Make it about major technology corporations.`,
    programming: `Theme: Programming/Development. Use locations like GitHub HQ, Stack Overflow. Systems like github-repos, stackoverflow-db, python-mirrors. Make it about developer communities and coding platforms.`
  };
  
  return prompts[theme] || `Theme: ${theme}. Use realistic ${theme}-related locations, systems, and context for the security case.`;
}

// Generate realistic theme context for cases
function generateThemeContext(theme?: string): {
  themeContext: string;
  themeLocation: string;
  themeSystems: string[];
} {
  if (!theme) {
    return {
      themeContext: '',
      themeLocation: '',
      themeSystems: ['web-server-01', 'database-02', 'workstation-03']
    };
  }

  const themeData: Record<string, {
    contexts: string[];
    locations: string[];
    systems: string[];
  }> = {
    marvel: {
      contexts: ['Stark Industries network', 'Avengers facility', 'S.H.I.E.L.D. systems', 'Xavier Institute'],
      locations: ['Stark Tower', 'Avengers Compound', 'S.H.I.E.L.D. Helicarrier', 'Wakanda Embassy'],
      systems: ['stark-ai-core', 'avengers-database', 'shield-mainframe', 'wakanda-network', 'jarvis-backup']
    },
    starwars: {
      contexts: ['Rebel Alliance network', 'Imperial systems', 'Jedi Temple archives', 'Death Star infrastructure'],
      locations: ['Death Star', 'Rebel Base', 'Imperial Fleet', 'Jedi Temple'],
      systems: ['death-star-core', 'rebel-comms', 'imperial-database', 'jedi-archives', 'droid-network']
    },
    nba: {
      contexts: ['NBA headquarters', 'Lakers facility', 'Warriors training center', 'league operations'],
      locations: ['Staples Center', 'Chase Center', 'NBA HQ', 'Training Facility'],
      systems: ['nba-stats-db', 'lakers-network', 'warriors-systems', 'arena-security', 'player-portal']
    },
    soccer: {
      contexts: ['Manchester United network', 'Barcelona systems', 'FIFA headquarters', 'Premier League'],
      locations: ['Old Trafford', 'Camp Nou', 'FIFA HQ', 'Wembley Stadium'],
      systems: ['manutd-network', 'barca-database', 'fifa-systems', 'premier-league-hub', 'stadium-security']
    },
    tech_companies: {
      contexts: ['Apple corporate network', 'Google datacenter', 'Microsoft Azure', 'Meta infrastructure'],
      locations: ['Apple Park', 'Google Campus', 'Microsoft HQ', 'Meta Menlo Park'],
      systems: ['apple-icloud', 'google-search', 'microsoft-azure', 'meta-servers', 'aws-infrastructure']
    },
    programming: {
      contexts: ['GitHub enterprise', 'Stack Overflow systems', 'Python foundation', 'JavaScript community'],
      locations: ['GitHub HQ', 'Stack Overflow', 'Python.org', 'Node.js Foundation'],
      systems: ['github-repos', 'stackoverflow-db', 'python-mirrors', 'nodejs-cdn', 'docker-registry']
    }
  };

  const defaultTheme = {
    contexts: [`${theme} organization`, `${theme} network`, `${theme} systems`],
    locations: [`${theme} HQ`, `${theme} Facility`, `${theme} Center`],
    systems: [`${theme}-server-01`, `${theme}-database`, `${theme}-workstation`]
  };

  const data = themeData[theme] || defaultTheme;
  
  return {
    themeContext: faker.helpers.arrayElement(data.contexts),
    themeLocation: faker.helpers.arrayElement(data.locations),
    themeSystems: faker.helpers.arrayElements(data.systems, { min: 2, max: 4 })
  };
}

// Enhance AI-generated case with full structure
async function enhanceAICaseWithStructure(
  aiCase: any,
  includeMitre: boolean,
  owner: string,
): Promise<SecurityCaseData> {
  const now = new Date();
  const discoveryTime = faker.date.recent({ days: 2 });
  
  // Use AI data but ensure required structure
  const fullCase: SecurityCaseData = {
    title: aiCase.title || 'Security Investigation Required',
    description: aiCase.description || 'AI-generated security case requiring investigation.',
    tags: [
      aiCase.category || 'security_incident',
      aiCase.severity || 'medium',
      ...(aiCase.findings ? ['ai-enhanced'] : []),
    ],
    severity: aiCase.severity || 'medium',
    owner,
    assignees: [{ uid: (aiCase.lead_analyst || 'security.analyst').toLowerCase().replace(/\s+/g, '.') }],
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
      category: aiCase.category || 'security_incident',
      subcategory: 'ai_generated',
      incident_type: aiCase.incident_type || 'Security Alert',
      priority: aiCase.severity || 'medium',
      impact_assessment: 'AI-generated case requiring assessment',
      affected_systems: aiCase.affected_systems || ['unknown-system'],
      threat_level: aiCase.severity || 'medium',
    },
    timeline: {
      discovery_time: discoveryTime.toISOString(),
      first_occurrence: discoveryTime.toISOString(),
    },
    investigation: {
      lead_analyst: aiCase.lead_analyst || 'Auto-Assignment Pending',
      team: ['SOC Tier 1'],
      status: 'open',
      findings: aiCase.findings || undefined,
    },
    metadata: {
      case_id: faker.string.uuid(),
      created_by: 'AI-Enhanced Generation',
      last_updated: now.toISOString(),
      escalation_level: aiCase.severity === 'critical' ? 4 : aiCase.severity === 'high' ? 3 : 2,
      alert_count: faker.number.int({ min: 0, max: 10 }),
    },
  };

  if (includeMitre) {
    fullCase.mitre = await generateMitreData();
    fullCase.tags.push('mitre-attack', ...(fullCase.mitre.technique_ids.slice(0, 2)));
  }

  return fullCase;
}

// Generate a single security case with AI enhancement
export async function generateSecurityCase(
  includeMitre: boolean = false,
  owner: string = 'securitySolution',
  useAI: boolean = false,
  theme?: string,
): Promise<SecurityCaseData> {
  // Try AI generation first if enabled
  if (useAI) {
    try {
      const aiCase = await generateAICase(theme);
      if (aiCase) {
        return enhanceAICaseWithStructure(aiCase, includeMitre, owner);
      }
    } catch (error) {
      console.warn('AI case generation failed, falling back to template:', error);
    }
  }

  // Fallback to template-based generation
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
  useAI: boolean = false,
  theme?: string,
): Promise<SecurityCaseData[]> {
  const cases: SecurityCaseData[] = [];

  for (let i = 0; i < count; i++) {
    const securityCase = await generateSecurityCase(includeMitre, owner, useAI, theme);
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
