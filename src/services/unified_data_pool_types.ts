/**
 * Unified Data Pool Types
 * 
 * Type definitions for the unified data pool generation system that handles
 * both standard and multi-field generation scenarios efficiently.
 */

import { MitreTechnique } from '../utils/ai_service_types';
import { ElasticsearchMapping } from '../utils/dynamic_mapping_generator';
import { FieldTemplate } from '../utils/multi_field_templates';

/**
 * Standard security data that's always generated
 */
export interface StandardDataPool {
  alertNames: string[];
  alertDescriptions: string[];
  threatNames: string[];
  processNames: string[];
  fileNames: string[];
  domains: string[];
  ipAddresses: string[];
  registryKeys: string[];
  urls: string[];
  eventDescriptions: string[];
}

/**
 * Extended field data for multi-field generation
 */
export interface ExtendedFieldData {
  fieldName: string;
  fieldType: string;
  values: string[];
  category: string;
  description: string;
}

/**
 * Extended data pool for multi-field scenarios
 */
export interface ExtendedDataPool {
  mappings: ElasticsearchMapping;
  fieldData: ExtendedFieldData[];
  categoryBreakdown: Record<string, number>;
  totalFields: number;
  batchInfo: {
    totalBatches: number;
    fieldsPerBatch: number[];
    processingTime: number;
  };
}

/**
 * MITRE ATT&CK data pool
 */
export interface MitreDataPool {
  techniques: MitreTechnique[];
  tactics: string[];
  procedures: string[];
  subtechniques: string[];
  mitigations: string[];
}

/**
 * Theme-specific data pool
 */
export interface ThemeDataPool {
  usernames: string[];
  hostnames: string[];
  organizationNames: string[];
  applicationNames: string[];
  customFields: Record<string, string[]>;
}

/**
 * Main unified data pool structure
 */
export interface UnifiedDataPool {
  // Core data (always present)
  standard: StandardDataPool;
  
  // Extended fields (present if multi-field enabled)
  extended?: ExtendedDataPool;
  
  // MITRE data (present if --mitre flag used)
  mitre?: MitreDataPool;
  
  // Theme data (present if --theme flag used)
  theme?: ThemeDataPool;
  
  // Metadata
  metadata: {
    generatedAt: string;
    alertCount: number;
    fieldCount: number;
    categories: string[];
    theme?: string;
    mitreEnabled: boolean;
    generationTimeMs: number;
    tokensUsed: number;
    aiCalls: number;
  };
}

/**
 * Configuration for data pool generation
 */
export interface DataPoolGenerationConfig {
  alertCount: number;
  fieldCount?: number;
  categories?: string[];
  theme?: string;
  mitreEnabled?: boolean;
  performanceMode?: boolean;
  cacheEnabled?: boolean;
}

/**
 * Batching configuration for large field sets
 */
export interface BatchingConfig {
  maxFieldsPerBatch: number;
  maxTokensPerBatch: number;
  adaptiveBatching: boolean;
  parallelBatches: boolean;
  memoryOptimization: boolean;
}

/**
 * Assembly options for creating alerts from the data pool
 */
export interface AssemblyOptions {
  space: string;
  namespace: string;
  timestampConfig?: any;
  falsePositiveRate?: number;
  correlationEnabled?: boolean;
  variationEnabled?: boolean;
}

/**
 * Result of data pool generation
 */
export interface DataPoolGenerationResult {
  pool: UnifiedDataPool;
  performance: {
    totalTimeMs: number;
    aiCallsUsed: number;
    tokensUsed: number;
    cacheHits: number;
    batchesProcessed: number;
  };
  errors: string[];
  warnings: string[];
}

/**
 * Adaptive batching strategy result
 */
export interface BatchingStrategy {
  batches: Array<{
    fields: string[];
    estimatedTokens: number;
    category: string;
    priority: number;
  }>;
  totalBatches: number;
  estimatedTotalTokens: number;
  processingOrder: number[];
}

/**
 * Field generation batch result
 */
export interface FieldGenerationBatch {
  batchId: string;
  fields: ExtendedFieldData[];
  processingTimeMs: number;
  tokensUsed: number;
  success: boolean;
  error?: string;
}

/**
 * Alert assembly result
 */
export interface AlertAssemblyResult {
  alert: Record<string, any>;
  fieldsUsed: {
    standard: string[];
    extended: string[];
    mitre: string[];
    theme: string[];
  };
  correlationsApplied: number;
  assemblyTimeMs: number;
}

/**
 * Performance metrics for the unified system
 */
export interface UnifiedSystemMetrics {
  dataPoolGeneration: {
    timeMs: number;
    aiCalls: number;
    tokensUsed: number;
    cacheHitRate: number;
  };
  alertAssembly: {
    timeMs: number;
    alertsPerSecond: number;
    memoryUsageMB: number;
    correlationsApplied: number;
  };
  overall: {
    totalTimeMs: number;
    speedImprovement: number;
    tokenReduction: number;
    reliabilityScore: number;
  };
}

/**
 * Error types for the unified system
 */
export enum UnifiedSystemErrorType {
  DATA_POOL_GENERATION_FAILED = 'DATA_POOL_GENERATION_FAILED',
  BATCH_PROCESSING_FAILED = 'BATCH_PROCESSING_FAILED',
  ALERT_ASSEMBLY_FAILED = 'ALERT_ASSEMBLY_FAILED',
  AI_SERVICE_ERROR = 'AI_SERVICE_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  MEMORY_LIMIT_EXCEEDED = 'MEMORY_LIMIT_EXCEEDED'
}

/**
 * Error handling for the unified system
 */
export interface UnifiedSystemError {
  type: UnifiedSystemErrorType;
  message: string;
  context: Record<string, any>;
  timestamp: string;
  recoverable: boolean;
}