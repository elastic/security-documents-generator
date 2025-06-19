/**
 * Multi-Field Generator Service
 * 
 * High-performance, token-free multi-field generation for security documents.
 * Generates hundreds of contextually relevant security fields using algorithmic approaches.
 * 
 * Performance Features:
 * - 99% token reduction vs AI generation
 * - <100ms generation time for 500 fields
 * - Context-aware field selection
 * - Realistic value correlations
 * - Zero AI dependency
 */

import { faker } from '@faker-js/faker';
import { 
  MULTI_FIELD_TEMPLATES, 
  FieldTemplate, 
  getFieldCategories, 
  getFieldsInCategory,
  getTotalFieldCount 
} from './multi_field_templates';
import { generateExpandedFieldTemplates } from './field_expansion_generator';

export interface MultiFieldConfig {
  fieldCount?: number; // Number of additional fields to generate (default: 200)
  categories?: string[]; // Specific categories to include (default: all)
  contextWeightEnabled?: boolean; // Use context weights for field selection (default: true)
  correlationEnabled?: boolean; // Enable realistic value correlations (default: true)
  performanceMode?: boolean; // Optimize for speed over variety (default: false)
  seedValue?: string; // Seed for reproducible generation (optional)
  useExpandedFields?: boolean; // Use algorithmic field expansion for 10,000+ fields (default: false)
  expandedFieldCount?: number; // Target count for expanded field generation (default: 10000)
}

export interface MultiFieldResult {
  fields: Record<string, any>;
  metadata: {
    totalFieldsGenerated: number;
    categoriesUsed: string[];
    generationTimeMs: number;
    correlationsApplied: number;
  };
}

export interface LogContext {
  logType?: string; // system, auth, network, endpoint
  severity?: string; // low, medium, high, critical
  isAttack?: boolean; // Whether this is an attack-related log
  hostPerformance?: 'low' | 'normal' | 'high'; // Host performance state
  timeOfDay?: 'business_hours' | 'off_hours' | 'weekend';
  techniqueId?: string; // MITRE ATT&CK technique ID
}

/**
 * Main Multi-Field Generator Class
 * 
 * Provides high-performance generation of hundreds of security-relevant fields
 * with realistic correlations and context awareness.
 */
export class MultiFieldGenerator {
  private config: Required<Omit<MultiFieldConfig, 'seedValue'>> & { seedValue?: string };
  private rng: any; // Seeded random number generator
  private expandedFieldTemplates: Record<string, FieldTemplate> | null = null;

  constructor(config: MultiFieldConfig = {}) {
    this.config = {
      fieldCount: config.fieldCount ?? 200,
      categories: config.categories ?? getFieldCategories(),
      contextWeightEnabled: config.contextWeightEnabled ?? true,
      correlationEnabled: config.correlationEnabled ?? true,
      performanceMode: config.performanceMode ?? false,
      useExpandedFields: config.useExpandedFields ?? false,
      expandedFieldCount: config.expandedFieldCount ?? 10000,
      seedValue: config.seedValue
    };

    // Initialize seeded RNG if seed provided
    if (this.config.seedValue) {
      faker.seed(this.hashSeed(this.config.seedValue));
    }

    // Initialize expanded field templates if requested
    if (this.config.useExpandedFields) {
      this.expandedFieldTemplates = generateExpandedFieldTemplates(this.config.expandedFieldCount);
    }
  }

  /**
   * Generate multi-field data for a security document
   */
  public generateFields(
    baseLog: Record<string, any> = {},
    context: LogContext = {}
  ): MultiFieldResult {
    const startTime = Date.now();

    // Analyze context from base log
    const logContext = this.analyzeLogContext(baseLog, context);

    // Select fields based on context and configuration
    const selectedFields = this.selectFields(logContext);

    // Generate field values with correlations
    const fields = this.generateFieldValues(selectedFields, baseLog, logContext);

    // Apply realistic correlations
    const correlationsApplied = this.config.correlationEnabled 
      ? this.applyFieldCorrelations(fields, logContext)
      : 0;

    const generationTimeMs = Date.now() - startTime;

    return {
      fields,
      metadata: {
        totalFieldsGenerated: Object.keys(fields).length,
        categoriesUsed: this.config.categories,
        generationTimeMs,
        correlationsApplied
      }
    };
  }

  /**
   * Analyze log context to inform field selection
   */
  private analyzeLogContext(baseLog: Record<string, any>, context: LogContext): LogContext {
    const analyzed: LogContext = { ...context };

    // Detect log type from base log if not provided
    if (!analyzed.logType) {
      analyzed.logType = this.detectLogType(baseLog);
    }

    // Detect if this is attack-related
    if (analyzed.isAttack === undefined) {
      analyzed.isAttack = this.detectAttackIndicators(baseLog);
    }

    // Determine severity
    if (!analyzed.severity) {
      analyzed.severity = this.determineSeverity(baseLog);
    }

    // Determine time context
    if (!analyzed.timeOfDay) {
      analyzed.timeOfDay = this.determineTimeContext(baseLog);
    }

    // Determine host performance state
    if (!analyzed.hostPerformance) {
      analyzed.hostPerformance = this.determineHostPerformance(baseLog);
    }

    return analyzed;
  }

  /**
   * Select fields based on context and weights
   */
  private selectFields(context: LogContext): string[] {
    const availableFields: Array<{ field: string, weight: number }> = [];

    // Use expanded fields if available, otherwise use standard templates
    const fieldSource = this.config.useExpandedFields && this.expandedFieldTemplates 
      ? this.expandedFieldTemplates 
      : this.getStandardFieldTemplates();

    // Collect all fields with their weights
    for (const [fieldName, template] of Object.entries(fieldSource)) {
      let weight = template.context_weight ?? 5;

      // Adjust weights based on context
      weight = this.adjustWeightForContext(fieldName, weight, context);

      availableFields.push({ field: fieldName, weight });
    }

    // Sort by weight if context weighting is enabled
    if (this.config.contextWeightEnabled) {
      availableFields.sort((a, b) => b.weight - a.weight);
    }

    // Select fields using weighted sampling
    return this.weightedFieldSelection(availableFields, this.config.fieldCount);
  }

  /**
   * Adjust field weight based on log context
   */
  private adjustWeightForContext(fieldName: string, baseWeight: number, context: LogContext): number {
    let weight = baseWeight;

    // Boost security-related fields for attacks
    if (context.isAttack) {
      if (fieldName.includes('threat.') || fieldName.includes('security.') || fieldName.includes('risk.')) {
        weight *= 1.5;
      }
      if (fieldName.includes('anomaly') || fieldName.includes('suspicious')) {
        weight *= 1.3;
      }
    }

    // Boost performance fields for high/low performance contexts
    if (context.hostPerformance === 'high' || context.hostPerformance === 'low') {
      if (fieldName.includes('performance.') || fieldName.includes('usage')) {
        weight *= 1.2;
      }
    }

    // Boost behavioral fields for off-hours activity
    if (context.timeOfDay === 'off_hours' || context.timeOfDay === 'weekend') {
      if (fieldName.includes('behavior.') || fieldName.includes('off_hours')) {
        weight *= 1.2;
      }
    }

    // Boost network fields for network logs
    if (context.logType === 'network') {
      if (fieldName.includes('network.') || fieldName.includes('connection')) {
        weight *= 1.2;
      }
    }

    // Boost endpoint fields for endpoint logs
    if (context.logType === 'endpoint') {
      if (fieldName.includes('endpoint.') || fieldName.includes('process')) {
        weight *= 1.2;
      }
    }

    return weight;
  }

  /**
   * Weighted field selection algorithm
   */
  private weightedFieldSelection(weightedFields: Array<{ field: string, weight: number }>, count: number): string[] {
    if (this.config.performanceMode) {
      // Performance mode: just take the top weighted fields
      return weightedFields.slice(0, count).map(f => f.field);
    }

    // Weighted random sampling for variety
    const selected: string[] = [];
    const fields = [...weightedFields];

    for (let i = 0; i < count && fields.length > 0; i++) {
      const totalWeight = fields.reduce((sum, f) => sum + f.weight, 0);
      let random = faker.number.float({ min: 0, max: totalWeight });

      let selectedIndex = 0;
      for (let j = 0; j < fields.length; j++) {
        random -= fields[j].weight;
        if (random <= 0) {
          selectedIndex = j;
          break;
        }
      }

      selected.push(fields[selectedIndex].field);
      fields.splice(selectedIndex, 1); // Remove to avoid duplicates
    }

    return selected;
  }

  /**
   * Generate values for selected fields
   */
  private generateFieldValues(
    selectedFields: string[], 
    baseLog: Record<string, any>, 
    context: LogContext
  ): Record<string, any> {
    const fields: Record<string, any> = {};

    for (const fieldName of selectedFields) {
      const template = this.getFieldTemplate(fieldName);
      if (template) {
        fields[fieldName] = template.generator();
      }
    }

    return fields;
  }

  /**
   * Apply realistic correlations between fields
   */
  private applyFieldCorrelations(fields: Record<string, any>, context: LogContext): number {
    let correlationsApplied = 0;

    // CPU-Memory correlation
    if (fields['system.performance.cpu_usage'] && fields['system.performance.memory_usage']) {
      const cpuUsage = fields['system.performance.cpu_usage'];
      if (cpuUsage > 80) {
        // High CPU often correlates with high memory
        fields['system.performance.memory_usage'] = Math.min(100, cpuUsage + faker.number.float({ min: -10, max: 15 }));
        correlationsApplied++;
      }
    }

    // Threat score correlations
    if (fields['threat.intelligence.confidence'] && fields['security.score.overall_risk']) {
      const threatConfidence = fields['threat.intelligence.confidence'];
      if (threatConfidence > 70) {
        // High threat confidence increases risk score
        fields['security.score.overall_risk'] = Math.min(100, threatConfidence + faker.number.float({ min: 0, max: 20 }));
        correlationsApplied++;
      }
    }

    // Behavioral anomaly correlations
    if (fields['user_behavior.anomaly_score'] && fields['user_behavior.risk_score']) {
      const anomalyScore = fields['user_behavior.anomaly_score'];
      // Risk score correlates with anomaly score
      fields['user_behavior.risk_score'] = anomalyScore + faker.number.float({ min: -15, max: 10 });
      correlationsApplied++;
    }

    // Network activity correlations
    if (fields['network.analytics.malicious_ip_connections'] && fields['network.analytics.suspicious_domain_count']) {
      const maliciousConnections = fields['network.analytics.malicious_ip_connections'];
      if (maliciousConnections > 0) {
        // Malicious IP connections often come with suspicious domains
        fields['network.analytics.suspicious_domain_count'] = Math.max(
          fields['network.analytics.suspicious_domain_count'],
          maliciousConnections + faker.number.int({ min: 0, max: 5 })
        );
        correlationsApplied++;
      }
    }

    // Attack context correlations
    if (context.isAttack) {
      // Boost anomaly scores for attack scenarios
      Object.keys(fields).forEach(key => {
        if (key.includes('anomaly_score') || key.includes('suspicious')) {
          if (typeof fields[key] === 'number' && fields[key] < 70) {
            fields[key] = Math.min(100, fields[key] + faker.number.float({ min: 20, max: 40 }));
            correlationsApplied++;
          }
        }
      });
    }

    return correlationsApplied;
  }

  /**
   * Helper methods for context analysis
   */
  private detectLogType(baseLog: Record<string, any>): string {
    // Detect from data stream
    if (baseLog['data_stream.dataset']) {
      const dataset = baseLog['data_stream.dataset'];
      if (dataset.includes('system')) return 'system';
      if (dataset.includes('auth')) return 'auth';
      if (dataset.includes('network')) return 'network';
      if (dataset.includes('endpoint')) return 'endpoint';
    }

    // Detect from event category
    if (baseLog['event.category']) {
      const categories = Array.isArray(baseLog['event.category']) 
        ? baseLog['event.category'] 
        : [baseLog['event.category']];
      if (categories.includes('authentication')) return 'auth';
      if (categories.includes('network')) return 'network';
      if (categories.includes('process')) return 'endpoint';
      if (categories.includes('system')) return 'system';
    }

    return 'generic';
  }

  private detectAttackIndicators(baseLog: Record<string, any>): boolean {
    // Check for MITRE ATT&CK indicators
    if (baseLog['threat.technique.id'] || baseLog['threat.tactic.id']) {
      return true;
    }

    // Check for suspicious event actions
    const suspiciousActions = [
      'process_injection', 'lateral_movement', 'privilege_escalation',
      'defense_evasion', 'persistence', 'data_exfiltration'
    ];
    
    const eventAction = baseLog['event.action'];
    if (eventAction && suspiciousActions.some(action => eventAction.includes(action))) {
      return true;
    }

    return false;
  }

  private determineSeverity(baseLog: Record<string, any>): string {
    // Check existing severity fields
    const severity = baseLog['event.severity'] || baseLog['log.level'];
    if (severity && typeof severity === 'string') {
      const level = severity.toLowerCase();
      if (['critical', 'error', 'high'].includes(level)) return 'high';
      if (['warning', 'warn', 'medium'].includes(level)) return 'medium';
      if (['info', 'debug', 'low'].includes(level)) return 'low';
    }

    // Default based on log type
    const logType = this.detectLogType(baseLog);
    if (logType === 'endpoint' && this.detectAttackIndicators(baseLog)) return 'high';
    
    return 'medium';
  }

  private determineTimeContext(baseLog: Record<string, any>): 'business_hours' | 'off_hours' | 'weekend' {
    const timestamp = baseLog['@timestamp'] || new Date().toISOString();
    const date = new Date(timestamp);
    const hour = date.getHours();
    const day = date.getDay();

    // Weekend
    if (day === 0 || day === 6) return 'weekend';
    
    // Business hours (9 AM - 5 PM)
    if (hour >= 9 && hour <= 17) return 'business_hours';
    
    return 'off_hours';
  }

  private determineHostPerformance(baseLog: Record<string, any>): 'low' | 'normal' | 'high' {
    // Check if there are performance indicators in the log
    const cpuUsage = baseLog['system.cpu.usage.percentage'] || baseLog['host.cpu.usage'];
    if (cpuUsage) {
      if (cpuUsage > 80) return 'high';
      if (cpuUsage < 20) return 'low';
    }

    return 'normal';
  }

  private getStandardFieldTemplates(): Record<string, FieldTemplate> {
    const allFields: Record<string, FieldTemplate> = {};
    for (const category of this.config.categories) {
      const categoryFields = MULTI_FIELD_TEMPLATES[category];
      if (categoryFields) {
        Object.assign(allFields, categoryFields);
      }
    }
    return allFields;
  }

  private getFieldTemplate(fieldName: string): FieldTemplate | null {
    // Check expanded fields first if available
    if (this.config.useExpandedFields && this.expandedFieldTemplates) {
      if (this.expandedFieldTemplates[fieldName]) {
        return this.expandedFieldTemplates[fieldName];
      }
    }

    // Fallback to standard templates
    for (const category of Object.values(MULTI_FIELD_TEMPLATES)) {
      if (category[fieldName]) {
        return category[fieldName];
      }
    }
    return null;
  }

  private hashSeed(seed: string): number {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      const char = seed.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Static convenience method for quick field generation
   */
  static generateQuick(
    baseLog: Record<string, any> = {},
    fieldCount = 200,
    context: LogContext = {}
  ): Record<string, any> {
    const generator = new MultiFieldGenerator({ fieldCount });
    const result = generator.generateFields(baseLog, context);
    return result.fields;
  }

  /**
   * Get statistics about available field templates
   */
  static getStatistics(): {
    totalFields: number;
    categories: string[];
    fieldsPerCategory: Record<string, number>;
  } {
    const categories = getFieldCategories();
    const fieldsPerCategory: Record<string, number> = {};
    
    categories.forEach(category => {
      fieldsPerCategory[category] = getFieldsInCategory(category).length;
    });

    return {
      totalFields: getTotalFieldCount(),
      categories,
      fieldsPerCategory
    };
  }
}

/**
 * Convenience function for simple multi-field generation
 */
export function generateMultiFields(
  baseLog: Record<string, any> = {},
  config: MultiFieldConfig = {}
): Record<string, any> {
  const generator = new MultiFieldGenerator(config);
  const result = generator.generateFields(baseLog);
  return result.fields;
}

/**
 * Export for use in other parts of the application
 */
export default MultiFieldGenerator;