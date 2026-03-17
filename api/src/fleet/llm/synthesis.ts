/**
 * LLM synthesis module — constructs prompts, calls ChatOpenAI, parses structured output.
 */

import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type {
  FleetGraphFinding,
  FleetGraphRecommendation,
  ChatMessage,
} from '@ship/shared';
import type { ShipDocument } from '../ship-api-client.js';
import { getLLMClient } from '../runtime.js';
import {
  SYSTEM_PROMPT,
  buildProactiveSynthesisPrompt,
  buildChatPrompt,
  type ActorContext,
} from './prompts.js';

export interface SynthesisResult {
  summary: string;
  enhancedFindings: Array<{ headline: string; rationale: string; severity: string }>;
  recommendations: Array<{
    type: string;
    reason: string;
    expectedImpact: string;
    actionType?: string | null;
    targetDocumentId?: string | null;
    proposedChange?: { field: string; old_value: unknown; new_value: unknown } | null;
  }>;
}

export interface ChatSynthesisResult {
  message: string;
  recommendations: Array<{
    type: string;
    reason: string;
    expectedImpact: string;
    actionType?: string | null;
    targetDocumentId?: string | null;
    proposedChange?: { field: string; old_value: unknown; new_value: unknown } | null;
  }>;
}

/**
 * Run LLM synthesis for proactive scan results.
 * Returns enhanced findings and recommendations with narrative context.
 */
export async function synthesizeProactiveFindings(
  detectorFindings: FleetGraphFinding[],
  resources: ShipDocument[],
  contextSummary: string,
): Promise<SynthesisResult> {
  const llm = getLLMClient();
  if (!llm) {
    // Fallback: no LLM available, return detector findings as-is
    return {
      summary: contextSummary,
      enhancedFindings: detectorFindings.map(f => ({
        headline: f.headline,
        rationale: f.rationale,
        severity: f.severity,
      })),
      recommendations: [],
    };
  }

  const userPrompt = buildProactiveSynthesisPrompt(detectorFindings, resources, contextSummary);

  const response = await llm.invoke([
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage(userPrompt),
  ]);

  return parseProactiveResponse(response.content as string, detectorFindings, contextSummary);
}

/**
 * Run LLM synthesis for chat interaction.
 */
export async function synthesizeChat(
  messages: ChatMessage[],
  detectorFindings: FleetGraphFinding[],
  resources: ShipDocument[],
  contextSummary: string,
  actor?: ActorContext,
): Promise<ChatSynthesisResult> {
  const llm = getLLMClient();
  if (!llm) {
    return {
      message: buildFallbackChatResponse(detectorFindings, contextSummary),
      recommendations: [],
    };
  }

  const userPrompt = buildChatPrompt(messages, detectorFindings, resources, contextSummary, actor);

  const response = await llm.invoke([
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage(userPrompt),
  ]);

  return parseChatResponse(response.content as string, detectorFindings, contextSummary);
}

function parseProactiveResponse(
  raw: string,
  fallbackFindings: FleetGraphFinding[],
  fallbackSummary: string,
): SynthesisResult {
  try {
    // Extract JSON from response (may have markdown code fences)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response');

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      summary: parsed.summary ?? fallbackSummary,
      enhancedFindings: Array.isArray(parsed.findings) ? parsed.findings : fallbackFindings.map(f => ({
        headline: f.headline,
        rationale: f.rationale,
        severity: f.severity,
      })),
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
    };
  } catch {
    // Parse failure — return detector findings with raw text as summary
    return {
      summary: raw.slice(0, 500) || fallbackSummary,
      enhancedFindings: fallbackFindings.map(f => ({
        headline: f.headline,
        rationale: f.rationale,
        severity: f.severity,
      })),
      recommendations: [],
    };
  }
}

function parseChatResponse(
  raw: string,
  fallbackFindings: FleetGraphFinding[],
  fallbackSummary: string,
): ChatSynthesisResult {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      // Treat entire response as a message (no structured data)
      return { message: raw, recommendations: [] };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      message: stripUUIDs(parsed.message ?? raw),
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
    };
  } catch {
    return { message: stripUUIDs(raw), recommendations: [] };
  }
}

/** Strip UUIDs and HTML doc-id comments from user-facing text. */
function stripUUIDs(text: string): string {
  return text
    .replace(/<!-- doc:[0-9a-f-]+ -->/g, '')
    .replace(/\(id: [0-9a-f-]+\)/g, '')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g, '')
    .replace(/ {2,}/g, ' ')
    .trim();
}

function buildFallbackChatResponse(findings: FleetGraphFinding[], contextSummary: string): string {
  if (findings.length === 0) {
    return `Based on available data: ${contextSummary}\n\nNo issues detected. Everything appears to be on track.`;
  }

  const findingList = findings
    .map(f => `- **${f.headline}** (${f.severity}): ${f.rationale}`)
    .join('\n');

  return `Based on available data: ${contextSummary}\n\n**Findings:**\n${findingList}`;
}
