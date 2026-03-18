import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { ChatMessage, FleetGraphFinding } from '@ship/shared';
import { getLLMClient } from '../runtime.js';
import type { ShipDocument } from '../ship-api-client.js';
import { buildReasoningPrompt, SYSTEM_PROMPT } from './prompts.js';

export interface UnifiedReasoningResult {
  summary: string;
  decisionType?: 'continue' | 'assign_to_me' | 'none' | null;
  chosenIssueId?: string | null;
  finding?: {
    headline: string;
    rationale: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
  } | null;
  recommendation?: {
    reason: string;
    expectedImpact: string;
  } | null;
}

export async function synthesizeUnifiedReasoning(params: {
  mode: 'chat' | 'event';
  contextSummary: string;
  resources: ShipDocument[];
  findings: FleetGraphFinding[];
  messages?: ChatMessage[];
  candidateActionDescription?: string;
  candidates?: Array<{
    issueId: string;
    title: string;
    scope: string;
    state: string;
    priority: string;
    recommendationKind: string;
    rationale: string;
  }>;
}): Promise<UnifiedReasoningResult | null> {
  const llm = getLLMClient();
  if (!llm) return null;

  const response = await llm.invoke([
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage(buildReasoningPrompt(params)),
  ]);

  return parseReasoningResponse(String(response.content ?? ''));
}

function parseReasoningResponse(raw: string): UnifiedReasoningResult {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      return { summary: raw.trim() || 'Analysis complete.' };
    }
    const parsed = JSON.parse(match[0]);
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : 'Analysis complete.',
      decisionType: parsed.decisionType ?? null,
      chosenIssueId: parsed.chosenIssueId ?? null,
      finding: parsed.finding ?? null,
      recommendation: parsed.recommendation ?? null,
    };
  } catch {
    return { summary: raw.trim() || 'Analysis complete.' };
  }
}
