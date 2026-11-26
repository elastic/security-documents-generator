import {
  createProcessNode,
  type EndpointWriter,
  type ProcessImage,
  type ProcessNode,
} from './endpoint_events.ts';
import { type OsUser } from './types.ts';

export interface CommandSpec {
  readonly image: ProcessImage;
  readonly exitCode?: number;
  /** Runs in a `$(...)` subshell that execs it in place, so Defend lists the shell image in `process.previous`. */
  readonly inSubshell?: boolean;
}

export const bin = (name: string, args: readonly string[], dir = '/usr/bin'): ProcessImage => ({
  name,
  executable: `${dir}/${name}`,
  args,
});

/** Emits one short-lived child as a single `fork,exec,end` event, as Defend reports them. */
export const runShortLived = (
  writer: EndpointWriter,
  parent: ProcessNode,
  { image, exitCode = 0, inSubshell = false }: CommandSpec,
  at: number,
): ProcessNode => {
  const node = createProcessNode({
    runtime: writer.runtime,
    parent,
    image,
    start: at,
    role: parent.role === undefined ? undefined : 'descendant',
  });
  if (inSubshell) {
    node.previous = [parent.image];
  }
  writer.processEvent(node, ['fork', 'exec', 'end'], at, { exitCode });
  return node;
};

export const forkSubshell = (
  writer: EndpointWriter,
  shell: ProcessNode,
  at: number,
): ProcessNode => {
  const subshell = createProcessNode({
    runtime: writer.runtime,
    parent: shell,
    image: shell.image,
    start: at,
    role: shell.role === undefined ? undefined : 'descendant',
  });
  writer.processEvent(subshell, ['fork', 'end'], at);
  return subshell;
};

/** Amazon Linux 2023 `/etc/profile.d` work done by every login shell. */
export const amazonLinuxProfile = (shellPid: number): CommandSpec[] => [
  { image: bin('id', ['/usr/bin/id', '-un']) },
  { image: bin('hostnamectl', ['/usr/bin/hostnamectl', '--transient']), inSubshell: true },
  { image: { ...bin('bash', ['/usr/bin/sh', '/usr/libexec/grepconf.sh', '-c']) } },
  {
    image: bin('grep', ['grep', '-qsi', '^COLOR.*none', '/etc/GREP_COLORS']),
    exitCode: 1,
    inSubshell: true,
  },
  { image: bin('bash', ['/usr/bin/sh', '/usr/libexec/grepconf.sh', '-c']) },
  {
    image: bin('grep', ['grep', '-qsi', '^COLOR.*none', '/etc/GREP_COLORS']),
    exitCode: 1,
    inSubshell: true,
  },
  { image: bin('bash', ['/usr/bin/sh', '/usr/libexec/grepconf.sh', '-c']) },
  {
    image: bin('grep', ['grep', '-qsi', '^COLOR.*none', '/etc/GREP_COLORS']),
    exitCode: 1,
    inSubshell: true,
  },
  {
    image: bin('cat', ['cat', '/dev/null', '/etc/debuginfod/*.urls']),
    exitCode: 1,
    inSubshell: true,
  },
  { image: bin('tr', ['tr', '\\n', ' ']), inSubshell: true },
  { image: bin('locale', ['/usr/bin/locale']), inSubshell: true },
  {
    image: bin('sed', [
      '/usr/bin/sed',
      '-r',
      '-e',
      's/^[[:blank:]]*([[:upper:]_]+)=([[:print:][:digit:]\\._-]+|"[[:print:][:digit:]\\._-]+")/export \\1=\\2/;t;d',
      '/etc/locale.conf',
    ]),
  },
  { image: bin('cat', ['cat', `/proc/${shellPid}/comm`]) },
];

const NVM_VERSION_COMPARE =
  'BEGIN {\n    if (ARGV[1] == "" || ARGV[2] == "") exit(1)\n    split(ARGV[1], a, /\\./);\n    split(ARGV[2], b, /\\./);\n    for (i=1; i<=3; i++) {\n      if (a[i] && a[i] !~ /^[0-9]+$/) exit(2);\n      if (b[i] && b[i] !~ /^[0-9]+$/) { exit(0); }\n      if (a[i] < b[i]) exit(3);\n      else if (a[i] > b[i]) exit(0);\n    }\n    exit(4)\n  }';

const dirnameWalk = (path: string): CommandSpec[] => {
  const steps: CommandSpec[] = [];
  let current = path;
  while (current !== '/' && current.length > 0) {
    steps.push({ image: bin('dirname', ['dirname', current]), inSubshell: steps.length === 0 });
    current = current.slice(0, current.lastIndexOf('/')) || '/';
  }
  return steps;
};

/** One sourcing of `nvm.sh` by a login shell: resolve node, compare versions and fix PATH and MANPATH. */
const nvmSourcing = (user: OsUser): CommandSpec[] => {
  const nvm = `${user.home}/.nvm`;
  const nodeBin = `${nvm}/versions/node/v${user.nodeVersion}/bin/node`;
  const versionPipeline: CommandSpec[] = [
    { image: bin('tr', ['tr', '[:upper:]', '[:lower:]']), inSubshell: true },
    { image: bin('head', ['head', '-n', '1']), inSubshell: true },
    { image: bin('tail', ['tail', '-n', '1']), inSubshell: true },
  ];
  return [
    { image: bin('which', ['which', 'node']), inSubshell: true },
    ...dirnameWalk(nodeBin),
    ...dirnameWalk(nodeBin).slice(0, 5),
    {
      image: { name: 'node', executable: nodeBin, args: ['node', '--version'] },
      inSubshell: true,
    },
    { image: bin('tr', ['tr', 't', '\\t']), inSubshell: true },
    { image: bin('tail', ['tail', '-1']), inSubshell: true },
    ...versionPipeline,
    ...versionPipeline,
    { image: bin('sed', ['sed', '-e', 's/^\\([0-9]\\)/v\\1/g']), inSubshell: true },
    { image: bin('sed', ['sed', '-e', 's/[^\\.]//g']), inSubshell: true },
    { image: bin('uname', ['uname', '-a']), inSubshell: true },
    {
      image: bin('gawk', ['awk', NVM_VERSION_COMPARE, '0.12.0', user.nodeVersion]),
      exitCode: 3,
      inSubshell: true,
    },
    { image: bin('tail', ['tail', '-1']), inSubshell: true },
    ...versionPipeline,
    ...versionPipeline,
    { image: bin('sed', ['sed', '-e', 's/^\\([0-9]\\)/v\\1/g']), inSubshell: true },
    { image: bin('sed', ['sed', '-e', 's/[^\\.]//g']), inSubshell: true },
    { image: bin('uname', ['uname', '-a']), inSubshell: true },
    {
      image: bin('gawk', ['awk', NVM_VERSION_COMPARE, '0.12.0', user.nodeVersion]),
      exitCode: 3,
      inSubshell: true,
    },
    { image: bin('uname', ['uname', '-a']), inSubshell: true },
    {
      image: bin('gawk', ['awk', NVM_VERSION_COMPARE, '0.12.0', user.nodeVersion]),
      exitCode: 3,
      inSubshell: true,
    },
    {
      image: bin('gawk', ['awk', NVM_VERSION_COMPARE, '0.12.0', user.nodeVersion]),
      exitCode: 3,
      inSubshell: true,
    },
    ...pathFixups(nvm, user.nodeVersion, 'bin'),
    { image: bin('manpath', ['manpath']) },
    ...pathFixups(nvm, user.nodeVersion, 'share/man'),
    { image: bin('uname', ['uname', '-a']), inSubshell: true },
    {
      image: bin('gawk', [
        'awk',
        'BEGIN { for (name in ENVIRON) if (toupper(name) == "NPM_CONFIG_PREFIX") { print name; break } }',
      ]),
    },
  ];
};

const pathFixups = (nvm: string, nodeVersion: string, suffix: string): CommandSpec[] => {
  const listVar = suffix === 'bin' ? '/bin' : '/share/man';
  return [
    { image: bin('grep', ['grep', '-q', `${nvm}/[^/]*/${suffix}`]), exitCode: 1, inSubshell: true },
    {
      image: bin('grep', ['grep', '-q', `${nvm}/versions/[^/]*/[^/]*/${suffix}`]),
      inSubshell: true,
    },
    {
      image: bin('grep', [
        'grep',
        '-Eq',
        `(^|:)(/usr(/local)?)?${listVar}:.*${nvm}/[^/]*/${suffix}`,
      ]),
      exitCode: 1,
      inSubshell: true,
    },
    {
      image: bin('grep', [
        'grep',
        '-Eq',
        `(^|:)(/usr(/local)?)?${listVar}:.*${nvm}/versions/[^/]*/[^/]*/${suffix}`,
      ]),
      exitCode: 1,
      inSubshell: true,
    },
    {
      image: bin('sed', [
        'sed',
        '-e',
        `s#${nvm}/[^/]*/${suffix}[^:]*#${nvm}/versions/node/v${nodeVersion}/${suffix}#`,
        '-e',
        `s#${nvm}/versions/[^/]*/[^/]*/${suffix}[^:]*#${nvm}/versions/node/v${nodeVersion}/${suffix}#`,
      ]),
      inSubshell: true,
    },
  ];
};

/** The children a login shell starts for this user: the OS profile, then `nvm.sh` twice when installed. */
export const loginShellChildren = (user: OsUser, shellPid: number): CommandSpec[] => [
  ...amazonLinuxProfile(shellPid),
  ...(user.shellProfile === 'nvm' ? [...nvmSourcing(user), ...nvmSourcing(user)] : []),
];

/**
 * Emits a login shell's children and `subshellCount` subshells that run only builtins, which
 * Defend reports as `fork,end`. Returns the time after the last child.
 */
export const emitLoginShellChildren = (
  writer: EndpointWriter,
  shell: ProcessNode,
  user: OsUser,
  at: number,
  subshellCount: number,
): number => {
  const children = loginShellChildren(user, shell.pid);
  const perChild = Math.floor(subshellCount / children.length);
  let remainder = subshellCount - perChild * children.length;
  let time = at;
  children.forEach((child, index) => {
    runShortLived(writer, shell, child, time);
    const subshells = perChild + (remainder > 0 ? 1 : 0);
    remainder = Math.max(0, remainder - 1);
    for (let subshell = 0; subshell < subshells; subshell++) {
      forkSubshell(writer, shell, time + 1);
    }
    time += index % 6 === 0 ? 10 : 2;
  });
  return time;
};
