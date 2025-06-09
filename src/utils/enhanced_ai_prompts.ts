/**
 * Enhanced AI Prompt Templates
 *
 * This module provides sophisticated prompt templates for generating realistic
 * security events with proper context, correlation, and technical accuracy.
 * These prompts incorporate MITRE ATT&CK techniques, threat actor behaviors,
 * and enterprise network environments.
 */

export interface PromptContext {
  campaign_id?: string;
  stage_name?: string;
  technique?: string;
  threat_actor?: string;
  parent_event_ids?: string[];
  network_context?: NetworkContext;
  user_context?: UserContext;
  temporal_context?: TemporalContext;
}

export interface NetworkContext {
  subnet: string;
  security_zone: 'dmz' | 'internal' | 'management' | 'critical';
  network_topology: {
    domain: string;
    forest: string;
    trust_relationships: string[];
  };
  security_controls: string[];
}

export interface UserContext {
  department: string;
  role: string;
  access_level: 'standard' | 'privileged' | 'admin';
  typical_behavior: {
    login_times: string[];
    accessed_systems: string[];
    file_patterns: string[];
  };
}

export interface TemporalContext {
  business_hours: boolean;
  weekend: boolean;
  holiday: boolean;
  maintenance_window: boolean;
}

/**
 * Core AI prompt templates for different security event types
 */
export const AI_PROMPT_TEMPLATES = {
  // Advanced Persistent Threat (APT) Events
  apt_reconnaissance: (context: PromptContext) => `
Generate a realistic security alert for APT reconnaissance activities.

Context:
- Campaign: ${context.campaign_id || 'Unknown APT Campaign'}
- Threat Actor: ${context.threat_actor || 'Advanced Persistent Threat'}
- Stage: ${context.stage_name || 'Initial Reconnaissance'}
- MITRE Technique: ${context.technique || 'T1589'}

Requirements:
1. Create DNS reconnaissance activity showing systematic information gathering
2. Include multiple DNS query types (A, MX, NS, TXT records)
3. Show queries for infrastructure mapping and employee enumeration
4. Include suspicious timing patterns and query volumes
5. Reference legitimate reconnaissance tools (nslookup, dig, nmap)
6. Add network artifacts: source IPs, DNS servers, query patterns
7. Include TTPs consistent with ${context.threat_actor} group
8. Show progression from passive to active reconnaissance
9. Add correlation indicators linking to parent events: ${context.parent_event_ids?.join(', ') || 'None'}

Generate detailed fields including:
- DNS query logs with specific domains and record types
- Network connection metadata
- Timeline showing escalation of reconnaissance activities
- Process creation events for reconnaissance tools
- File system artifacts from tool downloads/execution
`,

  apt_initial_access: (context: PromptContext) => `
Generate a realistic APT initial access security alert.

Context:
- Campaign: ${context.campaign_id || 'APT Campaign'}
- Threat Actor: ${context.threat_actor || 'Advanced Threat Group'}
- Stage: ${context.stage_name || 'Initial Access'}
- MITRE Technique: ${context.technique || 'T1566.001'}

Requirements:
1. Create spear-phishing email with targeted content for ${context.user_context?.department || 'Finance'} department
2. Include malicious attachment (PDF/DOCX) with embedded exploit
3. Show email metadata: sender reputation, SPF/DKIM results, suspicious headers
4. Add victim interaction: file download, execution, process creation
5. Include exploitation artifacts: CVE references, shellcode indicators
6. Show initial payload deployment and callback establishment
7. Add network connections to C2 infrastructure
8. Include persistence mechanism establishment
9. Reference previous reconnaissance events: ${context.parent_event_ids?.join(', ') || 'None'}

Generate detailed fields including:
- Email header analysis with suspicious indicators
- File hash analysis and reputation scores
- Process execution tree showing exploitation chain
- Network communication to command and control servers
- Registry modifications for persistence
- Memory artifacts from payload injection
`,

  apt_persistence: (context: PromptContext) => `
Generate a realistic APT persistence establishment alert.

Context:
- Campaign: ${context.campaign_id || 'APT Campaign'}
- Threat Actor: ${context.threat_actor || 'Advanced Threat Group'}
- Stage: ${context.stage_name || 'Persistence'}
- MITRE Technique: ${context.technique || 'T1547.001'}

Requirements:
1. Create registry-based persistence mechanism
2. Show creation of malicious registry keys and values
3. Include file system modifications for backdoor installation
4. Add scheduled task or service creation
5. Show privilege escalation attempts if needed
6. Include anti-forensics techniques (log clearing, timestamp manipulation)
7. Add network traffic to maintain C2 communication channels
8. Show defensive evasion techniques
9. Correlate with initial access events: ${context.parent_event_ids?.join(', ') || 'None'}

Generate detailed fields including:
- Registry key modifications with specific paths and values
- File creation events in system directories
- Service installation with persistence characteristics
- Network connections maintaining C2 communication
- Process injection techniques for stealth
- Event log clearing or modification attempts
`,

  lateral_movement: (context: PromptContext) => `
Generate a realistic lateral movement security alert.

Context:
- Campaign: ${context.campaign_id || 'Attack Campaign'}
- Stage: ${context.stage_name || 'Lateral Movement'}
- MITRE Technique: ${context.technique || 'T1021.001'}
- Network Zone: ${context.network_context?.security_zone || 'internal'}

Requirements:
1. Show RDP/SMB lateral movement between hosts
2. Include credential harvesting and reuse
3. Add network authentication events (Kerberos, NTLM)
4. Show file share enumeration and access
5. Include process creation on target systems
6. Add network traffic analysis showing lateral spread
7. Show privilege escalation on compromised hosts
8. Include evidence of credential dumping tools (Mimikatz, ProcDump)
9. Correlate with previous stage activities: ${context.parent_event_ids?.join(', ') || 'None'}

Generate detailed fields including:
- Authentication logs showing unusual cross-system access
- Network connection logs with suspicious RDP/SMB traffic
- Process creation events on multiple hosts
- File access logs showing credential file targeting
- Registry access events related to credential storage
- Memory analysis artifacts from credential extraction
`,

  data_exfiltration: (context: PromptContext) => `
Generate a realistic data exfiltration security alert.

Context:
- Campaign: ${context.campaign_id || 'Data Theft Campaign'}
- Stage: ${context.stage_name || 'Exfiltration'}
- MITRE Technique: ${context.technique || 'T1041'}
- User: ${context.user_context?.role || 'Standard User'}

Requirements:
1. Show large-scale data collection and staging
2. Include file access logs for sensitive documents
3. Add data compression and encryption activities
4. Show network exfiltration to external destinations
5. Include DNS tunneling or other covert channels
6. Add cloud storage abuse (OneDrive, Dropbox, etc.)
7. Show timing patterns consistent with automated exfiltration
8. Include data loss prevention (DLP) policy violations
9. Correlate with collection phase events: ${context.parent_event_ids?.join(', ') || 'None'}

Generate detailed fields including:
- File access logs showing systematic document collection
- Network upload traffic to suspicious external destinations
- Process creation for archiving and encryption tools
- DNS queries to cloud storage and file sharing services
- HTTP/HTTPS traffic analysis with large upload volumes
- DLP policy violations with data classification details
`,

  ransomware_encryption: (context: PromptContext) => `
Generate a realistic ransomware encryption security alert.

Context:
- Campaign: ${context.campaign_id || 'Ransomware Attack'}
- Ransomware Family: ${context.threat_actor || 'Unknown Ransomware'}
- Stage: ${context.stage_name || 'Impact'}
- MITRE Technique: ${context.technique || 'T1486'}

Requirements:
1. Show systematic file encryption across multiple directories
2. Include ransom note creation and placement
3. Add file extension changes indicating encryption
4. Show process creation for encryption tools
5. Include network share enumeration and encryption
6. Add volume shadow copy deletion activities
7. Show registry modifications for wallpaper/boot message changes
8. Include backup deletion and recovery prevention
9. Correlate with deployment stage events: ${context.parent_event_ids?.join(', ') || 'None'}

Generate detailed fields including:
- File modification events showing mass encryption activity
- Process creation for encryption and deletion tools
- Registry changes for ransom message display
- Network activity showing share enumeration
- Volume shadow copy service manipulation
- Backup service disruption and deletion activities
`,

  insider_threat_after_hours: (context: PromptContext) => `
Generate a realistic insider threat after-hours access alert.

Context:
- User: ${context.user_context?.role || 'Employee'} in ${context.user_context?.department || 'Finance'}
- Access Level: ${context.user_context?.access_level || 'standard'}
- Time Context: ${context.temporal_context?.business_hours ? 'Business Hours' : 'After Hours'}
- Baseline Behavior: Login times ${context.user_context?.typical_behavior?.login_times?.join(', ') || '9AM-5PM'}

Requirements:
1. Show login activity outside normal business hours
2. Include unusual system and file access patterns
3. Add geographic location anomalies if applicable
4. Show deviation from established behavioral baselines
5. Include access to sensitive data not typically accessed
6. Add privilege escalation attempts or unusual administrative actions
7. Show correlation with HR indicators (performance issues, disciplinary actions)
8. Include data collection and potential staging activities

Generate detailed fields including:
- Authentication logs with timestamp and location analysis
- File access logs showing sensitive document retrieval
- System access patterns deviating from baseline behavior
- Network activity showing unusual data movement
- Application usage outside normal job responsibilities
- Risk scoring based on behavioral deviation metrics
`,

  supply_chain_compromise: (context: PromptContext) => `
Generate a realistic supply chain compromise security alert.

Context:
- Campaign: ${context.campaign_id || 'Supply Chain Attack'}
- Attack Vector: ${context.stage_name || 'Software Supply Chain'}
- MITRE Technique: ${context.technique || 'T1195'}
- Threat Actor: ${context.threat_actor || 'Nation State Actor'}

Requirements:
1. Show compromised software update or installation
2. Include code signing certificate anomalies
3. Add network communication to suspicious update servers
4. Show unexpected software behavior post-installation
5. Include file integrity violations and hash mismatches
6. Add privilege escalation from trusted software context
7. Show lateral movement leveraging supply chain foothold
8. Include detection of embedded backdoors or malicious code

Generate detailed fields including:
- Software installation logs with signature verification failures
- Network connections to unauthorized update infrastructure
- File system changes showing malicious component installation
- Process creation from trusted software with suspicious behavior
- Registry modifications enabling persistent access
- Code signing certificate chain analysis showing compromise indicators
`,

  user_behavior_anomaly: (context: PromptContext) => `
Generate a realistic User Behavior Analytics (UBA) anomaly alert.

Context:
- User Profile: ${context.user_context?.role || 'Standard User'}
- Anomaly Type: ${context.stage_name || 'Behavioral Deviation'}
- Risk Score: High deviation from baseline behavior
- Department: ${context.user_context?.department || 'General'}

Requirements:
1. Show specific behavioral metrics exceeding baseline thresholds
2. Include temporal analysis of activity patterns
3. Add peer group comparison for context
4. Show progression of anomalous behavior over time
5. Include risk scoring with contributing factors
6. Add correlation with security events and system activities
7. Show potential impact assessment
8. Include recommended investigation steps

Generate detailed fields including:
- Behavioral metrics with baseline vs. observed values
- Statistical analysis showing confidence intervals and z-scores
- Peer group behavioral comparison data
- Timeline of behavioral changes and triggers
- Risk assessment with contributing factor breakdown
- Correlation with other security events and indicators
`,
};

/**
 * Context-aware prompt generation for realistic security events
 */
export class EnhancedPromptGenerator {
  /**
   * Generates context-enriched prompts for AI security event generation
   */
  static generatePrompt(
    alertType: string,
    baseContext: PromptContext,
    enhancementLevel: 'basic' | 'advanced' | 'expert' = 'advanced',
  ): string {
    const templateKey = this.mapAlertTypeToTemplate(alertType);
    const template =
      AI_PROMPT_TEMPLATES[templateKey as keyof typeof AI_PROMPT_TEMPLATES];

    if (!template) {
      return this.generateFallbackPrompt(alertType, baseContext);
    }

    const enrichedContext = this.enrichContext(baseContext, enhancementLevel);
    const basePrompt = template(enrichedContext);

    return this.addEnhancementDirectives(
      basePrompt,
      enhancementLevel,
      enrichedContext,
    );
  }

  /**
   * Maps alert types to appropriate prompt templates
   */
  private static mapAlertTypeToTemplate(alertType: string): string {
    const typeMapping: Record<string, string> = {
      TA0043_reconnaissance: 'apt_reconnaissance',
      TA0001_initial_access: 'apt_initial_access',
      TA0003_persistence: 'apt_persistence',
      TA0008_lateral_movement: 'lateral_movement',
      TA0010_exfiltration: 'data_exfiltration',
      TA0040_impact: 'ransomware_encryption',
      insider_threat: 'insider_threat_after_hours',
      supply_chain: 'supply_chain_compromise',
      uba_temporal_high: 'user_behavior_anomaly',
      uba_volumetric_medium: 'user_behavior_anomaly',
      uba_geographic_high: 'user_behavior_anomaly',
    };

    return typeMapping[alertType] || 'apt_initial_access';
  }

  /**
   * Enriches context with additional realistic details
   */
  private static enrichContext(
    baseContext: PromptContext,
    enhancementLevel: 'basic' | 'advanced' | 'expert',
  ): PromptContext {
    const enriched: PromptContext = { ...baseContext };

    if (enhancementLevel === 'advanced' || enhancementLevel === 'expert') {
      if (!enriched.network_context) {
        enriched.network_context = {
          subnet: '10.1.0.0/24',
          security_zone: 'internal',
          network_topology: {
            domain: 'corp.local',
            forest: 'corp.local',
            trust_relationships: ['partner.local'],
          },
          security_controls: [
            'Windows Defender',
            'CrowdStrike EDR',
            'Splunk SIEM',
          ],
        };
      }

      if (!enriched.temporal_context) {
        const now = new Date();
        enriched.temporal_context = {
          business_hours: now.getHours() >= 9 && now.getHours() <= 17,
          weekend: now.getDay() === 0 || now.getDay() === 6,
          holiday: false,
          maintenance_window: false,
        };
      }
    }

    if (enhancementLevel === 'expert') {
      // Add expert-level context enrichment
      if (enriched.technique) {
        enriched.threat_actor = this.inferThreatActorFromTechnique(
          enriched.technique,
        );
      }
    }

    return enriched;
  }

  /**
   * Adds enhancement directives based on sophistication level
   */
  private static addEnhancementDirectives(
    basePrompt: string,
    enhancementLevel: 'basic' | 'advanced' | 'expert',
    context: PromptContext,
  ): string {
    let enhancedPrompt = basePrompt;

    if (enhancementLevel === 'advanced' || enhancementLevel === 'expert') {
      enhancedPrompt += `

ADVANCED REQUIREMENTS:
- Include realistic IOCs (file hashes, IP addresses, domains)
- Add proper EDR telemetry fields (process GUIDs, parent-child relationships)
- Include SIEM correlation fields and enrichment data
- Add network flow analysis with protocol-specific details
- Include memory analysis artifacts and behavioral indicators
- Add threat intelligence context and attribution confidence levels`;
    }

    if (enhancementLevel === 'expert') {
      enhancedPrompt += `

EXPERT REQUIREMENTS:
- Include sophisticated evasion techniques and anti-analysis methods
- Add multi-stage attack progression with temporal correlation
- Include living-off-the-land techniques and legitimate tool abuse
- Add advanced persistent mechanisms and steganographic communication
- Include attribution indicators and TTPs consistent with known threat groups
- Add comprehensive forensic artifacts across multiple data sources
- Include machine learning detection bypass techniques
- Add supply chain and third-party risk indicators`;
    }

    return enhancedPrompt;
  }

  /**
   * Generates fallback prompt for unknown alert types
   */
  private static generateFallbackPrompt(
    alertType: string,
    context: PromptContext,
  ): string {
    return `
Generate a realistic security alert for: ${alertType}

Context:
- Campaign: ${context.campaign_id || 'Unknown'}
- Stage: ${context.stage_name || 'Unknown'}
- Technique: ${context.technique || 'Unknown'}
- Threat Actor: ${context.threat_actor || 'Unknown'}

Requirements:
1. Create detailed security event with appropriate severity and context
2. Include relevant technical artifacts and indicators
3. Add correlation information linking to related events
4. Show realistic network and system telemetry
5. Include proper timestamps and metadata
6. Add risk assessment and impact analysis
7. Include recommended response actions

Generate comprehensive security alert with all relevant fields populated.`;
  }

  /**
   * Infers threat actor from MITRE technique
   */
  private static inferThreatActorFromTechnique(technique: string): string {
    const techniqueActorMap: Record<string, string> = {
      'T1566.001': 'APT1',
      T1190: 'Lazarus Group',
      T1486: 'Conti Ransomware',
      T1078: 'Carbanak',
      'T1021.001': 'APT29',
      T1041: 'FIN7',
    };

    return techniqueActorMap[technique] || 'Unknown Threat Actor';
  }
}

export default EnhancedPromptGenerator;
