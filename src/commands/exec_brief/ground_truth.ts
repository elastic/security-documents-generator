import {
  DISCOVERIES,
  HOSTS,
  RULES,
  S1_ALERTS,
  S2_ALERTS,
  S3_ALERTS,
  USERS,
  buildNoiseAlerts,
  hostByKey,
  hostEuid,
  idpUserEuid,
  localUserEuid,
  serviceEuid,
  SERVICES,
  userByKey,
  type ScenarioAlert,
  type ScenarioUser,
} from './scenario.ts';
import { aliasHostsFor } from './entities.ts';
import { alertTimestamp, alertUuid } from './alerts.ts';
import type { InstalledRule } from './rules.ts';
import type { AdResult, CaseResult } from './extras.ts';
import { timeAt } from './utils.ts';

const alertSummary = (spec: ScenarioAlert, anchor: Date, rules: Map<string, InstalledRule>) => {
  const rule = rules.get(spec.ruleKey);
  const threat =
    (rule?.raw.threat as Array<{ tactic?: { id?: string; name?: string } }> | undefined) ?? [];
  return {
    key: spec.key,
    alertId: alertUuid(spec.key),
    timestamp: alertTimestamp(anchor, spec).toISOString(),
    rule: rule?.name,
    ruleId: rule?.ruleId,
    tacticIds: spec.ecsThreatOnly ? [] : threat.map((t) => t.tactic?.id).filter(Boolean),
    ecsTacticIds: spec.ecsThreatOnly ? ['TA0008'] : [],
    host: spec.hostKey,
    user: spec.userKey,
    status: spec.status,
  };
};

const userEntities = (user: ScenarioUser) => ({
  golden: idpUserEuid(user),
  aliases: aliasHostsFor(user).map((host) => localUserEuid(user, host)),
});

/** Ground truth for the Executive Brief evaluation scorecard (what the brief should find). */
export const buildGroundTruth = ({
  anchor,
  space,
  rules,
  ad,
  caseResult,
  leadId,
  mlEnabled,
  packages,
}: {
  anchor: Date;
  space: string;
  rules: Map<string, InstalledRule>;
  ad: AdResult;
  caseResult?: CaseResult;
  leadId?: string;
  mlEnabled: boolean;
  packages: Record<string, string>;
}) => {
  const rodriguez = userByKey('a.rodriguez');
  const chen = userByKey('j.chen');
  const svcBuild = userByKey('svc-build');
  const noiseUsers = USERS.filter((u) => u.storyline === 'noise');

  return {
    generatedAt: new Date().toISOString(),
    anchor: anchor.toISOString(),
    space,
    // Shape hints for poc-results/scripts/check_ground_truth.py (entity ids are display names there).
    checkerHints: {
      s1Entities: ['a.rodriguez', 'LAPTOP-FIN03', 'jump-box-01', 'docker-host-prod-01'],
      s2ResponseStatus: 'in_progress',
      attackStageFlags: { TA0008: ['limited_coverage'] },
      expectedGapIds: ['B5', 'B6'],
    },
    storylines: {
      S1: {
        label: 'Stolen privileged credentials -> jump box -> prod container escape',
        responseStatus: 'needs_action',
        goldenUser: userEntities(rodriguez),
        hosts: ['LAPTOP-FIN03', 'jump-box-01', 'docker-host-prod-01'].map((key) => ({
          name: key,
          entityId: hostEuid(hostByKey(key)),
          criticality: hostByKey(key).criticality,
        })),
        watchlist: 'privileged-user-monitoring',
        alerts: S1_ALERTS.map((a) => alertSummary(a, anchor, rules)),
        expectedTacticOrder: [
          'Initial Access (D-5)',
          'Credential Access (D-4)',
          'Lateral Movement (D-3)',
          'Privilege Escalation (D-2)',
          'Execution (D-1)',
        ],
        firstEverRelationships: [
          {
            actor: 'a.rodriguez',
            target: 'jump-box-01',
            kind: 'accesses_infrequently',
            firstSeen: timeAt(anchor, 3, 23).toISOString(),
          },
          {
            actor: 'a.rodriguez',
            target: 'docker-host-prod-01',
            kind: 'accesses_infrequently',
            firstSeen: timeAt(anchor, 2, 23).toISOString(),
          },
        ],
        attackDiscoveryId: ad.discoveryIds['s1-discovery'],
        attackDiscoveryAlertIds: S1_ALERTS.map((a) => alertUuid(a.key)),
        leadId,
        vulnerabilities: { 'docker-host-prod-01': { critical: 2, high: 1 } },
        riskTrend: 'rising D-5..D-1',
      },
      S2: {
        label: 'MFA bombing -> session hijack on a marketing user (handled)',
        responseStatus: 'being_handled',
        goldenUser: userEntities(chen),
        hosts: [{ name: 'LAPTOP-MKT07', entityId: hostEuid(hostByKey('LAPTOP-MKT07')) }],
        alerts: S2_ALERTS.map((a) => alertSummary(a, anchor, rules)),
        caseId: caseResult?.caseId,
        alertWorkflowStatus: 'acknowledged',
        attackDiscoveryId: ad.discoveryIds['s2-discovery'],
        note: 'owns LAPTOP-MKT07 set via CRUD bulk (no Entra feed); j.chen has no criticality (B6)',
      },
      S3: {
        label: 'SSH password spray -> curl exfiltration on a build server (no Attack Discovery)',
        responseStatus: 'open',
        goldenUser: userEntities(svcBuild),
        hosts: ['build-runner-02', 'fileserver-03'].map((key) => ({
          name: key,
          entityId: hostEuid(hostByKey(key)),
        })),
        alerts: S3_ALERTS.map((a) => alertSummary(a, anchor, rules)),
        attackDiscoveryId: null,
        note: 'threads only through co-alert, resolution and relationship edges',
      },
      noise: {
        mustNotFormStoryline: true,
        hosts: HOSTS.filter((h) => h.storyline === 'noise').length,
        users: noiseUsers.length,
        services: SERVICES.map(serviceEntityId),
        alerts: buildNoiseAlerts().map((a) => alertSummary(a, anchor, rules)),
        resolvedUsers: noiseUsers.filter((u) => u.resolve).map((u) => u.userName),
        unresolvedUsers: noiseUsers.filter((u) => !u.resolve).map((u) => u.userName),
      },
    },
    blindSpots: {
      lateralMovement: {
        tacticId: 'TA0008',
        expectedFlag: 'Limited coverage',
        workingRule: rules.get('sharprdp')?.name,
        enabledButIntegrationMissing: rules.get('rdp_internet')?.name,
        missingIntegrations: ['network_traffic'],
        edrPromotionAlert: alertUuid('s1-lm-edr'),
        edrPromotionCarries: 'ECS threat.tactic.id TA0008 only (kibana.alert.rule.threat is empty)',
        packages,
      },
      B5_unresolvedLocalUsers: noiseUsers.filter((u) => !u.resolve).map((u) => u.userName),
      B6_noCriticalityOnMaterialRiskEntity: {
        entity: idpUserEuid(rodriguez),
        note: 'S1 golden identity reaches High via resolution risk and has no asset.criticality (its aliases and hosts do)',
      },
      B12_mlNotRunning: !mlEnabled,
      v18Alias: {
        rule: rules.get('clear_logs')?.name,
        tacticNameOnAlerts: 'Defense Evasion',
        tacticId: 'TA0005',
      },
    },
    rules: RULES.map((rule) => {
      const installed = rules.get(rule.key);
      return {
        key: rule.key,
        name: installed?.name ?? rule.name,
        ruleId: installed?.ruleId ?? rule.ruleId,
        uuid: installed?.uuid,
        source: installed?.source,
        enabled: installed?.enabled,
        installedThreat: installed?.raw.threat,
      };
    }),
    discoveries: DISCOVERIES.map((d) => ({
      key: d.key,
      title: d.title,
      alertIds: d.alertKeys.map(alertUuid),
      id: ad.discoveryIds[d.key],
    })),
    sudoTechnique: 'T1548.003',
  };
};

const serviceEntityId = (service: { name: string }): string => serviceEuid(service);
