import { AIServiceError } from './ai_service_types';

// Custom error classes for different types of AI service errors
export class AIInitializationError extends Error implements AIServiceError {
  code = 'AI_INITIALIZATION_ERROR';
  details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AIInitializationError';
    this.details = details;
  }
}

export class AIGenerationError extends Error implements AIServiceError {
  code = 'AI_GENERATION_ERROR';
  details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AIGenerationError';
    this.details = details;
  }
}

export class ValidationError extends Error implements AIServiceError {
  code = 'VALIDATION_ERROR';
  details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

export class ConfigurationError extends Error implements AIServiceError {
  code = 'CONFIGURATION_ERROR';
  details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ConfigurationError';
    this.details = details;
  }
}

export class MitreDataError extends Error implements AIServiceError {
  code = 'MITRE_DATA_ERROR';
  details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'MitreDataError';
    this.details = details;
  }
}

// Type guard for AI service errors
export const isAIServiceError = (error: unknown): error is AIServiceError => {
  return error instanceof Error && 'code' in error;
};

// Error handling utilities
export const handleAIError = (error: unknown, context: string): never => {
  if (isAIServiceError(error)) {
    console.error(`${context}: ${error.message}`, error.details);
    throw error;
  }

  if (error instanceof Error) {
    const aiError = new AIGenerationError(`${context}: ${error.message}`, {
      originalError: error.name,
      stack: error.stack,
    });
    console.error(aiError.message, aiError.details);
    throw aiError;
  }

  const unknownError = new AIGenerationError(
    `${context}: Unknown error occurred`,
    { originalError: String(error) },
  );
  console.error(unknownError.message, unknownError.details);
  throw unknownError;
};

// Retry mechanism for AI operations
export const withRetry = async <T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000,
  context = 'AI operation',
): Promise<T> => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries) {
        break;
      }

      // Don't retry configuration errors
      if (error instanceof ConfigurationError) {
        throw error;
      }

      console.warn(
        `${context} failed on attempt ${attempt}/${maxRetries}, retrying...`,
        error,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }

  return handleAIError(
    lastError,
    `${context} failed after ${maxRetries} attempts`,
  );
};

// Validate configuration and throw appropriate errors
export const validateConfiguration = (
  config: Record<string, unknown>,
): void => {
  if (config.useClaudeAI) {
    if (!config.claudeApiKey) {
      throw new ConfigurationError('Claude API key not defined in config', {
        field: 'claudeApiKey',
        provider: 'claude',
      });
    }
  } else if (config.useAzureOpenAI) {
    if (!config.azureOpenAIApiKey) {
      throw new ConfigurationError(
        'Azure OpenAI API key not defined in config',
        {
          field: 'azureOpenAIApiKey',
          provider: 'azure',
        },
      );
    }
    if (!config.azureOpenAIEndpoint) {
      throw new ConfigurationError(
        'Azure OpenAI endpoint not defined in config',
        {
          field: 'azureOpenAIEndpoint',
          provider: 'azure',
        },
      );
    }
    if (!config.azureOpenAIDeployment) {
      throw new ConfigurationError(
        'Azure OpenAI deployment name not defined in config',
        {
          field: 'azureOpenAIDeployment',
          provider: 'azure',
        },
      );
    }
  } else {
    if (!config.openaiApiKey) {
      throw new ConfigurationError('OpenAI API key not defined in config', {
        field: 'openaiApiKey',
        provider: 'openai',
      });
    }
  }
};

// Safe JSON parsing with error handling
export const safeJsonParse = <T = unknown>(
  jsonString: string,
  context = 'JSON parsing',
): T => {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    throw new ValidationError(`${context}: Invalid JSON format`, {
      originalError: error instanceof Error ? error.message : String(error),
      content:
        jsonString.substring(0, 200) + (jsonString.length > 200 ? '...' : ''),
    });
  }
};

// Validate required fields in generated content
export const validateRequiredFields = (
  object: Record<string, unknown>,
  requiredFields: string[],
  context = 'Field validation',
): void => {
  const missingFields: string[] = [];

  for (const field of requiredFields) {
    const keys = field.split('.');
    let current = object;

    for (const key of keys) {
      if (!current || typeof current !== 'object' || !(key in current)) {
        missingFields.push(field);
        break;
      }
      current = current[key] as Record<string, unknown>;
    }

    if (current === undefined || current === null) {
      missingFields.push(field);
    }
  }

  if (missingFields.length > 0) {
    throw new ValidationError(`${context}: Missing required fields`, {
      missingFields,
      requiredFields,
      providedFields: Object.keys(object),
    });
  }
};

// Format error for logging
export const formatErrorForLogging = (
  error: unknown,
): Record<string, unknown> => {
  if (isAIServiceError(error)) {
    return {
      type: error.name,
      code: error.code,
      message: error.message,
      details: error.details,
      stack: error.stack,
    };
  }

  if (error instanceof Error) {
    return {
      type: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    type: 'Unknown',
    message: String(error),
  };
};

// Elasticsearch bulk operation error handling
export class ElasticsearchBulkError extends Error implements AIServiceError {
  code = 'ELASTICSEARCH_BULK_ERROR';
  details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ElasticsearchBulkError';
    this.details = details;
  }
}

// Enhanced bulk response analysis with detailed error reporting
export const analyzeBulkResponse = (
  response: any,
  context = 'Bulk operation',
): { success: number; failed: number; errors: any[] } => {
  if (!response || !response.items) {
    throw new ElasticsearchBulkError(
      `${context}: Invalid bulk response - missing items array`,
      { response }
    );
  }

  const results = {
    success: 0,
    failed: 0,
    errors: [] as any[]
  };

  // Analyze each item in the bulk response
  response.items.forEach((item: any, index: number) => {
    const operation = item.create || item.index || item.update || item.delete;
    
    if (!operation) {
      results.failed++;
      results.errors.push({
        index,
        error: 'Unknown operation type',
        item
      });
      return;
    }

    if (operation.error) {
      results.failed++;
      results.errors.push({
        index,
        operation: Object.keys(item)[0], // create, index, update, delete
        _index: operation._index,
        _id: operation._id,
        status: operation.status,
        error: {
          type: operation.error.type,
          reason: operation.error.reason,
          caused_by: operation.error.caused_by
        }
      });
    } else {
      results.success++;
    }
  });

  return results;
};

// Log bulk operation results with detailed error analysis
export const logBulkResults = (
  results: { success: number; failed: number; errors: any[] },
  context = 'Bulk operation',
  showAllErrors = false
): void => {
  const total = results.success + results.failed;
  
  if (results.failed === 0) {
    console.log(`✅ ${context}: Successfully processed ${results.success}/${total} documents`);
    return;
  }

  // Show summary
  console.log(`⚠️  ${context}: ${results.success}/${total} successful, ${results.failed} failed`);
  
  // Group errors by type for better analysis
  const errorsByType = results.errors.reduce((acc, error) => {
    const errorType = error.error?.type || 'unknown_error';
    if (!acc[errorType]) {
      acc[errorType] = [];
    }
    acc[errorType].push(error);
    return acc;
  }, {} as Record<string, any[]>);

  // Show error summary
  Object.entries(errorsByType).forEach(([errorType, errors]) => {
    console.log(`   📊 ${errorType}: ${errors.length} occurrences`);
    
    // Show first few examples of each error type
    const examples = errors.slice(0, showAllErrors ? errors.length : 2);
    examples.forEach((error, idx) => {
      console.log(`   ${idx + 1}. Index: ${error._index || 'unknown'}, Reason: ${error.error?.reason || 'unknown'}`);
      if (error.error?.caused_by) {
        console.log(`      Caused by: ${error.error.caused_by.reason}`);
      }
    });
    
    if (!showAllErrors && errors.length > 2) {
      console.log(`   ... and ${errors.length - 2} more similar errors`);
    }
  });
};

// Enhanced bulk operation wrapper with comprehensive error handling
export const executeBulkWithErrorHandling = async (
  client: any,
  operations: unknown[],
  options: {
    context?: string;
    refresh?: boolean | string;
    timeout?: string;
    showAllErrors?: boolean;
    throwOnPartialFailure?: boolean;
  } = {}
): Promise<{ success: number; failed: number; response: any }> => {
  const {
    context = 'Bulk operation',
    refresh = true,
    timeout = '60s',
    showAllErrors = false,
    throwOnPartialFailure = false
  } = options;

  if (!operations || operations.length === 0) {
    throw new ElasticsearchBulkError(`${context}: No operations provided`);
  }

  try {
    console.log(`📤 ${context}: Indexing ${operations.length / 2} documents...`);
    
    const response = await client.bulk({
      operations,
      refresh,
      timeout
    });

    // Analyze the response
    const results = analyzeBulkResponse(response, context);
    
    // Log results
    logBulkResults(results, context, showAllErrors);

    // Throw error if partial failures and configured to do so
    if (results.failed > 0 && throwOnPartialFailure) {
      throw new ElasticsearchBulkError(
        `${context}: Bulk operation had ${results.failed} failures`,
        {
          totalDocuments: operations.length / 2,
          successful: results.success,
          failed: results.failed,
          errors: results.errors.slice(0, 10) // First 10 errors for context
        }
      );
    }

    return {
      success: results.success,
      failed: results.failed,
      response
    };
    
  } catch (error) {
    if (error instanceof ElasticsearchBulkError) {
      throw error;
    }
    
    throw new ElasticsearchBulkError(
      `${context}: Bulk operation failed with exception`,
      {
        originalError: error instanceof Error ? error.message : String(error),
        operationCount: operations.length / 2
      }
    );
  }
};
