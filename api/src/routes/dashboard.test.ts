import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';

process.env.API_BENCHMARK = '1';

import { createApp } from '../app.js';
import { pool } from '../db/client.js';

describe('Dashboard API', () => {
  const app = createApp();
  const testRunId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const testEmail = `dashboard-test-${testRunId}@ship.local`;
  const testWorkspaceName = `Dashboard Test ${testRunId}`;

  let sessionCookie: string;
  let testWorkspaceId: string;
  let testUserId: string;
  let personId: string;
  let projectId: string;

  beforeAll(async () => {
    const workspaceResult = await pool.query(
      `INSERT INTO workspaces (name, sprint_start_date) VALUES ($1, CURRENT_DATE - INTERVAL '14 days') RETURNING id`,
      [testWorkspaceName]
    );
    testWorkspaceId = workspaceResult.rows[0].id;

    const userResult = await pool.query(
      `INSERT INTO users (email, password_hash, name)
       VALUES ($1, 'test-hash', 'Dashboard Test User')
       RETURNING id`,
      [testEmail]
    );
    testUserId = userResult.rows[0].id;

    await pool.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, 'member')`,
      [testWorkspaceId, testUserId]
    );

    const sessionId = crypto.randomBytes(32).toString('hex');
    await pool.query(
      `INSERT INTO sessions (id, user_id, workspace_id, expires_at)
       VALUES ($1, $2, $3, now() + interval '1 hour')`,
      [sessionId, testUserId, testWorkspaceId]
    );
    sessionCookie = `session_id=${sessionId}`;

    const personResult = await pool.query(
      `INSERT INTO documents (workspace_id, document_type, title, visibility, created_by, properties)
       VALUES ($1, 'person', 'Dashboard Person', 'workspace', $2, $3)
       RETURNING id`,
      [testWorkspaceId, testUserId, JSON.stringify({ user_id: testUserId, email: testEmail })]
    );
    personId = personResult.rows[0].id;

    const projectResult = await pool.query(
      `INSERT INTO documents (workspace_id, document_type, title, visibility, created_by)
       VALUES ($1, 'project', 'Dashboard Project', 'workspace', $2)
       RETURNING id`,
      [testWorkspaceId, testUserId]
    );
    projectId = projectResult.rows[0].id;

    await pool.query(
      `INSERT INTO documents (workspace_id, document_type, title, visibility, created_by, properties)
       VALUES
       ($1, 'weekly_plan', 'Current Plan', 'workspace', $2, $3),
       ($1, 'weekly_retro', 'Current Retro', 'workspace', $2, $4),
       ($1, 'weekly_retro', 'Previous Retro', 'workspace', $2, $5),
       ($1, 'standup', 'Monday Standup', 'workspace', $2, $6),
       ($1, 'sprint', 'Week Allocation', 'workspace', $2, $7)`,
      [
        testWorkspaceId,
        testUserId,
        JSON.stringify({ person_id: personId, week_number: 3, submitted_at: '2026-03-10T10:00:00.000Z' }),
        JSON.stringify({ person_id: personId, week_number: 3, submitted_at: '2026-03-11T10:00:00.000Z' }),
        JSON.stringify({ person_id: personId, week_number: 2, submitted_at: '2026-03-04T10:00:00.000Z' }),
        JSON.stringify({ author_id: testUserId, date: '2026-03-11' }),
        JSON.stringify({ assignee_ids: [personId], project_id: projectId, sprint_number: 3 }),
      ]
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [testUserId]);
    await pool.query('DELETE FROM document_associations WHERE document_id IN (SELECT id FROM documents WHERE workspace_id = $1)', [testWorkspaceId]);
    await pool.query('DELETE FROM documents WHERE workspace_id = $1', [testWorkspaceId]);
    await pool.query('DELETE FROM workspace_memberships WHERE user_id = $1', [testUserId]);
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
    await pool.query('DELETE FROM workspaces WHERE id = $1', [testWorkspaceId]);
  });

  it('returns the current my-week payload and emits server timing in benchmark mode', async () => {
    const res = await request(app)
      .get('/api/dashboard/my-week')
      .set('Cookie', sessionCookie);

    expect(res.status).toBe(200);
    expect(res.body.person_id).toBe(personId);
    expect(res.body.plan?.title).toBe('Current Plan');
    expect(res.body.retro?.title).toBe('Current Retro');
    expect(res.body.previous_retro?.week_number).toBe(2);
    expect(res.body.projects).toEqual([
      expect.objectContaining({
        id: projectId,
        title: 'Dashboard Project',
      }),
    ]);
    expect(res.body.standups).toHaveLength(7);
    expect(res.headers['server-timing']).toContain('db_main');
    expect(res.headers['server-timing']).toContain('auth_session');
    expect(res.headers['server-timing']).toContain('total');
  });
});
