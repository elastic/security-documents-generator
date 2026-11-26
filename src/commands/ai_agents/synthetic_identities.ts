import { faker } from '@faker-js/faker';
import {
  createClaudeAccount,
  createHostRuntime,
  type AgentHost,
  type ClaudeAccount,
  type HostRuntime,
  type OsUser,
  type ShellProfile,
} from '../../generators/ai_agents/index.ts';

const NODE_VERSION = '26.13.0';

/** The supplemental groups of Amazon Linux's default `ec2-user` account. */
const CLOUD_DEFAULT_GROUPS = [
  { name: 'adm', id: 4 },
  { name: 'wheel', id: 10 },
  { name: 'systemd-journal', id: 190 },
  { name: 'docker', id: 994 },
];

export interface Person {
  readonly email: string;
  /** Short login derived from the name, which never equals the email's local part. */
  readonly login: string;
  readonly account: ClaudeAccount;
}

export const createPerson = (domain: string, organizationId: string): Person => {
  const first = faker.person
    .firstName()
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  const last = faker.person
    .lastName()
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  const email = `${first}.${last}@${domain}`;
  return {
    email,
    login: `${first[0]}${last}`.slice(0, 12),
    account: createClaudeAccount(email, organizationId),
  };
};

export const cloudDefaultUser = (profile: ShellProfile = 'nvm'): OsUser => ({
  name: 'ec2-user',
  id: 1000,
  home: '/home/ec2-user',
  supplementalGroups: CLOUD_DEFAULT_GROUPS,
  shellProfile: profile,
  nodeVersion: NODE_VERSION,
});

export const personalUser = (login: string, id: number, profile: ShellProfile): OsUser => ({
  name: login,
  id,
  home: `/home/${login}`,
  supplementalGroups: [],
  shellProfile: profile,
  nodeVersion: NODE_VERSION,
});

export const createHost = (): AgentHost => {
  const octets = [faker.number.int({ min: 1, max: 254 }), faker.number.int({ min: 1, max: 254 })];
  return {
    id: faker.string.hexadecimal({ length: 32, casing: 'lower', prefix: '' }),
    name: `ip-10-20-${octets[0]}-${octets[1]}.ec2.internal`,
    ip: `10.20.${octets[0]}.${octets[1]}`,
    resolverIp: '10.20.0.2',
    elasticAgentId: faker.string.uuid(),
  };
};

export const createRuntime = (start: number, sessionData: boolean): HostRuntime =>
  createHostRuntime({ host: createHost(), bootTime: start - 3_600_000, sessionData });

export const sshClientIp = (): string => `203.0.113.${faker.number.int({ min: 2, max: 250 })}`;
