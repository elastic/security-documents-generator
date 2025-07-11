import { input, confirm } from '@inquirer/prompts';
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

  // Only support basic auth (username + password) for simplicity
  const username = await input({
    message: 'Enter the username',
    default: 'elastic',
  });

  const password = await input({
    message: 'Enter the password',
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

  // Add AI configuration
  const useAI = await confirm({
    message: 'Do you want to enable AI-powered document generation?',
    default: false,
  });

  let openaiApiKey = '';
  let useAzureOpenAI = false;
  let azureOpenAIApiKey = '';
  let azureOpenAIEndpoint = '';
  let azureOpenAIDeployment = '';
  let azureOpenAIApiVersion = '';

  if (useAI) {
    useAzureOpenAI = await confirm({
      message: 'Do you want to use Azure OpenAI instead of OpenAI?',
      default: false,
    });

    if (useAzureOpenAI) {
      azureOpenAIApiKey = await input({
        message: 'Enter your Azure OpenAI API key',
        default: '',
      });

      if (!azureOpenAIApiKey) {
        console.log(
          'Warning: Azure OpenAI enabled but no API key provided. You can add it later to config.json.',
        );
      }

      azureOpenAIEndpoint = await input({
        message:
          'Enter your Azure OpenAI endpoint (e.g., https://your-resource-name.openai.azure.com)',
        default: '',
      });

      azureOpenAIDeployment = await input({
        message: 'Enter your Azure OpenAI deployment name',
        default: '',
      });

      azureOpenAIApiVersion = await input({
        message: 'Enter your Azure OpenAI API version',
        default: '2023-05-15',
      });
    } else {
      openaiApiKey = await input({
        message: 'Enter your OpenAI API key',
        default: '',
      });

      if (!openaiApiKey) {
        console.log(
          'Warning: AI generation enabled but no API key provided. You can add it later to config.json.',
        );
      }
    }
  }

  const config: ConfigType = {
    elastic: {
      node: elasticNode,
      username,
      password,
    },
    kibana: {
      node: kibanaNode,
      username,
      password,
    },
    serverless: false,
    eventIndex: '',
    eventDateOffsetHours: undefined,
    useAI,
    openaiApiKey: openaiApiKey || undefined,
    useAzureOpenAI,
    azureOpenAIApiKey: azureOpenAIApiKey || undefined,
    azureOpenAIEndpoint: azureOpenAIEndpoint || undefined,
    azureOpenAIDeployment: azureOpenAIDeployment || undefined,
    azureOpenAIApiVersion: azureOpenAIApiVersion || undefined,
  };

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  console.log(`

    Config file created at ${configPath} 🎉

    Now let's run the command you wanted to run...

    `);
};
