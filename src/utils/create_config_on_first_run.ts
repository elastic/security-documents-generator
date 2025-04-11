import { input } from '@inquirer/prompts';
import fs from 'fs';
import { configPath } from '../get_config';

export const createConfigFileOnFirstRun = async () => {
  if (fs.existsSync(configPath)) {
    return;
  }

  console.log(`
    Hi there! Looks like this is your first run 👋

    First we need to create a config file for you.
  `);

  const username = await input({
    message: 'Enter the username for the ElasticSearch node',
    default: 'elastic',
  });
  const password = await input({
    message: 'Enter the password for the ElasticSearch node',
    default: 'changeme',
  });
  const elasticNode = await input({
    message: 'Enter the ElasticSearch node URL',
    default: 'http://localhost:9200',
  });
  const kibanaNode = await input({
    message: 'Enter the Kibana node URL',
    default: 'http://localhost:5601',
  });

  // now write the config file
  const config = {
    elastic: {
      node: elasticNode,
      username: username,
      password: password,
    },
    kibana: {
      node: kibanaNode,
      username: username,
      password: password,
    },
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`Config file created at ${configPath}`);
};
