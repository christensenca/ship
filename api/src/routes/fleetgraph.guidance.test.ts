/**
 * T023: Contextual guidance and draft API coverage
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

describe('POST /api/agent/contextual-guidance', () => {
  it('returns 400 for missing workspaceId', async () => {
    const res = await request(app)
      .post('/api/agent/contextual-guidance')
      .set(...AUTH_HEADER)
      .send({ viewType: 'issue' });

    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid viewType', async () => {
    const res = await request(app)
      .post('/api/agent/contextual-guidance')
      .set(...AUTH_HEADER)
      .send({ workspaceId: 'ws-001', viewType: 'invalid' });

    expect(res.status).toBe(400);
  });

  it('accepts valid guidance request', async () => {
    const res = await request(app)
      .post('/api/agent/contextual-guidance')
      .set(...AUTH_HEADER)
      .send({
        workspaceId: 'ws-001',
        viewType: 'issue',
        documentId: 'doc-001',
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('summary');
    expect(res.body).toHaveProperty('findings');
    expect(res.body).toHaveProperty('recommendations');
  });

  it('accepts guidance request with user prompt', async () => {
    const res = await request(app)
      .post('/api/agent/contextual-guidance')
      .set(...AUTH_HEADER)
      .send({
        workspaceId: 'ws-001',
        viewType: 'week',
        documentId: 'week-001',
        prompt: 'What should I work on next?',
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('summary');
  });

  it('accepts person view guidance', async () => {
    const res = await request(app)
      .post('/api/agent/contextual-guidance')
      .set(...AUTH_HEADER)
      .send({
        workspaceId: 'ws-001',
        viewType: 'person',
        documentId: 'person-001',
      });

    expect(res.status).toBe(200);
  });
});

describe('POST /api/agent/drafts', () => {
  it('returns 400 for missing required fields', async () => {
    const res = await request(app)
      .post('/api/agent/drafts')
      .set(...AUTH_HEADER)
      .send({ workspaceId: 'ws-001' });

    expect(res.status).toBe(400);
  });

  it('accepts valid standup draft request', async () => {
    const res = await request(app)
      .post('/api/agent/drafts')
      .set(...AUTH_HEADER)
      .send({
        workspaceId: 'ws-001',
        draftType: 'standup',
        sourceContext: { personId: 'person-001' },
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('draft');
    expect(res.body.draft.type).toBe('standup');
    expect(res.body.draft.status).toBe('draft');
    expect(res.body.draft.automated).toBe(true);
  });

  it('accepts weekly_plan draft request', async () => {
    const res = await request(app)
      .post('/api/agent/drafts')
      .set(...AUTH_HEADER)
      .send({
        workspaceId: 'ws-001',
        draftType: 'weekly_plan',
        sourceContext: { weekId: 'week-001' },
      });

    expect(res.status).toBe(200);
    expect(res.body.draft.type).toBe('weekly_plan');
  });

  it('uses Untitled as default draft title', async () => {
    const res = await request(app)
      .post('/api/agent/drafts')
      .set(...AUTH_HEADER)
      .send({
        workspaceId: 'ws-001',
        draftType: 'standup',
        sourceContext: {},
      });

    expect(res.status).toBe(200);
    expect(res.body.draft.title).toBe('Untitled');
  });
});
