/**
 * GitHub Integration
 * Generates audit log documents for the github.audit data stream
 */

import { BaseIntegration, IntegrationDocument, DataStreamConfig } from './base_integration';
import { Organization, CorrelationMap, Employee, GitHubRepo } from '../types';
import { faker } from '@faker-js/faker';
import {
  GITHUB_AUDIT_ACTIONS,
  GITHUB_TRANSPORT_PROTOCOLS,
  DEPT_ACTION_WEIGHTS,
  BRANCH_NAMES,
} from '../data/github_data';

/**
 * GitHub Integration
 */
export class GitHubIntegration extends BaseIntegration {
  readonly packageName = 'github';
  readonly displayName = 'GitHub';

  readonly dataStreams: DataStreamConfig[] = [
    { name: 'audit', index: 'logs-github.audit-default' },
  ];

  generateDocuments(
    org: Organization,
    _correlationMap: CorrelationMap
  ): Map<string, IntegrationDocument[]> {
    const documentsMap = new Map<string, IntegrationDocument[]>();
    const auditDocs: IntegrationDocument[] = [];

    // Only employees with GitHub access generate events
    const githubEmployees = org.employees.filter((e) => e.githubUsername);
    const eventsPerEmployee = this.getEventsPerEmployee(org.size);

    for (const employee of githubEmployees) {
      const eventCount = faker.number.int({
        min: eventsPerEmployee.min,
        max:
          employee.department === 'Product & Engineering'
            ? eventsPerEmployee.max
            : Math.ceil(eventsPerEmployee.max / 3),
      });

      for (let i = 0; i < eventCount; i++) {
        auditDocs.push(this.generateAuditDocument(employee, org));
      }
    }

    documentsMap.set('logs-github.audit-default', auditDocs);
    return documentsMap;
  }

  private generateAuditDocument(employee: Employee, org: Organization): IntegrationDocument {
    const action = this.pickAction(employee.department);
    const _actionConfig = GITHUB_AUDIT_ACTIONS[action] || {
      category: ['configuration'],
      type: ['info'],
    };
    const repo = faker.helpers.arrayElement(org.githubOrg.repos);
    const sourceIp = faker.internet.ipv4();
    const timestamp = this.getRandomTimestamp(72);
    const category = action.split('.')[0]; // e.g., 'git', 'repo', 'org', 'team'

    const rawEvent = {
      '@timestamp': new Date(timestamp).getTime(),
      _document_id: faker.string.alphanumeric(22),
      action,
      actor: employee.githubUsername,
      actor_id: faker.string.numeric(8),
      created_at: new Date(timestamp).getTime(),
      org: org.githubOrg.name,
      org_id: faker.string.numeric(8),
      repo: repo.fullName,
      repo_id: repo.id,
      visibility: repo.visibility,
      category,
      user_login: employee.githubUsername,
      user_id: faker.string.numeric(8),
      actor_ip: sourceIp,
      ...this.getActionSpecificFields(action, employee, repo, org),
    };

    return {
      '@timestamp': timestamp,
      message: JSON.stringify(rawEvent),
      data_stream: { namespace: 'default', type: 'logs', dataset: 'github.audit' },
      tags: ['forwarded', 'github-audit', 'preserve_original_event'],
    } as IntegrationDocument;
  }

  private pickAction(department: string): string {
    const weights = DEPT_ACTION_WEIGHTS[department];
    if (!weights) {
      // Fallback to general action weights
      const actions = Object.entries(GITHUB_AUDIT_ACTIONS);
      const totalWeight = actions.reduce((sum, [, config]) => sum + config.weight, 0);
      let random = faker.number.float({ min: 0, max: totalWeight });
      for (const [action, config] of actions) {
        random -= config.weight;
        if (random <= 0) return action;
      }
      return actions[0][0];
    }

    const entries = Object.entries(weights);
    const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
    let random = faker.number.float({ min: 0, max: totalWeight });
    for (const [action, weight] of entries) {
      random -= weight;
      if (random <= 0) return action;
    }
    return entries[0][0];
  }

  private getActionSpecificFields(
    action: string,
    _employee: Employee,
    repo: GitHubRepo,
    _org: Organization
  ): Record<string, unknown> {
    switch (action) {
      case 'git.clone':
      case 'git.fetch': {
        const protocol = faker.helpers.arrayElement(GITHUB_TRANSPORT_PROTOCOLS);
        return {
          transport_protocol: protocol.id,
          transport_protocol_name: protocol.name,
        };
      }
      case 'git.push':
        return {
          transport_protocol: 2,
          transport_protocol_name: 'ssh',
          source_branch: faker.helpers.arrayElement(BRANCH_NAMES),
        };
      case 'pull_request.create':
      case 'pull_request.merge':
      case 'pull_request.close':
        return {
          pull_request_id: faker.string.numeric(4),
          pull_request_title: faker.git.commitMessage(),
          pull_request_url: `https://github.com/${repo.fullName}/pull/${faker.string.numeric(3)}`,
          source_branch: faker.helpers.arrayElement(BRANCH_NAMES.filter((b) => b !== 'main')),
          target_branch: 'main',
        };
      case 'org.add_member':
      case 'org.remove_member':
        return {
          user_id: faker.string.numeric(8),
          new_role: 'member',
        };
      case 'team.add_member':
      case 'team.remove_member':
        return {
          team: faker.helpers.arrayElement(['backend', 'frontend', 'platform', 'devops']),
          user_id: faker.string.numeric(8),
        };
      case 'protected_branch.update':
      case 'protected_branch.create':
        return {
          source_branch: 'main',
        };
      case 'workflows.completed_workflow_run':
        return {
          workflow_id: faker.string.numeric(7),
          workflow_run_id: faker.string.numeric(10),
        };
      default:
        return {};
    }
  }

  private getEventsPerEmployee(size: string): { min: number; max: number } {
    switch (size) {
      case 'small':
        return { min: 2, max: 8 };
      case 'medium':
        return { min: 2, max: 8 };
      case 'enterprise':
        return { min: 2, max: 8 };
      default:
        return { min: 2, max: 8 };
    }
  }
}
