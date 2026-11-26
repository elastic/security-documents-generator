import { en, faker, Faker } from '@faker-js/faker';
import { type ClaudeCodeSessionResult } from './claude_code.ts';
import {
  CLAUDE_CODE_OTEL_INDEX,
  CLAUDE_CODE_VERSION,
  POC_MOCK_TAG,
  type GeneratedDocument,
} from './types.ts';

const KERNEL = '6.1.190-237.442.amzn2023.x86_64';

/** OTel draws from its own source, so turning it on doesn't change the Endpoint data for a seed. */
const otelFaker = new Faker({ locale: [en] });

export const seedClaudeCodeOtel = (seed: number): void => {
  otelFaker.seed(seed);
};

/** The Claude account behind a signed-in email. Claude Code OTel reports these, Defend only the email. */
export interface ClaudeAccount {
  readonly email: string;
  readonly userId: string;
  readonly accountUuid: string;
  readonly accountId: string;
  readonly organizationId: string;
}

export interface ClaudeCodeOtelOptions {
  readonly session: ClaudeCodeSessionResult;
  readonly account: ClaudeAccount;
  /** Typed prompt for interactive sessions. Print sessions use the prompt from the command line. */
  readonly prompt: string;
  readonly model: string;
}

export const createClaudeAccount = (email: string, organizationId: string): ClaudeAccount => ({
  email,
  userId: faker.string.hexadecimal({ length: 64, casing: 'lower', prefix: '' }),
  accountUuid: faker.string.uuid(),
  accountId: `user_01${faker.string.alphanumeric(22)}`,
  organizationId,
});

const iso = (ms: number): string => new Date(ms).toISOString();

/**
 * Builds Claude Code OTel events for a Defend session, shaped like the Claude Code 0.3.0 package's
 * stored documents (its system-test sample and pipeline-test outputs): same session ID, `user.email`
 * from the account, `host.arch` and `host.os` but no `host.name` or `host.id`. Fields only the Fleet
 * final pipeline or `preserve_original_event` add are left out. Extrapolated: the lab produced no
 * real Claude Code OTel.
 */
export const buildClaudeCodeOtelEvents = ({
  session,
  account,
  prompt,
  model,
}: ClaudeCodeOtelOptions): GeneratedDocument[] => {
  const faker = otelFaker;
  const documents: GeneratedDocument[] = [];
  let sequence = 0;
  const promptId = faker.string.uuid();

  const event = (
    at: number,
    name: string,
    ecsEvent: Record<string, unknown>,
    claudeFields: Record<string, unknown>,
    extra: Record<string, unknown> = {},
    withPrompt = true,
  ) => {
    const timestamp = iso(at);
    documents.push({
      index: CLAUDE_CODE_OTEL_INDEX,
      source: {
        '@timestamp': timestamp,
        observed_timestamp: timestamp,
        claude_code: {
          events: {
            event: { name, sequence: sequence++, timestamp },
            session: { id: session.sessionId },
            ...(withPrompt && { prompt: { id: promptId } }),
            ...(session.interactive && { terminal: { type: 'xterm-256color' } }),
            user: { account_id: account.accountId, account_uuid: account.accountUuid },
            ...claudeFields,
          },
        },
        data_stream: { dataset: 'claude_code.events.otel', namespace: 'default', type: 'logs' },
        ecs: { version: '9.3.0' },
        // event.dataset, host.architecture and host.os.* are aliases in the integration's OTel
        // template, and writing an alias rejects the document into the failure store.
        event: {
          action: name,
          kind: 'event',
          provider: 'claude-code',
          ...ecsEvent,
        },
        host: { arch: 'amd64' },
        os: { type: 'linux', version: KERNEL },
        service: { name: 'claude-code', version: CLAUDE_CODE_VERSION },
        organization: { id: account.organizationId },
        related: { user: [account.email, account.userId] },
        resource: {
          attributes: {
            host: { arch: 'amd64' },
            os: { type: 'linux', version: KERNEL },
            service: { name: 'claude-code', version: CLAUDE_CODE_VERSION },
          },
        },
        scope: { name: 'com.anthropic.claude_code.events', version: CLAUDE_CODE_VERSION },
        tags: [POC_MOCK_TAG],
        user: { email: account.email, id: account.userId },
        ...extra,
        gen_ai: {
          provider: { name: 'anthropic' },
          ...(extra.gen_ai as Record<string, unknown> | undefined),
        },
      },
    });
  };

  for (const server of session.mcpServers) {
    event(
      session.sessionStartedAt + 3_000,
      'mcp_server_connection',
      { category: ['network'], type: ['connection'], outcome: 'unknown', duration: 211_000_000 },
      {
        is_plugin: false,
        server_name: server.name,
        server_scope: 'user',
        status: 'connected',
        transport_type: 'stdio',
      },
      {},
      false,
    );
  }
  const promptAt = Math.max(session.firstPromptAt, session.sessionStartedAt) + 300;
  event(
    promptAt,
    'user_prompt',
    { outcome: 'unknown' },
    {
      has_hooks: false,
      has_mcp: session.mcpServers.length > 0,
      prompt_length: prompt.length,
      prompt_text: prompt,
    },
  );

  let time = promptAt + 2_200;
  const apiRequest = (at: number) => {
    const cacheRead = faker.number.int({ min: 15_000, max: 40_000 });
    const costMicros = faker.number.int({ min: 20_000, max: 120_000 });
    event(
      at,
      'api_request',
      {
        category: ['api'],
        type: ['info'],
        outcome: 'unknown',
        duration: faker.number.int({ min: 900, max: 4_000 }) * 1_000_000,
      },
      {
        cost_usd: costMicros / 1_000_000,
        cost_usd_micros: costMicros,
        speed: 'normal',
        effort: 'high',
      },
      {
        gen_ai: {
          operation: { name: 'repl_main_thread' },
          request: { model },
          response: { id: `req_01${faker.string.alphanumeric(24)}`, model },
          usage: {
            cache_creation: { input_tokens: faker.number.int({ min: 0, max: 17_000 }) },
            cache_read: { input_tokens: cacheRead },
            input_tokens: faker.number.int({ min: 3, max: 400 }),
            output_tokens: faker.number.int({ min: 5, max: 900 }),
          },
        },
      },
    );
  };

  apiRequest(time);
  for (const step of session.steps) {
    time += 1_500;
    const toolUseId = `toolu_01${faker.string.alphanumeric(22)}`;
    if (step.type === 'bash') {
      const parameters = {
        bash_command: step.command,
        full_command: step.command,
        description: 'Run the command',
      };
      event(
        time,
        'tool_decision',
        { category: ['iam'], type: ['info'], outcome: 'success' },
        { decision: 'accept', source: 'config', tool_parameters: JSON.stringify(parameters) },
        {
          gen_ai: { tool: { call: { arguments: parameters, id: toolUseId }, name: 'Bash' } },
          process: { command_line: step.command },
        },
      );
      const input = { command: step.command, description: 'Run the command' };
      event(
        time + 200,
        'tool_result',
        { category: ['process'], type: ['info'], outcome: 'success', duration: 214_000_000 },
        {
          decision_source: 'config',
          decision_type: 'accept',
          success: 'true',
          tool_input: JSON.stringify(input),
          tool_input_size_bytes: JSON.stringify(input).length,
          tool_parameters: JSON.stringify(parameters),
          tool_parameters_flattened: parameters,
          tool_result_size_bytes: faker.number.int({ min: 20, max: 2_000 }),
        },
        {
          gen_ai: { tool: { call: { arguments: input, id: toolUseId }, name: 'Bash' } },
          process: { command_line: step.command },
        },
      );
    } else if (step.type === 'mcp_tool') {
      const parameters = { mcp_server_name: step.server, mcp_tool_name: step.tool };
      event(
        time + 200,
        'tool_result',
        { category: ['process'], type: ['info'], outcome: 'success', duration: 120_000_000 },
        {
          decision_source: 'config',
          decision_type: 'accept',
          mcp_server_name: step.server,
          mcp_server_scope: 'user',
          success: 'true',
          tool_input: '{}',
          tool_input_size_bytes: 2,
          tool_parameters: JSON.stringify(parameters),
          tool_result_size_bytes: faker.number.int({ min: 100, max: 2_000 }),
        },
        { gen_ai: { tool: { call: { arguments: parameters, id: toolUseId }, name: step.tool } } },
      );
    }
    apiRequest(time + 400);
  }
  return documents;
};
