import { range } from 'lodash-es';
import { getRandomValues } from './utils';

const osNames = [
  'Windows Server 2019',
  'Windows Server 2016',
  'Windows 10 Pro',
  'Windows 11 Pro',
  'Windows Server 2022',
  'Windows 10 Enterprise',
];

const serviceNames = [
  'WindowsUpdateService',
  'RemoteRegistry',
  'SuspiciousBackdoorService',
  'CustomMonitoringAgent',
  'PrintSpooler',
  'RareCustomService',
  'WindowsDefender',
  'UnusualPersistenceService',
  'BitLocker',
];

const imagePaths = [
  'C:\\Windows\\System32\\wuauserv.dll',
  'C:\\Windows\\System32\\regsvc.dll',
  'C:\\Temp\\malicious.exe',
  'C:\\Program Files\\Monitoring\\agent.exe',
  'C:\\Windows\\System32\\spoolsv.exe',
  'C:\\CustomApps\\service.exe',
  'C:\\Program Files\\Windows Defender\\MsMpEng.exe',
  'C:\\Windows\\Temp\\hidden.exe',
  'C:\\Windows\\System32\\bdesvc.dll',
];

const serviceTypes = ['0x10', '0x20', '0x110'];
const startTypes = ['2', '3'];
const accountNames = ['LocalSystem', 'LocalService', 'NetworkService'];

const userNames = ['SYSTEM', 'Administrator', 'user1', 'user2', 'user3'];
const userDomains = ['NT AUTHORITY', 'WORKGROUP', 'CONTOSO'];
export const generateSourceData = (): Array<Record<string, unknown>> => {
  return range(100).map((val) => {
    const osName = getRandomValues(osNames, 1)[0];
    const serviceName = getRandomValues(serviceNames, 1)[0];
    const imagePath = getRandomValues(imagePaths, 1)[0];
    const serviceType = getRandomValues(serviceTypes, 1)[0];
    const startType = getRandomValues(startTypes, 1)[0];
    const accountName = getRandomValues(accountNames, 1)[0];
    const userName = getRandomValues(userNames, 1)[0];
    const userDomain = getRandomValues(userDomains, 1)[0];
    return {
      '@timestamp': new Date().toISOString(),
      event: {
        code: '7045',
        category: 'configuration',
        type: 'creation',
        action: 'service-installed',
      },
      host: {
        name: `windows-server-${val}`,
        hostname: `windows-server-${val}`,
        os: {
          family: 'windows',
          type: 'windows',
          platform: 'windows',
          name: osName,
          version: '10.0',
        },
      },
      process: {
        name: 'services.exe',
        pid: Math.ceil(Math.random() * 9999),
      },
      winlog: {
        channel: 'System',
        event_id: `${Math.ceil(Math.random() * 7000)}`,
        event_data: {
          ServiceName: serviceName,
          ImagePath: imagePath,
          ServiceType: serviceType,
          StartType: startType,
          AccountName: accountName,
        },
      },
      agent: { type: 'winlogbeat', version: '8.0.0' },
      user: { name: userName, domain: userDomain },
    };
  });
};
