/**
 * Unified Data Pool Generator
 * 
 * Core service that generates reusable data pools for alert generation,
 * handling both standard and multi-field scenarios efficiently.
 */

import { faker } from '@faker-js/faker';
import { getConfig } from '../get_config';
import { 
  UnifiedDataPool, 
  StandardDataPool, 
  ExtendedDataPool,
  MitreDataPool,
  ThemeDataPool,
  DataPoolGenerationConfig,
  DataPoolGenerationResult,
  BatchingStrategy,
  FieldGenerationBatch,
  ExtendedFieldData,
  UnifiedSystemError,
  UnifiedSystemErrorType
} from './unified_data_pool_types';
import { 
  getThemedData, 
  batchGenerateThemedData,
  Theme,
  SUPPORTED_THEMES 
} from '../utils/theme_service';
import { 
  loadMitreData, 
  selectMitreTechniques
} from '../utils/mitre_attack_service';
import { 
  MitreTechnique,
  MitreAttackData
} from '../utils/ai_service_types';
import { 
  MultiFieldGenerator,
  MultiFieldConfig 
} from '../utils/multi_field_generator';
import { 
  getFieldCategories,
  MULTI_FIELD_TEMPLATES 
} from '../utils/multi_field_templates';
import { 
  generateAISecurityData,
  generateAIFieldSchema,
  generateAIFieldData,
  calculateBatchingStrategy,
  processFieldBatches
} from './ai_data_pool_service';

/**
 * Main class for unified data pool generation
 */
export class UnifiedDataPoolGenerator {
  private cache: Map<string, UnifiedDataPool> = new Map();
  private cacheEnabled: boolean = true;
  private cacheTTL: number = 3600000; // 1 hour

  /**
   * Generate a unified data pool for alert generation
   */
  async generateDataPool(
    config: DataPoolGenerationConfig
  ): Promise<DataPoolGenerationResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];
    let aiCallsUsed = 0;
    let tokensUsed = 0;
    let cacheHits = 0;
    let batchesProcessed = 0;

    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(config);
      if (this.cacheEnabled && this.cache.has(cacheKey)) {
        const cachedPool = this.cache.get(cacheKey)!;
        if (this.isCacheValid(cachedPool.metadata.generatedAt)) {
          cacheHits++;
          return {
            pool: cachedPool,
            performance: {
              totalTimeMs: Date.now() - startTime,
              aiCallsUsed: 0,
              tokensUsed: 0,
              cacheHits: 1,
              batchesProcessed: 0
            },
            errors: [],
            warnings: ['Used cached data pool']
          };
        }
      }

      // Generate standard data pool
      const standardResult = await this.generateStandardDataPool(
        config.alertCount,
        config.theme
      );
      aiCallsUsed += standardResult.aiCalls;
      tokensUsed += standardResult.tokens;

      // Generate extended data pool if multi-field enabled
      let extendedDataPool: ExtendedDataPool | undefined;
      if (config.fieldCount && config.fieldCount > 0) {
        const extendedResult = await this.generateExtendedDataPool(
          config.fieldCount,
          config.categories,
          config.alertCount
        );
        extendedDataPool = extendedResult.pool;
        aiCallsUsed += extendedResult.aiCalls;
        tokensUsed += extendedResult.tokens;
        batchesProcessed += extendedResult.batchesProcessed;
      }

      // Generate MITRE data pool if enabled
      let mitreDataPool: MitreDataPool | undefined;
      if (config.mitreEnabled) {
        const mitreResult = await this.generateMitreDataPool(config.alertCount);
        mitreDataPool = mitreResult.pool;
        aiCallsUsed += mitreResult.aiCalls;
        tokensUsed += mitreResult.tokens;
      }

      // Generate theme data pool if theme specified
      let themeDataPool: ThemeDataPool | undefined;
      if (config.theme) {
        const themeResult = await this.generateThemeDataPool(
          config.theme,
          config.alertCount
        );
        themeDataPool = themeResult.pool;
        aiCallsUsed += themeResult.aiCalls;
        tokensUsed += themeResult.tokens;
      }

      // Create unified data pool
      const pool: UnifiedDataPool = {
        standard: standardResult.pool,
        extended: extendedDataPool,
        mitre: mitreDataPool,
        theme: themeDataPool,
        metadata: {
          generatedAt: new Date().toISOString(),
          alertCount: config.alertCount,
          fieldCount: config.fieldCount || 0,
          categories: config.categories || [],
          theme: config.theme,
          mitreEnabled: config.mitreEnabled || false,
          generationTimeMs: Date.now() - startTime,
          tokensUsed,
          aiCalls: aiCallsUsed
        }
      };

      // Cache the result
      if (this.cacheEnabled) {
        this.cache.set(cacheKey, pool);
      }

      return {
        pool,
        performance: {
          totalTimeMs: Date.now() - startTime,
          aiCallsUsed,
          tokensUsed,
          cacheHits,
          batchesProcessed
        },
        errors,
        warnings
      };

    } catch (error) {
      errors.push(`Data pool generation failed: ${error.message}`);
      
      // Return fallback data pool
      const fallbackPool = await this.generateFallbackDataPool(config);
      
      return {
        pool: fallbackPool,
        performance: {
          totalTimeMs: Date.now() - startTime,
          aiCallsUsed,
          tokensUsed,
          cacheHits,
          batchesProcessed
        },
        errors,
        warnings
      };
    }
  }

  /**
   * Generate standard security data pool
   */
  private async generateStandardDataPool(
    alertCount: number,
    theme?: string
  ): Promise<{
    pool: StandardDataPool;
    aiCalls: number;
    tokens: number;
  }> {
    const dataSize = Math.min(alertCount * 2, 100); // Generate more data than needed for variety
    let aiCalls = 0;
    let tokens = 0;

    // Check if AI is properly configured before attempting to use it
    const config = getConfig();
    const hasValidAIConfig = (
      (config.useClaudeAI && config.claudeApiKey) ||
      (config.useAzureOpenAI && config.azureOpenAIApiKey && config.azureOpenAIEndpoint) ||
      (config.openaiApiKey)
    );

    // Always try AI for theme generation if config indicates AI should be used
    const shouldTryAI = hasValidAIConfig || (theme && config.useAI);

    if (shouldTryAI) {
      try {
        // Use AI to generate realistic security data
        const aiResult = await generateAISecurityData(dataSize, theme);
        aiCalls += aiResult.aiCalls;
        tokens += aiResult.tokens;

        return {
          pool: {
            alertNames: aiResult.data.alertNames,
            alertDescriptions: aiResult.data.alertDescriptions,
            threatNames: aiResult.data.threatNames,
            processNames: aiResult.data.processNames,
            fileNames: aiResult.data.fileNames,
            domains: aiResult.data.domains,
            ipAddresses: aiResult.data.ipAddresses,
            registryKeys: aiResult.data.registryKeys,
            urls: aiResult.data.urls,
            eventDescriptions: aiResult.data.eventDescriptions
          },
          aiCalls,
          tokens
        };
      } catch (error: any) {
        console.warn('AI standard data generation failed, using high-quality fallback');
      }
    }
    
    // Use high-quality algorithmic generation (always reliable)
    return {
      pool: {
        alertNames: this.generateFallbackAlertNames(dataSize),
        alertDescriptions: this.generateFallbackAlertDescriptions(dataSize),
        threatNames: this.generateFallbackThreatNames(dataSize),
        processNames: this.generateFallbackProcessNames(dataSize),
        fileNames: this.generateFallbackFileNames(dataSize),
        domains: this.generateFallbackDomains(dataSize),
        ipAddresses: this.generateFallbackIpAddresses(dataSize),
        registryKeys: this.generateFallbackRegistryKeys(dataSize),
        urls: this.generateFallbackUrls(dataSize),
        eventDescriptions: this.generateFallbackEventDescriptions(dataSize)
      },
      aiCalls: 0,
      tokens: 0
    };
  }

  /**
   * Generate extended data pool for multi-field scenarios
   */
  private async generateExtendedDataPool(
    fieldCount: number,
    categories?: string[],
    alertCount: number = 100
  ): Promise<{
    pool: ExtendedDataPool;
    aiCalls: number;
    tokens: number;
    batchesProcessed: number;
  }> {
    const startTime = Date.now();
    
    // Use existing MultiFieldGenerator for algorithmic fields
    const multiFieldGenerator = new MultiFieldGenerator({
      fieldCount,
      categories,
      useExpandedFields: fieldCount > 1000
    });

    const algorithmicResult = multiFieldGenerator.generateFields({}, {
      logType: 'security',
      severity: 'medium',
      isAttack: false
    });

    // For very large field counts, also use AI to generate additional creative fields (if AI is available)
    let aiFieldData: ExtendedFieldData[] = [];
    let aiCalls = 0;
    let tokens = 0;
    let batchesProcessed = 0;

    // Check if AI is properly configured before attempting to use it
    const config = getConfig();
    const hasValidAIConfig = (
      (config.useClaudeAI && config.claudeApiKey) ||
      (config.useAzureOpenAI && config.azureOpenAIApiKey) ||
      (config.openaiApiKey)
    );

    if (fieldCount > 500 && hasValidAIConfig) {
      const aiFieldResult = await this.generateAIExtendedFields(
        Math.min(fieldCount - Object.keys(algorithmicResult.fields).length, 500),
        categories,
        alertCount
      );
      aiFieldData = aiFieldResult.fields;
      aiCalls += aiFieldResult.aiCalls;
      tokens += aiFieldResult.tokens;
      batchesProcessed += aiFieldResult.batchesProcessed;
    }

    // Convert algorithmic fields to ExtendedFieldData format
    const algorithmicFieldData: ExtendedFieldData[] = Object.entries(algorithmicResult.fields)
      .map(([fieldName, value]) => ({
        fieldName,
        fieldType: typeof value === 'number' ? 'float' : 'string',
        values: [String(value)],
        category: this.getCategoryForField(fieldName),
        description: `Generated field: ${fieldName}`
      }));

    // Combine algorithmic and AI-generated fields
    const allFieldData = [...algorithmicFieldData, ...aiFieldData];

    // Generate mappings for all fields
    const mappings = this.generateMappingsForFields(allFieldData);

    // Calculate category breakdown
    const categoryBreakdown = this.calculateCategoryBreakdown(allFieldData);

    return {
      pool: {
        mappings,
        fieldData: allFieldData,
        categoryBreakdown,
        totalFields: allFieldData.length,
        batchInfo: {
          totalBatches: batchesProcessed,
          fieldsPerBatch: [], // Will be populated by batching logic
          processingTime: Date.now() - startTime
        }
      },
      aiCalls,
      tokens,
      batchesProcessed
    };
  }

  /**
   * Generate MITRE data pool
   */
  private async generateMitreDataPool(
    alertCount: number
  ): Promise<{
    pool: MitreDataPool;
    aiCalls: number;
    tokens: number;
  }> {
    try {
      const mitreData = loadMitreData();
      if (!mitreData) {
        throw new Error('MITRE data not available');
      }

      const selectedTechniques = selectMitreTechniques(mitreData, alertCount);

      return {
        pool: {
          techniques: selectedTechniques,
          tactics: Object.keys(mitreData.tactics),
          procedures: [],
          subtechniques: Object.keys(mitreData.subTechniques || {}),
          mitigations: []
        },
        aiCalls: 0,
        tokens: 0
      };
    } catch (error: any) {
      console.warn('MITRE data loading failed, using fallback');
      
      return {
        pool: {
          techniques: [],
          tactics: ['Initial Access', 'Execution', 'Persistence', 'Privilege Escalation'],
          procedures: [],
          subtechniques: [],
          mitigations: []
        },
        aiCalls: 0,
        tokens: 0
      };
    }
  }

  /**
   * Generate theme data pool
   */
  private async generateThemeDataPool(
    theme: string,
    alertCount: number
  ): Promise<{
    pool: ThemeDataPool;
    aiCalls: number;
    tokens: number;
  }> {
    const dataSize = Math.min(alertCount * 2, 100);
    let aiCalls = 0;
    let tokens = 0;

    // Check if this is a supported theme with fallback data
    const themesWithFallback = ['nba', 'soccer', 'marvel', 'starwars', 'tech_companies', 'programming'];
    const hasThemeFallback = themesWithFallback.includes(theme);

    // Check if AI is properly configured
    const config = getConfig();
    const hasValidAIConfig = (
      (config.useClaudeAI && config.claudeApiKey) ||
      (config.useAzureOpenAI && config.azureOpenAIApiKey && config.azureOpenAIEndpoint) ||
      (config.openaiApiKey)
    );

    // For themes, we want to try AI even if config might have issues, then fall back
    const shouldTryTheme = hasValidAIConfig || hasThemeFallback || config.useAI;

    if (shouldTryTheme) {
      try {
        // Use existing theme service (handles AI and fallbacks internally)
        const themeData = await batchGenerateThemedData(
          theme as Theme,
          ['usernames', 'hostnames', 'organizations', 'applicationNames'],
          dataSize
        );

        // Count AI calls and tokens only if AI was likely used
        if (hasValidAIConfig && !hasThemeFallback) {
          aiCalls = 4; // One call per data type
          tokens = 2000; // Approximate
        }

        return {
          pool: {
            usernames: themeData.usernames || [],
            hostnames: themeData.hostnames || [],
            organizationNames: themeData.organizations || [],
            applicationNames: themeData.applicationNames || [],
            customFields: {}
          },
          aiCalls,
          tokens
        };
      } catch (error) {
        console.warn('Theme data generation failed, using empty theme pool');
      }
    }
    
    // Return empty theme pool (entity names will be generated separately)
    return {
      pool: {
        usernames: [],
        hostnames: [],
        organizationNames: [],
        applicationNames: [],
        customFields: {}
      },
      aiCalls: 0,
      tokens: 0
    };
  }

  /**
   * Generate AI-enhanced extended fields
   */
  private async generateAIExtendedFields(
    fieldCount: number,
    categories?: string[],
    alertCount: number = 100
  ): Promise<{
    fields: ExtendedFieldData[];
    aiCalls: number;
    tokens: number;
    batchesProcessed: number;
  }> {
    try {
      // Calculate batching strategy for large field sets
      const batchingStrategy = calculateBatchingStrategy(
        fieldCount,
        categories || getFieldCategories()
      );

      // Process field generation in batches
      const batchResults = await processFieldBatches(
        batchingStrategy.batches,
        undefined // theme will be handled at data pool level
      );

      // Combine results from all batches
      const allFields: ExtendedFieldData[] = [];
      batchResults.results.forEach(batch => {
        if (batch.success) {
          allFields.push(...batch.fields);
        }
      });

      return {
        fields: allFields,
        aiCalls: batchResults.totalAICalls,
        tokens: batchResults.totalTokens,
        batchesProcessed: batchResults.results.length
      };
    } catch (error) {
      console.warn('AI extended field generation failed:', error);
      return {
        fields: [],
        aiCalls: 0,
        tokens: 0,
        batchesProcessed: 0
      };
    }
  }

  /**
   * Generate fallback data pool when AI fails
   */
  private async generateFallbackDataPool(
    config: DataPoolGenerationConfig
  ): Promise<UnifiedDataPool> {
    const dataSize = Math.min(config.alertCount * 2, 100);

    return {
      standard: {
        alertNames: this.generateFallbackAlertNames(dataSize),
        alertDescriptions: this.generateFallbackAlertDescriptions(dataSize),
        threatNames: this.generateFallbackThreatNames(dataSize),
        processNames: this.generateFallbackProcessNames(dataSize),
        fileNames: this.generateFallbackFileNames(dataSize),
        domains: this.generateFallbackDomains(dataSize),
        ipAddresses: this.generateFallbackIpAddresses(dataSize),
        registryKeys: this.generateFallbackRegistryKeys(dataSize),
        urls: this.generateFallbackUrls(dataSize),
        eventDescriptions: this.generateFallbackEventDescriptions(dataSize)
      },
      metadata: {
        generatedAt: new Date().toISOString(),
        alertCount: config.alertCount,
        fieldCount: config.fieldCount || 0,
        categories: config.categories || [],
        theme: config.theme,
        mitreEnabled: config.mitreEnabled || false,
        generationTimeMs: 0,
        tokensUsed: 0,
        aiCalls: 0
      }
    };
  }

  // Fallback data generation methods
  private generateFallbackAlertNames(count: number): string[] {
    const templates = [
      'Suspicious PowerShell Activity Detected',
      'Malware Detection - Endpoint Security',
      'Failed Login Attempts from Multiple IPs',
      'Privilege Escalation Attempt',
      'Suspicious Network Traffic to External Domain',
      'File Integrity Monitoring Alert',
      'Credential Dumping Activity',
      'Process Injection Detected',
      'Unusual Outbound Network Connection',
      'Windows Defender Real-time Protection Disabled'
    ];
    
    return Array.from({ length: count }, () => 
      faker.helpers.arrayElement(templates)
    );
  }

  private generateFallbackAlertDescriptions(count: number): string[] {
    return Array.from({ length: count }, () => 
      faker.lorem.sentence(10)
    );
  }

  private generateFallbackThreatNames(count: number): string[] {
    const threats = ['APT29', 'Lazarus', 'Cobalt Strike', 'Emotet', 'Ransomware', 'Trojan'];
    return Array.from({ length: count }, () => 
      faker.helpers.arrayElement(threats)
    );
  }

  private generateFallbackProcessNames(count: number): string[] {
    const processes = ['powershell.exe', 'cmd.exe', 'rundll32.exe', 'svchost.exe', 'explorer.exe'];
    return Array.from({ length: count }, () => 
      faker.helpers.arrayElement(processes)
    );
  }

  private generateFallbackFileNames(count: number): string[] {
    return Array.from({ length: count }, () => 
      `${faker.system.fileName()}.${faker.helpers.arrayElement(['exe', 'dll', 'bat', 'ps1'])}`
    );
  }

  private generateFallbackDomains(count: number): string[] {
    return Array.from({ length: count }, () => 
      faker.internet.domainName()
    );
  }

  private generateFallbackIpAddresses(count: number): string[] {
    return Array.from({ length: count }, () => 
      faker.internet.ip()
    );
  }

  private generateFallbackRegistryKeys(count: number): string[] {
    const keys = [
      'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run',
      'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run',
      'HKLM\\SYSTEM\\CurrentControlSet\\Services'
    ];
    return Array.from({ length: count }, () => 
      faker.helpers.arrayElement(keys)
    );
  }

  private generateFallbackUrls(count: number): string[] {
    return Array.from({ length: count }, () => 
      faker.internet.url()
    );
  }

  private generateFallbackEventDescriptions(count: number): string[] {
    return Array.from({ length: count }, () => 
      faker.lorem.sentence(8)
    );
  }

  // Utility methods
  private generateCacheKey(config: DataPoolGenerationConfig): string {
    return `${config.alertCount}-${config.fieldCount || 0}-${config.theme || 'none'}-${config.mitreEnabled || false}`;
  }

  private isCacheValid(timestamp: string): boolean {
    const age = Date.now() - new Date(timestamp).getTime();
    return age < this.cacheTTL;
  }

  private getCategoryForField(fieldName: string): string {
    // Simple category detection based on field name
    if (fieldName.includes('user')) return 'behavioral_analytics';
    if (fieldName.includes('threat')) return 'threat_intelligence';
    if (fieldName.includes('network')) return 'network_analytics';
    if (fieldName.includes('process')) return 'endpoint_analytics';
    return 'security_scores';
  }

  private generateMappingsForFields(fields: ExtendedFieldData[]): any {
    // Generate Elasticsearch mappings for the fields
    const mappings: any = { mappings: { properties: {} } };
    
    fields.forEach(field => {
      const fieldPath = field.fieldName.split('.');
      let current = mappings.mappings.properties;
      
      for (let i = 0; i < fieldPath.length - 1; i++) {
        const part = fieldPath[i];
        if (!current[part]) {
          current[part] = { type: 'object', properties: {} };
        }
        current = current[part].properties;
      }
      
      const finalField = fieldPath[fieldPath.length - 1];
      current[finalField] = {
        type: field.fieldType === 'float' ? 'double' : 'keyword',
        index: true
      };
    });
    
    return mappings;
  }

  private calculateCategoryBreakdown(fields: ExtendedFieldData[]): Record<string, number> {
    const breakdown: Record<string, number> = {};
    
    fields.forEach(field => {
      breakdown[field.category] = (breakdown[field.category] || 0) + 1;
    });
    
    return breakdown;
  }
}

// Export singleton instance
export const unifiedDataPoolGenerator = new UnifiedDataPoolGenerator();