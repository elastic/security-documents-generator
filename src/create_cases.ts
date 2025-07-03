import { 
  generateSecurityCase, 
  generateMultipleSecurityCases, 
  generateCaseFromAlert,
  SecurityCaseData 
} from './generators/case_generator';
import { 
  getKibanaClient, 
  KibanaClient, 
  CaseResponse, 
  AttachAlertsRequest 
} from './utils/kibana_client';
import { getEsClient } from './commands/utils/indices';
import { TimestampConfig } from './utils/timestamp_utils';
import { generateAIAlert, generateAIAlertBatch } from './utils/ai_service';
import cliProgress from 'cli-progress';
import { faker } from '@faker-js/faker';

export interface CaseCreationOptions {
  count: number;
  space?: string;
  includeMitre?: boolean;
  owner?: string;
  attachExistingAlerts?: boolean;
  alertsPerCase?: number;
  alertQuery?: string;
  useAI?: boolean;
  timestampConfig?: TimestampConfig;
  environments?: number;
  namespace?: string;
}

export interface CaseFromAlertsOptions {
  space?: string;
  alertQuery?: string;
  maxAlertsPerCase?: number;
  groupingStrategy?: 'by-time' | 'by-host' | 'by-rule' | 'by-severity';
  owner?: string;
  timeWindowHours?: number;
}

export interface AlertToCaseMapping {
  caseId: string;
  alertIds: string[];
  alertCount: number;
  caseTitle: string;
}

/**
 * Main function to create security cases
 */
export async function createCases(options: CaseCreationOptions): Promise<CaseResponse[]> {
  const {
    count,
    space = 'default',
    includeMitre = false,
    owner = 'securitySolution',
    attachExistingAlerts = false,
    alertsPerCase = 3,
    alertQuery = '*',
    useAI = false,
    environments = 1,
    namespace = 'default'
  } = options;

  console.log(`\n🔒 Generating ${count} security cases...`);
  console.log(`📁 Space: ${space}`);
  console.log(`🎯 MITRE Integration: ${includeMitre ? 'enabled' : 'disabled'}`);
  console.log(`📎 Attach Alerts: ${attachExistingAlerts ? `${alertsPerCase} per case` : 'no'}`);
  
  if (environments > 1) {
    console.log(`🌍 Multi-Environment: ${environments} environments`);
  }

  const kibanaClient = getKibanaClient();
  
  // Test Kibana connection
  const healthCheck = await kibanaClient.healthCheck();
  if (healthCheck.status === 'error') {
    console.error('\n❌ Unable to connect to Kibana for Cases API');
    console.error('📋 Requirements for Cases functionality:');
    console.error('   • Kibana 7.10+ with Security solution enabled');
    console.error('   • Valid authentication credentials in config.json');
    console.error('   • Kibana running and accessible');
    console.error('\n💡 Troubleshooting:');
    console.error('   1. Verify Kibana is running: curl http://localhost:5601');
    console.error('   2. Check credentials in config.json');
    console.error('   3. Ensure Security solution is enabled in Kibana');
    console.error('   4. Try: yarn start generate-alerts (without --create-cases)');
    throw new Error(`Kibana connection failed: ${healthCheck.message}`);
  }

  // Helper function to create cases for a single environment
  const createCasesForEnvironment = async (targetSpace: string, envInfo?: string): Promise<CaseResponse[]> => {
    if (envInfo) {
      console.log(`\n🌍 ${envInfo}`);
    }

    // Generate case data
    const caseDataArray = await generateMultipleSecurityCases(count, includeMitre, owner);
    
    const createdCases: CaseResponse[] = [];
    const progressBar = new cliProgress.SingleBar({
      format: `Creating Cases | {bar} | {percentage}% | {value}/{total} cases`,
    }, cliProgress.Presets.shades_classic);

    progressBar.start(count, 0);

    // Create cases one by one to handle potential API rate limits
    for (let i = 0; i < caseDataArray.length; i++) {
      const caseData = caseDataArray[i];
      
      try {
        // Convert SecurityCaseData to CasePostRequest for API
        const apiCaseData = {
          title: caseData.title,
          description: caseData.description,
          tags: caseData.tags,
          severity: caseData.severity,
          owner: caseData.owner,
          assignees: caseData.assignees,
          connector: caseData.connector,
          settings: caseData.settings
        };

        const createdCase = await kibanaClient.createCase(apiCaseData, targetSpace);
        createdCases.push(createdCase);

        // Add a comment with additional security context
        const securityComment = `
**Security Case Details:**
- **Category:** ${caseData.security.category}
- **Incident Type:** ${caseData.security.incident_type}
- **Priority:** ${caseData.security.priority}
- **Affected Systems:** ${caseData.security.affected_systems.join(', ')}
- **Threat Level:** ${caseData.security.threat_level}

**Investigation Team:**
- **Lead Analyst:** ${caseData.investigation.lead_analyst}
- **Team:** ${caseData.investigation.team.join(', ')}

**Timeline:**
- **Discovery:** ${caseData.timeline.discovery_time}
- **First Occurrence:** ${caseData.timeline.first_occurrence || 'Unknown'}

${caseData.mitre ? `**MITRE ATT&CK:**
- **Techniques:** ${caseData.mitre.technique_ids.join(', ')}
- **Tactics:** ${caseData.mitre.tactic_ids.join(', ')}
- **Kill Chain:** ${caseData.mitre.kill_chain_phases.join(', ')}` : ''}

*This case was generated by the Security Documents Generator for testing and training purposes.*
        `.trim();

        await kibanaClient.addComment(createdCase.id, {
          comment: securityComment,
          type: 'user',
          owner
        }, targetSpace);

        // Attach existing alerts if requested
        if (attachExistingAlerts && alertsPerCase > 0) {
          await attachRandomAlertsToCase(
            kibanaClient,
            createdCase.id,
            targetSpace,
            alertsPerCase,
            alertQuery,
            owner
          );
        }

        progressBar.increment();
        
        // Small delay to prevent overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error: any) {
        if (error.message?.includes('Cases API not found')) {
          progressBar.stop();
          console.error(`\n❌ Cases API Not Available`);
          console.error(`📋 This Kibana instance doesn't support the Cases API.`);
          console.error(`\n💡 Solutions:`);
          console.error(`   1. Upgrade to Kibana 7.10+ with Security solution`);
          console.error(`   2. Enable the Security solution in Kibana`);
          console.error(`   3. Use Elastic Cloud with Security features enabled`);
          console.error(`\n📊 Generated Case Data Preview:`);
          
          // Show a preview of what would have been created
          for (let j = 0; j < Math.min(3, caseDataArray.length); j++) {
            const preview = caseDataArray[j];
            console.error(`\n🔒 Case ${j + 1}: ${preview.title}`);
            console.error(`   📝 Type: ${preview.security.incident_type}`);
            console.error(`   🎯 Severity: ${preview.severity}`);
            console.error(`   👤 Analyst: ${preview.investigation.lead_analyst}`);
            console.error(`   🏷️  Tags: ${preview.tags.slice(0, 3).join(', ')}`);
          }
          
          if (caseDataArray.length > 3) {
            console.error(`\n   ... and ${caseDataArray.length - 3} more cases`);
          }
          
          console.error(`\n✅ Case data generation successful - Cases API integration requires Kibana Security solution`);
          throw new Error('Cases API not available in this Kibana instance');
        }
        
        console.error(`\n❌ Error creating case ${i + 1}: ${error.message || error}`);
        progressBar.increment();
      }
    }

    progressBar.stop();
    return createdCases;
  };

  // Handle multi-environment generation
  if (environments > 1) {
    console.log(`\n🌍 Multi-Environment Case Generation: ${environments} environments`);
    const allCases: CaseResponse[] = [];

    for (let i = 1; i <= environments; i++) {
      const envNamespace = `${namespace}-env-${i.toString().padStart(3, '0')}`;
      const targetSpace = `${space}-${envNamespace}`;
      const envInfo = `Environment ${i}/${environments}: ${envNamespace}`;
      
      const envCases = await createCasesForEnvironment(targetSpace, envInfo);
      allCases.push(...envCases);
    }

    console.log(`\n✅ Multi-Environment Case Generation Complete!`);
    console.log(`🌍 Total Cases: ${allCases.length} across ${environments} environments`);
    
    return allCases;
  } else {
    // Single environment generation
    return await createCasesForEnvironment(space);
  }
}

/**
 * Create cases from existing alerts with grouping strategies
 */
export async function createCasesFromAlerts(options: CaseFromAlertsOptions): Promise<AlertToCaseMapping[]> {
  const {
    space = 'default',
    alertQuery = '*',
    maxAlertsPerCase = 5,
    groupingStrategy = 'by-severity',
    owner = 'securitySolution',
    timeWindowHours = 24
  } = options;

  console.log(`\n🚨 Creating cases from existing alerts...`);
  console.log(`📁 Space: ${space}`);
  console.log(`🔍 Query: ${alertQuery}`);
  console.log(`🗂️ Grouping: ${groupingStrategy}`);
  console.log(`📊 Max alerts per case: ${maxAlertsPerCase}`);

  const kibanaClient = getKibanaClient();
  const esClient = getEsClient();

  // Query existing alerts
  const alertsResult = await kibanaClient.queryAlerts(alertQuery, space, 1000);
  
  if (alertsResult.total === 0) {
    console.log('⚠️ No alerts found matching the query');
    return [];
  }

  console.log(`📊 Found ${alertsResult.total} alerts to process`);

  // Group alerts based on strategy
  const alertGroups = groupAlerts(alertsResult.alerts, groupingStrategy, maxAlertsPerCase, timeWindowHours);
  
  console.log(`🗂️ Created ${alertGroups.length} alert groups`);

  const caseMappings: AlertToCaseMapping[] = [];
  const progressBar = new cliProgress.SingleBar({
    format: `Creating Cases from Alerts | {bar} | {percentage}% | {value}/{total} groups`,
  }, cliProgress.Presets.shades_classic);

  progressBar.start(alertGroups.length, 0);

  for (const group of alertGroups) {
    try {
      // Create case based on the first/primary alert in the group
      const primaryAlert = group.alerts[0];
      const alertInfo = extractAlertInfo(primaryAlert);
      
      const caseData = generateCaseFromAlert(alertInfo, owner);
      
      // Modify title to indicate multiple alerts
      if (group.alerts.length > 1) {
        caseData.title = `${caseData.title} (${group.alerts.length} related alerts)`;
        caseData.description += `\n\n**Related Alerts:** ${group.alerts.length} alerts have been grouped together based on ${groupingStrategy.replace('by-', '')} correlation.`;
      }

      // Convert to API format
      const apiCaseData = {
        title: caseData.title,
        description: caseData.description,
        tags: caseData.tags,
        severity: caseData.severity,
        owner: caseData.owner,
        assignees: caseData.assignees,
        connector: caseData.connector,
        settings: caseData.settings
      };

      const createdCase = await kibanaClient.createCase(apiCaseData, space);

      // Attach all alerts in the group to the case
      const alertIds = group.alerts.map(alert => alert._id);
      const alertIndices = group.alerts.map(alert => alert._index);

      if (alertIds.length > 0) {
        const attachRequest: AttachAlertsRequest = {
          alertId: alertIds,
          index: alertIndices,
          type: 'alert',
          owner,
          rule: alertInfo.rule_name ? {
            id: faker.string.uuid(),
            name: alertInfo.rule_name
          } : undefined
        };

        await kibanaClient.attachAlertsToCase(createdCase.id, attachRequest, space);
      }

      caseMappings.push({
        caseId: createdCase.id,
        alertIds,
        alertCount: alertIds.length,
        caseTitle: createdCase.title
      });

      progressBar.increment();
      
      // Small delay to prevent API overload
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } catch (error) {
      console.error(`\nError creating case from alert group: ${error}`);
      progressBar.increment();
    }
  }

  progressBar.stop();

  console.log(`\n✅ Created ${caseMappings.length} cases from alerts`);
  console.log(`📊 Total alerts attached: ${caseMappings.reduce((sum, mapping) => sum + mapping.alertCount, 0)}`);

  return caseMappings;
}

/**
 * Delete all cases in a space
 */
export async function deleteAllCases(space?: string): Promise<void> {
  console.log(`\n🗑️ Deleting all cases${space ? ` in space: ${space}` : ''}...`);
  
  const kibanaClient = getKibanaClient();
  
  try {
    const allCases = await kibanaClient.getAllCases(space);
    
    if (allCases.length === 0) {
      console.log('ℹ️ No cases found to delete');
      return;
    }

    console.log(`📊 Found ${allCases.length} cases to delete`);
    
    const caseIds = allCases.map(c => c.id);
    
    // Delete in batches to avoid API limits
    const batchSize = 10;
    for (let i = 0; i < caseIds.length; i += batchSize) {
      const batch = caseIds.slice(i, i + batchSize);
      await kibanaClient.deleteCases(batch, space);
      
      console.log(`🗑️ Deleted ${Math.min(i + batchSize, caseIds.length)}/${caseIds.length} cases`);
      
      // Small delay between batches
      if (i + batchSize < caseIds.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log('✅ All cases deleted successfully');
  } catch (error) {
    console.error('❌ Error deleting cases:', error);
    throw error;
  }
}

// Helper Functions

/**
 * Attach random alerts to a case
 */
async function attachRandomAlertsToCase(
  kibanaClient: KibanaClient,
  caseId: string,
  space: string,
  alertCount: number,
  query: string,
  owner: string
): Promise<void> {
  try {
    const alertsResult = await kibanaClient.queryAlerts(query, space, alertCount * 2);
    
    if (alertsResult.alerts.length === 0) {
      // Alert API returned no results - likely not available
      return;
    }

    // Select random alerts up to the requested count
    const selectedAlerts = faker.helpers.arrayElements(
      alertsResult.alerts, 
      { min: 1, max: Math.min(alertCount, alertsResult.alerts.length) }
    );

    const alertIds = selectedAlerts.map(alert => alert._id);
    const alertIndices = selectedAlerts.map(alert => alert._index);

    const attachRequest: AttachAlertsRequest = {
      alertId: alertIds,
      index: alertIndices,
      type: 'alert',
      owner
    };

    await kibanaClient.attachAlertsToCase(caseId, attachRequest, space);
    
  } catch (error) {
    // Silently skip alert attachment if API is not available
    console.warn(`⚠️ Alert attachment skipped for case ${caseId} (API not available)`);
  }
}

/**
 * Group alerts based on different strategies
 */
function groupAlerts(
  alerts: any[],
  strategy: 'by-time' | 'by-host' | 'by-rule' | 'by-severity',
  maxAlertsPerCase: number,
  timeWindowHours: number
): Array<{ alerts: any[]; groupKey: string }> {
  const groups = new Map<string, any[]>();

  for (const alert of alerts) {
    let groupKey: string;

    switch (strategy) {
      case 'by-time':
        const alertTime = new Date(alert._source['@timestamp']);
        const timeSlot = Math.floor(alertTime.getTime() / (timeWindowHours * 60 * 60 * 1000));
        groupKey = `time-${timeSlot}`;
        break;
        
      case 'by-host':
        groupKey = `host-${alert._source['host.name'] || 'unknown'}`;
        break;
        
      case 'by-rule':
        groupKey = `rule-${alert._source['kibana.alert.rule.name'] || 'unknown'}`;
        break;
        
      case 'by-severity':
        groupKey = `severity-${alert._source['kibana.alert.severity'] || 'unknown'}`;
        break;
        
      default:
        groupKey = 'default';
    }

    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }

    const group = groups.get(groupKey)!;
    if (group.length < maxAlertsPerCase) {
      group.push(alert);
    }
  }

  return Array.from(groups.entries())
    .filter(([_, alerts]) => alerts.length > 0)
    .map(([groupKey, alerts]) => ({ alerts, groupKey }));
}

/**
 * Extract relevant information from an alert for case creation
 */
function extractAlertInfo(alert: any): {
  rule_name: string;
  severity: string;
  host_name: string;
  user_name?: string;
  mitre_techniques?: string[];
  mitre_tactics?: string[];
} {
  const source = alert._source || {};
  
  return {
    rule_name: source['kibana.alert.rule.name'] || 'Unknown Rule',
    severity: source['kibana.alert.severity'] || 'medium',
    host_name: source['host.name'] || 'unknown-host',
    user_name: source['user.name'],
    mitre_techniques: source['threat.technique.id'] ? [source['threat.technique.id']] : undefined,
    mitre_tactics: source['threat.tactic.id'] ? [source['threat.tactic.id']] : undefined
  };
}