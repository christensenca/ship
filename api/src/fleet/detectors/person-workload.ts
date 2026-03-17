/**
 * Person workload detectors — overload and idleness detection.
 *
 * These detectors analyze a person's assigned issues and produce capacity findings.
 */

import { v4 as uuid } from 'uuid';
import type { FleetGraphFinding } from '@ship/shared';
import type { ShipIssue } from '../ship-api-client.js';

const OVERLOAD_THRESHOLD = 4;

/**
 * Detect overloaded person — too many issues in progress simultaneously.
 */
export function detectOverload(issues: ShipIssue[], personId: string): FleetGraphFinding[] {
  const inProgress = issues.filter(
    i => i.properties.state === 'in_progress' && i.properties.assignee_id === personId,
  );

  if (inProgress.length <= OVERLOAD_THRESHOLD) return [];

  return [{
    id: `finding-overload-${uuid()}`,
    category: 'capacity_risk',
    severity: 'high',
    headline: `Person has ${inProgress.length} issues in progress (team avg is ~2-3)`,
    rationale: `Having ${inProgress.length} issues in progress simultaneously exceeds the recommended limit of ${OVERLOAD_THRESHOLD}. Context-switching overhead likely reduces effective throughput.`,
    evidence: [
      `In-progress count: ${inProgress.length}`,
      `Issues: ${inProgress.map(i => `#${i.ticket_number} – ${i.title}`).join(', ')}`,
    ],
    relatedDocumentIds: inProgress.map(i => i.id),
    recommendedAudience: [personId],
    requiresHumanAction: true,
    confidence: 0.9,
  }];
}

/**
 * Detect idle person — no work in progress despite having assigned todo items.
 */
export function detectIdleness(issues: ShipIssue[], personId: string): FleetGraphFinding[] {
  const personIssues = issues.filter(i => i.properties.assignee_id === personId);
  const inProgress = personIssues.filter(i => i.properties.state === 'in_progress');
  const todo = personIssues.filter(i => i.properties.state === 'todo');

  if (inProgress.length > 0 || todo.length === 0) return [];

  return [{
    id: `finding-idle-${uuid()}`,
    category: 'capacity_risk',
    severity: 'medium',
    headline: `No work in progress despite ${todo.length} assigned items`,
    rationale: `Person has ${todo.length} issues in todo state but nothing currently in progress. Work may be blocked or awaiting prioritization.`,
    evidence: [
      `In-progress count: 0`,
      `Todo count: ${todo.length}`,
      `Todo issues: ${todo.map(i => `#${i.ticket_number} – ${i.title}`).join(', ')}`,
    ],
    relatedDocumentIds: todo.map(i => i.id),
    recommendedAudience: [personId],
    requiresHumanAction: true,
    confidence: 0.8,
  }];
}

/**
 * Run all person workload detectors and return combined, sorted findings.
 */
export function runPersonWorkloadDetectors(
  issues: ShipIssue[],
  personId: string,
): FleetGraphFinding[] {
  const findings: FleetGraphFinding[] = [
    ...detectOverload(issues, personId),
    ...detectIdleness(issues, personId),
  ];

  const severityOrder: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  return findings.sort((a, b) =>
    (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4)
  );
}
