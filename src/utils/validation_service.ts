/**
 * Validation Service
 *
 * Handles data validation with legitimate control character detection.
 */
import { faker } from '@faker-js/faker';
import { generateTimestamp, TimestampConfig } from './timestamp_utils';
import { BaseCreateAlertsReturnType } from '../create_alerts';

// Helper to check if a string is a valid ISO date
export const isValidISODate = (str: string): boolean => {
  if (!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/.test(str)) return false;
  const d = new Date(str);
  return d.toISOString() === str;
};

// Validate generated alert for quality and correctness
export const validateAlert = (
  alert: Record<string, unknown>,
  hostName: string,
  userName: string,
  space: string,
  timestampConfig?: TimestampConfig,
): Record<string, unknown> => {
  // Create a copy to avoid modifying the original
  const validatedAlert = { ...alert };

  // Ensure critical fields are present and correctly formatted
  validatedAlert['host.name'] = hostName;
  validatedAlert['user.name'] = userName;
  validatedAlert['kibana.space_ids'] = Array.isArray(
    validatedAlert['kibana.space_ids'],
  )
    ? validatedAlert['kibana.space_ids']
    : [space];

  // Ensure timestamps are valid ISO strings with proper type checking
  const timestamp = generateTimestamp(timestampConfig);
  if (
    validatedAlert['kibana.alert.start'] &&
    typeof validatedAlert['kibana.alert.start'] === 'string' &&
    !isValidISODate(validatedAlert['kibana.alert.start'])
  ) {
    validatedAlert['kibana.alert.start'] = timestamp;
  }

  if (
    validatedAlert['kibana.alert.last_detected'] &&
    typeof validatedAlert['kibana.alert.last_detected'] === 'string' &&
    !isValidISODate(validatedAlert['kibana.alert.last_detected'])
  ) {
    validatedAlert['kibana.alert.last_detected'] = timestamp;
  }

  // Ensure UUID is valid
  if (
    !validatedAlert['kibana.alert.uuid'] ||
    typeof validatedAlert['kibana.alert.uuid'] !== 'string'
  ) {
    validatedAlert['kibana.alert.uuid'] = faker.string.uuid();
  }

  // Ensure @timestamp is present
  if (!validatedAlert['@timestamp']) {
    validatedAlert['@timestamp'] = Date.now();
  }

  return validatedAlert;
};

// Function to sanitize and clean JSON responses from AI
export const sanitizeJSONResponse = (rawContent: string): string => {
  try {
    // Remove common JSON formatting issues
    let cleaned = rawContent.trim();

    // Remove any markdown code block markers
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```$/, '');

    // Remove any leading/trailing non-JSON content
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    const firstBracket = cleaned.indexOf('[');
    const lastBracket = cleaned.lastIndexOf(']');

    // Determine if we have an object or array
    if (
      firstBrace !== -1 &&
      (firstBracket === -1 || firstBrace < firstBracket)
    ) {
      // Object format - extract the complete object
      if (lastBrace !== -1) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
      }
    } else if (firstBracket !== -1) {
      // Array format - extract the complete array
      if (lastBracket !== -1) {
        cleaned = cleaned.substring(firstBracket, lastBracket + 1);
      }
    }

    // Remove control characters that cause JSON parsing errors
    cleaned = cleaned.replace(/[\x00-\x1F\x7F-\x9F]/g, '');

    // Fix common JSON formatting issues
    cleaned = cleaned
      // Fix unescaped quotes in strings
      .replace(/([^\\])"([^"]*)"([^,}\]:])/g, '$1\\"$2\\"$3')
      // Fix trailing commas
      .replace(/,\s*([}\]])/g, '$1')
      // Fix multiple consecutive commas
      .replace(/,+/g, ',')
      // Fix missing commas between objects/arrays
      .replace(/}\s*{/g, '},{')
      .replace(/]\s*\[/g, '],[');

    // Validate basic JSON structure
    try {
      JSON.parse(cleaned);
      if (process.env.DEBUG_AI_RESPONSES) {
        console.log(
          'DEBUG - Successfully parsed cleaned JSON, length:',
          cleaned.length,
        );
      }
      return cleaned;
    } catch (parseError) {
      if (process.env.DEBUG_AI_RESPONSES) {
        console.log('DEBUG - JSON parse failed:', parseError);
        console.log('DEBUG - Attempting object extraction...');
      }
      // If still invalid, try to extract valid JSON objects
      const objects = extractValidJSONObjects(cleaned);
      const result = objects.length > 0 ? JSON.stringify(objects) : '[]';
      if (process.env.DEBUG_AI_RESPONSES) {
        console.log('DEBUG - Extracted objects count:', objects.length);
        console.log('DEBUG - Final result length:', result.length);
      }
      return result;
    }
  } catch (error) {
    console.warn('JSON sanitization failed, returning empty array:', error);
    return '[]';
  }
};

// Helper function to extract valid JSON objects from malformed text
export const extractValidJSONObjects = (
  text: string,
): Record<string, unknown>[] => {
  const objects: Record<string, unknown>[] = [];
  const lines = text.split('\n');
  let currentObject = '';
  let braceCount = 0;

  for (const line of lines) {
    currentObject += line;

    // Count braces to find complete objects
    for (const char of line) {
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;

      if (braceCount === 0 && currentObject.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(currentObject.trim());
          objects.push(parsed);
          currentObject = '';
        } catch {
          // Continue trying to build a valid object
        }
      }
    }
  }

  return objects;
};

// Validate alert batch response structure
export const validateBatchResponse = (
  generatedAlerts: unknown[],
  expectedCount: number,
): Record<string, unknown>[] => {
  let validatedAlerts = [...generatedAlerts];

  console.log(
    `🔍 Validating batch response: expected ${expectedCount}, got ${validatedAlerts.length}`,
  );

  // Validate that we have the expected number of alerts
  if (validatedAlerts.length !== expectedCount) {
    console.warn(
      `⚠️ Expected ${expectedCount} alerts, got ${validatedAlerts.length}. Padding with defaults.`,
    );

    // Pad with empty objects if we have fewer alerts than expected
    while (validatedAlerts.length < expectedCount) {
      console.log(`➕ Adding empty alert object to reach expected count`);
      validatedAlerts.push({});
    }

    // Truncate if we have too many
    if (validatedAlerts.length > expectedCount) {
      console.log(
        `✂️ Truncating from ${validatedAlerts.length} to ${expectedCount} alerts`,
      );
      validatedAlerts = validatedAlerts.slice(0, expectedCount);
    }
  } else {
    console.log(
      `✅ Batch response validation passed: ${validatedAlerts.length} alerts`,
    );
  }

  // Check for completely empty alerts
  const emptyAlerts = validatedAlerts.filter(
    (alert) =>
      !alert || typeof alert !== 'object' || Object.keys(alert).length === 0,
  );

  if (emptyAlerts.length > 0) {
    console.warn(
      `⚠️ Found ${emptyAlerts.length} empty/invalid alerts in batch`,
    );
  }

  return validatedAlerts as Record<string, unknown>[];
};

// Validate that an object has required alert fields
export const hasRequiredAlertFields = (
  alert: Record<string, unknown>,
): boolean => {
  const requiredFields = [
    'host.name',
    'user.name',
    'kibana.alert.uuid',
    '@timestamp',
  ];

  return requiredFields.every((field) => {
    const keys = field.split('.');
    let current = alert;

    for (const key of keys) {
      if (!current || typeof current !== 'object' || !(key in current)) {
        return false;
      }
      current = current[key] as Record<string, unknown>;
    }

    return current !== undefined && current !== null;
  });
};

// Clean and validate field values
export const sanitizeFieldValue = (value: unknown): unknown => {
  if (typeof value === 'string') {
    // Remove control characters and normalize whitespace
    return value
      .split('')
      .filter((char) => {
        const code = char.charCodeAt(0);
        return code > 31 && code !== 127;
      })
      .join('')
      .trim();
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeFieldValue);
  }

  if (value && typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      sanitized[key] = sanitizeFieldValue(val);
    }
    return sanitized;
  }

  return value;
};

// Comprehensive alert validation with field sanitization
export const validateAndSanitizeAlert = (
  alert: Record<string, unknown>,
  hostName: string,
  userName: string,
  space: string,
  timestampConfig?: TimestampConfig,
): BaseCreateAlertsReturnType => {
  // First sanitize all field values
  const sanitizedAlert = sanitizeFieldValue(alert) as Record<string, unknown>;

  // Then validate required fields and structure
  const validatedAlert = validateAlert(
    sanitizedAlert,
    hostName,
    userName,
    space,
    timestampConfig,
  );

  return validatedAlert as BaseCreateAlertsReturnType;
};
