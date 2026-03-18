import type { ChatMessage, FleetGraphFinding } from '@ship/shared';
import type { ShipDocument } from '../ship-api-client.js';

export const SYSTEM_PROMPT = `You are FleetGraph, the Ship workflow agent.

You reason about work relevance, assignment risk, capacity imbalance, and the best next action.

Rules:
- Do not invent projects, people, issues, or capacities.
- Prefer one concrete recommendation over many weak ones.
- If no action is justified, say so clearly.
- Never include UUIDs in the user-facing summary.
- For chat mode, answer the user directly and briefly.
- For event mode, explain why the assignment change is healthy or risky.
- In chat mode, if you choose an issue, the summary must describe that chosen issue only.
- In chat mode, if no issue is chosen, do not mention a specific issue title.

Return strict JSON:
{
  "summary": "short markdown summary",
  "decisionType": "continue|assign_to_me|none|null",
  "chosenIssueId": "issue id or null",
  "finding": {
    "headline": "string",
    "rationale": "string",
    "severity": "critical|high|medium|low"
  } | null,
  "recommendation": {
    "reason": "string",
    "expectedImpact": "string"
  } | null
}`;

export function buildReasoningPrompt(params: {
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
}): string {
  const resources = summarizeResources(params.resources);
  const findings = params.findings.length > 0
    ? params.findings.map((finding) => `- [${finding.severity}] ${finding.headline}: ${finding.rationale}`).join('\n')
    : 'No deterministic findings.';
  const conversation = params.messages?.length
    ? params.messages.map((message) => `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content}`).join('\n')
    : 'No conversation history.';
  const proposed = params.candidateActionDescription ?? 'No concrete action candidate.';
  const candidates = params.candidates?.length
    ? params.candidates.map((candidate) =>
      `- id=${candidate.issueId}, title=${candidate.title}, scope=${candidate.scope}, state=${candidate.state}, priority=${candidate.priority}, kind=${candidate.recommendationKind}, rationale=${candidate.rationale}`)
      .join('\n')
    : 'No prepared candidates.';

  return [
    `Mode: ${params.mode}`,
    `Context: ${params.contextSummary}`,
    '',
    'Available resources:',
    resources,
    '',
    'Deterministic findings:',
    findings,
    '',
    'Conversation:',
    conversation,
    '',
    'Prepared candidates:',
    candidates,
    '',
    'Current best candidate action:',
    proposed,
    '',
    params.mode === 'chat'
      ? `Choose the single best candidate for the user's request.
Return summary that explains the choice.
Only choose from the prepared candidates.
For chat mode, also return "decisionType" and "chosenIssueId".
Only choose "assign_to_me" if the user is asking to find or pick up new work.`
      : 'Decide whether this assignment change created a capacity or rebalance problem worth surfacing.',
  ].join('\n');
}

function summarizeResources(resources: ShipDocument[]): string {
  if (resources.length === 0) return 'No resources loaded.';

  return resources.slice(0, 25).map((resource) => {
    const props = resource.properties ?? {};
    const parts = [
      `${resource.document_type}:${resource.title ?? 'Untitled'}`,
      `id=${resource.id}`,
    ];
    if (resource.document_type === 'issue') {
      parts.push(`state=${String(props.state ?? 'unknown')}`);
      parts.push(`priority=${String(props.priority ?? 'medium')}`);
      parts.push(`assignee=${String(props.assignee_id ?? 'unassigned')}`);
      parts.push(`estimate=${String(props.estimate ?? 'unknown')}`);
    }
    if (resource.document_type === 'person') {
      parts.push(`capacity=${String(props.capacity_hours ?? 'unknown')}`);
    }
    return `- ${parts.join(', ')}`;
  }).join('\n');
}
