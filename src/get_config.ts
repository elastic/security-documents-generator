import * as fs from 'fs';
import * as t from 'io-ts';

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
  eventIndex: t.union([t.string, t.undefined]),
  eventDateOffsetHours: t.union([t.number, t.undefined]),
});

type ConfigType = t.TypeOf<typeof Config>;

let config: ConfigType;

export const getConfig = (): ConfigType => {
  if (config) {
    return config;
  }

  // get config relative to the file
  const configPath = __dirname + '/../config.json';
  const configJson = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  if (!configJson.eventIndex) {
    configJson.eventIndex = 'logs-testlogs-default';
  }

  const validationResult = Config.decode(configJson);

  if (validationResult._tag === 'Left') {
    console.error('Config validation error');
    console.error(JSON.stringify(validationResult.left, null, 2));
    process.exit(1);
  }

  config = configJson;
  return configJson;
};
