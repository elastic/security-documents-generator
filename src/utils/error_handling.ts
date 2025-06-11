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
