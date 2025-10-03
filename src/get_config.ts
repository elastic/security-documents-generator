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

export const getConfig = (): ConfigType => {
  if (config) {
    return config;
  }

  const configJson = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  if (!configJson.eventIndex) {
    configJson.eventIndex = 'logs-testlogs-default';
  }

  const validationResult = Config.decode(configJson);

  if (validationResult._tag === 'Left') {
    console.error(
      `There was a config validation error. Fix issues below in the ${CONFIG_FILE_NAME} file, and try again.`
    );
    console.log(PathReporter.report(validationResult));
    process.exit(1);
  }

  config = configJson;
  return configJson;
};
