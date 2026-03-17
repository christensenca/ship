/**
 * FleetGraph runtime configuration - LangSmith tracing, LLM client, and environment setup.
 */

import { Client } from 'langsmith';
import { ChatOpenAI } from '@langchain/openai';

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
  /** API key for LLM reasoning (OpenRouter or OpenAI) */
  openaiApiKey?: string;
  /** Base URL for LLM API (OpenRouter: https://openrouter.ai/api/v1) */
  llmBaseUrl?: string;
  /** LLM model name */
  llmModel: string;
}

let _config: FleetGraphConfig | null = null;
let _langsmithClient: Client | null = null;
let _llmClient: ChatOpenAI | null = null;

/**
 * Initialize FleetGraph runtime with environment configuration.
 */
export function initFleetGraph(overrides?: Partial<FleetGraphConfig>): FleetGraphConfig {
  _config = {
    langsmithApiKey: overrides?.langsmithApiKey ?? process.env.LANGSMITH_API_KEY,
    langsmithProject: overrides?.langsmithProject ?? process.env.LANGSMITH_PROJECT ?? 'fleetgraph',
    shipApiBaseUrl: overrides?.shipApiBaseUrl ?? process.env.SHIP_API_BASE_URL ?? `http://localhost:${process.env.PORT || 3000}`,
    shipApiToken: overrides?.shipApiToken ?? process.env.SHIP_API_TOKEN,
    tracingEnabled: overrides?.tracingEnabled ?? (process.env.LANGSMITH_TRACING === 'true'),
    openaiApiKey: overrides?.openaiApiKey ?? process.env.OPENROUTER_API_KEY ?? process.env.OPENAI_API_KEY,
    llmBaseUrl: overrides?.llmBaseUrl ?? process.env.LLM_BASE_URL ?? (process.env.OPENROUTER_API_KEY ? 'https://openrouter.ai/api/v1' : undefined),
    llmModel: overrides?.llmModel ?? process.env.FLEETGRAPH_LLM_MODEL ?? 'openai/gpt-4o-mini',
  };

  // Set LangSmith environment variables for @langchain/core auto-tracing
  if (_config.tracingEnabled && _config.langsmithApiKey) {
    process.env.LANGCHAIN_TRACING_V2 = 'true';
    process.env.LANGCHAIN_API_KEY = _config.langsmithApiKey;
    process.env.LANGCHAIN_PROJECT = _config.langsmithProject;
  }

  // Reset LLM client when config changes
  _llmClient = null;

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
 * Get or create the LLM client for FleetGraph reasoning.
 */
export function getLLMClient(): ChatOpenAI | null {
  const config = getFleetGraphConfig();
  if (!config.openaiApiKey) {
    return null;
  }

  if (!_llmClient) {
    _llmClient = new ChatOpenAI({
      apiKey: config.openaiApiKey,
      model: config.llmModel,
      temperature: 0.3,
      maxTokens: 2048,
      ...(config.llmBaseUrl ? { configuration: { baseURL: config.llmBaseUrl } } : {}),
    });
  }

  return _llmClient;
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

/**
 * Check if LLM reasoning is available.
 */
export function isLLMAvailable(): boolean {
  const config = getFleetGraphConfig();
  return !!config.openaiApiKey;
}
