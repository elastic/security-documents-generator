import { en, Faker } from '@faker-js/faker';
import { CURSOR_AUDIT_INDEX, POC_MOCK_TAG, type GeneratedDocument } from './types.ts';

/** Its own instance, so turning Cursor audit on doesn't change the other documents for a seed. */
const faker = new Faker({ locale: [en] });

export const seedCursorAudit = (seed: number): void => {
  faker.seed(seed);
};

/**
 * Cursor admin audit log events in the `cursor.audit` integration's stored shape, copied from its
 * pipeline test fixtures (`sources/mock-data/cursor/`). The integration only carries team admin
 * events (Enterprise plan): no prompts, sessions or tool calls. Never observed, so `poc-mock`.
 */
export type CursorAuditAction =
  | 'login'
  | 'logout'
  | 'add_user'
  | 'remove_user'
  | 'update_user_role'
  | 'user_api_key'
  | 'team_api_key'
  | 'mcp_server_config'
  | 'privacy_mode'
  | 'team_settings'
  | 'team_hook'
  | 'team_rule';

export interface CursorAuditEvent {
  readonly action: CursorAuditAction;
  readonly at: number;
  /** The signed-in user. `remove_user` from SCIM has no actor, as in the fixture. */
  readonly email?: string;
  readonly targetEmail?: string;
  /** Events from SCIM, such as `remove_user` in the fixture, have no source IP. */
  readonly fromScim?: boolean;
  readonly outcome?: 'success' | 'failure';
  /** Overrides or adds `cursor.audit.*` fields. */
  readonly audit?: Record<string, unknown>;
}

const SHAPES: Record<
  CursorAuditAction,
  { category: string[]; type: string[]; audit: () => Record<string, unknown> }
> = {
  login: {
    category: ['authentication'],
    type: ['start'],
    audit: () => ({ login_type: 'LOGIN_TYPE_WEB', success: true }),
  },
  logout: { category: ['authentication'], type: ['end'], audit: () => ({}) },
  add_user: {
    category: ['iam'],
    type: ['user', 'creation'],
    audit: () => ({
      invite_id: faker.string.alphanumeric(8).toLowerCase(),
      role: 'member',
      source: 'invite_email',
    }),
  },
  remove_user: { category: ['iam'], type: ['user', 'deletion'], audit: () => ({}) },
  update_user_role: {
    category: ['iam'],
    type: ['user', 'change'],
    audit: () => ({ new_role: 'ADMIN', old_role: 'MEMBER' }),
  },
  user_api_key: {
    category: ['iam', 'configuration'],
    type: ['admin'],
    audit: () => ({
      action: 'create',
      api_key_id: `key_user_${faker.string.alphanumeric(6).toLowerCase()}`,
    }),
  },
  team_api_key: {
    category: ['iam', 'configuration'],
    type: ['admin'],
    audit: () => ({
      action: 'create',
      api_key_id: `key_team_${faker.string.alphanumeric(6).toLowerCase()}`,
    }),
  },
  mcp_server_config: {
    category: ['configuration'],
    type: ['change'],
    audit: () => ({ action: 'create', scope: 'user', server_name: 'memory', server_type: 'STDIO' }),
  },
  privacy_mode: {
    category: ['configuration'],
    type: ['change'],
    audit: () => ({
      new_privacy_mode: 'PRIVACY_MODE_DEFAULT',
      old_privacy_mode: 'PRIVACY_MODE_NO_STORAGE',
      scope: 'team',
    }),
  },
  team_settings: {
    category: ['configuration'],
    type: ['change'],
    audit: () => ({
      new_value: 'disabled',
      old_value: 'enabled',
      setting_name: 'enforce_privacy_mode',
    }),
  },
  team_hook: {
    category: ['configuration'],
    type: ['change'],
    audit: () => ({
      action: 'create',
      hook_id: `hook_evt_${faker.string.numeric(3)}`,
      hook_step: 'post_tool_call',
      hook_type: 'command',
      is_active: true,
      operating_systems: ['linux', 'darwin'],
      script_name: 'log-tool-calls.sh',
    }),
  },
  team_rule: {
    category: ['configuration'],
    type: ['change'],
    audit: () => ({
      action: 'update',
      is_active: true,
      is_required: false,
      rule_id: `rule_${faker.string.alphanumeric(8).toLowerCase()}`,
      rule_name: 'Require review for infra',
    }),
  },
};

const ELASTIC_AGENT_VERSION = '9.6.0';

/** Builds Cursor audit documents for `logs-cursor.audit-default`, written with the `_none` pipeline. */
export const buildCursorAuditEvents = (
  events: readonly CursorAuditEvent[],
): GeneratedDocument[] => {
  const agentId = faker.string.uuid();
  return events.map(
    ({ action, at, email, targetEmail, fromScim = false, outcome = 'success', audit }) => {
      const sourceIp = fromScim ? undefined : `203.0.113.${faker.number.int({ min: 2, max: 250 })}`;
      const shape = SHAPES[action];
      const cursorAudit = { ...shape.audit(), ...audit };
      if (action === 'login' && outcome === 'failure') {
        cursorAudit.success = false;
      }
      const timestamp = new Date(at).toISOString();
      const users = [email, targetEmail].filter((value): value is string => Boolean(value));
      return {
        index: CURSOR_AUDIT_INDEX,
        source: {
          '@timestamp': timestamp,
          agent: { id: agentId, type: 'filebeat', version: ELASTIC_AGENT_VERSION },
          data_stream: { dataset: 'cursor.audit', namespace: 'default', type: 'logs' },
          ecs: { version: '9.3.0' },
          elastic_agent: { id: agentId, snapshot: false, version: ELASTIC_AGENT_VERSION },
          event: {
            action,
            category: shape.category,
            type: shape.type,
            kind: 'event',
            outcome,
            provider: 'cursor',
            dataset: 'cursor.audit',
            id: faker.string.uuid(),
            ingested: new Date(at + 90_000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
          },
          input: { type: 'cel' },
          ...(Object.keys(cursorAudit).length > 0 && { cursor: { audit: cursorAudit } }),
          related: { ...(sourceIp && { ip: [sourceIp] }), user: users },
          ...(sourceIp && { source: { ip: sourceIp } }),
          tags: ['forwarded', 'cursor-audit', POC_MOCK_TAG],
          user: {
            ...(email && { email }),
            ...(targetEmail && { target: { email: targetEmail } }),
          },
        },
      };
    },
  );
};
