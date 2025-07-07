/**
 * Entity Display Utility
 * 
 * Displays generated entities (users, hosts, etc.) in a user-friendly format
 * to help users know what data was generated for filtering and testing
 */

export interface GeneratedEntities {
  userNames?: string[];
  hostNames?: string[];
  [key: string]: string[] | undefined;
}

export interface EntityDisplayOptions {
  maxDisplayItems?: number;
  showKQLQueries?: boolean;
  showSampleQueries?: boolean;
  namespace?: string;
  space?: string;
}

/**
 * Display generated entities in a formatted summary
 */
export function displayGeneratedEntities(
  entities: GeneratedEntities,
  options: EntityDisplayOptions = {}
): void {
  const {
    maxDisplayItems = 10,
    showKQLQueries = true,
    showSampleQueries = true,
    namespace = 'default',
    space = 'default'
  } = options;

  console.log('\n📊 Generated Entities Summary:');
  
  // Display users
  if (entities.userNames && entities.userNames.length > 0) {
    const users = entities.userNames;
    const displayUsers = users.slice(0, maxDisplayItems);
    const moreCount = users.length - displayUsers.length;
    
    const userDisplay = displayUsers.join(', ') + 
      (moreCount > 0 ? ` and ${moreCount} more` : '');
    
    console.log(`  👥 Users (${users.length}): ${userDisplay}`);
  }
  
  // Display hosts
  if (entities.hostNames && entities.hostNames.length > 0) {
    const hosts = entities.hostNames;
    const displayHosts = hosts.slice(0, maxDisplayItems);
    const moreCount = hosts.length - displayHosts.length;
    
    const hostDisplay = displayHosts.join(', ') + 
      (moreCount > 0 ? ` and ${moreCount} more` : '');
    
    console.log(`  🖥️  Hosts (${hosts.length}): ${hostDisplay}`);
  }
  
  // Display other entities
  Object.entries(entities).forEach(([key, values]) => {
    if (key !== 'userNames' && key !== 'hostNames' && values && values.length > 0) {
      const displayValues = values.slice(0, maxDisplayItems);
      const moreCount = values.length - displayValues.length;
      
      const valueDisplay = displayValues.join(', ') + 
        (moreCount > 0 ? ` and ${moreCount} more` : '');
      
      const emoji = getEntityEmoji(key);
      const label = formatEntityLabel(key);
      console.log(`  ${emoji} ${label} (${values.length}): ${valueDisplay}`);
    }
  });

  // Show KQL queries for filtering
  if (showKQLQueries && (entities.userNames?.length || entities.hostNames?.length)) {
    console.log('\n🔍 Useful KQL Queries:');
    
    if (entities.userNames && entities.userNames.length > 0) {
      const users = entities.userNames.slice(0, 5); // Show up to 5 users in query
      const userQuery = users.map(user => `"${user}"`).join(' OR ');
      console.log(`  Filter by users: user.name: (${userQuery})`);
      
      if (entities.userNames.length > 0) {
        console.log(`  Filter by specific user: user.name: "${entities.userNames[0]}"`);
      }
    }
    
    if (entities.hostNames && entities.hostNames.length > 0) {
      const hosts = entities.hostNames.slice(0, 5); // Show up to 5 hosts in query
      const hostQuery = hosts.map(host => `"${host}"`).join(' OR ');
      console.log(`  Filter by hosts: host.name: (${hostQuery})`);
      
      if (entities.hostNames.length > 0) {
        console.log(`  Filter by specific host: host.name: "${entities.hostNames[0]}"`);
      }
    }
  }
  
  // Show sample queries for testing
  if (showSampleQueries && (entities.userNames?.length || entities.hostNames?.length)) {
    console.log('\n💡 Sample Test Queries:');
    
    if (entities.userNames && entities.userNames.length > 0) {
      console.log(`  View data for user: user.name: "${entities.userNames[0]}"`);
    }
    
    if (entities.hostNames && entities.hostNames.length > 0) {
      console.log(`  View data for host: host.name: "${entities.hostNames[0]}"`);
    }
    
    if (entities.userNames && entities.hostNames) {
      console.log(`  Combined filter: user.name: "${entities.userNames[0]}" AND host.name: "${entities.hostNames[0]}"`);
    }
  }
  
  // Show index patterns for reference
  if (namespace !== 'default' || space !== 'default') {
    console.log('\n📁 Index Patterns:');
    if (namespace !== 'default') {
      console.log(`  Logs: logs-*-${namespace}`);
    }
    if (space !== 'default') {
      console.log(`  Alerts: View in Kibana space "${space}"`);
    }
  }
}

/**
 * Get emoji for entity type
 */
function getEntityEmoji(entityType: string): string {
  const emojiMap: Record<string, string> = {
    userNames: '👥',
    hostNames: '🖥️',
    ipAddresses: '🌐',
    processes: '⚙️',
    files: '📄',
    services: '🔧',
    domains: '🌍',
    emails: '📧',
    default: '📊'
  };
  
  return emojiMap[entityType] || emojiMap.default;
}

/**
 * Format entity label for display
 */
function formatEntityLabel(entityType: string): string {
  const labelMap: Record<string, string> = {
    userNames: 'Users',
    hostNames: 'Hosts',
    ipAddresses: 'IP Addresses',
    processes: 'Processes',
    files: 'Files',
    services: 'Services',
    domains: 'Domains',
    emails: 'Email Addresses'
  };
  
  return labelMap[entityType] || entityType.charAt(0).toUpperCase() + entityType.slice(1);
}

/**
 * Create a compact entity summary for multi-environment scenarios
 */
export function displayCompactEntitySummary(
  entities: GeneratedEntities,
  environmentName?: string
): void {
  const prefix = environmentName ? `[${environmentName}] ` : '';
  const parts: string[] = [];
  
  if (entities.userNames?.length) {
    parts.push(`${entities.userNames.length} users`);
  }
  
  if (entities.hostNames?.length) {
    parts.push(`${entities.hostNames.length} hosts`);
  }
  
  if (parts.length > 0) {
    console.log(`  ${prefix}📊 Generated: ${parts.join(', ')}`);
  }
}