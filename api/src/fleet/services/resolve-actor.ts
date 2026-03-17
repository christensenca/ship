/**
 * Resolve an authenticated user ID to their person document and name.
 * Used to populate actorPersonId/actorName on InvocationContext.
 */

import { pool } from '../../db/client.js';

export interface ResolvedActor {
  personId: string;
  name: string;
}

/**
 * Look up the person document for a given user ID within a workspace.
 * Returns null if no person document is linked (shouldn't happen in normal use).
 */
export async function resolveActor(
  userId: string,
  workspaceId: string,
): Promise<ResolvedActor | null> {
  const result = await pool.query(
    `SELECT id, title FROM documents
     WHERE workspace_id = $1 AND document_type = 'person' AND properties->>'user_id' = $2
     LIMIT 1`,
    [workspaceId, userId],
  );

  const row = result.rows[0];
  if (!row) return null;

  return { personId: row.id, name: row.title };
}
