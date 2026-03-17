/**
 * Reasoning node — runs deterministic detectors, then single LLM synthesis call.
 * Detectors are the source of truth; LLM enhances with narrative and chat.
 */

import { v4 as uuid } from 'uuid';
import type {
  FleetGraphFinding,
  FleetGraphRecommendation,
} from '@ship/shared';
import type { FleetGraphStateType } from '../graph.js';
import type { ShipIssue, ShipWeek } from '../ship-api-client.js';
import { runWeekRiskDetectors } from '../detectors/week-risk.js';
import { runPersonWorkloadDetectors } from '../detectors/person-workload.js';
import { synthesizeProactiveFindings, synthesizeChat } from '../llm/synthesis.js';

export async function reasoningNode(state: FleetGraphStateType): Promise<Partial<FleetGraphStateType>> {
  const { invocation, fetchedResources, contextSummary, chatMessages } = state;

  // Step 1: Run deterministic detectors on fetched resources
  const issues = fetchedResources.filter(r => r.document_type === 'issue') as ShipIssue[];
  const weeks = fetchedResources.filter(r => r.document_type === 'sprint') as ShipWeek[];
  const week = weeks[0]; // Primary week for detectors

  let detectorFindings: FleetGraphFinding[] = [];
  if (issues.length > 0) {
    detectorFindings = runWeekRiskDetectors(issues, week);
  }

  if (invocation.viewType === 'person' && invocation.documentId) {
    detectorFindings.push(...runPersonWorkloadDetectors(issues, invocation.documentId));
  }

  // Also run person workload detectors for the actor if we have their issues
  if (invocation.actorPersonId && invocation.viewType !== 'person') {
    detectorFindings.push(...runPersonWorkloadDetectors(issues, invocation.actorPersonId));
  }

  // Build actor context for LLM personalization
  const actor = invocation.actorPersonId
    ? { name: invocation.actorName, personId: invocation.actorPersonId }
    : undefined;

  // Step 2: LLM synthesis
  try {
    if (chatMessages && chatMessages.length > 0) {
      // Chat mode: synthesize with conversation history
      const result = await synthesizeChat(
        chatMessages,
        detectorFindings,
        fetchedResources,
        contextSummary,
        actor,
      );

      // Convert LLM recommendations to FleetGraphRecommendation format
      const recommendations = result.recommendations.map(r => toRecommendation(r));

      return {
        detectedFindings: detectorFindings,
        recommendedActions: recommendations,
        llmSummary: result.message,
      };
    } else {
      // Proactive mode: synthesize detector findings
      const result = await synthesizeProactiveFindings(
        detectorFindings,
        fetchedResources,
        contextSummary,
      );

      const recommendations = result.recommendations.map(r => toRecommendation(r));

      return {
        detectedFindings: detectorFindings,
        recommendedActions: recommendations,
        llmSummary: result.summary,
      };
    }
  } catch (err) {
    // LLM failure: fall back to detector-only output
    const message = err instanceof Error ? err.message : String(err);
    console.error('Reasoning node LLM error:', message);
    return {
      detectedFindings: detectorFindings,
      recommendedActions: [],
      errors: [`LLM synthesis failed: ${message}`],
      degradationTier: 'partial',
    };
  }
}

function toRecommendation(r: {
  type: string;
  reason: string;
  expectedImpact: string;
  actionType?: string | null;
  targetDocumentId?: string | null;
  proposedChange?: { field: string; old_value: unknown; new_value: unknown } | null;
}): FleetGraphRecommendation {
  return {
    id: `rec-${uuid()}`,
    type: r.type as FleetGraphRecommendation['type'],
    reason: r.reason,
    expectedImpact: r.expectedImpact,
    approvalStatus: r.actionType ? 'pending' : 'not_required',
    affectedDocumentIds: r.targetDocumentId ? [r.targetDocumentId] : [],
    actionType: (r.actionType as FleetGraphRecommendation['actionType']) ?? undefined,
    proposedChange: r.proposedChange ?? undefined,
  };
}
