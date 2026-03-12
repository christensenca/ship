import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { createApp } from '../app.js';
import { pool } from '../db/client.js';

describe('Documents list payloads', () => {
  const app = createApp();
  const testRunId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const testEmail = `docs-list-${testRunId}@ship.local`;
  const testWorkspaceName = `Docs List ${testRunId}`;

  let sessionCookie: string;
  let testWorkspaceId: string;
  let testUserId: string;
  let wikiId: string;
  let issueId: string;

  beforeAll(async () => {
    const workspaceResult = await pool.query(
      `INSERT INTO workspaces (name) VALUES ($1) RETURNING id`,
      [testWorkspaceName]
    );
    testWorkspaceId = workspaceResult.rows[0].id;

    const userResult = await pool.query(
      `INSERT INTO users (email, password_hash, name)
       VALUES ($1, 'test-hash', 'Documents List User')
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

    const wikiResult = await pool.query(
      `INSERT INTO documents (workspace_id, document_type, title, visibility, created_by, properties)
       VALUES ($1, 'wiki', 'Wiki List Doc', 'workspace', $2, $3)
       RETURNING id`,
      [testWorkspaceId, testUserId, JSON.stringify({ color: '#123456', maintainer_id: testUserId })]
    );
    wikiId = wikiResult.rows[0].id;

    const issueResult = await pool.query(
      `INSERT INTO documents (workspace_id, document_type, title, visibility, created_by, properties)
       VALUES ($1, 'issue', 'Issue List Doc', 'workspace', $2, $3)
       RETURNING id`,
      [testWorkspaceId, testUserId, JSON.stringify({ state: 'backlog', priority: 'high' })]
    );
    issueId = issueResult.rows[0].id;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [testUserId]);
    await pool.query('DELETE FROM document_associations WHERE document_id IN (SELECT id FROM documents WHERE workspace_id = $1)', [testWorkspaceId]);
    await pool.query('DELETE FROM documents WHERE workspace_id = $1', [testWorkspaceId]);
    await pool.query('DELETE FROM workspace_memberships WHERE user_id = $1', [testUserId]);
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
    await pool.query('DELETE FROM workspaces WHERE id = $1', [testWorkspaceId]);
  });

  it('returns a trimmed wiki list payload for type=wiki', async () => {
    const res = await request(app)
      .get('/api/documents?type=wiki')
      .set('Cookie', sessionCookie);

    expect(res.status).toBe(200);
    const wiki = res.body.find((doc: { id: string }) => doc.id === wikiId);
    expect(wiki).toBeDefined();
    expect(wiki.properties).toBeUndefined();
    expect(wiki.state).toBeUndefined();
    expect(wiki.priority).toBeUndefined();
    expect(wiki.visibility).toBe('workspace');
  });

  it('keeps non-wiki document list payload backward-compatible', async () => {
    const res = await request(app)
      .get('/api/documents')
      .set('Cookie', sessionCookie);

    expect(res.status).toBe(200);
    const issue = res.body.find((doc: { id: string }) => doc.id === issueId);
    expect(issue).toBeDefined();
    expect(issue.properties).toBeTruthy();
    expect(issue.state).toBe('backlog');
    expect(issue.priority).toBe('high');
  });
});
