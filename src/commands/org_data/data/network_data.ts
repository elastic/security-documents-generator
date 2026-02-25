/**
 * Network security related static data for Cloudflare and Zscaler integrations
 */

import { DepartmentName } from '../types';

/**
 * Cloudflare edge colocations (data centers)
 */
export const CLOUDFLARE_COLOS = [
  'SJC',
  'LAX',
  'ORD',
  'IAD',
  'EWR',
  'ATL',
  'DFW',
  'SEA',
  'LHR',
  'CDG',
  'FRA',
  'AMS',
  'NRT',
  'SIN',
  'SYD',
  'GRU',
];

/**
 * Cloudflare WAF rule IDs and descriptions
 */
export const CLOUDFLARE_WAF_RULES = [
  { id: '100001', description: 'SQL Injection - Generic', source: 'waf' },
  { id: '100002', description: 'XSS Attack - Script Tag', source: 'waf' },
  { id: '100003', description: 'XSS Attack - Event Handler', source: 'waf' },
  { id: '100004', description: 'Path Traversal Attempt', source: 'waf' },
  { id: '100005', description: 'Remote Code Execution', source: 'waf' },
  { id: '100006', description: 'Command Injection', source: 'waf' },
  { id: '100007', description: 'SSRF Attempt', source: 'waf' },
  { id: 'rate-001', description: 'Rate Limit - API Endpoint', source: 'rateLimit' },
  { id: 'rate-002', description: 'Rate Limit - Login', source: 'rateLimit' },
  { id: 'bot-001', description: 'Bot Management - Automated Traffic', source: 'bm' },
  { id: 'bot-002', description: 'Bot Management - Credential Stuffing', source: 'bm' },
  { id: 'ip-block-001', description: 'IP Access Rule - Blocked Country', source: 'firewallRules' },
];

/**
 * Cloudflare firewall actions
 */
export const CLOUDFLARE_FW_ACTIONS = [
  'block',
  'challenge',
  'js_challenge',
  'managed_challenge',
  'log',
  'allow',
];

/**
 * HTTP methods and their weights for normal traffic
 */
export const HTTP_METHODS: Array<{ method: string; weight: number }> = [
  { method: 'GET', weight: 60 },
  { method: 'POST', weight: 25 },
  { method: 'PUT', weight: 5 },
  { method: 'PATCH', weight: 3 },
  { method: 'DELETE', weight: 2 },
  { method: 'OPTIONS', weight: 3 },
  { method: 'HEAD', weight: 2 },
];

/**
 * Common API paths
 */
export const API_PATHS = [
  '/api/v1/users',
  '/api/v1/accounts',
  '/api/v1/contacts',
  '/api/v1/deals',
  '/api/v1/tasks',
  '/api/v1/reports',
  '/api/v1/settings',
  '/api/v1/search',
  '/api/v1/notifications',
  '/api/v1/webhooks',
  '/api/v2/graphql',
  '/auth/login',
  '/auth/logout',
  '/auth/token',
  '/auth/callback',
  '/health',
  '/metrics',
  '/',
  '/app',
  '/dashboard',
  '/docs',
  '/status',
];

/**
 * HTTP status codes and their weights
 */
export const HTTP_STATUS_CODES: Array<{ code: number; weight: number }> = [
  { code: 200, weight: 70 },
  { code: 201, weight: 5 },
  { code: 204, weight: 3 },
  { code: 301, weight: 2 },
  { code: 302, weight: 3 },
  { code: 304, weight: 5 },
  { code: 400, weight: 3 },
  { code: 401, weight: 2 },
  { code: 403, weight: 2 },
  { code: 404, weight: 3 },
  { code: 429, weight: 1 },
  { code: 500, weight: 1 },
];

/**
 * Zscaler URL categories by department
 */
export const ZSCALER_URL_CATEGORIES: Record<
  DepartmentName,
  Array<{ url: string; category: string; superCategory: string }>
> = {
  'Product & Engineering': [
    { url: 'github.com', category: 'Professional Services', superCategory: 'Business and Economy' },
    {
      url: 'stackoverflow.com',
      category: 'Professional Services',
      superCategory: 'Business and Economy',
    },
    {
      url: 'console.aws.amazon.com',
      category: 'Web-based Email',
      superCategory: 'Business and Economy',
    },
    {
      url: 'portal.azure.com',
      category: 'Professional Services',
      superCategory: 'Business and Economy',
    },
    { url: 'npmjs.com', category: 'Professional Services', superCategory: 'Business and Economy' },
    { url: 'docker.com', category: 'Professional Services', superCategory: 'Business and Economy' },
    {
      url: 'kubernetes.io',
      category: 'Professional Services',
      superCategory: 'Business and Economy',
    },
    {
      url: 'grafana.com',
      category: 'Professional Services',
      superCategory: 'Business and Economy',
    },
    { url: 'elastic.co', category: 'Professional Services', superCategory: 'Business and Economy' },
    {
      url: 'jira.atlassian.com',
      category: 'Professional Services',
      superCategory: 'Business and Economy',
    },
  ],
  'Sales & Marketing': [
    { url: 'linkedin.com', category: 'Social Networking', superCategory: 'Social Networking' },
    {
      url: 'salesforce.com',
      category: 'Professional Services',
      superCategory: 'Business and Economy',
    },
    {
      url: 'hubspot.com',
      category: 'Professional Services',
      superCategory: 'Business and Economy',
    },
    {
      url: 'mailchimp.com',
      category: 'Professional Services',
      superCategory: 'Business and Economy',
    },
    {
      url: 'google.com/analytics',
      category: 'Web Analytics',
      superCategory: 'Business and Economy',
    },
    { url: 'twitter.com', category: 'Social Networking', superCategory: 'Social Networking' },
    { url: 'zoom.us', category: 'Professional Services', superCategory: 'Business and Economy' },
    { url: 'canva.com', category: 'Professional Services', superCategory: 'Business and Economy' },
  ],
  'Customer Success': [
    {
      url: 'zendesk.com',
      category: 'Professional Services',
      superCategory: 'Business and Economy',
    },
    {
      url: 'intercom.io',
      category: 'Professional Services',
      superCategory: 'Business and Economy',
    },
    {
      url: 'salesforce.com',
      category: 'Professional Services',
      superCategory: 'Business and Economy',
    },
    { url: 'notion.so', category: 'Professional Services', superCategory: 'Business and Economy' },
    { url: 'zoom.us', category: 'Professional Services', superCategory: 'Business and Economy' },
    {
      url: 'calendly.com',
      category: 'Professional Services',
      superCategory: 'Business and Economy',
    },
  ],
  Operations: [
    {
      url: 'workday.com',
      category: 'Professional Services',
      superCategory: 'Business and Economy',
    },
    { url: 'adp.com', category: 'Professional Services', superCategory: 'Business and Economy' },
    {
      url: 'netsuite.com',
      category: 'Professional Services',
      superCategory: 'Business and Economy',
    },
    {
      url: 'docusign.com',
      category: 'Professional Services',
      superCategory: 'Business and Economy',
    },
    {
      url: 'bamboohr.com',
      category: 'Professional Services',
      superCategory: 'Business and Economy',
    },
    {
      url: 'lastpass.com',
      category: 'Professional Services',
      superCategory: 'Business and Economy',
    },
  ],
  Executive: [
    { url: 'linkedin.com', category: 'Social Networking', superCategory: 'Social Networking' },
    { url: 'bloomberg.com', category: 'Finance', superCategory: 'Business and Economy' },
    { url: 'wsj.com', category: 'News', superCategory: 'News and Media' },
    { url: 'zoom.us', category: 'Professional Services', superCategory: 'Business and Economy' },
    {
      url: 'boardvantage.com',
      category: 'Professional Services',
      superCategory: 'Business and Economy',
    },
  ],
};

/**
 * Zscaler web actions
 */
export const ZSCALER_WEB_ACTIONS = ['Allowed', 'Blocked', 'Cautioned', 'Isolate'];

/**
 * Zscaler firewall actions
 */
export const ZSCALER_FW_ACTIONS = ['Allow', 'Drop', 'Reset', 'Block ICMP'];

/**
 * Zscaler DLP engines
 */
export const ZSCALER_DLP_ENGINES = [
  'Credit Card Number',
  'Social Security Number',
  'PII Detection',
  'Source Code Detection',
  'API Key Detection',
];

/**
 * Blocked/malicious URLs for Zscaler
 */
export const BLOCKED_URLS = [
  'malware-download.evil.com',
  'phishing-site.fake-bank.com',
  'cryptominer.suspicious.net',
  'c2-server.darkweb.org',
  'torrents.piracy-site.net',
  'free-vpn.suspicious.io',
  'fake-update.malware.com',
];

/**
 * User agent strings for web traffic
 */
export const WEB_USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 Edg/119.0.0.0',
];

/**
 * Attacker IP ranges (for simulated attack traffic in Cloudflare)
 */
export const ATTACKER_IPS = [
  '45.33.32.156',
  '185.220.101.1',
  '198.51.100.23',
  '203.0.113.50',
  '91.121.87.10',
  '178.128.200.45',
  '104.248.51.200',
  '159.89.161.100',
  '167.71.13.196',
  '142.93.120.50',
];

/**
 * Attacker country codes
 */
export const ATTACKER_COUNTRIES = ['RU', 'CN', 'KP', 'IR', 'BR', 'IN', 'VN', 'NG', 'RO', 'UA'];
