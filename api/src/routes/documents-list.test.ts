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

  it('returns a compact wiki tree payload for type=wiki&view=tree', async () => {
    const res = await request(app)
      .get('/api/documents?type=wiki&view=tree')
      .set('Cookie', sessionCookie);

    expect(res.status).toBe(200);
    const wiki = res.body.find((doc: { id: string }) => doc.id === wikiId);
    expect(wiki).toBeDefined();
    expect(wiki.workspace_id).toBeUndefined();
    expect(wiki.properties).toBeUndefined();
    expect(wiki.state).toBeUndefined();
    expect(wiki.priority).toBeUndefined();
    expect(wiki.created_by).toBeUndefined();
    expect(wiki.updated_at).toBeUndefined();
    expect(wiki.created_at).toBeTruthy();
    expect(wiki.visibility).toBe('workspace');
  });

  it('emits benchmark timing headers for the wiki list fast path', async () => {
    const previousBenchmark = process.env.API_BENCHMARK;
    process.env.API_BENCHMARK = '1';

    try {
      const res = await request(app)
        .get('/api/documents?type=wiki&view=tree')
        .set('Cookie', sessionCookie);

      expect(res.status).toBe(200);
      expect(res.headers['server-timing']).toContain('auth_session');
      expect(res.headers['server-timing']).toContain('db_main');
      expect(res.headers['server-timing']).toContain('serialize');
      expect(res.headers['server-timing']).toContain('total');
    } finally {
      if (previousBenchmark === undefined) {
        delete process.env.API_BENCHMARK;
      } else {
        process.env.API_BENCHMARK = previousBenchmark;
      }
    }
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

  it('returns the fuller wiki list payload without the tree view flag', async () => {
    const res = await request(app)
      .get('/api/documents?type=wiki')
      .set('Cookie', sessionCookie);

    expect(res.status).toBe(200);
    const wiki = res.body.find((doc: { id: string }) => doc.id === wikiId);
    expect(wiki).toBeDefined();
    expect(wiki.created_at).toBeTruthy();
    expect(wiki.updated_at).toBeTruthy();
    expect(wiki.created_by).toBe(testUserId);
    expect(wiki.properties).toBeUndefined();
  });
});
