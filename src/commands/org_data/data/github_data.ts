/**
 * GitHub-related static data for realistic event generation
 */

/**
 * GitHub audit log action categories and their events
 */
export const GITHUB_AUDIT_ACTIONS: Record<
  string,
  { weight: number; category: string[]; type: string[] }
> = {
  'git.clone': { weight: 30, category: ['configuration'], type: ['access'] },
  'git.push': { weight: 25, category: ['configuration'], type: ['change'] },
  'git.fetch': { weight: 15, category: ['configuration'], type: ['access'] },
  'repo.create': { weight: 2, category: ['configuration'], type: ['creation'] },
  'repo.destroy': { weight: 1, category: ['configuration'], type: ['deletion'] },
  'repo.archived': { weight: 1, category: ['configuration'], type: ['change'] },
  'org.add_member': { weight: 2, category: ['configuration'], type: ['change'] },
  'org.remove_member': { weight: 1, category: ['configuration'], type: ['deletion'] },
  'team.add_member': { weight: 3, category: ['configuration'], type: ['change'] },
  'team.remove_member': { weight: 1, category: ['configuration'], type: ['deletion'] },
  'protected_branch.update': { weight: 2, category: ['configuration'], type: ['change'] },
  'protected_branch.create': { weight: 1, category: ['configuration'], type: ['creation'] },
  'repo.access': { weight: 5, category: ['configuration'], type: ['access'] },
  'pull_request.create': { weight: 8, category: ['configuration'], type: ['creation'] },
  'pull_request.merge': { weight: 6, category: ['configuration'], type: ['change'] },
  'pull_request.close': { weight: 2, category: ['configuration'], type: ['change'] },
  'repo.add_topic': { weight: 1, category: ['configuration'], type: ['change'] },
  'hook.create': { weight: 1, category: ['configuration'], type: ['creation'] },
  'repo.update_actions_secret': { weight: 1, category: ['configuration'], type: ['change'] },
  'workflows.completed_workflow_run': { weight: 5, category: ['configuration'], type: ['info'] },
};

/**
 * GitHub transport protocols
 */
export const GITHUB_TRANSPORT_PROTOCOLS: Array<{ id: number; name: string }> = [
  { id: 1, name: 'http' },
  { id: 2, name: 'ssh' },
];

/**
 * GitHub team names by department
 */
export const GITHUB_TEAMS: Record<string, string[]> = {
  'Product & Engineering': [
    'backend',
    'frontend',
    'platform',
    'mobile',
    'devops',
    'security',
    'data',
  ],
  Executive: ['leadership'],
};

/**
 * Common branch names
 */
export const BRANCH_NAMES = [
  'main',
  'develop',
  'staging',
  'feature/auth-improvements',
  'feature/new-dashboard',
  'feature/api-v2',
  'fix/login-bug',
  'fix/memory-leak',
  'chore/dependency-updates',
  'release/v2.1.0',
  'release/v2.2.0',
  'hotfix/security-patch',
];

/**
 * Department-based action weights (which departments do which actions more)
 */
export const DEPT_ACTION_WEIGHTS: Record<string, Record<string, number>> = {
  'Product & Engineering': {
    'git.push': 40,
    'git.clone': 20,
    'git.fetch': 15,
    'pull_request.create': 10,
    'pull_request.merge': 8,
    'workflows.completed_workflow_run': 5,
    'protected_branch.update': 2,
  },
  Executive: {
    'repo.access': 50,
    'git.clone': 30,
    'org.add_member': 10,
    'org.remove_member': 10,
  },
};
