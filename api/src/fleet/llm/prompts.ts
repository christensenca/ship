/**
 * LLM prompt templates for FleetGraph reasoning.
 */

import type { FleetGraphFinding, ChatMessage } from '@ship/shared';
import type { ShipDocument } from '../ship-api-client.js';

export const SYSTEM_PROMPT = `You are FleetGraph, an AI assistant for the Ship project management tool. Your role is to analyze sprint health, identify risks, and help teams stay on track.

Rules:
- Be concise and actionable. Lead with the most important finding.
- Reference specific issues by title only. NEVER include document IDs or UUIDs in the "message" field — they are for JSON metadata only.
- When proposing actions, explain the expected impact.
- If data is incomplete, say what's missing rather than guessing.
- Never fabricate issue numbers or titles not present in the provided data.
- Format responses in markdown.
- When you know who is asking, personalize your response. Use "you" and "your" when referring to the user's own issues. Distinguish between their work and the team's work.
- For "what should I work on next?" questions, prioritize: 1) in-progress work (finish what's started), 2) issues blocking others, 3) high-priority unstarted items. Explain why each is recommended.

Output format for analysis (JSON):
{
  "summary": "1-2 sentence overall assessment",
  "findings": [{ "headline": "string", "rationale": "string", "severity": "critical|high|medium|low" }],
  "recommendations": [{ "type": "escalate|reassign|rescope|approve_plan|review_blocker", "reason": "string", "expectedImpact": "string", "actionType": "move_issue|reassign|change_priority|change_state|null", "targetDocumentId": "uuid|null", "proposedChange": { "field": "string", "old_value": "any", "new_value": "any" } | null }]
}`;

export interface ActorContext {
  name?: string;
  personId?: string;
}

export function buildProactiveSynthesisPrompt(
  detectorFindings: FleetGraphFinding[],
  resources: ShipDocument[],
  contextSummary: string,
  _actor?: ActorContext,
): string {
  const findingsText = detectorFindings.length > 0
    ? detectorFindings.map(f => `- [${f.severity}] ${f.headline}: ${f.rationale}`).join('\n')
    : 'No issues detected by automated checks.';

  const resourceSummary = summarizeResources(resources);

  return `Context: ${contextSummary}

Data available:
${resourceSummary}

Automated detector findings:
${findingsText}

Synthesize these findings into a cohesive health report. Enhance the detector findings with narrative context. If detectors found nothing, confirm the sprint is healthy. Suggest concrete actions where appropriate.

Respond with the JSON format specified in your instructions.`;
}

export function buildChatPrompt(
  messages: ChatMessage[],
  detectorFindings: FleetGraphFinding[],
  resources: ShipDocument[],
  contextSummary: string,
  actor?: ActorContext,
): string {
  const resourceSummary = summarizeResources(resources, actor?.personId);

  const findingsText = detectorFindings.length > 0
    ? `\nAutomated findings:\n${detectorFindings.map(f => `- [${f.severity}] ${f.headline}`).join('\n')}`
    : '';

  const conversationHistory = messages.slice(0, -1).map(m =>
    `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
  ).join('\n');

  const latestMessage = messages[messages.length - 1]?.content ?? '';

  const actorSection = actor?.name
    ? `\nThe user asking is: ${actor.name} (person ID: ${actor.personId}). Issues assigned to them are marked with [YOUR ISSUE] in the data above. When answering personal questions like "what should I work on next?", focus on their assigned issues.\n`
    : '';

  return `Context: ${contextSummary}
${actorSection}
Data available:
${resourceSummary}
${findingsText}
${conversationHistory ? `\nConversation so far:\n${conversationHistory}\n` : ''}
User question: ${latestMessage}

Answer the user's question based on the data and findings. Be conversational but precise.

IMPORTANT: Include recommendations in these cases:
- The user asks for help with a specific action (e.g., "move this to done", "reassign this", "escalate this blocker")
- The user asks "what should I work on next?" or similar — include a recommendation with actionType "reassign" for the top suggested issue, so the user can assign themselves
- The user asks to be assigned to an issue — include a recommendation with actionType "reassign"
Do NOT propose actions for purely informational questions like "what is this?" or "tell me about this project".

When including a reassign recommendation, use: actionType "reassign", targetDocumentId set to the issue's doc ID from the data above, and proposedChange null (the backend handles the assignment).

Respond as JSON:
{
  "message": "markdown response to the user",
  "recommendations": []
}

Only include recommendations when the user explicitly requests an action:
{
  "message": "markdown response",
  "recommendations": [{ "type": "escalate|reassign|rescope|change_state", "reason": "...", "expectedImpact": "...", "actionType": "move_issue|reassign|change_priority|change_state|null", "targetDocumentId": "uuid from the data above|null", "proposedChange": { "field": "state", "old_value": "current_value", "new_value": "proposed_value" } | null }]
}`;
}

function summarizeResources(resources: ShipDocument[], actorPersonId?: string): string {
  if (resources.length === 0) return 'No data fetched.';

  // Deduplicate resources by ID (actor-issues may overlap with view-scoped issues)
  const seen = new Set<string>();
  const deduped: ShipDocument[] = [];
  for (const r of resources) {
    if (r.id && seen.has(r.id)) continue;
    if (r.id) seen.add(r.id);
    deduped.push(r);
  }

  const byType: Record<string, ShipDocument[]> = {};
  for (const r of deduped) {
    const type = r.document_type ?? (r as any).type ?? 'unknown';
    if (!byType[type]) byType[type] = [];
    byType[type].push(r);
  }

  const parts: string[] = [];
  for (const [type, docs] of Object.entries(byType)) {
    if (type === 'issue') {
      const states: Record<string, number> = {};
      for (const d of docs) {
        const state = (d.properties as any)?.state ?? (d as any).state ?? 'unknown';
        states[state] = (states[state] ?? 0) + 1;
      }
      const stateStr = Object.entries(states).map(([s, c]) => `${c} ${s}`).join(', ');
      // Include issue titles with actor tagging for personalization
      const titles = docs.slice(0, 15).map(d => {
        const state = (d.properties as any)?.state ?? (d as any).state ?? '?';
        const assigneeId = (d.properties as any)?.assignee_id;
        const isActorIssue = actorPersonId && assigneeId === actorPersonId;
        const tag = isActorIssue ? ' [YOUR ISSUE]' : '';
        return `  - ${d.title ?? 'Untitled'} [${state}, priority: ${(d.properties as any)?.priority ?? '?'}]${tag} <!-- doc:${d.id} -->`;
      }).join('\n');
      parts.push(`${docs.length} issues (${stateStr}):\n${titles}`);
    } else if (type === 'sprint') {
      for (const d of docs) {
        parts.push(`Week ${(d.properties as any)?.sprint_number ?? '?'}: "${d.title}"`);
      }
    } else if (type === 'person') {
      parts.push(`${docs.length} team members`);
    } else if (type === 'project') {
      for (const d of docs) {
        parts.push(`Project: "${d.title}"`);
      }
    } else {
      for (const d of docs) {
        parts.push(`${type}: "${d.title ?? 'Untitled'}"`);
      }
    }
  }

  return parts.join('\n');
}
