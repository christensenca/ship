/**
 * T035: Cross-program drift summarization.
 */

import type {
  FleetGraphProgramSummary,
  ProgramHealthStatus,
  PortfolioSummaryRequest,
  PortfolioSummaryResponse,
} from '@ship/shared';
import { ShipAPIClient, type ShipDocument } from '../ship-api-client.js';
import { getFleetGraphConfig } from '../runtime.js';

const SILENT_THRESHOLD_DAYS = 7;

/**
 * Generate a portfolio drift summary.
 */
export async function generatePortfolioSummary(
  request: PortfolioSummaryRequest,
): Promise<PortfolioSummaryResponse> {
  const config = getFleetGraphConfig();
  const client = new ShipAPIClient({
    baseUrl: config.shipApiBaseUrl,
    apiToken: config.shipApiToken,
  });

  try {
    const programs = await client.listPrograms();

    // Filter to requested programs if specified
    const targetPrograms = request.programIds?.length
      ? programs.filter(p => request.programIds!.includes(p.id))
      : programs;

    const issues = await client.listIssues();

    const summaries: FleetGraphProgramSummary[] = targetPrograms.map(program => {
      return assessProgramHealth(program, issues);
    });

    // Sort: stalled first, then at_risk, then on_track
    const statusOrder: Record<string, number> = { stalled: 0, at_risk: 1, on_track: 2 };
    summaries.sort((a, b) =>
      (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3)
    );

    const stalledCount = summaries.filter(s => s.status === 'stalled').length;
    const atRiskCount = summaries.filter(s => s.status === 'at_risk').length;
    const onTrackCount = summaries.filter(s => s.status === 'on_track').length;

    return {
      summary: `Portfolio: ${summaries.length} programs (${onTrackCount} on track, ${atRiskCount} at risk, ${stalledCount} stalled)`,
      programs: summaries,
    };
  } catch (err) {
    console.error('Portfolio summary generation failed:', err);
    return {
      summary: 'Unable to generate portfolio summary.',
      programs: [],
    };
  }
}

/**
 * Assess the health status of a single program based on its issues.
 */
function assessProgramHealth(
  program: ShipDocument,
  allIssues: ShipDocument[],
): FleetGraphProgramSummary {
  // Find issues that belong to this program
  const programIssues = allIssues.filter(issue => {
    const belongsTo = issue.belongs_to ?? [];
    return belongsTo.some(b => b.id === program.id && b.type === 'program');
  });

  const now = new Date();
  const daysSinceUpdate = program.updated_at
    ? (now.getTime() - new Date(program.updated_at).getTime()) / (1000 * 60 * 60 * 24)
    : Infinity;

  // Count blockers (issues in blocked-like states)
  const blockerCount = programIssues.filter(i => {
    const state = (i.properties as any)?.state;
    return state === 'in_progress' &&
      (now.getTime() - new Date(i.updated_at).getTime()) / (1000 * 60 * 60 * 24) > 6;
  }).length;

  // Determine status
  let status: ProgramHealthStatus = 'on_track';
  let headline = `${program.title} is progressing normally.`;

  if (daysSinceUpdate > SILENT_THRESHOLD_DAYS && programIssues.length === 0) {
    status = 'stalled';
    headline = `${program.title} has had no activity for ${Math.floor(daysSinceUpdate)} days.`;
  } else if (blockerCount >= 3 || (blockerCount > 0 && programIssues.length < 5)) {
    status = 'at_risk';
    headline = `${program.title} has ${blockerCount} stalled issue${blockerCount !== 1 ? 's' : ''}.`;
  } else if (blockerCount > 0) {
    status = 'at_risk';
    headline = `${program.title} has ${blockerCount} issue${blockerCount !== 1 ? 's' : ''} needing attention.`;
  }

  return {
    programId: program.id,
    status,
    headline,
    blockers: blockerCount,
    silentDays: Math.floor(daysSinceUpdate),
  };
}
