/**
 * T040: FleetGraph observability helpers - logging, metrics, fallback tracing.
 */

export interface FleetGraphLogEntry {
  level: 'info' | 'warn' | 'error';
  correlationId: string;
  action: string;
  message: string;
  duration?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Log a FleetGraph operation.
 */
export function logFleetGraph(entry: FleetGraphLogEntry): void {
  const prefix = `[FleetGraph:${entry.correlationId}]`;
  const durationStr = entry.duration !== undefined ? ` (${entry.duration}ms)` : '';

  switch (entry.level) {
    case 'error':
      console.error(`${prefix} ${entry.action}: ${entry.message}${durationStr}`, entry.metadata ?? '');
      break;
    case 'warn':
      console.warn(`${prefix} ${entry.action}: ${entry.message}${durationStr}`, entry.metadata ?? '');
      break;
    default:
      console.log(`${prefix} ${entry.action}: ${entry.message}${durationStr}`, entry.metadata ?? '');
  }
}

/**
 * Measure and log the duration of an async operation.
 */
export async function withTiming<T>(
  correlationId: string,
  action: string,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();

  try {
    const result = await fn();
    const duration = Date.now() - start;

    logFleetGraph({
      level: 'info',
      correlationId,
      action,
      message: 'completed',
      duration,
    });

    return result;
  } catch (err) {
    const duration = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);

    logFleetGraph({
      level: 'error',
      correlationId,
      action,
      message: `failed: ${message}`,
      duration,
    });

    throw err;
  }
}

/**
 * Log a fallback event for observability.
 */
export function logFallback(
  correlationId: string,
  errorType: string,
  userMessage: string,
  retryable: boolean,
): void {
  logFleetGraph({
    level: 'warn',
    correlationId,
    action: 'fallback',
    message: userMessage,
    metadata: { errorType, retryable },
  });
}
