import type { NextFunction, Request, Response } from 'express';

type PerfPhaseMap = Map<string, number>;

function isBenchmarkEnabled(): boolean {
  return process.env.API_BENCHMARK === '1';
}

function nowMs(): number {
  return Number(process.hrtime.bigint()) / 1_000_000;
}

function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
}

declare global {
  namespace Express {
    interface Request {
      perfPhases?: PerfPhaseMap;
      perfRequestStartMs?: number;
    }
  }
}

function addPhaseDuration(req: Request, phase: string, durationMs: number): void {
  if (!isBenchmarkEnabled() || !req.perfPhases || durationMs < 0) {
    return;
  }

  const previous = req.perfPhases.get(phase) ?? 0;
  req.perfPhases.set(phase, previous + durationMs);
}

export function measureRequestPerf<T>(req: Request, phase: string, fn: () => T): T {
  if (!isBenchmarkEnabled()) {
    return fn();
  }

  const startedAt = nowMs();
  try {
    return fn();
  } finally {
    addPhaseDuration(req, phase, nowMs() - startedAt);
  }
}

export async function measureRequestPerfAsync<T>(
  req: Request,
  phase: string,
  fn: () => Promise<T>
): Promise<T> {
  if (!isBenchmarkEnabled()) {
    return fn();
  }

  const startedAt = nowMs();
  try {
    return await fn();
  } finally {
    addPhaseDuration(req, phase, nowMs() - startedAt);
  }
}

function buildServerTimingHeader(req: Request): string | null {
  if (!req.perfPhases || !req.perfRequestStartMs) {
    return null;
  }

  const totalMs = nowMs() - req.perfRequestStartMs;
  const entries = [...req.perfPhases.entries()]
    .filter(([, duration]) => duration > 0)
    .map(([phase, duration]) => `${phase};dur=${roundMs(duration)}`);

  entries.push(`total;dur=${roundMs(totalMs)}`);
  return entries.join(', ');
}

export function requestPerformanceMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!isBenchmarkEnabled() || !req.path.startsWith('/api/')) {
    next();
    return;
  }

  req.perfPhases = new Map<string, number>();
  req.perfRequestStartMs = nowMs();

  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => (
    measureRequestPerf(req, 'serialize', () => originalJson(body))
  )) as Response['json'];

  const originalWriteHead = res.writeHead.bind(res);
  res.writeHead = ((...args: Parameters<Response['writeHead']>) => {
    const header = buildServerTimingHeader(req);
    if (header) {
      res.setHeader('Server-Timing', header);
    }
    return originalWriteHead(...args);
  }) as Response['writeHead'];

  next();
}
