import { type OsUser } from '../../generators/ai_agents/index.ts';

export const CLAUDE_MODEL_NAME = 'Sonnet 5.5';
export const DEMO_REPO = 'demo-app';

export const repoPath = (user: OsUser): string => `${user.home}/src/${DEMO_REPO}`;

export const printArgs = (allowedTools: readonly string[]): string[] => [
  '--allowedTools',
  ...allowedTools,
  '--output-format',
  'json',
];
