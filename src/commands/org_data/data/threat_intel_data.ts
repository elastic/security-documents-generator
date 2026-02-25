/**
 * Threat intelligence data for TI feed integrations
 * Contains sample IOCs that can cross-correlate with other integration data
 */

/**
 * Malware families and their metadata
 */
export const MALWARE_FAMILIES = [
  { name: 'Emotet', tags: ['banking-trojan', 'loader', 'spam'], reporter: 'abuse.ch' },
  { name: 'TrickBot', tags: ['banking-trojan', 'botnet'], reporter: 'abuse.ch' },
  { name: 'QakBot', tags: ['banking-trojan', 'loader'], reporter: 'abuse.ch' },
  { name: 'IcedID', tags: ['banking-trojan', 'loader'], reporter: 'abuse.ch' },
  { name: 'AgentTesla', tags: ['infostealer', 'rat'], reporter: 'abuse.ch' },
  { name: 'RedLine', tags: ['infostealer'], reporter: 'abuse.ch' },
  { name: 'AsyncRAT', tags: ['rat', 'backdoor'], reporter: 'abuse.ch' },
  { name: 'Cobalt Strike', tags: ['pentest-tool', 'c2', 'apt'], reporter: 'abuse.ch' },
  { name: 'Raccoon', tags: ['infostealer', 'maas'], reporter: 'abuse.ch' },
  { name: 'FormBook', tags: ['infostealer', 'keylogger'], reporter: 'abuse.ch' },
  { name: 'LockBit', tags: ['ransomware'], reporter: 'abuse.ch' },
  { name: 'BlackCat', tags: ['ransomware', 'raas'], reporter: 'abuse.ch' },
];

/**
 * Sample SHA256 hashes (fake but realistic format)
 * These are generated to be deterministic so CrowdStrike alerts can reference them
 */
export const MALWARE_HASHES = [
  'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
  'b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3',
  'c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4',
  'd4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5',
  'e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6',
  'f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7',
  'a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8',
  'b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9',
  'c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0',
  'd0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1',
];

/**
 * Malicious URLs for TI feed
 * Some deliberately overlap with Zscaler/Cloudflare blocked URLs
 */
export const MALICIOUS_URLS = [
  'http://malware-download.evil.com/payload.exe',
  'http://phishing-site.fake-bank.com/login.html',
  'https://cryptominer.suspicious.net/miner.js',
  'http://c2-server.darkweb.org/beacon',
  'http://fake-update.malware.com/chrome-update.exe',
  'https://185.220.101.1/api/exfil',
  'http://45.33.32.156/botnet/command',
  'https://data-harvest.phishing.com/office365/login',
  'http://ransomware-c2.onion.ws/key',
  'https://exploit-kit.shady-cdn.com/landing',
  'http://198.51.100.23/malware/dropper.dll',
  'https://free-vpn.suspicious.io/install',
  'http://91.121.87.10/cobalt-strike/beacon.bin',
  'https://credential-stealer.fake-adobe.com/update',
  'http://167.71.13.196/rat/agent',
];

/**
 * Malicious IP indicators
 * Overlap with ATTACKER_IPS in network_data.ts for cross-correlation
 */
export const MALICIOUS_IPS = [
  '45.33.32.156',
  '185.220.101.1',
  '198.51.100.23',
  '203.0.113.50',
  '91.121.87.10',
  '178.128.200.45',
  '104.248.51.200',
  '159.89.161.100',
  '167.71.13.196',
  '142.93.120.50',
  '103.224.182.252',
  '94.102.49.190',
  '62.210.105.116',
  '185.56.83.83',
  '212.83.129.123',
];

/**
 * TI indicator confidence levels
 */
export const TI_CONFIDENCE_LEVELS = [
  { level: 'High', weight: 30 },
  { level: 'Medium', weight: 50 },
  { level: 'Low', weight: 20 },
];

/**
 * AbuseCH malware types
 */
export const ABUSECH_MALWARE_TYPES = [
  'exe',
  'dll',
  'doc',
  'xls',
  'js',
  'vbs',
  'ps1',
  'jar',
  'elf',
  'apk',
];

/**
 * AbuseCH URL statuses
 */
export const _ABUSECH_URL_STATUSES = ['online', 'offline', 'unknown'];

/**
 * AbuseCH threat types
 */
export const ABUSECH_THREAT_TYPES = [
  'malware_download',
  'phishing',
  'c2',
  'exploit_kit',
  'cryptominer',
  'ransomware',
];
