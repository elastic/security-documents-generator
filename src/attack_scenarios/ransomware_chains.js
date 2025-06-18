/**
 * Ransomware Attack Chain Patterns
 *
 * This module defines sophisticated ransomware attack sequences that simulate
 * real-world ransomware campaigns including double-extortion and supply chain
 * compromise scenarios.
 */
// Ransomware Group Definitions
export const RANSOMWARE_GROUPS = {
    CONTI: {
        id: 'CONTI',
        name: 'Conti',
        aliases: ['Wizard Spider', 'TrickBot Gang'],
        ransom: {
            currency: 'bitcoin',
            typical_amount: {
                min: 100000,
                max: 25000000,
            },
        },
        encryption: {
            algorithm: 'Salsa20',
            file_extensions: ['.conti'],
            exclusions: ['Windows', 'ProgramData', 'Program Files'],
        },
        tactics: {
            double_extortion: true,
            supply_chain: false,
            lateral_movement: ['RDP', 'SMB', 'WMI'],
        },
    },
    LOCKBIT: {
        id: 'LOCKBIT',
        name: 'LockBit',
        aliases: ['LockBit 2.0', 'LockBit 3.0'],
        ransom: {
            currency: 'bitcoin',
            typical_amount: {
                min: 50000,
                max: 10000000,
            },
        },
        encryption: {
            algorithm: 'AES-256',
            file_extensions: ['.lockbit'],
            exclusions: ['Windows', 'System32', 'Boot'],
        },
        tactics: {
            double_extortion: true,
            supply_chain: true,
            lateral_movement: ['PowerShell', 'WinRM', 'SMB'],
        },
    },
    DARKSIDE: {
        id: 'DARKSIDE',
        name: 'DarkSide',
        aliases: ['Carbon Spider', 'UNC2465'],
        ransom: {
            currency: 'bitcoin',
            typical_amount: {
                min: 200000,
                max: 5000000,
            },
        },
        encryption: {
            algorithm: 'RSA-1024',
            file_extensions: ['.darkside'],
            exclusions: ['Windows', 'System32', 'ProgramData'],
        },
        tactics: {
            double_extortion: true,
            supply_chain: false,
            lateral_movement: ['RDP', 'Cobalt Strike', 'PowerShell'],
        },
    },
};
// Ransomware Chain Definitions
export const RANSOMWARE_CHAINS = {
    CONTI_ENTERPRISE: {
        id: 'CONTI_ENTERPRISE',
        name: 'Conti Enterprise Ransomware Campaign',
        description: 'Multi-stage enterprise ransomware attack with data exfiltration',
        group: RANSOMWARE_GROUPS.CONTI,
        sophistication: 'expert',
        target_profile: {
            industries: ['healthcare', 'manufacturing', 'government'],
            organization_sizes: ['large', 'enterprise'],
            geographic_focus: ['US', 'EU', 'CA'],
        },
        estimated_timeline: {
            min_days: 14,
            max_days: 90,
        },
        stages: [
            {
                name: 'initial_access',
                tactic: 'TA0001',
                techniques: ['T1566.001', 'T1190'],
                duration: { min: 1, max: 24 },
                objectives: [
                    'Establish initial foothold via phishing',
                    'Exploit public-facing applications',
                    'Deploy TrickBot loader',
                ],
                indicators: [
                    'suspicious_email_attachments',
                    'exploitation_attempts',
                    'trickbot_beacons',
                ],
                nextStages: ['persistence', 'discovery'],
            },
            {
                name: 'persistence',
                tactic: 'TA0003',
                techniques: ['T1053.005', 'T1547.001'],
                duration: { min: 1, max: 8 },
                objectives: [
                    'Create scheduled tasks',
                    'Modify registry run keys',
                    'Install persistent backdoors',
                ],
                indicators: [
                    'scheduled_task_creation',
                    'registry_modifications',
                    'backdoor_installation',
                ],
                nextStages: ['discovery', 'privilege_escalation'],
            },
            {
                name: 'discovery',
                tactic: 'TA0007',
                techniques: ['T1083', 'T1135', 'T1018'],
                duration: { min: 12, max: 72 },
                objectives: [
                    'Map network topology',
                    'Identify valuable data stores',
                    'Locate domain controllers',
                    'Find backup systems',
                ],
                indicators: [
                    'network_scanning_activity',
                    'share_enumeration',
                    'ad_reconnaissance',
                ],
                nextStages: ['credential_access', 'lateral_movement'],
            },
            {
                name: 'credential_access',
                tactic: 'TA0006',
                techniques: ['T1003.001', 'T1110.003'],
                duration: { min: 4, max: 48 },
                objectives: [
                    'Dump LSASS credentials',
                    'Perform password spraying',
                    'Extract cached credentials',
                ],
                indicators: [
                    'lsass_access_attempts',
                    'password_spray_patterns',
                    'credential_extraction_tools',
                ],
                nextStages: ['lateral_movement', 'collection'],
            },
            {
                name: 'lateral_movement',
                tactic: 'TA0008',
                techniques: ['T1021.001', 'T1021.002', 'T1047'],
                duration: { min: 24, max: 168 },
                objectives: [
                    'Move to critical systems',
                    'Access domain controllers',
                    'Compromise backup servers',
                    'Deploy Cobalt Strike beacons',
                ],
                indicators: [
                    'rdp_lateral_connections',
                    'smb_lateral_movement',
                    'wmi_execution',
                    'cobalt_strike_activity',
                ],
                nextStages: ['collection', 'exfiltration'],
            },
            {
                name: 'collection',
                tactic: 'TA0009',
                techniques: ['T1005', 'T1039', 'T1560'],
                duration: { min: 48, max: 336 }, // 2-14 days
                objectives: [
                    'Identify sensitive data',
                    'Collect financial records',
                    'Archive customer data',
                    'Gather intellectual property',
                ],
                indicators: [
                    'large_file_access',
                    'data_staging_activity',
                    'compression_utilities',
                ],
                nextStages: ['exfiltration', 'impact'],
            },
            {
                name: 'exfiltration',
                tactic: 'TA0010',
                techniques: ['T1567.002', 'T1041'],
                duration: { min: 12, max: 72 },
                objectives: [
                    'Upload data to cloud storage',
                    'Transfer via C2 channels',
                    'Prepare for double extortion',
                ],
                indicators: [
                    'cloud_upload_activity',
                    'large_outbound_transfers',
                    'c2_data_exfiltration',
                ],
                nextStages: ['impact'],
            },
            {
                name: 'impact',
                tactic: 'TA0040',
                techniques: ['T1486', 'T1490'],
                duration: { min: 2, max: 24 },
                objectives: [
                    'Deploy Conti ransomware',
                    'Encrypt critical systems',
                    'Delete shadow copies',
                    'Display ransom note',
                ],
                indicators: [
                    'conti_ransomware_execution',
                    'mass_file_encryption',
                    'shadow_copy_deletion',
                    'ransom_note_creation',
                ],
                nextStages: [],
            },
        ],
    },
    LOCKBIT_SUPPLY_CHAIN: {
        id: 'LOCKBIT_SUPPLY_CHAIN',
        name: 'LockBit Supply Chain Attack',
        description: 'Supply chain compromise leading to multiple victim encryption',
        group: RANSOMWARE_GROUPS.LOCKBIT,
        sophistication: 'expert',
        target_profile: {
            industries: ['technology', 'msp', 'software'],
            organization_sizes: ['medium', 'large'],
            geographic_focus: ['global'],
        },
        estimated_timeline: {
            min_days: 30,
            max_days: 180,
        },
        stages: [
            {
                name: 'supply_chain_compromise',
                tactic: 'TA0001',
                techniques: ['T1195.002'],
                duration: { min: 168, max: 720 }, // 1-4 weeks
                objectives: [
                    'Compromise software vendor',
                    'Inject malicious code',
                    'Prepare trojanized updates',
                ],
                indicators: [
                    'vendor_system_compromise',
                    'code_signing_abuse',
                    'malicious_updates',
                ],
                nextStages: ['distribution'],
            },
            {
                name: 'distribution',
                tactic: 'TA0001',
                techniques: ['T1195.002', 'T1078'],
                duration: { min: 24, max: 168 },
                objectives: [
                    'Distribute trojanized software',
                    'Infect downstream customers',
                    'Establish multiple footholds',
                ],
                indicators: [
                    'software_distribution',
                    'customer_infections',
                    'multiple_beacons',
                ],
                nextStages: ['activation'],
            },
            {
                name: 'activation',
                tactic: 'TA0002',
                techniques: ['T1053.005', 'T1204.002'],
                duration: { min: 1, max: 72 },
                objectives: [
                    'Activate dormant payloads',
                    'Begin reconnaissance phase',
                    'Establish C2 communications',
                ],
                indicators: [
                    'payload_activation',
                    'c2_establishment',
                    'initial_reconnaissance',
                ],
                nextStages: ['mass_encryption'],
            },
            {
                name: 'mass_encryption',
                tactic: 'TA0040',
                techniques: ['T1486', 'T1561'],
                duration: { min: 1, max: 12 },
                objectives: [
                    'Simultaneously encrypt multiple victims',
                    'Deploy LockBit ransomware',
                    'Maximize impact and pressure',
                ],
                indicators: [
                    'mass_encryption_event',
                    'lockbit_deployment',
                    'ransom_demands',
                ],
                nextStages: [],
            },
        ],
    },
};
/**
 * Generates a random ransomware chain based on available groups
 */
export function generateRandomRansomwareChain() {
    const chains = Object.values(RANSOMWARE_CHAINS);
    return chains[Math.floor(Math.random() * chains.length)];
}
/**
 * Gets all available ransomware chains
 */
export function getAllRansomwareChains() {
    return Object.values(RANSOMWARE_CHAINS);
}
/**
 * Gets ransomware chains by sophistication level
 */
export function getRansomwareChainsBySophistication(sophistication) {
    return Object.values(RANSOMWARE_CHAINS).filter((chain) => chain.sophistication === sophistication);
}
/**
 * Gets ransomware chains by target industry
 */
export function getRansomwareChainsByIndustry(industry) {
    return Object.values(RANSOMWARE_CHAINS).filter((chain) => chain.target_profile.industries.includes(industry));
}
