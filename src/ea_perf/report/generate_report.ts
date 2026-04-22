import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

type NumberStats = {
  values: number[];
  min: number;
  median: number;
  max: number;
};

type TierSummary = {
  label: string;
  dir: string;
  params: Record<string, unknown> | null;
  entityCount: number | null;
  alertCount: number | null;
  hardwareProfile: string;
  uiScenarios: Record<string, NumberStats>;
  backend: Partial<
    Record<
      'risk_scoring' | 'risk_scoring_resolution' | 'lead_generation' | 'watchlists',
      NumberStats
    >
  >;
  monitoring: Record<string, MonitoringWindowSummary>;
  notes: string[];
};

type MonitoringPointEs = {
  timestamp: string;
  jvmHeapUsedPct: number;
};

type MonitoringPointKibana = {
  timestamp: string;
  eventLoopUtilization: number;
};

type MonitoringWindowSummary = {
  window: { start: string; end: string };
  elasticsearch: MonitoringPointEs[];
  kibana: MonitoringPointKibana[];
};

export interface GenerateEaPerfReportOptions {
  input: string;
  output: string;
  findings?: string;
}

export interface GenerateEaPerfReportResult {
  outputPath: string;
  tierCount: number;
  notes: string[];
}

const UI_SCENARIOS = [
  'hosts-list',
  'host-detail',
  'flyout',
  'flyout-comparison',
  'users-list',
  'user-detail',
  'flyout-user',
] as const;

const UI_PRIMARY_SCENARIO_MAP: Record<string, string[]> = {
  'hosts-list': ['hosts-list'],
  'host-detail': ['host-detail'],
  flyout: ['flyout'],
  'flyout-comparison': ['flyout-entity-store', 'flyout-observed'],
  'users-list': ['users-list'],
  'user-detail': ['user-detail'],
  'flyout-user': ['flyout-user'],
};

const expandHome = (input: string): string =>
  input.startsWith('~/') ? path.join(os.homedir(), input.slice(2)) : input;

const toFiniteNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

const stats = (values: number[]): NumberStats => ({
  values,
  min: Math.min(...values),
  median: median(values),
  max: Math.max(...values),
});

const safeReadJson = async (filePath: string): Promise<unknown | null> => {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as unknown;
  } catch {
    return null;
  }
};

const extractNested = (obj: unknown, dottedPath: string): unknown =>
  dottedPath.split('.').reduce<unknown>((cursor, key) => {
    if (typeof cursor !== 'object' || cursor === null) return undefined;
    return (cursor as Record<string, unknown>)[key];
  }, obj);

const unwrapLatestRun = (parsed: unknown): unknown => {
  if (Array.isArray(parsed) && parsed.length > 0) {
    return parsed[parsed.length - 1];
  }
  return parsed;
};

const extractUiMetricFromResults = (result: Record<string, unknown>): number | undefined => {
  const scenario = typeof result.scenario === 'string' ? result.scenario : '';
  const metrics = (result.metrics ?? {}) as Record<string, unknown>;
  if (scenario === 'hosts-list' || scenario === 'users-list') {
    return toFiniteNumber(metrics.timeToTableRendered);
  }
  if (scenario === 'host-detail' || scenario === 'user-detail') {
    return (
      toFiniteNumber(metrics.timeToEntityIdRendered) ?? toFiniteNumber(metrics.timeToDetailRendered)
    );
  }
  if (scenario.startsWith('flyout')) {
    return toFiniteNumber(metrics.timeToFlyoutRendered);
  }
  return undefined;
};

const extractUiRunMetric = (parsed: unknown, scenarioFolder: string): number | undefined => {
  const source = parsed as Record<string, unknown>;
  const summary = Array.isArray(source.summary)
    ? (source.summary as Array<Record<string, unknown>>)
    : [];
  const allowedScenarios = UI_PRIMARY_SCENARIO_MAP[scenarioFolder] ?? [scenarioFolder];
  for (const scenario of allowedScenarios) {
    const entry = summary.find((item) => item.scenario === scenario);
    const metric = toFiniteNumber(entry?.median);
    if (metric !== undefined) {
      return metric;
    }
  }

  const results = Array.isArray(source.results)
    ? (source.results as Array<Record<string, unknown>>)
    : [];
  const values = results
    .filter((item) => allowedScenarios.includes(String(item.scenario)))
    .map(extractUiMetricFromResults)
    .filter((value): value is number => value !== undefined);
  if (values.length > 0) {
    return median(values);
  }
  return undefined;
};

const extractRiskScoringMetricMs = (parsed: unknown): number | undefined => {
  const source = unwrapLatestRun(parsed);
  return toFiniteNumber(extractNested(source, 'maintainer_api.wall_clock_duration_seconds')) !==
    undefined
    ? toFiniteNumber(extractNested(source, 'maintainer_api.wall_clock_duration_seconds'))! * 1000
    : toFiniteNumber(extractNested(source, 'maintainer_api.curl_total_time_seconds')) !== undefined
      ? toFiniteNumber(extractNested(source, 'maintainer_api.curl_total_time_seconds'))! * 1000
      : (toFiniteNumber(extractNested(source, 'durationMs')) ??
        toFiniteNumber(extractNested(source, 'maintainerTotals.durationMs')) ??
        toFiniteNumber(extractNested(source, 'tier1.totalDurationMs')));
};

const extractLeadGenerationMetricMs = (parsed: unknown): number | undefined => {
  const source = unwrapLatestRun(parsed);
  return (
    toFiniteNumber(extractNested(source, 'pipeline.totalPipelineMs')) ??
    toFiniteNumber(extractNested(source, 'pipeline.enginePipelineMs')) ??
    toFiniteNumber(extractNested(source, 'durationMs'))
  );
};

const extractWatchlistMetricMs = (parsed: unknown): number | undefined => {
  const source = unwrapLatestRun(parsed);
  const attempts = extractNested(source, 'attempts');
  if (Array.isArray(attempts)) {
    const attemptDurations = attempts
      .map((attempt) => {
        const approxSeconds = toFiniteNumber(
          extractNested(attempt, 'approx_sync_duration_seconds_from_trigger'),
        );
        if (approxSeconds !== undefined) return approxSeconds * 1000;
        const triggerSeconds = toFiniteNumber(extractNested(attempt, 'sync_trigger_http_seconds'));
        if (triggerSeconds !== undefined) return triggerSeconds * 1000;
        return undefined;
      })
      .filter((value): value is number => value !== undefined);
    if (attemptDurations.length > 0) {
      return Math.max(...attemptDurations);
    }
  }
  const setupSeconds = toFiniteNumber(extractNested(source, 'scenario_setup.duration_seconds'));
  if (setupSeconds !== undefined) return setupSeconds * 1000;
  return toFiniteNumber(extractNested(source, 'durationMs'));
};

const collectRunValues = async (
  featureDir: string,
  extractor: (parsed: unknown) => number | undefined,
): Promise<number[]> => {
  let runEntries: string[];
  try {
    runEntries = (await readdir(featureDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('run-'))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }

  const values: number[] = [];
  for (const runDir of runEntries) {
    const metricsPath = path.join(featureDir, runDir, 'metrics.json');
    const parsed = await safeReadJson(metricsPath);
    if (parsed === null) continue;
    const value = extractor(parsed);
    if (value !== undefined) {
      values.push(value);
    }
  }
  return values;
};

const inferEntityCount = (params: Record<string, unknown> | null): number | null => {
  if (!params) return null;
  const preferredKeys = [
    'entityCount',
    'entities',
    'entity_count',
    'totalEntities',
    'entityVolume',
    'users',
    'hosts',
  ];
  for (const key of preferredKeys) {
    const value = toFiniteNumber(params[key]);
    if (value !== undefined) {
      return value;
    }
  }
  return null;
};

const inferAlertCount = (params: Record<string, unknown> | null): number | null => {
  if (!params) return null;
  const preferredKeys = ['alertCount', 'alerts', 'alert_count', 'alertsPerEntity', 'totalAlerts'];
  for (const key of preferredKeys) {
    const value = toFiniteNumber(params[key]);
    if (value !== undefined) {
      return value;
    }
  }
  return null;
};

const inferHardwareProfile = (params: Record<string, unknown> | null): string => {
  if (!params) return 'Unknown';
  const candidates = ['hardwareProfile', 'profile', 'deployment', 'environment', 'host'];
  for (const key of candidates) {
    const value = params[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }
  return 'Unknown';
};

const parseMonitoringWindow = (parsed: unknown): MonitoringWindowSummary | null => {
  if (typeof parsed !== 'object' || parsed === null) return null;
  const source = parsed as Record<string, unknown>;
  const window = source.window as { start?: string; end?: string } | undefined;
  const elasticsearchRaw = Array.isArray(source.elasticsearch) ? source.elasticsearch : [];
  const kibanaRaw = Array.isArray(source.kibana) ? source.kibana : [];

  const elasticsearch = elasticsearchRaw
    .map((item) => ({
      timestamp:
        typeof extractNested(item, 'timestamp') === 'string'
          ? String(extractNested(item, 'timestamp'))
          : '',
      jvmHeapUsedPct: toFiniteNumber(extractNested(item, 'jvmHeapUsedPct')) ?? 0,
    }))
    .filter((item) => item.timestamp.length > 0);

  const kibana = kibanaRaw
    .map((item) => ({
      timestamp:
        typeof extractNested(item, 'timestamp') === 'string'
          ? String(extractNested(item, 'timestamp'))
          : '',
      eventLoopUtilization: toFiniteNumber(extractNested(item, 'eventLoopUtilization')) ?? 0,
    }))
    .filter((item) => item.timestamp.length > 0);

  return {
    window: {
      start: typeof window?.start === 'string' ? window.start : '',
      end: typeof window?.end === 'string' ? window.end : '',
    },
    elasticsearch,
    kibana,
  };
};

const tierSortOrder = (left: string, right: string): number => {
  const order = ['small', 'p90', 'p95'];
  const leftIndex = order.indexOf(left);
  const rightIndex = order.indexOf(right);
  if (leftIndex !== -1 || rightIndex !== -1) {
    return (leftIndex === -1 ? 999 : leftIndex) - (rightIndex === -1 ? 999 : rightIndex);
  }
  return left.localeCompare(right);
};

const markdownToHtml = (markdown: string): string => {
  const escaped = markdown.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const lines = escaped.split('\n');
  const rendered: string[] = [];
  let inList = false;
  for (const line of lines) {
    if (line.startsWith('### ')) {
      if (inList) {
        rendered.push('</ul>');
        inList = false;
      }
      rendered.push(`<h3>${line.slice(4)}</h3>`);
      continue;
    }
    if (line.startsWith('## ')) {
      if (inList) {
        rendered.push('</ul>');
        inList = false;
      }
      rendered.push(`<h2>${line.slice(3)}</h2>`);
      continue;
    }
    if (line.startsWith('# ')) {
      if (inList) {
        rendered.push('</ul>');
        inList = false;
      }
      rendered.push(`<h1>${line.slice(2)}</h1>`);
      continue;
    }
    if (line.startsWith('- ')) {
      if (!inList) {
        rendered.push('<ul>');
        inList = true;
      }
      rendered.push(`<li>${line.slice(2)}</li>`);
      continue;
    }
    if (line.trim() === '') {
      if (inList) {
        rendered.push('</ul>');
        inList = false;
      }
      rendered.push('<p></p>');
      continue;
    }
    if (inList) {
      rendered.push('</ul>');
      inList = false;
    }
    rendered.push(`<p>${line}</p>`);
  }
  if (inList) {
    rendered.push('</ul>');
  }
  return rendered.join('\n');
};

const uiStatus = (valueMs: number): 'green' | 'amber' | 'red' => {
  if (valueMs < 2000) return 'green';
  if (valueMs <= 5000) return 'amber';
  return 'red';
};

const backendStatus = (valueMs: number): 'green' | 'amber' | 'red' => {
  if (valueMs < 60000) return 'green';
  if (valueMs <= 180000) return 'amber';
  return 'red';
};

const buildHtml = (tiers: TierSummary[], findingsHtml: string, notes: string[]): string => {
  const generatedAt = new Date().toISOString();
  const bestP90Tier = tiers.find((tier) => tier.label === 'p90') ?? tiers[0];

  const executiveRows = [
    ['UI Explore/Flyout', bestP90Tier?.uiScenarios['flyout']?.median ?? null, 'ui'],
    ['Risk scoring', bestP90Tier?.backend.risk_scoring?.median ?? null, 'backend'],
    ['Lead generation', bestP90Tier?.backend.lead_generation?.median ?? null, 'backend'],
    ['Watchlists', bestP90Tier?.backend.watchlists?.median ?? null, 'backend'],
  ] as const;

  const toc = [
    ['header', 'Header'],
    ['summary', 'Executive Summary'],
    ['ui-scaling', 'UI Scaling Charts'],
    ['flyout-ab', 'Flyout A/B Comparison'],
    ['host-user', 'Host vs User Comparison'],
    ['backend-scaling', 'Backend Scaling Charts'],
    ['resolution-overhead', 'Resolution Overhead'],
    ['infra', 'Infrastructure Time-Series'],
    ['tables', 'Detailed Metrics Tables'],
    ['findings', 'Issues and Findings'],
  ];

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Entity Analytics Performance Report - 9.4</title>
  <style>
    :root { color-scheme: light dark; }
    body { font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 24px; line-height: 1.45; }
    .container { max-width: 1280px; margin: 0 auto; }
    h1, h2 { margin: 0 0 12px; }
    h2 { margin-top: 30px; border-bottom: 1px solid color-mix(in oklab, currentColor 20%, transparent); padding-bottom: 6px; }
    .toc { padding: 12px; border: 1px solid color-mix(in oklab, currentColor 20%, transparent); border-radius: 8px; margin-bottom: 20px; }
    .toc a { margin-right: 12px; text-decoration: none; }
    .meta { color: color-mix(in oklab, currentColor 70%, transparent); margin-bottom: 20px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }
    .card { border: 1px solid color-mix(in oklab, currentColor 20%, transparent); border-radius: 8px; padding: 12px; }
    .traffic { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; }
    .traffic.green { background: color-mix(in oklab, #22c55e 30%, transparent); }
    .traffic.amber { background: color-mix(in oklab, #f59e0b 30%, transparent); }
    .traffic.red { background: color-mix(in oklab, #ef4444 30%, transparent); }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 8px; border-bottom: 1px solid color-mix(in oklab, currentColor 15%, transparent); text-align: left; }
    th { cursor: pointer; }
    .chart-wrap { min-height: 300px; }
    .note-list { margin: 8px 0 0; padding-left: 18px; }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
  <div class="container">
    <section id="header">
      <h1>Entity Analytics Performance Report &mdash; 9.4</h1>
      <div class="meta">Generated: ${generatedAt} | Stack version: 9.4</div>
      <div class="toc">
        ${toc.map(([id, label]) => `<a href="#${id}">${label}</a>`).join('')}
      </div>
      <table>
        <thead><tr><th>Tier</th><th>Hardware Profile</th><th>Entity Volume</th><th>Alert Volume</th></tr></thead>
        <tbody>
          ${tiers
            .map(
              (tier) =>
                `<tr><td>${tier.label}</td><td>${tier.hardwareProfile}</td><td>${tier.entityCount ?? 'n/a'}</td><td>${tier.alertCount ?? 'n/a'}</td></tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </section>

    <section id="summary">
      <h2>Executive Summary</h2>
      <div class="grid">
        ${executiveRows
          .map(([label, value, kind]) => {
            if (value === null)
              return `<div class="card"><strong>${label}:</strong> not enough data</div>`;
            const status = kind === 'ui' ? uiStatus(value) : backendStatus(value);
            return `<div class="card"><strong>${label}:</strong> ${Math.round(value)} ms median <span class="traffic ${status}">${status.toUpperCase()}</span></div>`;
          })
          .join('')}
      </div>
    </section>

    <section id="ui-scaling">
      <h2>UI Scaling Charts</h2>
      <div class="grid">
        ${UI_SCENARIOS.map((scenario) => `<div class="card chart-wrap"><canvas id="ui-${scenario}"></canvas></div>`).join('')}
      </div>
    </section>

    <section id="flyout-ab">
      <h2>Flyout A/B Comparison</h2>
      <div class="card chart-wrap"><canvas id="flyout-ab-chart"></canvas></div>
    </section>

    <section id="host-user">
      <h2>Host vs User Comparison</h2>
      <div class="card chart-wrap"><canvas id="host-user-chart"></canvas></div>
    </section>

    <section id="backend-scaling">
      <h2>Backend Scaling Charts</h2>
      <div class="grid">
        <div class="card chart-wrap"><canvas id="backend-risk_scoring"></canvas></div>
        <div class="card chart-wrap"><canvas id="backend-lead_generation"></canvas></div>
        <div class="card chart-wrap"><canvas id="backend-watchlists"></canvas></div>
      </div>
    </section>

    <section id="resolution-overhead">
      <h2>Resolution Overhead</h2>
      <p style="margin:0 0 12px;font-size:13px;opacity:.7">Baseline (0% resolution) vs Resolution (10%) risk scoring duration per tier. Grouped bars show the added cost of entity resolution at each data volume.</p>
      <div class="card chart-wrap"><canvas id="resolution-overhead-chart"></canvas></div>
    </section>

    <section id="infra">
      <h2>Infrastructure Time-Series</h2>
      <div id="infra-charts" class="grid"></div>
    </section>

    <section id="tables">
      <h2>Detailed Metrics Tables</h2>
      <div class="card">
        <table id="details-table">
          <thead>
            <tr>
              <th data-col="tier">Tier</th>
              <th data-col="feature">Feature</th>
              <th data-col="scenario">Scenario</th>
              <th data-col="runs">Runs</th>
              <th data-col="min">Min (ms)</th>
              <th data-col="median">Median (ms)</th>
              <th data-col="max">Max (ms)</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
      ${notes.length > 0 ? `<ul class="note-list">${notes.map((note) => `<li>${note}</li>`).join('')}</ul>` : ''}
    </section>

    <section id="findings">
      <h2>Issues and Findings</h2>
      <div class="card">
        ${findingsHtml || '<p>Add key findings with --findings &lt;markdown-file&gt;.</p>'}
      </div>
    </section>
  </div>
  <script>
    const tiers = ${JSON.stringify(tiers)};

    const scenarioLabel = {
      "hosts-list": "Hosts list",
      "host-detail": "Host detail",
      "flyout": "Flyout",
      "flyout-comparison": "Flyout comparison",
      "users-list": "Users list",
      "user-detail": "User detail",
      "flyout-user": "Flyout user",
    };

    function chartOrNoData(canvasId, note) {
      const canvas = document.getElementById(canvasId);
      const parent = canvas && canvas.parentElement;
      if (!canvas || !parent) return null;
      parent.innerHTML = "<div>" + note + "</div>";
      return null;
    }

    function createUiCharts() {
      ${JSON.stringify(UI_SCENARIOS)}.forEach((scenario) => {
        const points = tiers
          .filter((tier) => tier.uiScenarios[scenario])
          .map((tier) => ({
            label: tier.label + (tier.entityCount !== null ? " (" + tier.entityCount + ")" : ""),
            min: tier.uiScenarios[scenario].min,
            median: tier.uiScenarios[scenario].median,
            max: tier.uiScenarios[scenario].max,
          }));
        if (points.length === 0) {
          chartOrNoData("ui-" + scenario, "No data for " + scenario);
          return;
        }
        new Chart(document.getElementById("ui-" + scenario), {
          type: "line",
          data: {
            labels: points.map((p) => p.label),
            datasets: [
              { label: "Min", data: points.map((p) => p.min), borderDash: [5, 5] },
              { label: "Median", data: points.map((p) => p.median), borderWidth: 2 },
              { label: "Max", data: points.map((p) => p.max), borderDash: [5, 5] },
            ],
          },
          options: { responsive: true, plugins: { title: { display: true, text: scenarioLabel[scenario] ?? scenario } } },
        });
      });
    }

    function createFlyoutABChart() {
      const labels = tiers.map((tier) => tier.label);
      const entityStore = tiers.map((tier) => tier.uiScenarios["flyout-comparison"]?.median ?? null);
      const observed = tiers.map((tier) => tier.uiScenarios["flyout-comparison"]?.max ?? null);
      if (entityStore.every((value) => value === null) && observed.every((value) => value === null)) {
        chartOrNoData("flyout-ab-chart", "No flyout comparison data available");
        return;
      }
      new Chart(document.getElementById("flyout-ab-chart"), {
        type: "bar",
        data: {
          labels,
          datasets: [
            { label: "Entity Store (median ms)", data: entityStore },
            { label: "Observed (max proxy ms)", data: observed },
          ],
        },
        options: { responsive: true },
      });
    }

    function createHostUserChart() {
      const tier = tiers.find((item) => item.label === "p90") ?? tiers[0];
      if (!tier) {
        chartOrNoData("host-user-chart", "No tiers found");
        return;
      }
      const hostValues = [
        tier.uiScenarios["hosts-list"]?.median ?? null,
        tier.uiScenarios["host-detail"]?.median ?? null,
        tier.uiScenarios["flyout"]?.median ?? null,
      ];
      const userValues = [
        tier.uiScenarios["users-list"]?.median ?? null,
        tier.uiScenarios["user-detail"]?.median ?? null,
        tier.uiScenarios["flyout-user"]?.median ?? null,
      ];
      if (hostValues.every((value) => value === null) && userValues.every((value) => value === null)) {
        chartOrNoData("host-user-chart", "No host/user comparison data available");
        return;
      }
      new Chart(document.getElementById("host-user-chart"), {
        type: "bar",
        data: {
          labels: ["List", "Detail", "Flyout"],
          datasets: [
            { label: "Host variants (" + tier.label + ")", data: hostValues },
            { label: "User variants (" + tier.label + ")", data: userValues },
          ],
        },
        options: { responsive: true },
      });
    }

    function createBackendCharts() {
      ["risk_scoring", "lead_generation", "watchlists"].forEach((feature) => {
        const points = tiers
          .filter((tier) => tier.backend[feature])
          .map((tier) => ({
            label: tier.label + (tier.entityCount !== null ? " (" + tier.entityCount + ")" : ""),
            min: tier.backend[feature].min,
            median: tier.backend[feature].median,
            max: tier.backend[feature].max,
          }));
        if (points.length === 0) {
          chartOrNoData("backend-" + feature, "No " + feature + " data");
          return;
        }
        new Chart(document.getElementById("backend-" + feature), {
          type: "line",
          data: {
            labels: points.map((p) => p.label),
            datasets: [
              { label: "Min", data: points.map((p) => p.min), borderDash: [5, 5] },
              { label: "Median", data: points.map((p) => p.median), borderWidth: 2 },
              { label: "Max", data: points.map((p) => p.max), borderDash: [5, 5] },
            ],
          },
          options: { responsive: true, plugins: { title: { display: true, text: feature.replaceAll("_", " ") } } },
        });
      });
    }

    function createResolutionChart() {
      const hasSomeResolution = tiers.some((tier) => tier.backend.risk_scoring_resolution);
      if (!hasSomeResolution) {
        chartOrNoData("resolution-overhead-chart", "No resolution comparison data available");
        return;
      }
      const labels = tiers.map((tier) =>
        tier.label + (tier.entityCount !== null ? " (" + tier.entityCount + ")" : "")
      );
      new Chart(document.getElementById("resolution-overhead-chart"), {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              label: "Baseline 0% resolution (median ms)",
              data: tiers.map((tier) => tier.backend.risk_scoring?.median ?? null),
            },
            {
              label: "10% resolution (median ms)",
              data: tiers.map((tier) => tier.backend.risk_scoring_resolution?.median ?? null),
            },
          ],
        },
        options: {
          responsive: true,
          plugins: { title: { display: true, text: "Risk Scoring: Baseline vs Resolution Overhead" } },
        },
      });
    }

    function createInfraCharts() {
      const container = document.getElementById("infra-charts");
      let count = 0;
      tiers.forEach((tier) => {
        Object.entries(tier.monitoring).forEach(([feature, windowData]) => {
          if (!windowData || (windowData.elasticsearch.length === 0 && windowData.kibana.length === 0)) return;
          count += 1;
          const card = document.createElement("div");
          card.className = "card chart-wrap";
          const title = document.createElement("div");
          title.textContent = tier.label + " - " + feature;
          card.appendChild(title);
          const canvas = document.createElement("canvas");
          card.appendChild(canvas);
          container.appendChild(card);
          const labels = windowData.elasticsearch.map((item) => item.timestamp);
          new Chart(canvas, {
            type: "line",
            data: {
              labels,
              datasets: [
                { label: "ES JVM heap %", data: windowData.elasticsearch.map((item) => item.jvmHeapUsedPct) },
                { label: "Kibana event loop utilization", data: windowData.kibana.map((item) => item.eventLoopUtilization) },
              ],
            },
            options: { responsive: true },
          });
        });
      });
      if (count === 0) {
        container.innerHTML = "<div class='card'>No monitoring data available.</div>";
      }
    }

    function populateDetailsTable() {
      const rows = [];
      tiers.forEach((tier) => {
        Object.entries(tier.uiScenarios).forEach(([scenario, row]) => {
          rows.push({ tier: tier.label, feature: "explore_flyout", scenario, ...row, runs: row.values.length });
        });
        Object.entries(tier.backend).forEach(([feature, row]) => {
          if (!row) return;
          rows.push({ tier: tier.label, feature, scenario: feature, ...row, runs: row.values.length });
        });
      });
      const tbody = document.querySelector("#details-table tbody");
      tbody.innerHTML = rows
        .map((row) => "<tr>" +
          "<td>" + row.tier + "</td>" +
          "<td>" + row.feature + "</td>" +
          "<td>" + row.scenario + "</td>" +
          "<td>" + row.runs + "</td>" +
          "<td>" + Math.round(row.min) + "</td>" +
          "<td>" + Math.round(row.median) + "</td>" +
          "<td>" + Math.round(row.max) + "</td>" +
          "</tr>")
        .join("");

      const headers = document.querySelectorAll("#details-table th");
      headers.forEach((header) => {
        header.addEventListener("click", () => {
          const col = header.getAttribute("data-col");
          if (!col) return;
          rows.sort((a, b) => {
            const left = a[col];
            const right = b[col];
            if (typeof left === "number" && typeof right === "number") return left - right;
            return String(left).localeCompare(String(right));
          });
          tbody.innerHTML = rows
            .map((row) => "<tr>" +
              "<td>" + row.tier + "</td>" +
              "<td>" + row.feature + "</td>" +
              "<td>" + row.scenario + "</td>" +
              "<td>" + row.runs + "</td>" +
              "<td>" + Math.round(row.min) + "</td>" +
              "<td>" + Math.round(row.median) + "</td>" +
              "<td>" + Math.round(row.max) + "</td>" +
              "</tr>")
            .join("");
        });
      });
    }

    createUiCharts();
    createFlyoutABChart();
    createHostUserChart();
    createBackendCharts();
    createResolutionChart();
    createInfraCharts();
    populateDetailsTable();
  </script>
</body>
</html>`;
};

export const generateEaPerfReport = async (
  options: GenerateEaPerfReportOptions,
): Promise<GenerateEaPerfReportResult> => {
  const inputRoot = path.resolve(expandHome(options.input));
  const outputPath = path.resolve(expandHome(options.output));

  const tierEntries = (await readdir(inputRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort(tierSortOrder);

  const globalNotes: string[] = [];
  const tiers: TierSummary[] = [];

  for (const tierLabel of tierEntries) {
    const tierDir = path.join(inputRoot, tierLabel);
    const tierNotes: string[] = [];
    const paramsPath = path.join(tierDir, 'params.json');
    const paramsRaw = await safeReadJson(paramsPath);
    const params =
      paramsRaw && typeof paramsRaw === 'object' ? (paramsRaw as Record<string, unknown>) : null;
    if (!params) {
      tierNotes.push(`Missing or invalid params.json for tier "${tierLabel}"`);
    }

    const uiScenarios: Record<string, NumberStats> = {};
    const uiRoot = path.join(tierDir, 'explore_flyout');
    for (const scenario of UI_SCENARIOS) {
      const scenarioDir = path.join(uiRoot, scenario);
      const values = await collectRunValues(scenarioDir, (parsed) =>
        extractUiRunMetric(parsed, scenario),
      );
      if (values.length === 0) continue;
      uiScenarios[scenario] = stats(values);
    }
    if (Object.keys(uiScenarios).length === 0) {
      tierNotes.push(`No UI scenario data found in tier "${tierLabel}"`);
    }

    const backend: TierSummary['backend'] = {};
    // Support both flat (run-N/) and split (baseline/run-N/ + resolution/run-N/) layouts.
    const riskBaselineValues = await collectRunValues(
      path.join(tierDir, 'risk_scoring', 'baseline'),
      extractRiskScoringMetricMs,
    );
    const riskResolutionValues = await collectRunValues(
      path.join(tierDir, 'risk_scoring', 'resolution'),
      extractRiskScoringMetricMs,
    );
    const riskValues =
      riskBaselineValues.length > 0
        ? riskBaselineValues
        : await collectRunValues(path.join(tierDir, 'risk_scoring'), extractRiskScoringMetricMs);
    if (riskValues.length > 0) backend.risk_scoring = stats(riskValues);
    if (riskResolutionValues.length > 0)
      backend.risk_scoring_resolution = stats(riskResolutionValues);

    const leadValues = await collectRunValues(
      path.join(tierDir, 'lead_generation'),
      extractLeadGenerationMetricMs,
    );
    if (leadValues.length > 0) backend.lead_generation = stats(leadValues);

    const watchValues = await collectRunValues(
      path.join(tierDir, 'watchlists'),
      extractWatchlistMetricMs,
    );
    if (watchValues.length > 0) backend.watchlists = stats(watchValues);

    if (Object.keys(backend).length === 0) {
      tierNotes.push(`No backend feature metrics found in tier "${tierLabel}"`);
    }

    const monitoring: Record<string, MonitoringWindowSummary> = {};
    const monitoringDir = path.join(tierDir, 'monitoring');
    try {
      const monitoringFiles = (await readdir(monitoringDir, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map((entry) => entry.name)
        .sort();
      for (const fileName of monitoringFiles) {
        const parsed = await safeReadJson(path.join(monitoringDir, fileName));
        if (parsed === null) continue;
        const normalized = parseMonitoringWindow(parsed);
        if (!normalized) continue;
        const featureKey = fileName.includes('risk')
          ? 'risk_scoring'
          : fileName.includes('lead')
            ? 'lead_generation'
            : fileName.includes('watch')
              ? 'watchlists'
              : fileName.replace(/\.json$/u, '');
        monitoring[featureKey] = normalized;
      }
    } catch {
      tierNotes.push(`No monitoring directory found in tier "${tierLabel}"`);
    }

    tiers.push({
      label: tierLabel,
      dir: tierDir,
      params,
      entityCount: inferEntityCount(params),
      alertCount: inferAlertCount(params),
      hardwareProfile: inferHardwareProfile(params),
      uiScenarios,
      backend,
      monitoring,
      notes: tierNotes,
    });
    globalNotes.push(...tierNotes);
  }

  if (tiers.length === 0) {
    throw new Error(`No tier subdirectories found under ${inputRoot}`);
  }

  const findingsMarkdown =
    options.findings !== undefined
      ? await readFile(path.resolve(expandHome(options.findings)), 'utf8')
      : '';
  const findingsHtml = findingsMarkdown.trim().length > 0 ? markdownToHtml(findingsMarkdown) : '';
  const html = buildHtml(tiers, findingsHtml, globalNotes);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, html, 'utf8');

  return {
    outputPath,
    tierCount: tiers.length,
    notes: globalNotes,
  };
};
