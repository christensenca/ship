/**
 * FleetGraph runtime configuration - LangSmith tracing and environment setup.
 */

import { Client } from 'langsmith';

export interface FleetGraphConfig {
  /** LangSmith API key for tracing (optional in dev) */
  langsmithApiKey?: string;
  /** LangSmith project name */
  langsmithProject?: string;
  /** Ship API base URL for the agent to call */
  shipApiBaseUrl: string;
  /** Ship API token for server-to-server calls */
  shipApiToken?: string;
  /** Enable LangSmith tracing */
  tracingEnabled: boolean;
}

let _config: FleetGraphConfig | null = null;
let _langsmithClient: Client | null = null;

/**
 * Initialize FleetGraph runtime with environment configuration.
 */
export function initFleetGraph(overrides?: Partial<FleetGraphConfig>): FleetGraphConfig {
  _config = {
    langsmithApiKey: overrides?.langsmithApiKey ?? process.env.LANGSMITH_API_KEY,
    langsmithProject: overrides?.langsmithProject ?? process.env.LANGSMITH_PROJECT ?? 'fleetgraph',
    shipApiBaseUrl: overrides?.shipApiBaseUrl ?? process.env.SHIP_API_BASE_URL ?? 'http://localhost:3000',
    shipApiToken: overrides?.shipApiToken ?? process.env.SHIP_API_TOKEN,
    tracingEnabled: overrides?.tracingEnabled ?? (process.env.LANGSMITH_TRACING === 'true'),
  };

  // Set LangSmith environment variables for @langchain/core auto-tracing
  if (_config.tracingEnabled && _config.langsmithApiKey) {
    process.env.LANGCHAIN_TRACING_V2 = 'true';
    process.env.LANGCHAIN_API_KEY = _config.langsmithApiKey;
    process.env.LANGCHAIN_PROJECT = _config.langsmithProject;
  }

  return _config;
}

/**
 * Get the current FleetGraph runtime config.
 */
export function getFleetGraphConfig(): FleetGraphConfig {
  if (!_config) {
    return initFleetGraph();
  }
  return _config;
}

/**
 * Get or create a LangSmith client for manual tracing/feedback.
 */
export function getLangSmithClient(): Client | null {
  const config = getFleetGraphConfig();
  if (!config.tracingEnabled || !config.langsmithApiKey) {
    return null;
  }

  if (!_langsmithClient) {
    _langsmithClient = new Client({
      apiKey: config.langsmithApiKey,
    });
  }

  return _langsmithClient;
}

/**
 * Check if FleetGraph is available (has minimum required configuration).
 */
export function isFleetGraphAvailable(): boolean {
  const config = getFleetGraphConfig();
  return !!config.shipApiBaseUrl;
}
