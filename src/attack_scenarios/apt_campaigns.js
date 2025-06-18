/**
 * Advanced Persistent Threat (APT) Campaign Patterns
 *
 * This module defines sophisticated, multi-stage APT attack scenarios
 * that simulate real-world threat actor behaviors across the full
 * MITRE ATT&CK framework kill chain.
 */
// Threat Actor Profiles
export const THREAT_ACTORS = {
    APT1: {
        id: 'APT1',
        name: 'Comment Crew',
        aliases: ['PLA Unit 61398', 'Comment Group'],
        attribution: {
            country: 'China',
            motivation: 'espionage',
            sophistication: 'high',
        },
        ttps: {
            preferredTechniques: ['T1566.001', 'T1059.001', 'T1078', 'T1021.001'],
            commonTools: ['RAR', 'AURIGA', 'WEBC2', 'GREENCAT'],
            infrastructure: ['VPS', 'compromised_sites', 'domain_fronting'],
        },
    },
    CARBANAK: {
        id: 'CARBANAK',
        name: 'Carbanak Group',
        aliases: ['FIN7', 'Carbon Spider'],
        attribution: {
            country: 'Unknown',
            motivation: 'financial',
            sophistication: 'expert',
        },
        ttps: {
            preferredTechniques: ['T1566.001', 'T1055', 'T1021.002', 'T1041'],
            commonTools: ['Carbanak', 'Cobalt Strike', 'PowerShell Empire'],
            infrastructure: ['bulletproof_hosting', 'compromised_email'],
        },
    },
    LAZARUS: {
        id: 'LAZARUS',
        name: 'Lazarus Group',
        aliases: ['Hidden Cobra', 'Guardians of Peace'],
        attribution: {
            country: 'North Korea',
            motivation: 'financial',
            sophistication: 'expert',
        },
        ttps: {
            preferredTechniques: ['T1566.002', 'T1190', 'T1486', 'T1567.002'],
            commonTools: ['HOPLIGHT', 'ELECTRICFISH', 'BADCALL'],
            infrastructure: [
                'proxy_chains',
                'tor_networks',
                'compromised_infrastructure',
            ],
        },
    },
};
// APT Campaign Definitions
export const APT_CAMPAIGNS = {
    OPERATION_AURORA: {
        id: 'OPERATION_AURORA',
        name: 'Operation Aurora',
        description: 'Long-term espionage campaign targeting intellectual property theft',
        threatActor: THREAT_ACTORS.APT1,
        duration: { min: 30, max: 180 },
        targetProfile: {
            industries: ['technology', 'financial', 'defense'],
            geolocations: ['US', 'EU', 'JP'],
            organizationSizes: ['large', 'enterprise'],
        },
        complexity: 'expert',
        stages: [
            {
                name: 'reconnaissance',
                tactic: 'TA0043',
                techniques: ['T1589', 'T1590', 'T1593', 'T1596'],
                duration: { min: 24, max: 168 },
                objectives: [
                    'Identify high-value targets',
                    'Map network infrastructure',
                    'Gather employee information',
                ],
                artifacts: [
                    {
                        type: 'network',
                        name: 'DNS_RECONNAISSANCE',
                        description: 'DNS queries to map target infrastructure',
                        detectability: 'low',
                        iocs: ['excessive_dns_queries', 'zone_transfer_attempts'],
                    },
                ],
                nextStages: ['initial_access'],
            },
            {
                name: 'initial_access',
                tactic: 'TA0001',
                techniques: ['T1566.001', 'T1190'],
                duration: { min: 1, max: 24 },
                objectives: [
                    'Establish initial foothold',
                    'Deploy first-stage payload',
                ],
                artifacts: [
                    {
                        type: 'file',
                        name: 'SPEAR_PHISHING_DOC',
                        description: 'Malicious PDF with embedded exploit',
                        detectability: 'medium',
                        iocs: ['CVE-2012-0158', 'suspicious_pdf_structure'],
                    },
                ],
                nextStages: ['persistence'],
            },
        ],
    },
};
/**
 * Generates a randomized APT campaign based on threat actor profiles
 */
export function generateRandomAPTCampaign() {
    const campaigns = Object.values(APT_CAMPAIGNS);
    return campaigns[Math.floor(Math.random() * campaigns.length)];
}
/**
 * Gets all available APT campaigns
 */
export function getAllAPTCampaigns() {
    return Object.values(APT_CAMPAIGNS);
}
/**
 * Gets APT campaigns by complexity level
 */
export function getAPTCampaignsByComplexity(complexity) {
    return Object.values(APT_CAMPAIGNS).filter((campaign) => campaign.complexity === complexity);
}
/**
 * Gets APT campaigns by threat actor
 */
export function getAPTCampaignsByActor(actorId) {
    return Object.values(APT_CAMPAIGNS).filter((campaign) => campaign.threatActor.id === actorId);
}
