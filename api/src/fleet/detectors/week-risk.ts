/**
 * T017: Blocker, stale-work, and slip detectors for week risk.
 *
 * These detectors analyze fetched week data and produce findings.
 */

import { v4 as uuid } from 'uuid';
import type { FleetGraphFinding, FindingSeverity } from '@ship/shared';
import type { ShipIssue, ShipWeek, ShipDocument } from '../ship-api-client.js';

const STALE_THRESHOLD_DAYS = 3;
const SLIP_THRESHOLD_RATIO = 0.5;

/**
 * Detect blocked issues with no recent activity.
 */
export function detectBlockers(issues: ShipIssue[]): FleetGraphFinding[] {
  const findings: FleetGraphFinding[] = [];
  const now = new Date();

  for (const issue of issues) {
    const state = issue.properties.state;
    if (state !== 'in_progress' && state !== 'in_review') continue;

    // Check if issue has a blocker indicator (blocked state or very old update)
    const updatedAt = new Date(issue.updated_at);
    const daysSinceUpdate = (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceUpdate > STALE_THRESHOLD_DAYS * 2) {
      findings.push({
        id: `finding-blocker-${uuid()}`,
        category: 'blocker',
        severity: 'critical',
        headline: `${issue.title} (#${issue.ticket_number}) appears blocked`,
        rationale: `Issue has been ${state} for ${Math.floor(daysSinceUpdate)} days without any updates.`,
        evidence: [
          `State: ${state} since last update`,
          `Last updated: ${issue.updated_at}`,
        ],
        relatedDocumentIds: [issue.id],
        recommendedAudience: issue.properties.assignee_id
          ? [issue.properties.assignee_id]
          : [],
        requiresHumanAction: true,
        confidence: Math.min(0.95, 0.6 + daysSinceUpdate * 0.05),
      });
    }
  }

  return findings;
}

/**
 * Detect stale in-progress work (no update within threshold).
 */
export function detectStaleWork(issues: ShipIssue[]): FleetGraphFinding[] {
  const findings: FleetGraphFinding[] = [];
  const now = new Date();

  for (const issue of issues) {
    if (issue.properties.state !== 'in_progress') continue;

    const updatedAt = new Date(issue.updated_at);
    const daysSinceUpdate = (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceUpdate >= STALE_THRESHOLD_DAYS && daysSinceUpdate < STALE_THRESHOLD_DAYS * 2) {
      const severity: FindingSeverity = daysSinceUpdate > 5 ? 'high' : 'medium';

      findings.push({
        id: `finding-stale-${uuid()}`,
        category: 'stale_work',
        severity,
        headline: `${issue.title} (#${issue.ticket_number}) has stalled`,
        rationale: `In progress for ${Math.floor(daysSinceUpdate)} days without updates. Expected progress within ${STALE_THRESHOLD_DAYS} days.`,
        evidence: [
          `State: in_progress`,
          `Last updated: ${issue.updated_at}`,
          `Days since update: ${Math.floor(daysSinceUpdate)}`,
        ],
        relatedDocumentIds: [issue.id],
        recommendedAudience: issue.properties.assignee_id
          ? [issue.properties.assignee_id]
          : [],
        requiresHumanAction: true,
        confidence: 0.85,
      });
    }
  }

  return findings;
}

/**
 * Detect likely scope spillover — too many issues not started near week end.
 */
export function detectSlippingScope(
  issues: ShipIssue[],
  week?: ShipWeek,
): FleetGraphFinding[] {
  if (issues.length === 0) return [];

  const notStartedStates = ['triage', 'backlog', 'todo'];
  const notStarted = issues.filter(i => notStartedStates.includes(i.properties.state));
  const ratio = notStarted.length / issues.length;

  if (ratio < SLIP_THRESHOLD_RATIO) return [];

  const weekLabel = week
    ? `Week ${week.properties.sprint_number}`
    : 'Current week';

  return [{
    id: `finding-slip-${uuid()}`,
    category: 'slipping_scope',
    severity: ratio > 0.7 ? 'critical' : 'high',
    headline: `${weekLabel} has ${Math.round(ratio * 100)}% of issues not started`,
    rationale: `${notStarted.length} of ${issues.length} planned issues have not been started. At current velocity, planned scope is unlikely to complete.`,
    evidence: [
      `Not started: ${notStarted.length}/${issues.length}`,
      `States: ${notStarted.map(i => `#${i.ticket_number} (${i.properties.state})`).join(', ')}`,
    ],
    relatedDocumentIds: week ? [week.id] : [],
    recommendedAudience: week?.properties.owner_id
      ? [week.properties.owner_id]
      : [],
    requiresHumanAction: true,
    confidence: 0.8,
  }];
}

/**
 * Detect missing plan approval for an active week.
 */
export function detectMissingPlanApproval(week: ShipWeek): FleetGraphFinding[] {
  const approval = week.properties.plan_approval;
  const status = week.properties.status;

  // Only flag active weeks with no approval
  if (status !== 'active') return [];
  if (approval && approval.state === 'approved') return [];

  return [{
    id: `finding-planning-gap-${uuid()}`,
    category: 'planning_gap',
    severity: 'high',
    headline: `Week ${week.properties.sprint_number} plan is not approved`,
    rationale: 'Active week is operating without an approved plan. Plan approval ensures alignment before execution begins.',
    evidence: [
      `Plan approval state: ${approval?.state ?? 'none'}`,
      `Week status: ${status}`,
    ],
    relatedDocumentIds: [week.id],
    recommendedAudience: week.properties.owner_id
      ? [week.properties.owner_id]
      : [],
    requiresHumanAction: true,
    confidence: 0.95,
  }];
}

/**
 * Run all week-risk detectors and return combined, sorted findings.
 */
export function runWeekRiskDetectors(
  issues: ShipIssue[],
  week?: ShipWeek,
): FleetGraphFinding[] {
  const findings: FleetGraphFinding[] = [
    ...detectBlockers(issues),
    ...detectStaleWork(issues),
    ...detectSlippingScope(issues, week),
    ...(week ? detectMissingPlanApproval(week) : []),
  ];

  // Sort by severity priority
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
