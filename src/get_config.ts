import * as fs from 'fs';
import * as t from 'io-ts';
// get config relative to the file
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { PathReporter } from 'io-ts/lib/PathReporter';

const NodeWithCredentials = t.type({
  node: t.string,
  username: t.string,
  password: t.string,
});

const NodeWithAPIKey = t.type({
  node: t.string,
  apiKey: t.string,
});

const Node = t.union([NodeWithCredentials, NodeWithAPIKey]);

const Config = t.type({
  elastic: Node,
  kibana: Node,
  serverless: t.union([t.boolean, t.undefined]),
  eventIndex: t.union([t.string, t.undefined]),
  eventDateOffsetHours: t.union([t.number, t.undefined]),
});

export type ConfigType = t.TypeOf<typeof Config>;

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
    }
  }

  // Return null if no env vars were set (to indicate we should use file config)
  const hasAnyEnvConfig =
    envConfig.elastic ||
    envConfig.kibana ||
    envConfig.serverless !== undefined ||
    envConfig.eventIndex !== undefined ||
    envConfig.eventDateOffsetHours !== undefined;

  return hasAnyEnvConfig ? envConfig : null;
};

/**
 * Merges environment variable config with file config.
 * Environment variables take precedence.
 */
const mergeConfigs = (
  fileConfig: Partial<ConfigType>,
  envConfig: Partial<ConfigType>
): Partial<ConfigType> => {
  return {
    ...fileConfig,
    ...envConfig,
    // Deep merge for elastic and kibana nodes
    elastic: envConfig.elastic || fileConfig.elastic,
    kibana: envConfig.kibana || fileConfig.kibana,
  };
};

/**
 * Loads and merges configuration from environment variables and config.json.
 * Returns the merged config and validation result.
 * @param throwOnReadError - If true, throws on file read errors. If false, returns empty config.
 */
const loadAndMergeConfig = (
  throwOnReadError: boolean = false
): {
  mergedConfig: Partial<ConfigType>;
  validationResult: t.Validation<ConfigType>;
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

  // Validate the merged configuration
  const validationResult = Config.decode(mergedConfig);

  return { mergedConfig, validationResult, envConfig };
};

/**
 * Checks if a valid configuration is available from environment variables or config.json.
 * This is used to determine if we need to prompt the user to create a config file.
 */
export const hasValidConfig = (): boolean => {
  const { validationResult } = loadAndMergeConfig(false);
  return validationResult._tag === 'Right';
};

export const getConfig = (): ConfigType => {
  if (config) {
    return config;
  }

  const { mergedConfig, validationResult, envConfig } = loadAndMergeConfig(true);

  if (validationResult._tag === 'Left') {
    console.error(
      `There was a config validation error. Fix issues below in your ${envConfig ? 'environment variables or ' : ''}${CONFIG_FILE_NAME} file, and try again.`
    );
    console.log(PathReporter.report(validationResult));
    process.exit(1);
  }

  config = mergedConfig as ConfigType;
  return config;
};
