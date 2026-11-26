export interface Destination {
  readonly domain: string;
  /** The name in the DNS answer when it's a CNAME target, as with `api2.cursor.sh`. */
  readonly answerName?: string;
  readonly ip: string;
  readonly port: number;
}

/** Real vendor domains with addresses from the RFC 5737 documentation ranges. */
export const DESTINATIONS = {
  anthropicApi: { domain: 'api.anthropic.com', ip: '198.51.100.20', port: 443 },
  anthropicMcpProxy: { domain: 'mcp-proxy.anthropic.com', ip: '198.51.100.21', port: 443 },
  claudeLogIntake: { domain: 'http-intake.logs.us5.datadoghq.com', ip: '198.51.100.30', port: 443 },
  cursorApi2: {
    domain: 'api2.cursor.sh',
    answerName: 'api2direct.cursor.sh',
    ip: '198.51.100.40',
    port: 443,
  },
  cursorApi: { domain: 'api.cursor.com', ip: '198.51.100.41', port: 443 },
  cursorAgent: {
    domain: 'agentn.us.api5.cursor.sh',
    answerName: 'agentn.api5lat.cursor.sh',
    ip: '198.51.100.42',
    port: 443,
  },
  npmRegistry: { domain: 'registry.npmjs.org', ip: '198.51.100.50', port: 443 },
  github: { domain: 'github.com', ip: '198.51.100.60', port: 443 },
  githubSsh: { domain: 'github.com', ip: '198.51.100.60', port: 22 },
  exampleCom: { domain: 'example.com', ip: '203.0.113.10', port: 443 },
} as const satisfies Record<string, Destination>;

export const orgTelemetryCollector = (domain: string): Destination => ({
  domain: `otel-collector.${domain}`,
  ip: '203.0.113.50',
  port: 443,
});
