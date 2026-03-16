import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

interface NodeWithCredentials {
  node: string;
  username: string;
  password: string;
}

interface NodeWithAPIKey {
  node: string;
  apiKey: string;
}

type NodeConfig = NodeWithCredentials | NodeWithAPIKey;

export interface ConfigType {
  elastic: NodeConfig;
  kibana: NodeConfig;
  serverless?: boolean;
  eventIndex?: string;
  eventDateOffsetHours?: number;
  allowSelfSignedCerts?: boolean;
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';
const checkOptionalType = (obj: Record<string, unknown>, key: string, type: string, prefix = '') =>
  obj[key] !== undefined && typeof obj[key] !== type ? `${prefix}${key}: must be a ${type}` : null;
const checkRequired = (obj: Record<string, unknown>, key: string, type: string, prefix = '') =>
  typeof obj[key] !== type ? `${prefix}${key}: must be a ${type}` : null;

const validateNodeConfig = (value: unknown, name: string): string[] => {
  if (!isObject(value)) return [`${name}: must be an object`];
  if (typeof value.node !== 'string') return [`${name}.node: must be a string`];

  if ('apiKey' in value) {
    return [checkRequired(value, 'apiKey', 'string', `${name}.`)].filter(Boolean) as string[];
  }
  if ('username' in value || 'password' in value) {
    return [
      checkRequired(value, 'username', 'string', `${name}.`),
      checkRequired(value, 'password', 'string', `${name}.`),
    ].filter(Boolean) as string[];
  }
  return [`${name}: must have either (username + password) or apiKey`];
};

const OPTIONAL_FIELDS: Array<[string, string]> = [
  ['serverless', 'boolean'],
  ['eventIndex', 'string'],
  ['eventDateOffsetHours', 'number'],
  ['allowSelfSignedCerts', 'boolean'],
];

const validateConfig = (value: unknown): string[] => {
  if (!isObject(value)) return ['Config must be an object'];
  return [
    ...validateNodeConfig(value.elastic, 'elastic'),
    ...validateNodeConfig(value.kibana, 'kibana'),
    ...OPTIONAL_FIELDS.map(([key, type]) => checkOptionalType(value, key, type)).filter(Boolean),
  ] as string[];
};

let config: ConfigType;

const CONFIG_FILE_NAME = 'config.json';

const directoryName = dirname(fileURLToPath(import.meta.url));
export const configPath = resolve(directoryName, `../${CONFIG_FILE_NAME}`);

/**
 * Reads configuration from environment variables.
 * Environment variables take precedence over config.json values.
 *
 * Supported environment variables:
 * - ELASTIC_NODE, ELASTIC_USERNAME, ELASTIC_PASSWORD, ELASTIC_API_KEY
 * - KIBANA_NODE, KIBANA_USERNAME, KIBANA_PASSWORD, KIBANA_API_KEY
 * - SERVERLESS (true/false)
 * - EVENT_INDEX
 * - EVENT_DATE_OFFSET_HOURS (number)
 * - ALLOW_SELF_SIGNED_CERTS (true/false)
 */
const getConfigFromEnv = (): Partial<ConfigType> | null => {
  const envConfig: Partial<ConfigType> = {};

  // Elastic node configuration
  const elasticNode = process.env.ELASTIC_NODE;
  const elasticUsername = process.env.ELASTIC_USERNAME;
  const elasticPassword = process.env.ELASTIC_PASSWORD;
  const elasticApiKey = process.env.ELASTIC_API_KEY;

  if (elasticNode) {
    if (elasticApiKey) {
      envConfig.elastic = {
        node: elasticNode,
        apiKey: elasticApiKey,
      };
    } else if (elasticUsername && elasticPassword) {
      envConfig.elastic = {
        node: elasticNode,
        username: elasticUsername,
        password: elasticPassword,
      };
    }
  }

  // Kibana node configuration
  const kibanaNode = process.env.KIBANA_NODE;
  const kibanaUsername = process.env.KIBANA_USERNAME;
  const kibanaPassword = process.env.KIBANA_PASSWORD;
  const kibanaApiKey = process.env.KIBANA_API_KEY;

  if (kibanaNode) {
    if (kibanaApiKey) {
      envConfig.kibana = {
        node: kibanaNode,
        apiKey: kibanaApiKey,
      };
    } else if (kibanaUsername && kibanaPassword) {
      envConfig.kibana = {
        node: kibanaNode,
        username: kibanaUsername,
        password: kibanaPassword,
      };
    }
  }

  // Optional fields
  if (process.env.SERVERLESS !== undefined) {
    envConfig.serverless = process.env.SERVERLESS === 'true' || process.env.SERVERLESS === '1';
  }

  if (process.env.EVENT_INDEX !== undefined) {
    envConfig.eventIndex = process.env.EVENT_INDEX;
  }

  if (process.env.EVENT_DATE_OFFSET_HOURS !== undefined) {
    const offsetHours = parseInt(process.env.EVENT_DATE_OFFSET_HOURS, 10);
    if (!isNaN(offsetHours)) {
      envConfig.eventDateOffsetHours = offsetHours;
    } else {
      console.warn(
        `Warning: EVENT_DATE_OFFSET_HOURS environment variable contains an invalid number ("${process.env.EVENT_DATE_OFFSET_HOURS}"). Ignoring this value.`,
      );
    }
  }

  if (process.env.ALLOW_SELF_SIGNED_CERTS !== undefined) {
    envConfig.allowSelfSignedCerts =
      process.env.ALLOW_SELF_SIGNED_CERTS === 'true' || process.env.ALLOW_SELF_SIGNED_CERTS === '1';
  }

  // Return null if no env vars were set (to indicate we should use file config)
  const hasAnyEnvConfig =
    envConfig.elastic ||
    envConfig.kibana ||
    envConfig.serverless !== undefined ||
    envConfig.eventIndex !== undefined ||
    envConfig.eventDateOffsetHours !== undefined ||
    envConfig.allowSelfSignedCerts !== undefined;

  return hasAnyEnvConfig ? envConfig : null;
};

/**
 * Merges environment variable config with file config.
 * Environment variables take precedence.
 */
const mergeConfigs = (
  fileConfig: Partial<ConfigType>,
  envConfig: Partial<ConfigType>,
): Partial<ConfigType> => {
  const { elastic, kibana, ...envConfigWithoutNodes } = envConfig;
  return {
    ...fileConfig,
    ...envConfigWithoutNodes,
    // Prefer envConfig values when they are defined; otherwise fall back to fileConfig
    elastic: elastic ?? fileConfig.elastic,
    kibana: kibana ?? fileConfig.kibana,
  };
};

/**
 * Loads and merges configuration from environment variables and config.json.
 * Returns the merged config and validation result.
 * @param throwOnReadError - If true, throws on file read errors. If false, returns empty config.
 */
const loadAndMergeConfig = (
  throwOnReadError: boolean = false,
): {
  mergedConfig: Partial<ConfigType>;
  errors: string[];
  envConfig: Partial<ConfigType> | null;
} => {
  // Try to read from environment variables first
  const envConfig = getConfigFromEnv();

  // Read from config.json file (if it exists)
  let fileConfig: Partial<ConfigType> = {};
  if (fs.existsSync(configPath)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (error) {
      if (throwOnReadError) {
        console.error(`Error reading ${CONFIG_FILE_NAME}:`, error);
        process.exit(1);
      }
      // If file exists but can't be parsed, return empty config
      // Validation will fail, which is the desired behavior
    }
  }

  // Merge configs (env vars override file config)
  const mergedConfig = envConfig ? mergeConfigs(fileConfig, envConfig) : fileConfig;

  // Set default eventIndex if not provided
  if (!mergedConfig.eventIndex) {
    mergedConfig.eventIndex = 'logs-testlogs-default';
  }

  const errors = validateConfig(mergedConfig);

  return { mergedConfig, errors, envConfig };
};

/**
 * Checks if a valid configuration is available from environment variables or config.json.
 * This is used to determine if we need to prompt the user to create a config file.
 */
export const hasValidConfig = (): boolean => {
  const { errors } = loadAndMergeConfig(false);
  return errors.length === 0;
};

export const getConfig = (): ConfigType => {
  if (config) {
    return config;
  }

  const { mergedConfig, errors, envConfig } = loadAndMergeConfig(true);

  if (errors.length > 0) {
    console.error(
      `There was a config validation error. Fix issues below in your ${envConfig ? 'environment variables or ' : ''}${CONFIG_FILE_NAME} file, and try again.`,
    );
    errors.forEach((err) => console.error(`  - ${err}`));
    process.exit(1);
  }

  config = mergedConfig as ConfigType;
  return config;
};
