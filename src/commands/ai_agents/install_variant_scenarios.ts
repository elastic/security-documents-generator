import { faker } from '@faker-js/faker';
import {
  bin,
  DESTINATIONS,
  type HostOs,
  type HostRuntime,
  type InstallMethod,
  type OsUser,
} from '../../generators/ai_agents/index.ts';
import { weekdayStarts, type WeekdayOptions } from './history.ts';
import type { ScenarioBuild, ScenarioBuilder } from './scenarios.ts';
import { repoPath } from './scenario_helpers.ts';
import {
  cloudDefaultUser,
  macUser,
  windowsUser,
  type AccountKind,
} from './synthetic_identities.ts';

/**
 * One ordinary session per install method the lab didn't cover, for the inventory and the agent ID.
 * Every shape is inferred from install layouts and the GenAI rules' name lists, so all of it is `poc-mock`.
 */
export const INSTALL_VARIANT_SCENARIOS = [
  'install_claude_brew',
  'install_claude_npm',
  'install_claude_windows',
  'install_cursor_ide',
] as const;

export type InstallVariantScenario = (typeof INSTALL_VARIANT_SCENARIOS)[number];

export const INSTALL_VARIANT_SHAPES: Record<
  InstallVariantScenario,
  { install: InstallMethod; os: HostOs; account?: AccountKind }
> = {
  install_claude_brew: { install: 'claude_homebrew', os: 'macos' },
  install_claude_npm: { install: 'claude_npm', os: 'linux' },
  install_claude_windows: { install: 'claude_windows', os: 'windows', account: 'contractor' },
  install_cursor_ide: { install: 'cursor_ide', os: 'macos' },
};

const tool = (os: HostOs, user: OsUser, name: 'git' | 'python3', args: string[]) => {
  if (os !== 'windows') {
    return { image: bin(name, [name, ...args]) };
  }
  const executable =
    name === 'git'
      ? 'C:\\Program Files\\Git\\cmd\\git.exe'
      : `${user.home}\\AppData\\Local\\Programs\\Python\\Python313\\python.exe`;
  return {
    image: {
      name: `${name === 'git' ? 'git' : 'python'}.exe`,
      executable,
      args: [executable, ...args],
    },
  };
};

interface OrdinaryRun {
  readonly runtime: HostRuntime;
  readonly os: HostOs;
  readonly install: InstallMethod;
  readonly osUser: OsUser;
  readonly email: string;
  readonly start: number;
  readonly args: readonly string[];
  /** Time the person spends between steps and before quitting. 0 for a print run. */
  readonly pauseMs?: number;
}

/** Reads main.py, runs `git status`, edits main.py and runs it, then quits. */
const ordinaryRun = (
  builder: ScenarioBuilder,
  { runtime, os, install, osUser, email, start, args, pauseMs = 0 }: OrdinaryRun,
): void => {
  const separator = os === 'windows' ? '\\' : '/';
  const workingDirectory = os === 'windows' ? `${osUser.home}\\src\\demo-app` : repoPath(osUser);
  const cursor = install === 'cursor_ide';
  const run = builder
    .mockRun({ runtime, user: osUser, install, args, start, email, workingDirectory })
    .launch();
  run.agentConnection(start + 300, cursor ? DESTINATIONS.cursorApi2 : DESTINATIONS.anthropicApi);
  run.agentFile(start + 1_200 + pauseMs, {
    action: 'open',
    path: `${workingDirectory}${separator}main.py`,
  });
  let time = run.toolCall(
    'git status --short',
    [tool(os, osUser, 'git', ['status', '--short'])],
    start + 2_000 + 2 * pauseMs,
  );
  const target = `${workingDirectory}${separator}main.py`;
  const tmp = `${target}.tmp.${run.agent.pid}.9c1e4b7a2d3f`;
  run.agentFile(time + 400 + pauseMs, { action: 'creation', path: tmp });
  run.agentFile(time + 403 + pauseMs, {
    action: 'rename',
    path: target,
    originalPath: tmp,
    size: 151,
  });
  time = run.toolCall(
    'python3 main.py',
    [tool(os, osUser, 'python3', ['main.py'])],
    time + 800 + 2 * pauseMs,
  );
  builder.finish(run, time + 1_500 + pauseMs);
};

/** Laptop installs with weekday history, and the one whose person was away for a week. */
const WEEKDAY_HISTORY: Partial<Record<InstallVariantScenario, WeekdayOptions>> = {
  install_claude_brew: {},
  install_cursor_ide: { away: { from: 8, to: 14 } },
  install_claude_windows: { maxPerDay: 2 },
};

const sessionFor = (
  builder: ScenarioBuilder,
  scenario: InstallVariantScenario,
  user: (login: string) => OsUser,
): void => {
  const { install, os, account } = INSTALL_VARIANT_SHAPES[scenario];
  const person = builder.person(account);
  const osUser = user(person.login);
  const runtime = builder.runtime({ os });
  const cursor = install === 'cursor_ide';
  const run = { runtime, os, install, osUser, email: person.email };
  ordinaryRun(builder, {
    ...run,
    start: builder.context.start + 5_000,
    args: cursor ? [] : ['-p', 'What does main.py do?', '--output-format', 'json'],
  });
  const history = WEEKDAY_HISTORY[scenario];
  if (history) {
    builder.history(() => {
      const { start, historyDays } = builder.context;
      for (const at of weekdayStarts(start, historyDays, history)) {
        ordinaryRun(builder, {
          ...run,
          start: at,
          args: [],
          pauseMs: faker.number.int({ min: 2, max: 12 }) * 60_000,
        });
      }
    });
  }
};

const USERS: Record<HostOs, (login: string) => OsUser> = {
  linux: () => cloudDefaultUser('plain'),
  macos: macUser,
  windows: windowsUser,
};

export const INSTALL_VARIANT_BUILDS = Object.fromEntries(
  INSTALL_VARIANT_SCENARIOS.map((name) => {
    const build: ScenarioBuild = (builder) =>
      sessionFor(builder, name, USERS[INSTALL_VARIANT_SHAPES[name].os]);
    return [name, build];
  }),
) as Record<InstallVariantScenario, ScenarioBuild>;
