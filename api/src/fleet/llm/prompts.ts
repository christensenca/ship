/**
 * LLM prompt templates for FleetGraph reasoning.
 */

import type { FleetGraphFinding, ChatMessage } from '@ship/shared';
import type { ShipDocument } from '../ship-api-client.js';

export const SYSTEM_PROMPT = `You are FleetGraph, an AI assistant for the Ship project management tool. Your role is to analyze sprint health, identify risks, and help teams stay on track.

Rules:
- Be concise and actionable. Lead with the most important finding.
- Reference specific issues by title and ticket number when available.
- When proposing actions, explain the expected impact.
- If data is incomplete, say what's missing rather than guessing.
- Never fabricate issue numbers or titles not present in the provided data.
- Format responses in markdown.

Output format for analysis (JSON):
{
  "summary": "1-2 sentence overall assessment",
  "findings": [{ "headline": "string", "rationale": "string", "severity": "critical|high|medium|low" }],
  "recommendations": [{ "type": "escalate|reassign|rescope|approve_plan|review_blocker", "reason": "string", "expectedImpact": "string", "actionType": "move_issue|reassign|change_priority|change_state|null", "targetDocumentId": "uuid|null", "proposedChange": { "field": "string", "old_value": "any", "new_value": "any" } | null }]
}`;

export function buildProactiveSynthesisPrompt(
  detectorFindings: FleetGraphFinding[],
  resources: ShipDocument[],
  contextSummary: string,
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
): string {
  const resourceSummary = summarizeResources(resources);

  const findingsText = detectorFindings.length > 0
    ? `\nAutomated findings:\n${detectorFindings.map(f => `- [${f.severity}] ${f.headline}`).join('\n')}`
    : '';

  const conversationHistory = messages.slice(0, -1).map(m =>
    `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
  ).join('\n');

  const latestMessage = messages[messages.length - 1]?.content ?? '';

  return `Context: ${contextSummary}

Data available:
${resourceSummary}
${findingsText}
${conversationHistory ? `\nConversation so far:\n${conversationHistory}\n` : ''}
User question: ${latestMessage}

Answer the user's question based on the data and findings. Be conversational but precise.

IMPORTANT: Only include recommendations when the user is asking for help with a specific action (e.g., "move this to done", "reassign this", "escalate this blocker"). Do NOT propose actions for informational questions like "what is this?" or "tell me about this project". Most chat messages should have an empty recommendations array.

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

function summarizeResources(resources: ShipDocument[]): string {
  if (resources.length === 0) return 'No data fetched.';

  const byType: Record<string, ShipDocument[]> = {};
  for (const r of resources) {
    const type = r.document_type ?? (r as any).type ?? 'unknown';
    if (!byType[type]) byType[type] = [];
    byType[type].push(r);
  }

  const parts: string[] = [];
  for (const [type, docs] of Object.entries(byType)) {
    if (type === 'issue') {
      const states: Record<string, number> = {};
      for (const d of docs) {
        // Support both nested properties.state and flat state field
        const state = (d.properties as any)?.state ?? (d as any).state ?? 'unknown';
        states[state] = (states[state] ?? 0) + 1;
      }
      const stateStr = Object.entries(states).map(([s, c]) => `${c} ${s}`).join(', ');
      // Include issue titles for better LLM context
      const titles = docs.slice(0, 10).map(d => `  - ${d.title ?? 'Untitled'} (${(d.properties as any)?.state ?? (d as any).state ?? '?'})`).join('\n');
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
