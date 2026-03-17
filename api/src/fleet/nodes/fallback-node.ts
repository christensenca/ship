/**
 * Fallback node — mode-aware error handling.
 * - on_demand (chat): returns partial results with caveats
 * - scheduled/event (proactive): logs failure silently, no notifications
 */

import type { FleetGraphStateType } from '../graph.js';
import type { FallbackEvent } from '../state.js';

export async function fallbackNode(state: FleetGraphStateType): Promise<Partial<FleetGraphStateType>> {
  const { errors, invocation, detectedFindings } = state;

  if (errors.length === 0) return {};

  const isOnDemand = invocation.triggerType === 'on_demand';

  const fallbackEvent: FallbackEvent = {
    fallbackId: `fb-${Date.now()}`,
    errorType: 'node_failure',
    userSafeMessage: isOnDemand
      ? buildPartialResultMessage(errors, detectedFindings.length)
      : 'Proactive scan encountered errors. No notifications sent.',
    recoveryAction: 'retry',
    retryable: true,
    loggedAt: new Date().toISOString(),
  };

  if (isOnDemand) {
    // Chat mode: return partial results with caveats
    return {
      fallbackStatus: [fallbackEvent],
      fallback: {
        message: fallbackEvent.userSafeMessage,
        retryable: true,
      },
    };
  }

  // Proactive mode: log failure silently, suppress notifications
  return {
    fallbackStatus: [fallbackEvent],
    fallback: {
      message: fallbackEvent.userSafeMessage,
      retryable: true,
    },
    // Clear findings to prevent notifications from being sent for failed scans
    detectedFindings: [],
    recommendedActions: [],
  };
}

function buildPartialResultMessage(errors: string[], findingsCount: number): string {
  const unavailable = errors.map(e => {
    const match = e.match(/Fetch (\S+) failed/);
    return match ? match[1] : 'some data';
  });

  const parts: string[] = [];

  if (findingsCount > 0) {
    parts.push(`Analysis completed with partial data (${findingsCount} findings detected).`);
  } else {
    parts.push('Analysis completed with limited data.');
  }

  parts.push(`The following could not be retrieved: ${unavailable.join(', ')}.`);
  parts.push('Results may be incomplete.');

  return parts.join(' ');
}
