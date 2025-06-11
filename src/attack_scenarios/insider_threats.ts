/**
 * Insider Threat Behavior Patterns
 *
 * This module defines sophisticated insider threat scenarios that simulate
 * malicious insider activities including data theft, sabotage, and fraud.
 */

export interface InsiderProfile {
  id: string;
  name: string;
  role: 'employee' | 'contractor' | 'vendor' | 'privileged_user';
  access_level: 'low' | 'medium' | 'high' | 'administrative';
  motivation: 'financial' | 'revenge' | 'ideology' | 'coercion' | 'negligence';
  sophistication: 'low' | 'medium' | 'high' | 'expert';
  behavioral_indicators: string[];
}

export interface InsiderActivity {
  name: string;
  category:
    | 'data_access'
    | 'system_modification'
    | 'network_activity'
    | 'policy_violation';
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  techniques: string[];
  indicators: string[];
  timeframe: {
    frequency: 'hourly' | 'daily' | 'weekly' | 'monthly';
    duration_hours: number;
  };
}

export interface InsiderThreatScenario {
  id: string;
  name: string;
  description: string;
  insider: InsiderProfile;
  timeline: {
    buildup_days: number;
    active_days: number;
    detection_window_days: number;
  };
  activities: InsiderActivity[];
  target_data: string[];
  impact_assessment: {
    data_exposure: 'low' | 'medium' | 'high' | 'critical';
    financial_impact: number;
    reputation_damage: 'low' | 'medium' | 'high' | 'critical';
  };
}

// Insider Profile Definitions
export const INSIDER_PROFILES: Record<string, InsiderProfile> = {
  DISGRUNTLED_EMPLOYEE: {
    id: 'DISGRUNTLED_EMPLOYEE',
    name: 'Disgruntled Employee',
    role: 'employee',
    access_level: 'medium',
    motivation: 'revenge',
    sophistication: 'medium',
    behavioral_indicators: [
      'increased_after_hours_access',
      'negative_performance_reviews',
      'disciplinary_actions',
      'unusual_file_access_patterns',
      'downloading_large_datasets',
    ],
  },

  PRIVILEGED_ADMIN: {
    id: 'PRIVILEGED_ADMIN',
    name: 'Malicious System Administrator',
    role: 'privileged_user',
    access_level: 'administrative',
    motivation: 'financial',
    sophistication: 'expert',
    behavioral_indicators: [
      'abuse_of_administrative_privileges',
      'unauthorized_system_modifications',
      'covering_tracks',
      'creating_backdoors',
      'financial_stress_indicators',
    ],
  },

  CARELESS_CONTRACTOR: {
    id: 'CARELESS_CONTRACTOR',
    name: 'Negligent Contractor',
    role: 'contractor',
    access_level: 'low',
    motivation: 'negligence',
    sophistication: 'low',
    behavioral_indicators: [
      'poor_security_practices',
      'policy_violations',
      'unsecured_data_handling',
      'weak_password_usage',
      'social_engineering_susceptibility',
    ],
  },

  FINANCIALLY_MOTIVATED: {
    id: 'FINANCIALLY_MOTIVATED',
    name: 'Financially Motivated Insider',
    role: 'employee',
    access_level: 'high',
    motivation: 'financial',
    sophistication: 'high',
    behavioral_indicators: [
      'financial_difficulties',
      'lifestyle_changes',
      'contact_with_competitors',
      'unusual_data_exfiltration',
      'attempts_to_monetize_access',
    ],
  },
};

// Insider Threat Scenario Definitions
export const INSIDER_THREAT_SCENARIOS: Record<string, InsiderThreatScenario> = {
  DATA_THEFT_REVENGE: {
    id: 'DATA_THEFT_REVENGE',
    name: 'Revenge-Motivated Data Theft',
    description:
      'Disgruntled employee steals sensitive data before termination',
    insider: INSIDER_PROFILES.DISGRUNTLED_EMPLOYEE,
    timeline: {
      buildup_days: 30,
      active_days: 7,
      detection_window_days: 14,
    },
    activities: [
      {
        name: 'escalating_data_access',
        category: 'data_access',
        risk_level: 'medium',
        techniques: ['T1005', 'T1039', 'T1083'],
        indicators: [
          'increased_file_access_frequency',
          'access_to_sensitive_directories',
          'large_file_downloads',
        ],
        timeframe: {
          frequency: 'daily',
          duration_hours: 2,
        },
      },
      {
        name: 'data_staging',
        category: 'data_access',
        risk_level: 'high',
        techniques: ['T1074', 'T1560'],
        indicators: [
          'creating_large_archives',
          'staging_data_in_temp_directories',
          'compressing_sensitive_files',
        ],
        timeframe: {
          frequency: 'weekly',
          duration_hours: 4,
        },
      },
      {
        name: 'exfiltration_attempt',
        category: 'network_activity',
        risk_level: 'critical',
        techniques: ['T1052', 'T1567'],
        indicators: [
          'usb_device_usage',
          'cloud_upload_activity',
          'email_with_large_attachments',
        ],
        timeframe: {
          frequency: 'weekly',
          duration_hours: 1,
        },
      },
    ],
    target_data: [
      'customer_database',
      'financial_records',
      'employee_information',
      'trade_secrets',
    ],
    impact_assessment: {
      data_exposure: 'high',
      financial_impact: 500000,
      reputation_damage: 'high',
    },
  },

  ADMIN_BACKDOOR: {
    id: 'ADMIN_BACKDOOR',
    name: 'Administrator Creates Persistent Backdoor',
    description:
      'System administrator creates hidden access for future exploitation',
    insider: INSIDER_PROFILES.PRIVILEGED_ADMIN,
    timeline: {
      buildup_days: 90,
      active_days: 180,
      detection_window_days: 30,
    },
    activities: [
      {
        name: 'account_creation',
        category: 'system_modification',
        risk_level: 'high',
        techniques: ['T1136', 'T1078'],
        indicators: [
          'unauthorized_account_creation',
          'hidden_admin_accounts',
          'privilege_escalation',
        ],
        timeframe: {
          frequency: 'monthly',
          duration_hours: 1,
        },
      },
      {
        name: 'backdoor_installation',
        category: 'system_modification',
        risk_level: 'critical',
        techniques: ['T1543', 'T1547'],
        indicators: [
          'unauthorized_service_installation',
          'registry_modifications',
          'scheduled_task_creation',
        ],
        timeframe: {
          frequency: 'monthly',
          duration_hours: 2,
        },
      },
      {
        name: 'log_manipulation',
        category: 'system_modification',
        risk_level: 'high',
        techniques: ['T1070'],
        indicators: [
          'log_file_modifications',
          'audit_trail_tampering',
          'event_log_clearing',
        ],
        timeframe: {
          frequency: 'weekly',
          duration_hours: 1,
        },
      },
      {
        name: 'data_monetization',
        category: 'data_access',
        risk_level: 'critical',
        techniques: ['T1005', 'T1041'],
        indicators: [
          'accessing_financial_systems',
          'downloading_customer_data',
          'external_communications',
        ],
        timeframe: {
          frequency: 'monthly',
          duration_hours: 3,
        },
      },
    ],
    target_data: [
      'customer_financial_data',
      'payment_processing_systems',
      'authentication_databases',
      'system_configurations',
    ],
    impact_assessment: {
      data_exposure: 'critical',
      financial_impact: 2000000,
      reputation_damage: 'critical',
    },
  },

  NEGLIGENT_EXPOSURE: {
    id: 'NEGLIGENT_EXPOSURE',
    name: 'Negligent Data Exposure',
    description:
      'Contractor accidentally exposes sensitive data through poor practices',
    insider: INSIDER_PROFILES.CARELESS_CONTRACTOR,
    timeline: {
      buildup_days: 7,
      active_days: 1,
      detection_window_days: 60,
    },
    activities: [
      {
        name: 'weak_authentication',
        category: 'policy_violation',
        risk_level: 'medium',
        techniques: ['T1078', 'T1110'],
        indicators: [
          'weak_password_usage',
          'shared_account_access',
          'failed_authentication_attempts',
        ],
        timeframe: {
          frequency: 'daily',
          duration_hours: 8,
        },
      },
      {
        name: 'unsecured_data_handling',
        category: 'data_access',
        risk_level: 'high',
        techniques: ['T1005', 'T1039'],
        indicators: [
          'downloading_to_personal_devices',
          'unsecured_file_sharing',
          'email_data_transmission',
        ],
        timeframe: {
          frequency: 'daily',
          duration_hours: 4,
        },
      },
      {
        name: 'accidental_exposure',
        category: 'data_access',
        risk_level: 'critical',
        techniques: ['T1567', 'T1011'],
        indicators: [
          'public_cloud_misconfiguration',
          'insecure_file_sharing',
          'unencrypted_data_transmission',
        ],
        timeframe: {
          frequency: 'weekly',
          duration_hours: 1,
        },
      },
    ],
    target_data: [
      'project_documentation',
      'customer_contact_information',
      'internal_communications',
      'system_credentials',
    ],
    impact_assessment: {
      data_exposure: 'medium',
      financial_impact: 100000,
      reputation_damage: 'medium',
    },
  },

  INTELLECTUAL_PROPERTY_THEFT: {
    id: 'INTELLECTUAL_PROPERTY_THEFT',
    name: 'Corporate Espionage',
    description: 'Employee steals trade secrets for competitor benefit',
    insider: INSIDER_PROFILES.FINANCIALLY_MOTIVATED,
    timeline: {
      buildup_days: 60,
      active_days: 30,
      detection_window_days: 21,
    },
    activities: [
      {
        name: 'reconnaissance',
        category: 'data_access',
        risk_level: 'low',
        techniques: ['T1083', 'T1135'],
        indicators: [
          'systematic_file_browsing',
          'research_and_development_access',
          'unusual_search_patterns',
        ],
        timeframe: {
          frequency: 'weekly',
          duration_hours: 3,
        },
      },
      {
        name: 'targeted_collection',
        category: 'data_access',
        risk_level: 'high',
        techniques: ['T1005', 'T1039', 'T1113'],
        indicators: [
          'accessing_proprietary_documents',
          'screenshot_activity',
          'copying_source_code',
        ],
        timeframe: {
          frequency: 'weekly',
          duration_hours: 4,
        },
      },
      {
        name: 'covert_exfiltration',
        category: 'network_activity',
        risk_level: 'critical',
        techniques: ['T1567', 'T1041', 'T1052'],
        indicators: [
          'encrypted_file_transfers',
          'steganographic_communications',
          'personal_device_synchronization',
        ],
        timeframe: {
          frequency: 'monthly',
          duration_hours: 2,
        },
      },
    ],
    target_data: [
      'research_and_development_data',
      'proprietary_algorithms',
      'customer_lists',
      'business_strategies',
    ],
    impact_assessment: {
      data_exposure: 'critical',
      financial_impact: 5000000,
      reputation_damage: 'high',
    },
  },
};

/**
 * Generates a random insider threat scenario
 */
export function generateRandomInsiderThreatScenario(): InsiderThreatScenario {
  const scenarios = Object.values(INSIDER_THREAT_SCENARIOS);
  return scenarios[Math.floor(Math.random() * scenarios.length)];
}

/**
 * Gets all available insider threat scenarios
 */
export function getAllInsiderThreatScenarios(): InsiderThreatScenario[] {
  return Object.values(INSIDER_THREAT_SCENARIOS);
}

/**
 * Gets insider threat scenarios by motivation
 */
export function getInsiderThreatScenariosByMotivation(
  motivation: 'financial' | 'revenge' | 'ideology' | 'coercion' | 'negligence',
): InsiderThreatScenario[] {
  return Object.values(INSIDER_THREAT_SCENARIOS).filter(
    (scenario) => scenario.insider.motivation === motivation,
  );
}

/**
 * Gets insider threat scenarios by risk level
 */
export function getInsiderThreatScenariosByRisk(
  riskLevel: 'low' | 'medium' | 'high' | 'critical',
): InsiderThreatScenario[] {
  return Object.values(INSIDER_THREAT_SCENARIOS).filter((scenario) =>
    scenario.activities.some((activity) => activity.risk_level === riskLevel),
  );
}
