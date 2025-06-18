import { faker } from '@faker-js/faker';
import { BaseCreateAlertsReturnType } from '../create_alerts';

// Common false positive categories and their reasons
const FALSE_POSITIVE_CATEGORIES = {
  maintenance: [
    'Scheduled system maintenance activity',
    'Authorized administrative script execution',
    'System backup and archival processes',
    'Software deployment and updates',
    'Database maintenance operations',
  ],
  authorized_tools: [
    'Legitimate security scanning tool',
    'Authorized penetration testing',
    'System monitoring and diagnostic tools',
    'Network administration utilities',
    'Performance benchmarking software',
  ],
  normal_business: [
    'Normal business operations during extended hours',
    'Legitimate user accessing required resources',
    'Standard data processing workflows',
    'Authorized bulk data transfers',
    'Regular automated reporting processes',
  ],
  configuration_change: [
    'Authorized configuration modification',
    'Standard policy enforcement',
    'Legitimate service account activity',
    'Normal group policy updates',
    'Authorized firewall rule changes',
  ],
  false_detection: [
    'Rule threshold too sensitive',
    'Benign process flagged incorrectly',
    'Legitimate traffic misidentified',
    'Normal user behavior outside baseline',
    'System process triggering detection',
  ],
};

// SOC analyst names for resolution tracking
const SOC_ANALYSTS = [
  'Alice Johnson',
  'Bob Martinez',
  'Carol Williams',
  'David Chen',
  'Elena Rodriguez',
  'Frank Thompson',
  'Grace Kim',
  'Henry Davis',
  'Isabel Garcia',
  'James Wilson',
];

// Extended alert type with false positive fields
type ExtendedAlert = BaseCreateAlertsReturnType & {
  'kibana.alert.false_positive'?: boolean;
  'kibana.alert.false_positive.category'?: string;
  'kibana.alert.false_positive.analyst'?: string;
  'kibana.alert.false_positive.resolution_time_minutes'?: number;
  'kibana.alert.workflow_reason'?: string;
  'kibana.alert.workflow_user'?: string;
  'kibana.alert.workflow_updated_at'?: string;
  'event.outcome'?: string;
};

/**
 * Converts a regular alert to a false positive by updating workflow status
 * and adding resolution metadata
 */
export function markAlertAsFalsePositive(
  alert: BaseCreateAlertsReturnType,
  category?: keyof typeof FALSE_POSITIVE_CATEGORIES,
): ExtendedAlert {
  // Select a random category if not provided
  const selectedCategory =
    category ||
    faker.helpers.arrayElement(
      Object.keys(FALSE_POSITIVE_CATEGORIES) as Array<
        keyof typeof FALSE_POSITIVE_CATEGORIES
      >,
    );

  // Get a random reason from the selected category
  const reason = faker.helpers.arrayElement(
    FALSE_POSITIVE_CATEGORIES[selectedCategory],
  );

  // Generate resolution metadata
  const resolvedBy = faker.helpers.arrayElement(SOC_ANALYSTS);
  const originalTimestamp = new Date(alert['@timestamp']);
  const resolutionTime = new Date(
    originalTimestamp.getTime() +
      faker.number.int({ min: 300000, max: 7200000 }), // 5 minutes to 2 hours later
  );

  return {
    ...alert,
    'kibana.alert.status': 'closed' as any,
    'kibana.alert.workflow_status': 'closed' as any,
    'kibana.alert.workflow_reason': reason,
    'kibana.alert.workflow_user': resolvedBy,
    'kibana.alert.workflow_updated_at': resolutionTime.toISOString(),
    // Add custom fields for false positive tracking
    'kibana.alert.false_positive': true,
    'kibana.alert.false_positive.category': selectedCategory,
    'kibana.alert.false_positive.analyst': resolvedBy,
    'kibana.alert.false_positive.resolution_time_minutes': Math.round(
      (resolutionTime.getTime() - originalTimestamp.getTime()) / 60000,
    ),
    // Add to rule false positives array for pattern analysis
    'kibana.alert.rule.false_positives': [
      ...(alert['kibana.alert.rule.false_positives'] as string[]),
      `${selectedCategory}: ${reason}`,
    ] as any,
    // Update event outcome for query filtering
    'event.outcome': 'false_positive',
  };
}

/**
 * Determines if an alert should be marked as a false positive based on the rate
 */
export function shouldMarkAsFalsePositive(falsePositiveRate: number): boolean {
  return faker.number.float() < falsePositiveRate;
}

/**
 * Applies false positive logic to an array of alerts
 */
export function applyFalsePositiveLogic(
  alerts: BaseCreateAlertsReturnType[],
  falsePositiveRate: number,
): ExtendedAlert[] {
  if (falsePositiveRate <= 0) {
    return alerts;
  }

  return alerts.map((alert) => {
    if (shouldMarkAsFalsePositive(falsePositiveRate)) {
      return markAlertAsFalsePositive(alert);
    }
    return alert;
  });
}

/**
 * Generates false positive statistics for reporting
 */
export function generateFalsePositiveStats(alerts: ExtendedAlert[]) {
  const falsePositives = alerts.filter(
    (alert) => alert['kibana.alert.false_positive'],
  );
  const total = alerts.length;

  if (falsePositives.length === 0) {
    return {
      total,
      falsePositives: 0,
      rate: 0,
      categories: {},
      avgResolutionTimeMinutes: 0,
    };
  }

  // Count by category
  const categories: Record<string, number> = {};
  let totalResolutionTime = 0;

  falsePositives.forEach((alert) => {
    const category = alert['kibana.alert.false_positive.category'] || 'unknown';
    categories[category] = (categories[category] || 0) + 1;
    totalResolutionTime +=
      alert['kibana.alert.false_positive.resolution_time_minutes'] || 0;
  });

  return {
    total,
    falsePositives: falsePositives.length,
    rate: ((falsePositives.length / total) * 100).toFixed(1),
    categories,
    avgResolutionTimeMinutes: Math.round(
      totalResolutionTime / falsePositives.length,
    ),
  };
}
