import { input, select, confirm } from '@inquirer/prompts';
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
    let apiKey = '';
    let username = '';
    let password = '';
    const authMethod = await select({
        choices: [
            { name: 'Basic Auth (username + password)', value: "basic" /* AuthMethod.Basic */ },
            { name: 'API Key', value: "api_key" /* AuthMethod.ApiKey */ },
        ],
        message: 'Select the authentication method',
        default: "basic" /* AuthMethod.Basic */,
    });
    if (authMethod === 'api_key') {
        apiKey = await input({
            message: 'Enter the API key',
            default: '',
        });
    }
    else {
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
                console.log('Warning: Azure OpenAI enabled but no API key provided. You can add it later to config.json.');
            }
            azureOpenAIEndpoint = await input({
                message: 'Enter your Azure OpenAI endpoint (e.g., https://your-resource-name.openai.azure.com)',
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
        }
        else {
            openaiApiKey = await input({
                message: 'Enter your OpenAI API key',
                default: '',
            });
            if (!openaiApiKey) {
                console.log('Warning: AI generation enabled but no API key provided. You can add it later to config.json.');
            }
        }
    }
    const auth = authMethod === "api_key" /* AuthMethod.ApiKey */ ? { apiKey } : { username, password };
    const config = {
        elastic: {
            node: elasticNode,
            ...auth,
        },
        kibana: {
            node: kibanaNode,
            ...auth,
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
