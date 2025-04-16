import {
  GeneratorEntry,
  GeneratorDoc,
  GeneratorFn,
  TimeWindow,
} from '../../types';
import { faker } from '@faker-js/faker';
import { createTimestampInWindow } from '../../utils';

function generateMockRegistryEvents({
  matchingCount,
  noiseCount,
  agentCount,
  timeWindow,
}: {
  matchingCount: number;
  noiseCount: number;
  agentCount: number;
  timeWindow: { minTimestamp: string; maxTimestamp: string };
}): GeneratorDoc[] {
  const events: GeneratorDoc[] = [];

  // Generate matching events
  events.push(
    ...generateMatchingEvents({ matchingCount, agentCount, timeWindow }),
  );
  // Generate noise events
  events.push(...generateNoiseEvents({ noiseCount, agentCount, timeWindow }));

  return events;
}

function generateMatchingEvents({
  matchingCount,
  agentCount,
  timeWindow,
}: {
  matchingCount: number;
  agentCount: number;
  timeWindow: TimeWindow;
}): GeneratorDoc[] {
  const events: GeneratorDoc[] = [];
  const lolbins = [
    'users\\public\\malicious.exe',
    '\\appdata\\roaming\\evil.exe',
    'programdata\\backdoor.exe',
    'powershell.exe -enc BASE64PAYLOAD',
    'rundll32.exe suspicious.dll',
    'regsvr32.exe /s malicious.dll',
    'mshta.exe javascript:code',
    'cscript.exe //B badscript.vbs',
    'wscript.exe malicious.js',
    'cmd.exe /c suspicious_command',
    'forfiles /p c:\\windows\\system32 /m notepad.exe /c evil.exe',
    'msiexec.exe /quiet /i malware.msi',
    'wmic.exe process call create "cmd.exe /c evil.bat"',
    'msbuild.exe malicious.xml',
    'http://malicious-domain.com/payload',
    'cmstp.exe /s badconfig.inf',
    'msxsl.exe xml xsl payload',
    'ie4uinit.exe -BaseSettings',
  ];

  // Registry paths template for matching events
  const registryPathTemplate =
    'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Schedule\\TaskCache\\Tasks\\{taskId}\\Actions';

  // Generate random agent IDs
  const agentIds: string[] = [];
  for (let i = 0; i < agentCount; i++) {
    agentIds.push(`agent-${faker.string.alphanumeric(8)}`);
  }

  // Create matching events
  for (let i = 0; i < matchingCount; i++) {
    const taskId = `{${faker.string.uuid()}}`;
    const lolbin = lolbins[Math.floor(Math.random() * lolbins.length)];

    // Create a string with the lolbin command, but avoid "localsystem" prefix
    const actionContent = `"Command":"${lolbin}","Arguments":"${faker.system.fileName()}","WorkingDirectory":"C:\\${faker.system.directoryPath()}"`;

    // Base64 encode with null bytes to simulate Windows registry binary data
    const base64Data = Buffer.from(
      actionContent.split('').join('\u0000'),
    ).toString('base64');

    events.push({
      index: `logs-endpoint.events.registry-default`,
      source: {
        '@timestamp': createTimestampInWindow(timeWindow),
        host: {
          os: {
            type: 'windows',
          },
        },
        event: {
          category: 'registry',
          action: 'modification',
        },
        registry: {
          path: registryPathTemplate.replace('{taskId}', taskId),
          data: {
            bytes: base64Data,
          },
        },
        agent: {
          id: agentIds[Math.floor(Math.random() * agentIds.length)],
        },
      },
    });
  }

  return events;
}

function generateNoiseEvents({
  noiseCount,
  agentCount,
  timeWindow,
}: {
  noiseCount: number;
  agentCount: number;
  timeWindow: TimeWindow;
}): GeneratorDoc[] {
  const events: GeneratorDoc[] = [];

  // Generate random agent IDs
  const agentIds: string[] = [];
  for (let i = 0; i < agentCount; i++) {
    agentIds.push(`agent-${faker.string.alphanumeric(8)}`);
  }

  // Create noise events - only "safe command" events that won't match the regex
  for (let i = 0; i < noiseCount; i++) {
    const taskId = `{${faker.string.uuid()}}`;

    // Safe commands that won't match the suspicious pattern regex
    const safeCommands = [
      'explorer.exe',
      'notepad.exe',
      'calc.exe',
      'msedge.exe',
      'winword.exe',
      'excel.exe',
      'svchost.exe',
      'services.exe',
      'lsass.exe',
      'spoolsv.exe',
      'taskhostw.exe',
      'csrss.exe',
      'dwm.exe',
      'SearchApp.exe',
      'Widgets.exe',
    ];

    const command =
      safeCommands[Math.floor(Math.random() * safeCommands.length)];
    const args = faker.system.fileName();
    const actionContent = `"Command":"${command}","Arguments":"${args}","WorkingDirectory":"C:\\${faker.system.directoryPath()}"`;
    const base64Data = Buffer.from(
      actionContent.split('').join('\u0000'),
    ).toString('base64');

    events.push({
      index: `logs-endpoint.events.registry-default`,
      source: {
        '@timestamp': createTimestampInWindow(timeWindow),
        host: {
          os: {
            type: 'windows', // Same OS type
          },
        },
        event: {
          category: 'registry', // Same event category
          action: 'modification', // Same action
        },
        registry: {
          path: `HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Schedule\\TaskCache\\Tasks\\${taskId}\\Actions`, // Same path pattern
          data: {
            bytes: base64Data, // Different: safe command that won't match regex
          },
        },
        agent: {
          id: agentIds[Math.floor(Math.random() * agentIds.length)],
        },
      },
    });
  }

  return events;
}

// Generate data with 50 matching events and 100 noise events
const generateTestData: GeneratorFn = async ({ timeWindow }) => {
  const matchingCount: number = 50;
  const noiseCount: number = 100;
  const agentCount: number = 10;
  return generateMockRegistryEvents({
    matchingCount,
    noiseCount,
    agentCount,
    timeWindow,
  });
};

export const scheduledTaskCreationByActionViaRegistry: GeneratorEntry = {
  id: 'scheduled_task_creation_by_action_via_registry',
  generate: generateTestData,
};
