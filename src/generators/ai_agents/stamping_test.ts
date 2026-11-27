import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { stampAiAgent, type ClaudeStampState, type CursorStampState } from './stamping.ts';

const signedInAt = 1_000;
const sessionStartedAt = 2_000;

const claude: ClaudeStampState = {
  agent: 'claude_code',
  email: 'dana.lee@example.com',
  signedInAt,
  sessionId: '00000000-0000-4000-8000-000000000001',
  sessionStartedAt,
};

const cursor: CursorStampState = { agent: 'cursor', email: 'dana.lee@example.com', signedInAt };

describe('stampAiAgent', () => {
  it('puts the email only on events of the agent itself, at or after sign-in', () => {
    assert.equal(
      stampAiAgent({ state: claude, role: 'agent', timestamp: signedInAt - 1 }).email,
      undefined,
    );
    assert.equal(
      stampAiAgent({ state: claude, role: 'agent', timestamp: signedInAt }).email,
      claude.email,
    );
    assert.equal(
      stampAiAgent({ state: cursor, role: 'agent', timestamp: signedInAt + 5 }).email,
      cursor.email,
    );
  });

  it('never puts the email on descendants', () => {
    for (const state of [claude, cursor]) {
      assert.equal(
        stampAiAgent({ state, role: 'descendant', timestamp: sessionStartedAt + 10 }).email,
        undefined,
      );
    }
  });

  it('leaves the email off when the agent never signed in', () => {
    const neverSignedIn: ClaudeStampState = { ...claude, signedInAt: undefined };
    assert.equal(
      stampAiAgent({ state: neverSignedIn, role: 'agent', timestamp: 10_000 }).email,
      undefined,
    );
  });

  it('puts the Claude session ID on the agent and its descendants once the session has started', () => {
    assert.equal(
      stampAiAgent({ state: claude, role: 'agent', timestamp: sessionStartedAt - 1 }).session_id,
      undefined,
    );
    assert.equal(
      stampAiAgent({ state: claude, role: 'agent', timestamp: sessionStartedAt }).session_id,
      claude.sessionId,
    );
    assert.equal(
      stampAiAgent({ state: claude, role: 'descendant', timestamp: sessionStartedAt + 1 })
        .session_id,
      claude.sessionId,
    );
  });

  it('never gives Cursor a session ID', () => {
    const fields = stampAiAgent({ state: cursor, role: 'agent', timestamp: 1_000_000 });
    assert.equal('session_id' in fields, false);
  });

  it('sets name and is_descendant on every event and never api_key_auth', () => {
    const agent = stampAiAgent({ state: claude, role: 'agent', timestamp: 0 });
    const descendant = stampAiAgent({ state: cursor, role: 'descendant', timestamp: 0 });
    assert.deepEqual(agent, { name: 'claude_code', is_descendant: false });
    assert.deepEqual(descendant, { name: 'cursor', is_descendant: true });
    assert.equal('api_key_auth' in agent, false);
  });
});
