/**
 * Supply Chain Attack Patterns
 *
 * This module defines sophisticated supply chain compromise scenarios that
 * simulate attacks on software dependencies, hardware, and third-party services.
 */

export interface SupplyChainTarget {
  id: string;
  name: string;
  type: 'software' | 'hardware' | 'service' | 'vendor';
  criticality: 'low' | 'medium' | 'high' | 'critical';
  customer_reach: number; // estimated number of downstream customers
  attack_surface: string[];
}

export interface SupplyChainStage {
  name: string;
  tactic: string;
  techniques: string[];
  duration: {
    min_days: number;
    max_days: number;
  };
  objectives: string[];
  indicators: string[];
  success_criteria: string[];
}

export interface SupplyChainAttack {
  id: string;
  name: string;
  description: string;
  target: SupplyChainTarget;
  attack_vector: 'compromise' | 'insertion' | 'replacement' | 'modification';
  sophistication: 'low' | 'medium' | 'high' | 'expert';
  stages: SupplyChainStage[];
  impact_scope: {
    direct_victims: number;
    indirect_victims: number;
    geographic_reach: string[];
  };
  estimated_timeline: {
    planning_days: number;
    execution_days: number;
    discovery_days: number;
  };
}

// Supply Chain Target Definitions
export const SUPPLY_CHAIN_TARGETS: Record<string, SupplyChainTarget> = {
  SOFTWARE_LIBRARY: {
    id: 'SOFTWARE_LIBRARY',
    name: 'Popular JavaScript Library',
    type: 'software',
    criticality: 'high',
    customer_reach: 1000000,
    attack_surface: [
      'package_repository',
      'developer_accounts',
      'build_systems',
      'distribution_channels',
    ],
  },

  CLOUD_SERVICE: {
    id: 'CLOUD_SERVICE',
    name: 'Cloud Management Platform',
    type: 'service',
    criticality: 'critical',
    customer_reach: 50000,
    attack_surface: [
      'saas_platform',
      'api_endpoints',
      'customer_data',
      'deployment_pipelines',
    ],
  },

  MSP_PROVIDER: {
    id: 'MSP_PROVIDER',
    name: 'Managed Service Provider',
    type: 'vendor',
    criticality: 'critical',
    customer_reach: 1500,
    attack_surface: [
      'remote_management_tools',
      'customer_networks',
      'shared_infrastructure',
      'privileged_access',
    ],
  },

  HARDWARE_VENDOR: {
    id: 'HARDWARE_VENDOR',
    name: 'Network Equipment Manufacturer',
    type: 'hardware',
    criticality: 'high',
    customer_reach: 100000,
    attack_surface: [
      'firmware_updates',
      'manufacturing_process',
      'supply_chain_logistics',
      'component_suppliers',
    ],
  },
};

// Supply Chain Attack Definitions
export const SUPPLY_CHAIN_ATTACKS: Record<string, SupplyChainAttack> = {
  SOLARWINDS_STYLE: {
    id: 'SOLARWINDS_STYLE',
    name: 'Software Build System Compromise',
    description:
      'Nation-state compromise of software build pipeline affecting thousands',
    target: SUPPLY_CHAIN_TARGETS.SOFTWARE_LIBRARY,
    attack_vector: 'compromise',
    sophistication: 'expert',
    impact_scope: {
      direct_victims: 18000,
      indirect_victims: 425000,
      geographic_reach: ['global'],
    },
    estimated_timeline: {
      planning_days: 180,
      execution_days: 365,
      discovery_days: 365,
    },
    stages: [
      {
        name: 'initial_reconnaissance',
        tactic: 'TA0043',
        techniques: ['T1589', 'T1590', 'T1593'],
        duration: { min_days: 30, max_days: 90 },
        objectives: [
          'Identify target software vendor',
          'Map development infrastructure',
          'Identify key personnel',
          'Research security practices',
        ],
        indicators: [
          'extensive_osint_gathering',
          'social_media_reconnaissance',
          'technical_infrastructure_mapping',
        ],
        success_criteria: [
          'complete_org_chart_mapping',
          'infrastructure_documentation',
          'security_gap_identification',
        ],
      },
      {
        name: 'vendor_compromise',
        tactic: 'TA0001',
        techniques: ['T1566.001', 'T1078', 'T1190'],
        duration: { min_days: 14, max_days: 60 },
        objectives: [
          'Gain initial access to vendor network',
          'Establish persistent presence',
          'Map internal infrastructure',
        ],
        indicators: [
          'spearphishing_campaigns',
          'credential_stuffing_attacks',
          'exploitation_attempts',
        ],
        success_criteria: [
          'persistent_network_access',
          'credential_harvesting',
          'network_mapping_complete',
        ],
      },
      {
        name: 'build_system_infiltration',
        tactic: 'TA0008',
        techniques: ['T1021', 'T1078', 'T1550'],
        duration: { min_days: 7, max_days: 30 },
        objectives: [
          'Access software build systems',
          'Identify build processes',
          'Locate code signing infrastructure',
        ],
        indicators: [
          'lateral_movement_to_dev_systems',
          'build_server_access',
          'source_code_repository_access',
        ],
        success_criteria: [
          'build_pipeline_access',
          'code_signing_certificate_access',
          'release_process_understanding',
        ],
      },
      {
        name: 'malicious_code_injection',
        tactic: 'TA0003',
        techniques: ['T1554', 'T1195.002'],
        duration: { min_days: 1, max_days: 7 },
        objectives: [
          'Inject backdoor into source code',
          'Maintain stealth during builds',
          'Ensure activation mechanisms',
        ],
        indicators: [
          'unauthorized_code_modifications',
          'build_system_anomalies',
          'compilation_irregularities',
        ],
        success_criteria: [
          'backdoor_integration_successful',
          'stealth_maintenance',
          'activation_trigger_installed',
        ],
      },
      {
        name: 'distribution_phase',
        tactic: 'TA0001',
        techniques: ['T1195.002', 'T1608'],
        duration: { min_days: 30, max_days: 365 },
        objectives: [
          'Distribute trojanized software',
          'Monitor infection spread',
          'Maintain operational security',
        ],
        indicators: [
          'software_update_distribution',
          'customer_installation_monitoring',
          'c2_infrastructure_scaling',
        ],
        success_criteria: [
          'widespread_distribution_achieved',
          'infection_rate_targets_met',
          'detection_avoidance_maintained',
        ],
      },
      {
        name: 'selective_activation',
        tactic: 'TA0002',
        techniques: ['T1204', 'T1053'],
        duration: { min_days: 1, max_days: 180 },
        objectives: [
          'Activate backdoors in high-value targets',
          'Establish command and control',
          'Begin intelligence collection',
        ],
        indicators: [
          'selective_payload_activation',
          'c2_beacon_establishment',
          'targeted_system_enumeration',
        ],
        success_criteria: [
          'high_value_target_compromise',
          'persistent_access_established',
          'intelligence_collection_initiated',
        ],
      },
    ],
  },

  CODECOV_STYLE: {
    id: 'CODECOV_STYLE',
    name: 'CI/CD Pipeline Compromise',
    description: 'Attackers compromise CI/CD service to inject malicious code',
    target: SUPPLY_CHAIN_TARGETS.CLOUD_SERVICE,
    attack_vector: 'modification',
    sophistication: 'high',
    impact_scope: {
      direct_victims: 29000,
      indirect_victims: 100000,
      geographic_reach: ['global'],
    },
    estimated_timeline: {
      planning_days: 60,
      execution_days: 120,
      discovery_days: 90,
    },
    stages: [
      {
        name: 'service_reconnaissance',
        tactic: 'TA0043',
        techniques: ['T1590', 'T1596'],
        duration: { min_days: 7, max_days: 30 },
        objectives: [
          'Map CI/CD service infrastructure',
          'Identify API endpoints',
          'Research customer integration patterns',
        ],
        indicators: [
          'api_enumeration_attempts',
          'service_infrastructure_scanning',
          'customer_research_activities',
        ],
        success_criteria: [
          'service_architecture_mapped',
          'api_vulnerabilities_identified',
          'customer_integration_understood',
        ],
      },
      {
        name: 'service_compromise',
        tactic: 'TA0001',
        techniques: ['T1190', 'T1078'],
        duration: { min_days: 3, max_days: 14 },
        objectives: [
          'Exploit service vulnerabilities',
          'Gain administrative access',
          'Access customer data',
        ],
        indicators: [
          'exploitation_attempts',
          'privilege_escalation_activities',
          'customer_data_access',
        ],
        success_criteria: [
          'administrative_access_achieved',
          'customer_credential_access',
          'service_modification_capability',
        ],
      },
      {
        name: 'script_modification',
        tactic: 'TA0003',
        techniques: ['T1505', 'T1554'],
        duration: { min_days: 1, max_days: 3 },
        objectives: [
          'Modify CI/CD scripts',
          'Inject data exfiltration code',
          'Maintain service functionality',
        ],
        indicators: [
          'unauthorized_script_modifications',
          'service_configuration_changes',
          'code_injection_attempts',
        ],
        success_criteria: [
          'script_modification_successful',
          'data_exfiltration_capability',
          'service_stability_maintained',
        ],
      },
      {
        name: 'credential_harvesting',
        tactic: 'TA0006',
        techniques: ['T1555', 'T1552'],
        duration: { min_days: 30, max_days: 120 },
        objectives: [
          'Harvest customer credentials',
          'Collect environment variables',
          'Gather deployment secrets',
        ],
        indicators: [
          'credential_extraction_activities',
          'environment_variable_harvesting',
          'secret_collection_patterns',
        ],
        success_criteria: [
          'credential_database_populated',
          'high_value_secrets_collected',
          'customer_access_achieved',
        ],
      },
    ],
  },

  KASEYA_STYLE: {
    id: 'KASEYA_STYLE',
    name: 'MSP Platform Compromise',
    description:
      'Ransomware deployment through managed service provider compromise',
    target: SUPPLY_CHAIN_TARGETS.MSP_PROVIDER,
    attack_vector: 'compromise',
    sophistication: 'high',
    impact_scope: {
      direct_victims: 60,
      indirect_victims: 1500,
      geographic_reach: ['US', 'EU', 'AU'],
    },
    estimated_timeline: {
      planning_days: 90,
      execution_days: 30,
      discovery_days: 3,
    },
    stages: [
      {
        name: 'msp_infiltration',
        tactic: 'TA0001',
        techniques: ['T1190', 'T1133'],
        duration: { min_days: 7, max_days: 21 },
        objectives: [
          'Compromise MSP infrastructure',
          'Access customer management tools',
          'Map customer networks',
        ],
        indicators: [
          'msp_platform_exploitation',
          'management_tool_access',
          'customer_network_scanning',
        ],
        success_criteria: [
          'msp_platform_control',
          'customer_inventory_complete',
          'deployment_capability_verified',
        ],
      },
      {
        name: 'mass_deployment',
        tactic: 'TA0040',
        techniques: ['T1486', 'T1570'],
        duration: { min_days: 1, max_days: 3 },
        objectives: [
          'Deploy ransomware to customers',
          'Maximize simultaneous impact',
          'Overwhelm response capabilities',
        ],
        indicators: [
          'mass_ransomware_deployment',
          'customer_system_encryption',
          'ransom_note_distribution',
        ],
        success_criteria: [
          'widespread_customer_impact',
          'ransom_payment_pressure',
          'response_overwhelm_achieved',
        ],
      },
    ],
  },
};

/**
 * Generates a random supply chain attack scenario
 */
export function generateRandomSupplyChainAttack(): SupplyChainAttack {
  const attacks = Object.values(SUPPLY_CHAIN_ATTACKS);
  return attacks[Math.floor(Math.random() * attacks.length)];
}

/**
 * Gets all available supply chain attacks
 */
export function getAllSupplyChainAttacks(): SupplyChainAttack[] {
  return Object.values(SUPPLY_CHAIN_ATTACKS);
}

/**
 * Gets supply chain attacks by target type
 */
export function getSupplyChainAttacksByTargetType(
  targetType: 'software' | 'hardware' | 'service' | 'vendor',
): SupplyChainAttack[] {
  return Object.values(SUPPLY_CHAIN_ATTACKS).filter(
    (attack) => attack.target.type === targetType,
  );
}

/**
 * Gets supply chain attacks by sophistication level
 */
export function getSupplyChainAttacksBySophistication(
  sophistication: 'low' | 'medium' | 'high' | 'expert',
): SupplyChainAttack[] {
  return Object.values(SUPPLY_CHAIN_ATTACKS).filter(
    (attack) => attack.sophistication === sophistication,
  );
}
