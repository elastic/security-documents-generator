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
const MitreConfig = t.partial({
    enabled: t.boolean,
    tactics: t.array(t.string),
    maxTechniquesPerAlert: t.number,
    includeSubTechniques: t.boolean,
    probabilityOfMitreAlert: t.number,
    enableAttackChains: t.boolean,
    maxChainLength: t.number,
    chainProbability: t.number,
});
const GenerationConfig = t.partial({
    alerts: t.partial({
        defaultCount: t.number,
        batchSize: t.number,
        maxFields: t.number,
        minFields: t.number,
        largeBatchSize: t.number,
        maxLargeBatchSize: t.number,
        parallelBatches: t.number,
    }),
    events: t.partial({
        defaultCount: t.number,
        batchSize: t.number,
        maxFields: t.number,
        minFields: t.number,
        largeBatchSize: t.number,
        maxLargeBatchSize: t.number,
        parallelBatches: t.number,
    }),
    entities: t.partial({
        defaultHosts: t.number,
        defaultUsers: t.number,
        maxHostsPerBatch: t.number,
        maxUsersPerBatch: t.number,
    }),
    performance: t.partial({
        enableLargeScale: t.boolean,
        largeScaleThreshold: t.number,
        maxConcurrentRequests: t.number,
        requestDelayMs: t.number,
        cacheEnabled: t.boolean,
        maxCacheSize: t.number,
        progressReporting: t.boolean,
    }),
});
const Config = t.intersection([
    t.type({
        elastic: Node,
        kibana: Node,
    }),
    t.partial({
        serverless: t.boolean,
        eventIndex: t.string,
        eventDateOffsetHours: t.number,
        openaiApiKey: t.string,
        useAI: t.boolean,
        // Azure OpenAI fields
        useAzureOpenAI: t.boolean,
        azureOpenAIApiKey: t.string,
        azureOpenAIEndpoint: t.string,
        azureOpenAIDeployment: t.string,
        azureOpenAIApiVersion: t.string,
        // Claude/Anthropic fields
        useClaudeAI: t.boolean,
        claudeApiKey: t.string,
        claudeModel: t.string,
        // MITRE and generation configs
        mitre: MitreConfig,
        generation: GenerationConfig,
    }),
    t.partial({
        timestamps: t.partial({
            startDate: t.string,
            endDate: t.string,
            pattern: t.union([
                t.literal('uniform'),
                t.literal('business_hours'),
                t.literal('random'),
                t.literal('attack_simulation'),
                t.literal('weekend_heavy'),
            ]),
            enableMultiDay: t.boolean,
            daySpread: t.number,
            examples: t.partial({
                '7_days_ago': t.string,
                '1_week_ago': t.string,
                '1_month_ago': t.string,
                specific_date: t.string,
                patterns: t.array(t.string),
            }),
        }),
    }),
]);
let config;
const CONFIG_FILE_NAME = 'config.json';
const directoryName = dirname(fileURLToPath(import.meta.url));
export const configPath = resolve(directoryName, `../${CONFIG_FILE_NAME}`);
export const getConfig = () => {
    if (config) {
        return config;
    }
    const configJson = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (!configJson.eventIndex) {
        configJson.eventIndex = 'logs-testlogs-default';
    }
    // Default AI settings
    if (configJson.useAI === undefined) {
        configJson.useAI = false;
    }
    // Default Azure OpenAI settings
    if (configJson.useAzureOpenAI === undefined) {
        configJson.useAzureOpenAI = false;
    }
    // Default Claude settings
    if (configJson.useClaudeAI === undefined) {
        configJson.useClaudeAI = false;
    }
    if (configJson.claudeModel === undefined) {
        configJson.claudeModel = 'claude-3-5-sonnet-20241022';
    }
    const validationResult = Config.decode(configJson);
    if (validationResult._tag === 'Left') {
        console.error(`There was a config validation error. Fix issues below in the ${CONFIG_FILE_NAME} file, and try again.`);
        console.log(PathReporter.report(validationResult));
        process.exit(1);
    }
    config = configJson;
    return configJson;
};
