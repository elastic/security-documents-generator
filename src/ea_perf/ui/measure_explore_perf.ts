/**
 * Entity Analytics explore UI benchmarks (Playwright).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Page, Request, Response } from '@playwright/test';
import { chromium } from '@playwright/test';

import { getEaPerfResultsRoot } from '../../utils/data_paths.ts';
import { parseEnvFile } from '../../utils/env_file.ts';

export interface ApiCallRecord {
  url: string;
  method: string;
  durationMs: number;
  status: number;
}

export interface QueryStatRecord {
  url: string;
  method: string;
  status: number;
  endpoint: 'entity_store_entities' | 'search' | 'other';
  factoryQueryType?: string;
  hostName?: string;
  entityStoreTotal?: number;
  recordsReturned?: number;
  hitsTotal?: number;
  hostNameBucketDocCount?: number;
  timerangeFrom?: string;
  timerangeTo?: string;
  timerangeInterval?: string;
  rawSnippet?: string;
  from?: string;
  to?: string;
  query?: string;
}

export interface ScenarioResult {
  scenario: string;
  run: number;
  metrics: {
    timeToTableRendered?: number;
    timeToKpiRendered?: number;
    timeToDetailRendered?: number;
    timeToEntityIdRendered?: number;
    timeToFlyoutRendered?: number;
    networkRequestCount: number;
    apiCalls: ApiCallRecord[];
    queryStats?: QueryStatRecord[];
  };
  timestamp: string;
  kibanaUrl: string;
}

export interface MeasureExplorePerfResult {
  outputPath: string;
  results: ScenarioResult[];
}

interface EnvConfig {
  kibanaUrl: string;
  username: string;
  password: string;
}

export const SCENARIOS = [
  'hosts-list',
  'host-detail',
  'flyout',
  'flyout-comparison',
  'users-list',
  'user-detail',
  'flyout-user',
  'all',
] as const;
export type ScenarioName = (typeof SCENARIOS)[number];

export interface MeasureExplorePerfOptions {
  envFile: string;
  scenario?: ScenarioName;
  runs?: number;
  storeEntity?: string;
  observedEntity?: string;
  captureQueryStats?: boolean;
  outputDir?: string;
  headed?: boolean;
}

/** Hosts tab URL — `/app/security/hosts` redirects to the events tab, so target the explicit "All hosts" tab. */
const HOSTS_LIST_PATH = '/app/security/hosts/allHosts';
const USERS_LIST_PATH = '/app/security/users/allUsers';
const ALERTS_PATH = '/app/security/alerts';
const ALERTS_TIME_FROM = 'now-7d';
const ALERTS_TIME_TO = 'now';

const SELECTORS = {
  loginUsername: '[data-test-subj="loginUsername"]',
  loginPassword: '[data-test-subj="loginPassword"]',
  loginSubmit: '[data-test-subj="loginSubmit"]',
  loginBasicProvider: '[data-test-subj="loginCard-basic/cloud-basic"]',
  globalLoadingHidden: '[data-test-subj="globalLoadingIndicator-hidden"]',
  navCollapsible: '[data-test-subj="collapsibleNav"]',
  hostsTableLoaded: '[data-test-subj="paginated-basic-table"]',
  hostsKpiStatTitle: '[data-test-subj="hosts"] [data-test-subj="stat-title"]',
  hostRowLink: '[data-test-subj="host-details-button"]',
  hostDetailEntityId: '[data-test-subj="host-details-page-entity-id"]',
  hostDetailsPage: '[data-test-subj="hostDetailsPage"]',
  alertsTableLoaded: '[data-test-subj="alertsTableIsLoaded"]',
  expandEvent: '[data-test-subj="expand-event"]',
  alertFlyout: '[data-test-subj="securitySolutionFlyoutBody"]',
  alertFlyoutHostEntityLink: '[data-test-subj="securitySolutionFlyoutHighlightedFieldsLinkedCell"]',
  hostFlyoutHeader: '[data-test-subj="host-panel-header"]',
  hostFlyoutLastSeenLoading: '[data-test-subj="host-panel-header-lastSeen-loading"]',
  hostPanelObservedBadge: '[data-test-subj="host-panel-header-observed-badge"]',
  usersTableLoaded: '[data-test-subj="paginated-basic-table"]',
  usersKpiStatTitle: '[data-test-subj="users"] [data-test-subj="stat-title"]',
  userRowLink: '[data-test-subj="users-link-anchor"]',
  userDetailEntityId: '[data-test-subj="user-details-page-entity-id"]',
  userDetailsPage: '[data-test-subj="usersDetailsPage"]',
  alertFlyoutUserEntityLink: '[data-test-subj="securitySolutionFlyoutHighlightedFieldsLinkedCell"]',
  userFlyoutHeader: '[data-test-subj="user-panel-header"]',
  userFlyoutLastSeenLoading: '[data-test-subj="user-panel-header-lastSeen-loading"]',
} as const;

async function maybeLogin(page: Page, env: EnvConfig): Promise<void> {
  const username = page.locator(SELECTORS.loginUsername);
  if (page.url().includes('/login')) {
    const basicProvider = page.locator(SELECTORS.loginBasicProvider);
    if ((await basicProvider.count()) === 0 && (await username.count()) === 0) {
      await Promise.race([
        basicProvider.waitFor({ state: 'visible', timeout: 30_000 }),
        username.waitFor({ state: 'visible', timeout: 30_000 }),
      ]);
    }
    if ((await basicProvider.count()) > 0) {
      await basicProvider.click();
    }
    await username.waitFor({ state: 'visible', timeout: 30_000 });
  } else if ((await username.count()) === 0) {
    return;
  }

  await username.fill(env.username);
  await page.locator(SELECTORS.loginPassword).fill(env.password);
  await Promise.all([
    page.waitForURL(/\/app\//, { timeout: 120_000 }),
    page.locator(SELECTORS.loginSubmit).click(),
  ]);
  await page
    .locator(`${SELECTORS.globalLoadingHidden}, ${SELECTORS.navCollapsible}`)
    .first()
    .waitFor({ state: 'visible', timeout: 120_000 });
}

async function gotoWithLoginRetry(page: Page, env: EnvConfig, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await maybeLogin(page, env);
}

async function loadEnvFile(envPath: string): Promise<EnvConfig> {
  const map = parseEnvFile(envPath);
  const kibanaUrl = map.KIBANA_NODE ?? map.kibana_node;
  const username = map.KIBANA_USERNAME ?? map.kibana_username ?? 'elastic';
  const password = map.KIBANA_PASSWORD ?? map.kibana_password;
  if (!kibanaUrl) throw new Error('Env file must define KIBANA_NODE');
  if (!password) throw new Error('Env file must define KIBANA_PASSWORD');
  return {
    kibanaUrl: kibanaUrl.replace(/\/+$/, ''),
    username,
    password,
  };
}

function isTrackedApiUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname;
    return pathname.includes('/api/') || pathname.includes('/internal/');
  } catch {
    return false;
  }
}

function extractHitsTotal(value: unknown): number | undefined {
  if (value == null || typeof value !== 'object') return undefined;
  const obj = value as Record<string, unknown>;
  const hits = obj.hits;
  if (hits && typeof hits === 'object') {
    const total = (hits as Record<string, unknown>).total;
    if (typeof total === 'number') return total;
    if (total && typeof total === 'object') {
      const maybeValue = (total as Record<string, unknown>).value;
      if (typeof maybeValue === 'number') return maybeValue;
    }
  }
  for (const nested of Object.values(obj)) {
    const found = extractHitsTotal(nested);
    if (typeof found === 'number') return found;
  }
  return undefined;
}

function extractHitsTotalFromText(rawText: string): number | undefined {
  const objectStyle = rawText.match(/"total"\s*:\s*\{\s*"value"\s*:\s*(\d+)/);
  if (objectStyle) return Number(objectStyle[1]);
  const numberStyle = rawText.match(/"total"\s*:\s*(\d+)/);
  if (numberStyle) return Number(numberStyle[1]);
  return undefined;
}

function extractQueryAndRange(
  url: string,
  postData?: string,
): Pick<QueryStatRecord, 'from' | 'to' | 'query'> {
  const out: Pick<QueryStatRecord, 'from' | 'to' | 'query'> = {};
  try {
    const parsedUrl = new URL(url);
    out.from = parsedUrl.searchParams.get('from') ?? undefined;
    out.to = parsedUrl.searchParams.get('to') ?? undefined;
    out.query = parsedUrl.searchParams.get('query') ?? undefined;
  } catch {
    // ignore URL parse failures
  }

  if (!postData) return out;

  const fromMatch = postData.match(/"from"\s*:\s*"([^"]+)"/);
  const toMatch = postData.match(/"to"\s*:\s*"([^"]+)"/);
  const queryMatch = postData.match(/"query"\s*:\s*"([^"]+)"/);
  if (!out.from && fromMatch) out.from = fromMatch[1];
  if (!out.to && toMatch) out.to = toMatch[1];
  if (!out.query && queryMatch) out.query = queryMatch[1];
  return out;
}

function attachApiCollector(
  page: Page,
  captureQueryStats = false,
): {
  stop: () => void;
  snapshot: () => {
    apiCalls: ApiCallRecord[];
    networkRequestCount: number;
    queryStats: QueryStatRecord[];
  };
} {
  const starts = new WeakMap<Request, { startedAt: number; postData?: string }>();
  const apiCalls: ApiCallRecord[] = [];
  const queryStats: QueryStatRecord[] = [];

  const onRequest = (request: Request) => {
    if (!isTrackedApiUrl(request.url())) return;
    starts.set(request, { startedAt: Date.now(), postData: request.postData() ?? undefined });
  };

  const onResponse = async (response: Response) => {
    const request = response.request();
    const startInfo = starts.get(request);
    if (startInfo === undefined) return;
    starts.delete(request);
    const end = Date.now();
    const url = request.url();
    const method = request.method();
    apiCalls.push({
      url,
      method,
      durationMs: end - startInfo.startedAt,
      status: response.status(),
    });

    if (!captureQueryStats) return;

    const isEntityStoreEntities = url.includes('/api/security/entity_store/entities');
    const isSearchEndpoint =
      url.includes('/internal/search') ||
      url.includes('/internal/bsearch') ||
      url.includes('/api/detection_engine/signals');

    if (!isEntityStoreEntities && !isSearchEndpoint) return;

    const base = extractQueryAndRange(url, startInfo.postData);
    const entry: QueryStatRecord = {
      url,
      method,
      status: response.status(),
      endpoint: isEntityStoreEntities ? 'entity_store_entities' : 'search',
      ...base,
    };

    try {
      const rawText = await response.text();
      const body = rawText ? (JSON.parse(rawText) as unknown) : undefined;
      if (isEntityStoreEntities && body && typeof body === 'object') {
        const payload = body as { total?: unknown; records?: unknown[] };
        if (typeof payload.total === 'number') entry.entityStoreTotal = payload.total;
        if (Array.isArray(payload.records)) entry.recordsReturned = payload.records.length;
      } else if (isSearchEndpoint) {
        entry.hitsTotal = extractHitsTotal(body) ?? extractHitsTotalFromText(rawText);
        if (startInfo.postData != null) {
          try {
            const requestBody = JSON.parse(startInfo.postData) as {
              factoryQueryType?: string;
              hostName?: string;
              timerange?: { from?: string; to?: string; interval?: string };
            };
            entry.factoryQueryType = requestBody.factoryQueryType;
            entry.hostName = requestBody.hostName;
            entry.timerangeFrom = requestBody.timerange?.from;
            entry.timerangeTo = requestBody.timerange?.to;
            entry.timerangeInterval = requestBody.timerange?.interval;
          } catch {
            // ignore malformed request payload
          }
          if (entry.factoryQueryType === 'hostDetails' && body && typeof body === 'object') {
            const rawResponse = (body as Record<string, unknown>).rawResponse;
            if (rawResponse && typeof rawResponse === 'object') {
              const aggs = (rawResponse as Record<string, unknown>).aggregations;
              if (aggs && typeof aggs === 'object') {
                const hostNameAgg = (aggs as Record<string, unknown>).host_name;
                if (hostNameAgg && typeof hostNameAgg === 'object') {
                  const buckets = (hostNameAgg as Record<string, unknown>).buckets;
                  if (Array.isArray(buckets) && buckets.length > 0) {
                    const first = buckets[0] as Record<string, unknown>;
                    if (typeof first.doc_count === 'number') {
                      entry.hostNameBucketDocCount = first.doc_count;
                    }
                  }
                }
              }
            }
          }
        }
        if (
          entry.hitsTotal === undefined &&
          url.includes('/internal/search/securitySolutionSearchStrategy')
        ) {
          entry.rawSnippet = rawText.slice(0, 500);
        }
      }
    } catch {
      // response may not be JSON; keep URL/status metadata only
    }
    queryStats.push(entry);
  };

  page.on('request', onRequest);
  page.on('response', onResponse);

  return {
    stop: () => {
      page.off('request', onRequest);
      page.off('response', onResponse);
    },
    snapshot: () => ({
      apiCalls: [...apiCalls],
      networkRequestCount: apiCalls.length,
      queryStats: [...queryStats],
    }),
  };
}

async function login(page: Page, env: EnvConfig): Promise<void> {
  await gotoWithLoginRetry(page, env, `${env.kibanaUrl}/login`);
}

async function resetBetweenRuns(page: Page, env: EnvConfig): Promise<void> {
  await gotoWithLoginRetry(page, env, `${env.kibanaUrl}/app/home`);
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

function nowIso(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function scenariosToRun(scenario: ScenarioName): Exclude<ScenarioName, 'all'>[] {
  if (scenario === 'all') {
    return [
      'hosts-list',
      'host-detail',
      'flyout',
      'flyout-comparison',
      'users-list',
      'user-detail',
      'flyout-user',
    ];
  }
  return [scenario];
}

function buildAlertsUrl(env: EnvConfig): string {
  const search = new URLSearchParams();
  search.set('from', ALERTS_TIME_FROM);
  search.set('to', ALERTS_TIME_TO);
  return `${env.kibanaUrl}${ALERTS_PATH}?${search.toString()}`;
}

function asHostNameKql(entityName: string): string {
  return `host.name: "${entityName.replace(/"/g, '\\"')}"`;
}

async function applyAlertsHostFilter(page: Page, entityName: string): Promise<void> {
  const query = asHostNameKql(entityName);
  const queryInput = page.locator('[data-test-subj="unifiedQueryInput"]');
  await queryInput.waitFor({ state: 'visible', timeout: 60_000 });
  await queryInput.click();
  await page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+A`);
  await page.keyboard.type(query);
  await page.locator('[data-test-subj="querySubmitButton"]').click();
}

async function setAlertsTimeRangeToLast7Days(page: Page): Promise<void> {
  await page.locator('[data-test-subj="superDatePickerShowDatesButton"]').click();
  await page.locator('[data-test-subj="superDatePickerToggleQuickMenuButton"]').click();
  await page.locator('[data-test-subj="superDatePickerCommonlyUsed_Last_7 days"]').click();
  await page.keyboard.press('Escape');
}

async function warmUpHostsList(page: Page, env: EnvConfig): Promise<void> {
  await gotoWithLoginRetry(page, env, `${env.kibanaUrl}${HOSTS_LIST_PATH}`);
  await page.locator(SELECTORS.hostsTableLoaded).waitFor({ state: 'visible', timeout: 120_000 });
}

async function measureHostsList(
  page: Page,
  env: EnvConfig,
  run: number,
  record: boolean,
  captureQueryStats: boolean,
): Promise<ScenarioResult> {
  const collector = attachApiCollector(page, captureQueryStats);
  const t0 = Date.now();
  await gotoWithLoginRetry(page, env, `${env.kibanaUrl}${HOSTS_LIST_PATH}`);

  await page.locator(SELECTORS.hostsTableLoaded).waitFor({ state: 'visible', timeout: 120_000 });
  const timeToTableRendered = Date.now() - t0;

  await page
    .locator(SELECTORS.hostsKpiStatTitle)
    .first()
    .waitFor({ state: 'visible', timeout: 120_000 });
  const timeToKpiRendered = Date.now() - t0;

  const snap = collector.snapshot();
  collector.stop();

  return {
    scenario: 'hosts-list',
    run,
    metrics: {
      timeToTableRendered,
      timeToKpiRendered,
      networkRequestCount: record ? snap.networkRequestCount : 0,
      apiCalls: record ? snap.apiCalls : [],
      queryStats: record ? snap.queryStats : [],
    },
    timestamp: new Date().toISOString(),
    kibanaUrl: env.kibanaUrl,
  };
}

async function measureHostDetail(
  page: Page,
  env: EnvConfig,
  run: number,
  record: boolean,
  captureQueryStats: boolean,
): Promise<ScenarioResult> {
  const collector = attachApiCollector(page, captureQueryStats);
  await gotoWithLoginRetry(page, env, `${env.kibanaUrl}${HOSTS_LIST_PATH}`);
  await page.locator(SELECTORS.hostsTableLoaded).waitFor({ state: 'visible', timeout: 120_000 });

  const rowLink = page.locator(SELECTORS.hostRowLink).first();
  await rowLink.waitFor({ state: 'visible', timeout: 60_000 });

  const tClick = Date.now();
  await rowLink.click();

  await page.locator(SELECTORS.hostDetailsPage).waitFor({ state: 'visible', timeout: 120_000 });
  const timeToDetailRendered = Date.now() - tClick;

  await page.locator(SELECTORS.hostDetailEntityId).waitFor({ state: 'visible', timeout: 120_000 });
  const timeToEntityIdRendered = Date.now() - tClick;

  const snap = collector.snapshot();
  collector.stop();

  return {
    scenario: 'host-detail',
    run,
    metrics: {
      timeToDetailRendered,
      timeToEntityIdRendered,
      networkRequestCount: record ? snap.networkRequestCount : 0,
      apiCalls: record ? snap.apiCalls : [],
      queryStats: record ? snap.queryStats : [],
    },
    timestamp: new Date().toISOString(),
    kibanaUrl: env.kibanaUrl,
  };
}

async function measureFlyout(
  page: Page,
  env: EnvConfig,
  run: number,
  record: boolean,
  captureQueryStats: boolean,
): Promise<ScenarioResult> {
  const collector = attachApiCollector(page, captureQueryStats);
  await gotoWithLoginRetry(page, env, buildAlertsUrl(env));
  await page.locator(SELECTORS.alertsTableLoaded).waitFor({ state: 'visible', timeout: 120_000 });
  await setAlertsTimeRangeToLast7Days(page);

  const expandBtn = page
    .locator(SELECTORS.alertsTableLoaded)
    .locator(SELECTORS.expandEvent)
    .first();
  await expandBtn.waitFor({ state: 'visible', timeout: 60_000 });
  await expandBtn.click();

  await page.locator(SELECTORS.alertFlyout).waitFor({ state: 'visible', timeout: 60_000 });

  const hostEntityLink = page
    .locator(SELECTORS.alertFlyoutHostEntityLink)
    .filter({ hasText: /host/i })
    .first();
  await hostEntityLink.waitFor({ state: 'visible', timeout: 60_000 });

  const tClick = Date.now();
  await hostEntityLink.click();

  await page.locator(SELECTORS.hostFlyoutHeader).waitFor({ state: 'visible', timeout: 120_000 });
  await page
    .locator(SELECTORS.hostFlyoutLastSeenLoading)
    .waitFor({ state: 'hidden', timeout: 120_000 });

  const timeToFlyoutRendered = Date.now() - tClick;

  const snap = collector.snapshot();
  collector.stop();

  return {
    scenario: 'flyout',
    run,
    metrics: {
      timeToFlyoutRendered,
      networkRequestCount: record ? snap.networkRequestCount : 0,
      apiCalls: record ? snap.apiCalls : [],
      queryStats: record ? snap.queryStats : [],
    },
    timestamp: new Date().toISOString(),
    kibanaUrl: env.kibanaUrl,
  };
}

async function warmUpUsersList(page: Page, env: EnvConfig): Promise<void> {
  await gotoWithLoginRetry(page, env, `${env.kibanaUrl}${USERS_LIST_PATH}`);
  await page.locator(SELECTORS.usersTableLoaded).waitFor({ state: 'visible', timeout: 120_000 });
}

async function measureUsersList(
  page: Page,
  env: EnvConfig,
  run: number,
  record: boolean,
  captureQueryStats: boolean,
): Promise<ScenarioResult> {
  const collector = attachApiCollector(page, captureQueryStats);
  const t0 = Date.now();
  await gotoWithLoginRetry(page, env, `${env.kibanaUrl}${USERS_LIST_PATH}`);

  await page.locator(SELECTORS.usersTableLoaded).waitFor({ state: 'visible', timeout: 120_000 });
  const timeToTableRendered = Date.now() - t0;

  await page
    .locator(SELECTORS.usersKpiStatTitle)
    .first()
    .waitFor({ state: 'visible', timeout: 120_000 });
  const timeToKpiRendered = Date.now() - t0;

  const snap = collector.snapshot();
  collector.stop();

  return {
    scenario: 'users-list',
    run,
    metrics: {
      timeToTableRendered,
      timeToKpiRendered,
      networkRequestCount: record ? snap.networkRequestCount : 0,
      apiCalls: record ? snap.apiCalls : [],
      queryStats: record ? snap.queryStats : [],
    },
    timestamp: new Date().toISOString(),
    kibanaUrl: env.kibanaUrl,
  };
}

async function measureUserDetail(
  page: Page,
  env: EnvConfig,
  run: number,
  record: boolean,
  captureQueryStats: boolean,
): Promise<ScenarioResult> {
  const collector = attachApiCollector(page, captureQueryStats);
  await gotoWithLoginRetry(page, env, `${env.kibanaUrl}${USERS_LIST_PATH}`);
  await page.locator(SELECTORS.usersTableLoaded).waitFor({ state: 'visible', timeout: 120_000 });

  const rowLink = page.locator(SELECTORS.userRowLink).first();
  await rowLink.waitFor({ state: 'visible', timeout: 60_000 });

  const tClick = Date.now();
  await rowLink.click();

  await page.locator(SELECTORS.userDetailsPage).waitFor({ state: 'visible', timeout: 120_000 });
  const timeToDetailRendered = Date.now() - tClick;

  await page.locator(SELECTORS.userDetailEntityId).waitFor({ state: 'visible', timeout: 120_000 });
  const timeToEntityIdRendered = Date.now() - tClick;

  const snap = collector.snapshot();
  collector.stop();

  return {
    scenario: 'user-detail',
    run,
    metrics: {
      timeToDetailRendered,
      timeToEntityIdRendered,
      networkRequestCount: record ? snap.networkRequestCount : 0,
      apiCalls: record ? snap.apiCalls : [],
      queryStats: record ? snap.queryStats : [],
    },
    timestamp: new Date().toISOString(),
    kibanaUrl: env.kibanaUrl,
  };
}

async function measureUserFlyout(
  page: Page,
  env: EnvConfig,
  run: number,
  record: boolean,
  captureQueryStats: boolean,
): Promise<ScenarioResult> {
  const collector = attachApiCollector(page, captureQueryStats);
  await gotoWithLoginRetry(page, env, buildAlertsUrl(env));
  await page.locator(SELECTORS.alertsTableLoaded).waitFor({ state: 'visible', timeout: 120_000 });
  await setAlertsTimeRangeToLast7Days(page);

  const expandBtn = page
    .locator(SELECTORS.alertsTableLoaded)
    .locator(SELECTORS.expandEvent)
    .first();
  await expandBtn.waitFor({ state: 'visible', timeout: 60_000 });
  await expandBtn.click();

  await page.locator(SELECTORS.alertFlyout).waitFor({ state: 'visible', timeout: 60_000 });

  const userEntityLink = page
    .locator(SELECTORS.alertFlyoutUserEntityLink)
    .filter({ hasText: /user/i })
    .first();
  await userEntityLink.waitFor({ state: 'visible', timeout: 60_000 });

  const tClick = Date.now();
  await userEntityLink.click();

  await page.locator(SELECTORS.userFlyoutHeader).waitFor({ state: 'visible', timeout: 120_000 });
  await page
    .locator(SELECTORS.userFlyoutLastSeenLoading)
    .waitFor({ state: 'hidden', timeout: 120_000 });

  const timeToFlyoutRendered = Date.now() - tClick;

  const snap = collector.snapshot();
  collector.stop();

  return {
    scenario: 'flyout-user',
    run,
    metrics: {
      timeToFlyoutRendered,
      networkRequestCount: record ? snap.networkRequestCount : 0,
      apiCalls: record ? snap.apiCalls : [],
      queryStats: record ? snap.queryStats : [],
    },
    timestamp: new Date().toISOString(),
    kibanaUrl: env.kibanaUrl,
  };
}

async function measureFlyoutForEntity(
  page: Page,
  env: EnvConfig,
  run: number,
  entityName: string,
  scenarioName: 'flyout-entity-store' | 'flyout-observed',
  record: boolean,
  captureQueryStats: boolean,
): Promise<{ result: ScenarioResult; badge: string | null }> {
  const collector = attachApiCollector(page, captureQueryStats);
  await gotoWithLoginRetry(page, env, buildAlertsUrl(env));
  await page.locator(SELECTORS.alertsTableLoaded).waitFor({ state: 'visible', timeout: 120_000 });
  await setAlertsTimeRangeToLast7Days(page);
  await applyAlertsHostFilter(page, entityName);

  const alertsTable = page.locator(SELECTORS.alertsTableLoaded);
  await alertsTable.waitFor({ state: 'visible', timeout: 120_000 });
  await page.waitForTimeout(2000);
  await alertsTable.waitFor({ state: 'visible', timeout: 30_000 });

  const expandCount = await alertsTable.locator(SELECTORS.expandEvent).count();
  if (expandCount === 0) {
    const tableText = await alertsTable.innerText();
    if (!tableText.includes(entityName)) {
      throw new Error(
        `No alerts found for host "${entityName}" after filter (table empty or filter did not apply)`,
      );
    }
  }

  const expandBtn = alertsTable.locator(SELECTORS.expandEvent).first();
  await expandBtn.waitFor({ state: 'visible', timeout: 60_000 });
  await expandBtn.click();

  await page.locator(SELECTORS.alertFlyout).waitFor({ state: 'visible', timeout: 60_000 });

  const hostEntityLink = page
    .locator(SELECTORS.alertFlyoutHostEntityLink)
    .filter({ hasText: /host/i })
    .first();
  await hostEntityLink.waitFor({ state: 'visible', timeout: 60_000 });

  const tClick = Date.now();
  await hostEntityLink.click();

  await page.locator(SELECTORS.hostFlyoutHeader).waitFor({ state: 'visible', timeout: 120_000 });
  await page
    .locator(SELECTORS.hostFlyoutLastSeenLoading)
    .waitFor({ state: 'hidden', timeout: 120_000 });

  if (captureQueryStats) {
    await page.waitForTimeout(1500);
  }
  const timeToFlyoutRendered = Date.now() - tClick;

  let badge: string | null = null;
  const badgeLocator = page.locator(SELECTORS.hostPanelObservedBadge).first();
  if ((await badgeLocator.count()) > 0) {
    const text = await badgeLocator.textContent();
    badge = text?.trim() || null;
  }

  const snap = collector.snapshot();
  collector.stop();

  return {
    result: {
      scenario: scenarioName,
      run,
      metrics: {
        timeToFlyoutRendered,
        networkRequestCount: record ? snap.networkRequestCount : 0,
        apiCalls: record ? snap.apiCalls : [],
        queryStats: record ? snap.queryStats : [],
      },
      timestamp: new Date().toISOString(),
      kibanaUrl: env.kibanaUrl,
    },
    badge,
  };
}

async function measureFlyoutComparison(
  page: Page,
  env: EnvConfig,
  run: number,
  storeEntity: string,
  observedEntity: string,
  captureQueryStats: boolean,
): Promise<{
  storeResult: ScenarioResult;
  observedResult: ScenarioResult;
  storeBadge: string | null;
  observedBadge: string | null;
}> {
  const storeMeasurement = await measureFlyoutForEntity(
    page,
    env,
    run,
    storeEntity,
    'flyout-entity-store',
    true,
    captureQueryStats,
  );

  await resetBetweenRuns(page, env);

  const observedMeasurement = await measureFlyoutForEntity(
    page,
    env,
    run,
    observedEntity,
    'flyout-observed',
    true,
    captureQueryStats,
  );

  return {
    storeResult: storeMeasurement.result,
    observedResult: observedMeasurement.result,
    storeBadge: storeMeasurement.badge,
    observedBadge: observedMeasurement.badge,
  };
}

function primaryMetricForScenario(result: ScenarioResult): number | undefined {
  switch (result.scenario) {
    case 'hosts-list':
    case 'users-list':
      return result.metrics.timeToTableRendered;
    case 'host-detail':
    case 'user-detail':
      return result.metrics.timeToEntityIdRendered ?? result.metrics.timeToDetailRendered;
    case 'flyout':
    case 'flyout-user':
    case 'flyout-entity-store':
    case 'flyout-observed':
      return result.metrics.timeToFlyoutRendered;
    default:
      return undefined;
  }
}

async function dispatchScenario(
  scenario: string,
  page: Page,
  env: EnvConfig,
  run: number,
  captureQueryStats: boolean,
): Promise<ScenarioResult> {
  switch (scenario) {
    case 'hosts-list':
      return measureHostsList(page, env, run, true, captureQueryStats);
    case 'host-detail':
      return measureHostDetail(page, env, run, true, captureQueryStats);
    case 'flyout':
      return measureFlyout(page, env, run, true, captureQueryStats);
    case 'users-list':
      return measureUsersList(page, env, run, true, captureQueryStats);
    case 'user-detail':
      return measureUserDetail(page, env, run, true, captureQueryStats);
    case 'flyout-user':
      return measureUserFlyout(page, env, run, true, captureQueryStats);
    default:
      throw new Error(`Unknown scenario: ${scenario}`);
  }
}

const defaultOutputDir = () => path.join(getEaPerfResultsRoot(), 'explore_flyout', 'results');

export async function measureExplorePerf(
  options: MeasureExplorePerfOptions,
): Promise<MeasureExplorePerfResult> {
  const scenario = options.scenario ?? 'all';
  const runs = options.runs ?? 3;
  const storeEntity = options.storeEntity ?? 'perf-store-host-1';
  const observedEntity = options.observedEntity ?? 'perf-observed-host-1';
  const captureQueryStats = options.captureQueryStats ?? false;
  const outputDir = options.outputDir ? path.resolve(options.outputDir) : defaultOutputDir();
  const headed = options.headed ?? false;

  const env = await loadEnvFile(path.resolve(options.envFile));
  const toRun = scenariosToRun(scenario);

  await mkdir(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: !headed });
  const context = await browser.newContext({
    httpCredentials: {
      username: env.username,
      password: env.password,
    },
  });
  const page = await context.newPage();

  try {
    await login(page, env);
    const hasHostScenarios = toRun.some(
      (s) => s.startsWith('host') || s === 'flyout' || s === 'flyout-comparison',
    );
    const hasUserScenarios = toRun.some((s) => s.startsWith('user') || s === 'flyout-user');
    if (hasHostScenarios) {
      await warmUpHostsList(page, env);
      await resetBetweenRuns(page, env);
    }
    if (hasUserScenarios) {
      await warmUpUsersList(page, env);
      await resetBetweenRuns(page, env);
    }

    const allResults: ScenarioResult[] = [];

    for (const currentScenario of toRun) {
      for (let measuredRun = 1; measuredRun <= runs; measuredRun++) {
        if (measuredRun > 1 || currentScenario !== toRun[0]) {
          await resetBetweenRuns(page, env);
        }

        if (currentScenario === 'flyout-comparison') {
          const comparison = await measureFlyoutComparison(
            page,
            env,
            measuredRun,
            storeEntity,
            observedEntity,
            captureQueryStats,
          );
          allResults.push(comparison.storeResult, comparison.observedResult);
          process.stderr.write(
            `[flyout-comparison run ${measuredRun}/${runs}] store=${comparison.storeResult.metrics.timeToFlyoutRendered ?? 'n/a'}ms (${comparison.storeBadge ?? 'badge-missing'}), observed=${comparison.observedResult.metrics.timeToFlyoutRendered ?? 'n/a'}ms (${comparison.observedBadge ?? 'badge-missing'})\n`,
          );
          continue;
        }

        const result = await dispatchScenario(
          currentScenario,
          page,
          env,
          measuredRun,
          captureQueryStats,
        );
        allResults.push(result);
        const primaryMetric = primaryMetricForScenario(result);
        process.stderr.write(
          `[${currentScenario} run ${measuredRun}/${runs}] primary=${primaryMetric ?? 'n/a'}ms network=${result.metrics.networkRequestCount}\n`,
        );
      }

      await resetBetweenRuns(page, env);
    }

    const outName = `${scenario}_${nowIso()}.json`;
    const outputPath = path.join(outputDir, outName);
    const payload = { results: allResults, recordedAt: new Date().toISOString() };
    await writeFile(outputPath, JSON.stringify(payload, null, 2), 'utf8');
    process.stderr.write(`Wrote ${outputPath}\n`);
    return { outputPath, results: allResults };
  } finally {
    await browser.close();
  }
}
