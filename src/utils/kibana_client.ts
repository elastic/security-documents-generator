/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * Kibana Client
 *
 * Handles dynamic Kibana API interactions with variable response structures.
 * Uses 'any' types due to diverse Kibana API response schemas.
 */
import { getConfig } from '../get_config';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

export interface KibanaAlert {
  id: string;
  index: string;
  rule?: {
    id: string;
    name: string;
  };
}

export interface CasePostRequest {
  title: string;
  description: string;
  tags: string[];
  severity?: 'low' | 'medium' | 'high' | 'critical';
  owner: string;
  assignees?: Array<{ uid: string }>;
  connector?: {
    id: string;
    name: string;
    type: string;
    fields: Record<string, any> | null;
  };
  settings?: {
    syncAlerts: boolean;
  };
}

export interface CaseResponse {
  id: string;
  version: string;
  comments?: any[];
  totalComment: number;
  title: string;
  tags: string[];
  description: string;
  severity: string;
  status: 'open' | 'in-progress' | 'closed';
  owner: string;
  assignees: Array<{ uid: string }>;
  created_at: string;
  created_by: { email?: string; full_name?: string; username?: string };
  updated_at: string;
  updated_by: { email?: string; full_name?: string; username?: string };
  closed_at?: string;
  closed_by?: { email?: string; full_name?: string; username?: string };
  duration?: number;
  external_service?: any;
  connector: {
    id: string;
    name: string;
    type: string;
    fields: Record<string, any> | null;
  };
  settings: {
    syncAlerts: boolean;
  };
  totalAlerts: number;
}

export interface AttachAlertsRequest {
  alertId: string[];
  index: string[];
  rule?: {
    id: string;
    name: string;
  };
  type: 'alert';
  owner: string;
}

export class KibanaClient {
  private client: AxiosInstance;
  private config: ReturnType<typeof getConfig>;

  constructor() {
    this.config = getConfig();

    // Extract base path from node URL if present (e.g., http://localhost:5601/xey)
    const nodeUrl = new URL(this.config.kibana.node);
    const baseURL = this.config.kibana.node;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'kbn-xsrf': 'true',
    };

    // Configure authentication (API key or username/password)
    if ('apiKey' in this.config.kibana && this.config.kibana.apiKey) {
      // Use API key authentication
      headers['Authorization'] = `ApiKey ${this.config.kibana.apiKey}`;
    } else if (
      'username' in this.config.kibana &&
      this.config.kibana.username &&
      this.config.kibana.password
    ) {
      // Use basic authentication - encode username:password in base64
      const credentials = Buffer.from(
        `${this.config.kibana.username}:${this.config.kibana.password}`,
      ).toString('base64');
      headers['Authorization'] = `Basic ${credentials}`;
    } else {
      throw new Error(
        'Kibana authentication required. Please set either apiKey or username/password in config.json',
      );
    }

    this.client = axios.create({
      baseURL,
      headers,
      timeout: 30000,
      httpsAgent: new (require('https').Agent)({
        rejectUnauthorized: false, // Accept self-signed certificates for serverless dev
      }),
    });
  }

  /**
   * Create a new case
   */
  async createCase(
    caseData: CasePostRequest,
    space?: string,
  ): Promise<CaseResponse> {
    const url =
      space && space !== 'default' ? `/${space}/api/cases` : '/api/cases';

    try {
      const response = await this.client.post(url, caseData);
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new Error(
          `Cases API not found. This Kibana instance may not have the Security solution enabled or may be using an older version. Cases API requires Kibana 7.10+ with Security solution.`,
        );
      }
      console.error('Error creating case:', error);
      throw new Error(`Failed to create case: ${error}`);
    }
  }

  /**
   * Get case by ID
   */
  async getCase(caseId: string, space?: string): Promise<CaseResponse> {
    const url =
      space && space !== 'default'
        ? `/${space}/api/cases/${caseId}`
        : `/api/cases/${caseId}`;

    try {
      const response = await this.client.get(url);
      return response.data;
    } catch (error) {
      console.error('Error getting case:', error);
      throw new Error(`Failed to get case: ${error}`);
    }
  }

  /**
   * Search cases with query parameters
   */
  async findCases(
    params: {
      page?: number;
      perPage?: number;
      sortField?: string;
      sortOrder?: 'asc' | 'desc';
      search?: string;
      searchFields?: string[];
      severity?: string[];
      status?: string[];
      tags?: string[];
      owner?: string[];
    } = {},
    space?: string,
  ): Promise<{
    cases: CaseResponse[];
    total: number;
    page: number;
    per_page: number;
  }> {
    const url =
      space && space !== 'default'
        ? `/${space}/api/cases/_find`
        : '/api/cases/_find';

    try {
      const response = await this.client.get(url, { params });
      return response.data;
    } catch (error) {
      console.error('Error finding cases:', error);
      throw new Error(`Failed to find cases: ${error}`);
    }
  }

  /**
   * Delete a case
   */
  async deleteCase(caseId: string, space?: string): Promise<void> {
    const url =
      space && space !== 'default'
        ? `/${space}/api/cases?ids=["${caseId}"]`
        : `/api/cases?ids=["${caseId}"]`;

    try {
      await this.client.delete(url);
    } catch (error) {
      console.error('Error deleting case:', error);
      throw new Error(`Failed to delete case: ${error}`);
    }
  }

  /**
   * Delete multiple cases
   */
  async deleteCases(caseIds: string[], space?: string): Promise<void> {
    const url =
      space && space !== 'default' ? `/${space}/api/cases` : '/api/cases';

    try {
      await this.client.delete(url, {
        params: {
          ids: JSON.stringify(caseIds),
        },
      });
    } catch (error) {
      console.error('Error deleting cases:', error);
      throw new Error(`Failed to delete cases: ${error}`);
    }
  }

  /**
   * Attach alerts to a case
   */
  async attachAlertsToCase(
    caseId: string,
    alertsData: AttachAlertsRequest,
    space?: string,
  ): Promise<any> {
    const url =
      space && space !== 'default'
        ? `/${space}/api/cases/${caseId}/comments`
        : `/api/cases/${caseId}/comments`;

    try {
      const response = await this.client.post(url, alertsData);
      return response.data;
    } catch (error) {
      console.error('Error attaching alerts to case:', error);
      throw new Error(`Failed to attach alerts to case: ${error}`);
    }
  }

  /**
   * Add a comment to a case
   */
  async addComment(
    caseId: string,
    comment: {
      comment: string;
      type: 'user';
      owner: string;
    },
    space?: string,
  ): Promise<any> {
    const url =
      space && space !== 'default'
        ? `/${space}/api/cases/${caseId}/comments`
        : `/api/cases/${caseId}/comments`;

    try {
      const response = await this.client.post(url, comment);
      return response.data;
    } catch (error) {
      console.error('Error adding comment to case:', error);
      throw new Error(`Failed to add comment to case: ${error}`);
    }
  }

  /**
   * Update case status
   */
  async updateCaseStatus(
    caseId: string,
    status: 'open' | 'in-progress' | 'closed',
    space?: string,
  ): Promise<CaseResponse> {
    const url =
      space && space !== 'default' ? `/${space}/api/cases` : '/api/cases';

    try {
      const caseData = await this.getCase(caseId, space);

      const response = await this.client.patch(url, {
        cases: [
          {
            id: caseId,
            version: caseData.version,
            status,
          },
        ],
      });

      return response.data.cases[0];
    } catch (error) {
      console.error('Error updating case status:', error);
      throw new Error(`Failed to update case status: ${error}`);
    }
  }

  /**
   * Query alerts that can be attached to cases
   */
  async queryAlerts(
    query: string,
    space?: string,
    size: number = 100,
  ): Promise<{ alerts: any[]; total: number }> {
    const alertsUrl =
      space && space !== 'default'
        ? `/${space}/internal/rac/alerts`
        : '/internal/rac/alerts';

    try {
      const response = await this.client.post(alertsUrl, {
        query: {
          bool: {
            must: [
              {
                query_string: {
                  query: query || '*',
                  default_field: 'kibana.alert.rule.name',
                },
              },
            ],
          },
        },
        size,
        sort: [
          {
            '@timestamp': {
              order: 'desc',
            },
          },
        ],
      });

      return {
        alerts: response.data.hits?.hits || [],
        total: response.data.hits?.total?.value || 0,
      };
    } catch (error) {
      console.warn('RAC Alerts API not available - alert attachment disabled');
      // Fallback: return empty result if RAC API is not available
      return { alerts: [], total: 0 };
    }
  }

  /**
   * Get all cases in a space (with pagination)
   */
  async getAllCases(space?: string): Promise<CaseResponse[]> {
    const allCases: CaseResponse[] = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const result = await this.findCases(
        { page, perPage, sortField: 'createdAt', sortOrder: 'desc' },
        space,
      );

      allCases.push(...result.cases);

      if (result.cases.length < perPage) {
        break;
      }

      page++;
    }

    return allCases;
  }

  /**
   * Health check for Kibana connection
   */
  async healthCheck(): Promise<{ status: 'ok' | 'error'; message: string }> {
    try {
      // Try multiple endpoints to check connectivity
      const endpoints = ['/api/status', '/api', '/app/management', '/'];

      let lastError: any;

      for (const endpoint of endpoints) {
        try {
          const response = await this.client.get(endpoint);
          if (response.status === 200) {
            console.log(
              `✅ Kibana connection successful via ${endpoint} (${response.status})`,
            );
            return { status: 'ok', message: 'Kibana connection successful' };
          }
        } catch (error: any) {
          lastError = error;
          // Continue to next endpoint
        }
      }

      // If we get here, all endpoints failed
      throw lastError;
    } catch (error: any) {
      const errorMessage = error.response
        ? `HTTP ${error.response.status}: ${error.response.statusText}`
        : error.message || 'Unknown error';

      console.error(`❌ Kibana connection failed: ${errorMessage}`);
      console.error(`🔧 Kibana URL: ${this.config.kibana.node}`);
      console.error(
        `🔧 Auth method: ${'apiKey' in this.config.kibana ? 'API Key' : 'Username/Password'}`,
      );

      // Check if this is a Cases API compatibility issue
      if (error.response?.status === 404) {
        console.warn(
          `⚠️  Note: This Kibana instance may not support the Cases API`,
        );
        console.warn(
          `⚠️  Cases API requires Kibana 7.10+ with Security solution enabled`,
        );
      }

      return {
        status: 'error',
        message: `Kibana connection failed: ${errorMessage}`,
      };
    }
  }
}

// Singleton instance
let kibanaClient: KibanaClient | null = null;

export function getKibanaClient(): KibanaClient {
  if (!kibanaClient) {
    kibanaClient = new KibanaClient();
  }
  return kibanaClient;
}
