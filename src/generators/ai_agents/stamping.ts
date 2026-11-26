import { type AiAgentName } from './types.ts';

/** `agent` is the agent's own process, including its self re-execs. Everything it starts is a `descendant`. */
export type ProcessRole = 'agent' | 'descendant';

export interface ClaudeStampState {
  readonly agent: 'claude_code';
  readonly email: string;
  /** Epoch ms of the credential file write. Undefined means never signed in during the data. */
  readonly signedInAt: number | undefined;
  readonly sessionId: string;
  /** Epoch ms from which Claude knows its session ID. */
  readonly sessionStartedAt: number;
}

export interface CursorStampState {
  readonly agent: 'cursor';
  readonly email: string;
  readonly signedInAt: number | undefined;
}

export type AgentStampState = ClaudeStampState | CursorStampState;

export interface AiAgentFields {
  readonly name: AiAgentName;
  readonly is_descendant: boolean;
  readonly email?: string;
  readonly session_id?: string;
}

/**
 * Builds `process.ai_agent` for one event. Every Endpoint document the helpers emit for an agent
 * goes through this function, so these rules hold everywhere:
 * the email only on the agent's own events at or after sign-in, the session ID only on Claude
 * events once the session has started, and `api_key_auth` never set.
 */
export const stampAiAgent = ({
  state,
  role,
  timestamp,
}: {
  state: AgentStampState;
  role: ProcessRole;
  timestamp: number;
}): AiAgentFields => {
  const signedIn = state.signedInAt !== undefined && timestamp >= state.signedInAt;
  const email = role === 'agent' && signedIn ? state.email : undefined;
  const sessionId =
    state.agent === 'claude_code' && timestamp >= state.sessionStartedAt
      ? state.sessionId
      : undefined;

  return {
    name: state.agent,
    is_descendant: role === 'descendant',
    ...(email !== undefined && { email }),
    ...(sessionId !== undefined && { session_id: sessionId }),
  };
};
