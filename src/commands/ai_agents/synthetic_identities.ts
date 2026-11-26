import { faker } from '@faker-js/faker';
import {
  createClaudeAccount,
  createHostRuntime,
  type AgentHost,
  type ClaudeAccount,
  type HostOs,
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

const usedEmails = new Set<string>();
const usedHostIps = new Set<string>();

/** Starts a new run, so names and hosts are unique within one run but a seed still repeats them. */
export const resetSyntheticIdentities = (): void => {
  usedEmails.clear();
  usedHostIps.clear();
};

export const createPerson = (domain: string, organizationId: string): Person => {
  const first = faker.person
    .firstName()
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  const last = faker.person
    .lastName()
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  let suffix = '';
  for (let attempt = 2; usedEmails.has(`${first}.${last}${suffix}@${domain}`); attempt++) {
    suffix = String(attempt);
  }
  const email = `${first}.${last}${suffix}@${domain}`;
  usedEmails.add(email);
  return {
    email,
    login: `${first[0]}${last}`.slice(0, 10) + suffix,
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

export const rootUser = (): OsUser => ({
  name: 'root',
  id: 0,
  home: '/root',
  supplementalGroups: [],
  shellProfile: 'plain',
  nodeVersion: NODE_VERSION,
});

/** A system or container account such as `jenkins` or `node`, with no supplemental groups. */
export const serviceUser = (name: string, id: number, home: string): OsUser => ({
  name,
  id,
  home,
  supplementalGroups: [],
  shellProfile: 'plain',
  nodeVersion: NODE_VERSION,
});

export interface HostOptions {
  readonly os?: HostOs;
  /** A fixed host name, for hosts other lanes look up by name. */
  readonly name?: string;
}

/** macOS and Windows host names and IDs are inferred, since only Linux was observed. */
export const createHost = ({ os = 'linux', name }: HostOptions = {}): AgentHost => {
  let octets: number[];
  do {
    octets = [1, 2, 3].map(() => faker.number.int({ min: 1, max: 254 }));
  } while (usedHostIps.has(octets.join('.')));
  usedHostIps.add(octets.join('.'));
  const id =
    os === 'linux'
      ? faker.string.hexadecimal({ length: 32, casing: 'lower', prefix: '' })
      : faker.string.uuid();
  const defaultName =
    os === 'linux'
      ? `ip-10-${octets.join('-')}.ec2.internal`
      : os === 'macos'
        ? `mac-${faker.string.alphanumeric({ length: 8, casing: 'lower' })}`
        : `DESKTOP-${faker.string.alphanumeric({ length: 7, casing: 'upper' })}`;
  return {
    id,
    name: name ?? defaultName,
    ip: `10.${octets.join('.')}`,
    resolverIp: `10.${octets[0]}.0.2`,
    elasticAgentId: faker.string.uuid(),
    os,
  };
};

/** Linux hosts get Defend's session data when it's on. macOS and Windows Defend have none. */
export const createRuntime = (
  start: number,
  sessionData: boolean,
  options: HostOptions = {},
): HostRuntime =>
  createHostRuntime({
    host: createHost(options),
    bootTime: start - 3_600_000,
    sessionData: sessionData && (options.os ?? 'linux') === 'linux',
  });

export const macUser = (login: string): OsUser => ({
  name: login,
  id: 501,
  home: `/Users/${login}`,
  supplementalGroups: [],
  shellProfile: 'plain',
  nodeVersion: NODE_VERSION,
});

export const windowsUser = (login: string): OsUser => ({
  name: login,
  id: 1001,
  home: `C:\\Users\\${login}`,
  supplementalGroups: [],
  shellProfile: 'plain',
  nodeVersion: NODE_VERSION,
});

/** The storyline's two people, fixed so other lanes can find them. Names are made up. */
export const STORYLINE_PEOPLE = {
  departing: {
    firstName: 'Avery',
    lastName: 'Quinn',
    login: 'aquinn',
    department: 'Platform Engineering',
    title: 'Release Engineer',
  },
  privileged: {
    firstName: 'Jordan',
    lastName: 'Blake',
    login: 'jblake',
    department: 'Platform Engineering',
    title: 'Platform Administrator',
  },
} as const;

/** A person with a fixed name, for the storyline. */
export const createNamedPerson = (
  { firstName, lastName, login }: { firstName: string; lastName: string; login: string },
  domain: string,
  organizationId: string,
): Person => {
  const email = `${firstName}.${lastName}@${domain}`.toLowerCase();
  usedEmails.add(email);
  return { email, login, account: createClaudeAccount(email, organizationId) };
};

export const sshClientIp = (): string => `203.0.113.${faker.number.int({ min: 2, max: 250 })}`;
