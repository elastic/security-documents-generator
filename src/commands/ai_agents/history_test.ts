import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { faker } from '@faker-js/faker';
import { buildAiAgentDocuments } from './ai_agents.ts';
import { DAY_MS, historyDays, nightlyStarts, weekdayStarts } from './history.ts';
import { SCENARIO_GROUPS } from './scenarios.ts';
import { STORYLINE_HOSTS } from './storyline.ts';
import {
  ENDPOINT_PROCESS_INDEX,
  seedClaudeCodeOtel,
  seedIdentityContext,
} from '../../generators/ai_agents/index.ts';

type Source = Record<string, unknown>;

interface ProcessFields {
  entity_id: string;
  args: string[];
  command_line: string;
  ai_agent?: { name: string; is_descendant: boolean };
  parent?: { entity_id: string };
  entry_leader?: { start: string; entry_meta: { type: string } };
}

// A Thursday, so the window's day is a weekday.
const NOW = Date.parse('2026-11-26T12:00:00.000Z');
const WINDOW_MS = 3 * 60 * 60 * 1000;
const START = NOW - WINDOW_MS;

const processOf = (source: Source): ProcessFields => source.process as ProcessFields;
const actionsOf = (source: Source): string[] => (source.event as { action: string[] }).action;
const timeOf = (source: Source): number => Date.parse(String(source['@timestamp']));
const hostName = (source: Source): string => (source.host as { name: string }).name;
const userName = (source: Source): string => (source.user as { name: string }).name;

const generate = (historyDayCount: number) => {
  faker.seed(4321);
  seedClaudeCodeOtel(4321);
  seedIdentityContext(4321);
  return buildAiAgentDocuments(
    {
      scenarios: SCENARIO_GROUPS.demo,
      repeat: 1,
      timeWindowMs: WINDOW_MS,
      claudeOtel: true,
      sessionData: true,
      domain: 'example.com',
      cursorAudit: true,
      historyDays: historyDayCount,
    },
    NOW,
  ).flatMap(({ documents }) => documents);
};

const processEvents = (documents: ReturnType<typeof generate>): Source[] =>
  documents.filter((doc) => doc.index === ENDPOINT_PROCESS_INDEX).map((doc) => doc.source);

/** `name@host@user` for every agent, as Entity Store keys them (host name standing in for host.id). */
const agentKeys = (events: Source[]): string[] =>
  [
    ...new Set(
      events
        .filter((source) => processOf(source).ai_agent?.is_descendant === false)
        .map(
          (source) => `${processOf(source).ai_agent?.name}@${hostName(source)}@${userName(source)}`,
        ),
    ),
  ].sort();

/** Launches whose parent isn't the agent, as the flyout counts sessions. */
const sessionRoots = (events: Source[], host: string, user: string): Source[] => {
  const own = events.filter(
    (source) =>
      hostName(source) === host &&
      userName(source) === user &&
      processOf(source).ai_agent?.is_descendant === false,
  );
  const ids = new Set(own.map((source) => processOf(source).entity_id));
  return own.filter(
    (source) =>
      actionsOf(source).includes('exec') && !ids.has(processOf(source).parent?.entity_id ?? ''),
  );
};

describe('history days', () => {
  it('ends with the window day, which has only the live scenarios', () => {
    const days = historyDays(START, 30);
    assert.equal(days.length, 29);
    assert.equal(days[28], Date.parse('2026-11-25T00:00:00.000Z'));
    assert.equal(days[0], Date.parse('2026-10-28T00:00:00.000Z'));
    assert.deepEqual(historyDays(START, 0), []);
    assert.deepEqual(historyDays(START, 1), []);
  });

  it('runs the cron job at the same minute every night', () => {
    const nights = nightlyStarts(START, 30, 135);
    assert.equal(nights.length, 29);
    assert.ok(nights.every((at) => new Date(at).toISOString().endsWith('T02:15:00.000Z')));
  });

  it('starts weekday sessions in working hours and none on the days away', () => {
    faker.seed(1);
    const starts = weekdayStarts(START, 30, { away: { from: 8, to: 14 } });
    const today = START - (START % DAY_MS);
    for (const at of starts) {
      const date = new Date(at);
      assert.ok(![0, 6].includes(date.getUTCDay()), date.toISOString());
      assert.ok(date.getUTCHours() >= 9 && date.getUTCHours() < 17, date.toISOString());
      const daysAgo = Math.floor((today - at) / DAY_MS) + 1;
      assert.ok(daysAgo < 8 || daysAgo > 14, date.toISOString());
    }
    assert.ok(starts.length >= 15);
  });
});

describe('demo scenarios with 30 days of history', () => {
  let withHistory: Source[];
  let without: Source[];

  before(() => {
    withHistory = processEvents(generate(30));
    without = processEvents(generate(0));
  });

  it('keeps the live sessions the same for a seed and adds history only to existing agents', () => {
    const liveIds = (events: Source[]) =>
      events
        .filter((source) => timeOf(source) >= START)
        .map((source) => processOf(source).entity_id);
    assert.deepEqual(liveIds(withHistory), liveIds(without));
    assert.deepEqual(agentKeys(withHistory), agentKeys(without));
  });

  it('writes nothing in the future, and nothing before the first history day', () => {
    const first = Date.parse('2026-10-28T00:00:00.000Z');
    for (const source of withHistory) {
      assert.ok(timeOf(source) <= NOW && timeOf(source) >= first, String(source['@timestamp']));
    }
  });

  it('gives the build server agent one cron session a night for 30 days, each ended', () => {
    const roots = sessionRoots(withHistory, STORYLINE_HOSTS.buildServer, 'ec2-user');
    assert.equal(roots.length, 30);
    const days = new Set(roots.map((source) => String(source['@timestamp']).slice(0, 10)));
    assert.equal(days.size, 30);
    for (const root of roots) {
      const { entity_id: id, entry_leader: leader } = processOf(root);
      assert.equal(leader?.entry_meta.type, 'init');
      assert.ok(
        withHistory.some(
          (source) => processOf(source).entity_id === id && actionsOf(source).includes('end'),
        ),
        `no end event for the session at ${String(root['@timestamp'])}`,
      );
    }
  });

  it('keeps the quiet nights free of what the demo rules match', () => {
    const history = withHistory.filter((source) => timeOf(source) < START);
    for (const source of history) {
      const line = processOf(source).command_line ?? '';
      assert.ok(!line.includes('--dangerously-skip-permissions'), line);
      assert.ok(!/ignore previous instructions/i.test(line), line);
      assert.ok(!line.includes('Downloads'), line);
    }
  });

  it('starts every history event after its session leader, so hosts boot before the history', () => {
    for (const source of withHistory) {
      const leaderStart = processOf(source).entry_leader?.start;
      if (leaderStart) {
        assert.ok(Date.parse(leaderStart) <= timeOf(source), String(source['@timestamp']));
      }
    }
  });

  it('gives three laptop installs weekday sessions, with a week away for the Cursor user', () => {
    const laptops = agentKeys(withHistory).filter((key) => /@(mac-|DESKTOP-)/.test(key));
    const sessionDays = (key: string) => {
      const [, host, user] = key.split('@');
      return new Set(
        sessionRoots(withHistory, host, user)
          .filter((source) => timeOf(source) < START)
          .map((source) => String(source['@timestamp']).slice(0, 10)),
      );
    };
    const withSessions = laptops.filter((key) => sessionDays(key).size > 0);
    assert.equal(withSessions.length, 3);
    const cursor = withSessions.find((key) => key.startsWith('cursor@'));
    assert.ok(cursor);
    const away = sessionDays(cursor);
    for (const day of ['2026-11-12', '2026-11-13', '2026-11-16', '2026-11-17', '2026-11-18']) {
      assert.ok(!away.has(day), day);
    }
    for (const key of withSessions) {
      for (const day of sessionDays(key)) {
        assert.ok(![0, 6].includes(new Date(day).getUTCDay()), `${key} on ${day}`);
      }
    }
  });
});
