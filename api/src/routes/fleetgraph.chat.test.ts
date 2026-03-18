import { describe, expect, it, vi } from 'vitest';

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.userId = 'user-test-001';
    req.workspaceId = 'ws-test-001';
    req.isApiToken = true;
    next();
  },
  workspaceAdminMiddleware: (_req: any, _res: any, next: any) => { next(); },
  workspaceAccessMiddleware: (_req: any, _res: any, next: any) => { next(); },
  superAdminMiddleware: (_req: any, _res: any, next: any) => { next(); },
}));

vi.mock('../fleet/services/invoke-agent.js', () => ({
  invokeChatAgent: vi.fn().mockResolvedValue({
    runId: 'run-001',
    summary: 'Assign yourself to AUTH-12 next.',
    findings: [],
    proposedActions: [],
    degradationTier: 'full',
  }),
}));

import request from 'supertest';
import { createApp } from '../app.js';

const app = createApp();
const AUTH_HEADER = ['Authorization', 'Bearer test-token'] as const;

describe('POST /api/agent/chat', () => {
  it('returns 400 for invalid request body', async () => {
    const response = await request(app)
      .post('/api/agent/chat')
      .set(...AUTH_HEADER)
      .send({ workspaceId: 'ws-test-001', messages: [] });

    expect(response.status).toBe(400);
  });

  it('returns unified chat payload', async () => {
    const response = await request(app)
      .post('/api/agent/chat')
      .set(...AUTH_HEADER)
      .send({
        workspaceId: 'ws-test-001',
        viewType: 'project',
        documentId: 'project-001',
        messages: [{ role: 'user', content: 'What should I work on next?' }],
      });

    expect(response.status).toBe(200);
    expect(response.body.runId).toBe('run-001');
    expect(response.body.summary).toBe('Assign yourself to AUTH-12 next.');
    expect(response.body.message).toBe('Assign yourself to AUTH-12 next.');
    expect(response.body.refetchedScope).toBe(true);
  });
});
