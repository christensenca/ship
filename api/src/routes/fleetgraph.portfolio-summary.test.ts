/**
 * T032: Portfolio summary API coverage
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import { createApp } from '../app.js';
import request from 'supertest';

const app = createApp();
const AUTH_HEADER = ['Authorization', 'Bearer test-token'] as const;

describe('POST /api/agent/portfolio-summary', () => {
  it('returns 400 for missing workspaceId', async () => {
    const res = await request(app)
      .post('/api/agent/portfolio-summary')
      .set(...AUTH_HEADER)
      .send({});

    expect(res.status).toBe(400);
  });

  it('accepts valid portfolio summary request', async () => {
    const res = await request(app)
      .post('/api/agent/portfolio-summary')
      .set(...AUTH_HEADER)
      .send({ workspaceId: 'ws-001' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('summary');
    expect(res.body).toHaveProperty('programs');
    expect(Array.isArray(res.body.programs)).toBe(true);
  });

  it('accepts request with programIds filter', async () => {
    const res = await request(app)
      .post('/api/agent/portfolio-summary')
      .set(...AUTH_HEADER)
      .send({
        workspaceId: 'ws-001',
        programIds: ['prog-001', 'prog-002'],
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('summary');
    expect(res.body).toHaveProperty('programs');
  });
});
