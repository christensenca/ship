/**
 * T014: Proactive findings API coverage
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock auth middleware - must list all exports used by app.ts
vi.mock('../middleware/auth.js', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => {
    _req.userId = 'user-test-001';
    _req.workspaceId = 'ws-test-001';
    _req.isApiToken = true;
    next();
  },
  workspaceAdminMiddleware: (_req: any, _res: any, next: any) => { next(); },
  workspaceAccessMiddleware: (_req: any, _res: any, next: any) => { next(); },
  superAdminMiddleware: (_req: any, _res: any, next: any) => { next(); },
}));

// Mock proactive findings service
vi.mock('../fleet/services/proactive-findings.js', () => ({
  runProactiveFindingsScan: vi.fn().mockResolvedValue({
    findings: [],
    generatedAt: new Date().toISOString(),
  }),
  shapeRecommendations: vi.fn().mockReturnValue([]),
}));

import { createApp } from '../app.js';
import request from 'supertest';

const app = createApp();

// Bearer header bypasses CSRF protection (conditionalCsrf skips for Bearer auth)
const AUTH_HEADER = ['Authorization', 'Bearer test-token'] as const;

describe('POST /api/agent/proactive-findings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 for invalid request body', async () => {
    const res = await request(app)
      .post('/api/agent/proactive-findings')
      .set(...AUTH_HEADER)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid request');
  });

  it('returns 400 when workspaceId is missing', async () => {
    const res = await request(app)
      .post('/api/agent/proactive-findings')
      .set(...AUTH_HEADER)
      .send({ scopeType: 'week' });

    expect(res.status).toBe(400);
  });

  it('accepts valid proactive findings request', async () => {
    const res = await request(app)
      .post('/api/agent/proactive-findings')
      .set(...AUTH_HEADER)
      .send({
        workspaceId: 'ws-test-001',
        scopeType: 'week',
        scopeId: 'week-test-001',
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('findings');
    expect(Array.isArray(res.body.findings)).toBe(true);
  });

  it('accepts request with triggerType', async () => {
    const res = await request(app)
      .post('/api/agent/proactive-findings')
      .set(...AUTH_HEADER)
      .send({
        workspaceId: 'ws-test-001',
        scopeType: 'program',
        triggerType: 'scheduled',
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('findings');
  });

  it('returns generatedAt timestamp', async () => {
    const res = await request(app)
      .post('/api/agent/proactive-findings')
      .set(...AUTH_HEADER)
      .send({
        workspaceId: 'ws-test-001',
        scopeType: 'week',
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('generatedAt');
  });
});

describe('GET /api/agent/status', () => {
  it('returns availability status', async () => {
    const res = await request(app)
      .get('/api/agent/status');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('available');
    expect(typeof res.body.available).toBe('boolean');
  });
});
