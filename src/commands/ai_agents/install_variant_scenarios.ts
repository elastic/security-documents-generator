import {
  bin,
  DESTINATIONS,
  type HostOs,
  type InstallMethod,
  type OsUser,
} from '../../generators/ai_agents/index.ts';
import type { ScenarioBuild, ScenarioBuilder } from './scenarios.ts';
import { repoPath } from './scenario_helpers.ts';
import { cloudDefaultUser, macUser, windowsUser } from './synthetic_identities.ts';

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
  { install: InstallMethod; os: HostOs }
> = {
  install_claude_brew: { install: 'claude_homebrew', os: 'macos' },
  install_claude_npm: { install: 'claude_npm', os: 'linux' },
  install_claude_windows: { install: 'claude_windows', os: 'windows' },
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

const sessionFor = (
  builder: ScenarioBuilder,
  install: InstallMethod,
  os: HostOs,
  user: (login: string) => OsUser,
): void => {
  const person = builder.person();
  const osUser = user(person.login);
  const runtime = builder.runtime({ os });
  const start = builder.context.start + 5_000;
  const separator = os === 'windows' ? '\\' : '/';
  const workingDirectory = os === 'windows' ? `${osUser.home}\\src\\demo-app` : repoPath(osUser);
  const cursor = install === 'cursor_ide';
  const run = builder
    .mockRun({
      runtime,
      user: osUser,
      install,
      args: cursor ? [] : ['-p', 'What does main.py do?', '--output-format', 'json'],
      start,
      email: person.email,
      workingDirectory,
    })
    .launch();
  run.agentConnection(start + 300, cursor ? DESTINATIONS.cursorApi2 : DESTINATIONS.anthropicApi);
  run.agentFile(start + 1_200, { action: 'open', path: `${workingDirectory}${separator}main.py` });
  let time = run.toolCall(
    'git status --short',
    [tool(os, osUser, 'git', ['status', '--short'])],
    start + 2_000,
  );
  const target = `${workingDirectory}${separator}main.py`;
  const tmp = `${target}.tmp.${run.agent.pid}.9c1e4b7a2d3f`;
  run.agentFile(time + 400, { action: 'creation', path: tmp });
  run.agentFile(time + 403, { action: 'rename', path: target, originalPath: tmp, size: 151 });
  time = run.toolCall('python3 main.py', [tool(os, osUser, 'python3', ['main.py'])], time + 800);
  builder.finish(run, time + 1_500);
};

const USERS: Record<HostOs, (login: string) => OsUser> = {
  linux: () => cloudDefaultUser('plain'),
  macos: macUser,
  windows: windowsUser,
};

export const INSTALL_VARIANT_BUILDS = Object.fromEntries(
  INSTALL_VARIANT_SCENARIOS.map((name) => {
    const { install, os } = INSTALL_VARIANT_SHAPES[name];
    const build: ScenarioBuild = (builder) => sessionFor(builder, install, os, USERS[os]);
    return [name, build];
  }),
) as Record<InstallVariantScenario, ScenarioBuild>;
