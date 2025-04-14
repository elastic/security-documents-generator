import { input, select } from '@inquirer/prompts';
import fs from 'fs';
import { configPath, ConfigType } from '../get_config';

export const createConfigFileOnFirstRun = async () => {
  if (fs.existsSync(configPath)) {
    return;
  }

  console.log(`
    Hi there! Looks like this is your first run 👋

    First we need to create a config file for you.
  `);

  let apiKey = '';
  let username = '';
  let password = '';

  const enum AuthMethod {
    Basic = 'basic',
    ApiKey = 'api_key',
  }

  const authMethod: AuthMethod = await select({
    choices: [
      { name: 'Basic Auth (username + password)', value: AuthMethod.Basic },
      { name: 'API Key', value: AuthMethod.ApiKey },
    ],
    message: 'Select the authentication method',
    default: AuthMethod.Basic,
  });

  if (authMethod === 'api_key') {
    apiKey = await input({
      message: 'Enter the API key',
      default: '',
    });
  } else {
    username = await input({
      message: 'Enter the username',
      default: 'elastic',
    });

    password = await input({
      message: 'Enter the password',
      default: 'changeme',
    });
  }

  const elasticNode = await input({
    message: 'Enter the ElasticSearch node URL',
    default: 'http://localhost:9200',
  });
  const kibanaNode = await input({
    message: 'Enter the Kibana node URL',
    default: 'http://localhost:5601',
  });

  const auth =
    authMethod === AuthMethod.ApiKey ? { apiKey } : { username, password };

  const config: ConfigType = {
    elastic: {
      node: elasticNode,
      ...auth,
    },
    kibana: {
      node: kibanaNode,
      ...auth,
    },
    eventIndex: '',
    eventDateOffsetHours: undefined,
  };

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  console.log(`
    
    Config file created at ${configPath} 🎉

    Now let's run the command you wanted to run...

    `);
};
