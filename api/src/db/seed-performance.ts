import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'fs';
import { loadProductionSecrets } from '../config/ssm.js';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: join(__dirname, '../../.env.local') });
config({ path: join(__dirname, '../../.env') });

const WORKSPACE_NAME = 'Perf Benchmark Workspace';
const SEED_KEY = 'api-latency-perf-v1';
const PERF_USER_COUNT = 24;
const MIN_COUNTS = {
  documents: 600,
  issues: 140,
  sprints: 20,
  users: 24,
} as const;
const EXPECTED_SEED_KEY_DOCUMENTS = 665;

type PerfUser = { id: string; email: string; name: string };

function toDateOnly(date: Date): string {
  return date.toISOString().split('T')[0] as string;
}

function normalizeDate(dateLike: unknown): Date {
  if (dateLike instanceof Date) {
    return new Date(Date.UTC(dateLike.getUTCFullYear(), dateLike.getUTCMonth(), dateLike.getUTCDate()));
  }
  if (typeof dateLike === 'string') {
    return new Date(`${dateLike}T00:00:00Z`);
  }
  const fallback = new Date();
  fallback.setUTCHours(0, 0, 0, 0);
  return fallback;
}

async function ensureAssociation(
  pool: pg.Pool,
  documentId: string,
  relatedId: string,
  relationshipType: 'program' | 'project' | 'sprint'
): Promise<void> {
  await pool.query(
    `INSERT INTO document_associations (document_id, related_id, relationship_type, metadata)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (document_id, related_id, relationship_type) DO NOTHING`,
    [documentId, relatedId, relationshipType, JSON.stringify({ seed_key: SEED_KEY })]
  );
}

async function ensureWorkspace(pool: pg.Pool): Promise<{ id: string; sprintStartDate: Date }> {
  const existing = await pool.query(
    `SELECT id, sprint_start_date FROM workspaces WHERE name = $1 ORDER BY created_at ASC LIMIT 1`,
    [WORKSPACE_NAME]
  );

  if (existing.rows[0]) {
    return {
      id: existing.rows[0].id,
      sprintStartDate: normalizeDate(existing.rows[0].sprint_start_date),
    };
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const monday = new Date(today);
  const day = monday.getUTCDay();
  const delta = day === 0 ? 6 : day - 1;
  monday.setUTCDate(monday.getUTCDate() - delta - 56); // 8 weeks ago, aligned to Monday

  const inserted = await pool.query(
    `INSERT INTO workspaces (name, sprint_start_date)
     VALUES ($1, $2)
     RETURNING id, sprint_start_date`,
    [WORKSPACE_NAME, toDateOnly(monday)]
  );

  return {
    id: inserted.rows[0].id,
    sprintStartDate: normalizeDate(inserted.rows[0].sprint_start_date),
  };
}

async function ensurePerfUsers(pool: pg.Pool, workspaceId: string): Promise<PerfUser[]> {
  const passwordHash = await bcrypt.hash('admin123', 10);

  const seedUsers = Array.from({ length: PERF_USER_COUNT }, (_, idx) => {
    const n = idx + 1;
    const isPrimary = n === 1;
    return {
      email: isPrimary ? 'perf.admin@ship.local' : `perf.user${String(n).padStart(3, '0')}@ship.local`,
      name: isPrimary ? 'Perf Admin' : `Perf User ${String(n).padStart(3, '0')}`,
      isAdmin: isPrimary,
    };
  });

  for (const user of seedUsers) {
    await pool.query(
      `INSERT INTO users (email, password_hash, name, is_super_admin, last_workspace_id)
       VALUES ($1, $2, $3, false, $4)
       ON CONFLICT (email) DO UPDATE
       SET name = EXCLUDED.name,
           password_hash = EXCLUDED.password_hash,
           last_workspace_id = EXCLUDED.last_workspace_id`,
      [user.email, passwordHash, user.name, workspaceId]
    );
  }

  const usersResult = await pool.query(
    `SELECT id, email, name FROM users
     WHERE email = 'perf.admin@ship.local' OR email LIKE 'perf.user%@ship.local'
     ORDER BY email ASC`
  );

  const users = usersResult.rows as PerfUser[];

  for (const user of users) {
    const role = user.email === 'perf.admin@ship.local' ? 'admin' : 'member';
    await pool.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [workspaceId, user.id, role]
    );

    await pool.query(
      `INSERT INTO documents (workspace_id, document_type, title, properties, created_by)
       SELECT $1, 'person', $2, $3, $4
       WHERE NOT EXISTS (
         SELECT 1 FROM documents
         WHERE workspace_id = $1
           AND document_type = 'person'
           AND properties->>'user_id' = $5
       )`,
      [
        workspaceId,
        user.name,
        JSON.stringify({ user_id: user.id, email: user.email, seed_key: SEED_KEY }),
        user.id,
        user.id,
      ]
    );
  }

  return users;
}

async function getPersonMap(pool: pg.Pool, workspaceId: string): Promise<Map<string, string>> {
  const result = await pool.query(
    `SELECT id, properties->>'user_id' as user_id
     FROM documents
     WHERE workspace_id = $1
       AND document_type = 'person'
       AND properties ? 'user_id'`,
    [workspaceId]
  );

  const map = new Map<string, string>();
  for (const row of result.rows) {
    if (row.user_id) {
      map.set(row.user_id, row.id);
    }
  }
  return map;
}

async function ensurePrograms(pool: pg.Pool, workspaceId: string, users: PerfUser[]): Promise<Array<{ id: string; index: number }>> {
  const programs: Array<{ id: string; index: number }> = [];

  for (let i = 1; i <= 8; i++) {
    const title = `Perf Program ${String(i).padStart(2, '0')}`;
    const color = ['#2563eb', '#0891b2', '#16a34a', '#ea580c', '#dc2626', '#7c3aed', '#0f766e', '#4f46e5'][(i - 1) % 8]!;
    const owner = users[(i - 1) % users.length]!;

    const existing = await pool.query(
      `SELECT id FROM documents
       WHERE workspace_id = $1 AND document_type = 'program' AND title = $2
       LIMIT 1`,
      [workspaceId, title]
    );

    let programId: string;
    if (existing.rows[0]) {
      programId = existing.rows[0].id;
    } else {
      const inserted = await pool.query(
        `INSERT INTO documents (workspace_id, document_type, title, properties, created_by)
         VALUES ($1, 'program', $2, $3, $4)
         RETURNING id`,
        [workspaceId, title, JSON.stringify({ seed_key: SEED_KEY, color, owner_id: owner.id }), owner.id]
      );
      programId = inserted.rows[0].id;
    }

    programs.push({ id: programId, index: i });
  }

  return programs;
}

async function ensureProjects(
  pool: pg.Pool,
  workspaceId: string,
  users: PerfUser[],
  programs: Array<{ id: string; index: number }>
): Promise<Array<{ id: string; programId: string; index: number }>> {
  const projects: Array<{ id: string; programId: string; index: number }> = [];

  for (let i = 1; i <= 24; i++) {
    const title = `Perf Project ${String(i).padStart(3, '0')}`;
    const owner = users[(i - 1) % users.length]!;
    const program = programs[(i - 1) % programs.length]!;

    const existing = await pool.query(
      `SELECT id FROM documents
       WHERE workspace_id = $1 AND document_type = 'project' AND title = $2
       LIMIT 1`,
      [workspaceId, title]
    );

    let projectId: string;
    if (existing.rows[0]) {
      projectId = existing.rows[0].id;
    } else {
      const properties = {
        seed_key: SEED_KEY,
        owner_id: owner.id,
        impact: ((i % 5) + 1),
        confidence: (((i + 1) % 5) + 1),
        ease: (((i + 2) % 5) + 1),
        color: '#2563eb',
      };

      const inserted = await pool.query(
        `INSERT INTO documents (workspace_id, document_type, title, properties, created_by)
         VALUES ($1, 'project', $2, $3, $4)
         RETURNING id`,
        [workspaceId, title, JSON.stringify(properties), owner.id]
      );
      projectId = inserted.rows[0].id;
    }

    await ensureAssociation(pool, projectId, program.id, 'program');
    projects.push({ id: projectId, programId: program.id, index: i });
  }

  return projects;
}

async function ensureSprints(
  pool: pg.Pool,
  workspaceId: string,
  users: PerfUser[],
  personMap: Map<string, string>,
  projects: Array<{ id: string; programId: string; index: number }>,
  workspaceStartDate: Date
): Promise<Array<{ id: string; sprintNumber: number }>> {
  const sprints: Array<{ id: string; sprintNumber: number }> = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const currentSprintNumber = Math.max(1, Math.floor((today.getTime() - workspaceStartDate.getTime()) / (1000 * 60 * 60 * 24 * 7)) + 1);
  const sprintNumbers = Array.from({ length: 24 }, (_, idx) => currentSprintNumber - 4 + idx).filter(n => n > 0);

  for (let i = 0; i < sprintNumbers.length; i++) {
    const sprintNumber = sprintNumbers[i]!;
    const project = projects[i % projects.length]!;
    const owner = users[i % users.length]!;
    const personIds = [
      personMap.get(users[i % users.length]!.id),
      personMap.get(users[(i + 1) % users.length]!.id),
      personMap.get(users[(i + 2) % users.length]!.id),
    ].filter((id): id is string => Boolean(id));

    const title = `Perf Week ${String(sprintNumber).padStart(3, '0')} (Project ${String(project.index).padStart(3, '0')})`;

    const existing = await pool.query(
      `SELECT id FROM documents
       WHERE workspace_id = $1 AND document_type = 'sprint' AND title = $2
       LIMIT 1`,
      [workspaceId, title]
    );

    let sprintId: string;
    if (existing.rows[0]) {
      sprintId = existing.rows[0].id;
    } else {
      const status = sprintNumber < currentSprintNumber ? 'completed' : sprintNumber === currentSprintNumber ? 'active' : 'planning';
      const properties = {
        seed_key: SEED_KEY,
        sprint_number: sprintNumber,
        owner_id: owner.id,
        project_id: project.id,
        assignee_ids: personIds,
        status,
      };

      const inserted = await pool.query(
        `INSERT INTO documents (workspace_id, document_type, title, properties, created_by)
         VALUES ($1, 'sprint', $2, $3, $4)
         RETURNING id`,
        [workspaceId, title, JSON.stringify(properties), owner.id]
      );
      sprintId = inserted.rows[0].id;
    }

    await ensureAssociation(pool, sprintId, project.id, 'project');
    await ensureAssociation(pool, sprintId, project.programId, 'program');
    sprints.push({ id: sprintId, sprintNumber });
  }

  return sprints;
}

async function nextTicketNumber(pool: pg.Pool, workspaceId: string): Promise<number> {
  const result = await pool.query(
    `SELECT COALESCE(MAX(ticket_number), 0) AS max_ticket
     FROM documents
     WHERE workspace_id = $1 AND document_type = 'issue'`,
    [workspaceId]
  );
  return Number(result.rows[0]?.max_ticket || 0);
}

async function ensureIssues(
  pool: pg.Pool,
  workspaceId: string,
  users: PerfUser[],
  projects: Array<{ id: string; programId: string; index: number }>,
  sprints: Array<{ id: string }>
): Promise<void> {
  let ticketNumber = await nextTicketNumber(pool, workspaceId);

  for (let i = 1; i <= 160; i++) {
    const title = `Perf Issue ${String(i).padStart(4, '0')}`;
    const assignee = users[(i - 1) % users.length]!;
    const project = projects[(i - 1) % projects.length]!;
    const sprint = sprints[(i - 1) % sprints.length]!;

    const existing = await pool.query(
      `SELECT id FROM documents
       WHERE workspace_id = $1 AND document_type = 'issue' AND title = $2
       LIMIT 1`,
      [workspaceId, title]
    );

    let issueId: string;
    if (existing.rows[0]) {
      issueId = existing.rows[0].id;
    } else {
      ticketNumber += 1;
      const state = i % 7 === 0 ? 'done' : i % 5 === 0 ? 'in_progress' : 'todo';
      const priority = i % 10 === 0 ? 'high' : i % 3 === 0 ? 'medium' : 'low';
      const properties = {
        seed_key: SEED_KEY,
        state,
        priority,
        source: 'internal',
        assignee_id: assignee.id,
        estimate: (i % 13) + 1,
      };

      const inserted = await pool.query(
        `INSERT INTO documents (workspace_id, document_type, title, properties, created_by, ticket_number)
         VALUES ($1, 'issue', $2, $3, $4, $5)
         RETURNING id`,
        [workspaceId, title, JSON.stringify(properties), assignee.id, ticketNumber]
      );
      issueId = inserted.rows[0].id;
    }

    await ensureAssociation(pool, issueId, project.programId, 'program');
    await ensureAssociation(pool, issueId, project.id, 'project');
    if (i <= 120) {
      await ensureAssociation(pool, issueId, sprint.id, 'sprint');
    }
  }
}

async function ensureWikiDocs(pool: pg.Pool, workspaceId: string, users: PerfUser[]): Promise<void> {
  const templateContent = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Performance benchmark wiki document.' }],
      },
    ],
  };

  for (let i = 1; i <= 420; i++) {
    const title = `Perf Wiki ${String(i).padStart(4, '0')}`;
    const owner = users[(i - 1) % users.length]!;

    await pool.query(
      `INSERT INTO documents (workspace_id, document_type, title, properties, content, created_by, position)
       SELECT $1, 'wiki', $2, $3, $4, $5, $6
       WHERE NOT EXISTS (
         SELECT 1 FROM documents
         WHERE workspace_id = $1 AND document_type = 'wiki' AND title = $2
       )`,
      [
        workspaceId,
        title,
        JSON.stringify({ seed_key: SEED_KEY }),
        JSON.stringify(templateContent),
        owner.id,
        i,
      ]
    );
  }
}

async function ensureMyWeekSupport(
  pool: pg.Pool,
  workspaceId: string,
  workspaceStartDate: Date,
  personMap: Map<string, string>,
  users: PerfUser[],
  projects: Array<{ id: string }>
): Promise<void> {
  const primaryUser = users.find(u => u.email === 'perf.admin@ship.local') || users[0];
  if (!primaryUser) return;
  const personId = personMap.get(primaryUser.id);
  if (!personId) return;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const currentWeekNumber = Math.max(1, Math.floor((today.getTime() - workspaceStartDate.getTime()) / (1000 * 60 * 60 * 24 * 7)) + 1);
  const currentProject = projects[0];

  if (currentProject) {
    await pool.query(
      `INSERT INTO documents (workspace_id, document_type, title, properties, content, created_by)
       SELECT $1, 'weekly_plan', $2, $3, $4, $5
       WHERE NOT EXISTS (
         SELECT 1 FROM documents
         WHERE workspace_id = $1
           AND document_type = 'weekly_plan'
           AND properties->>'person_id' = $6
           AND (properties->>'week_number')::int = $7
       )`,
      [
        workspaceId,
        `Week ${currentWeekNumber} Plan`,
        JSON.stringify({
          seed_key: SEED_KEY,
          person_id: personId,
          project_id: currentProject.id,
          week_number: currentWeekNumber,
          submitted_at: new Date().toISOString(),
        }),
        JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Perf benchmark weekly plan.' }] }] }),
        primaryUser.id,
        personId,
        currentWeekNumber,
      ]
    );

    await pool.query(
      `INSERT INTO documents (workspace_id, document_type, title, properties, content, created_by)
       SELECT $1, 'weekly_retro', $2, $3, $4, $5
       WHERE NOT EXISTS (
         SELECT 1 FROM documents
         WHERE workspace_id = $1
           AND document_type = 'weekly_retro'
           AND properties->>'person_id' = $6
           AND (properties->>'week_number')::int = $7
       )`,
      [
        workspaceId,
        `Week ${currentWeekNumber - 1} Retro`,
        JSON.stringify({
          seed_key: SEED_KEY,
          person_id: personId,
          project_id: currentProject.id,
          week_number: currentWeekNumber - 1,
          submitted_at: new Date().toISOString(),
        }),
        JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Perf benchmark weekly retro.' }] }] }),
        primaryUser.id,
        personId,
        currentWeekNumber - 1,
      ]
    );
  }

  for (let i = 0; i < 3; i++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const dateStr = toDateOnly(d);

    await pool.query(
      `INSERT INTO documents (workspace_id, document_type, title, properties, content, created_by)
       SELECT $1, 'standup', $2, $3, $4, $5
       WHERE NOT EXISTS (
         SELECT 1 FROM documents
         WHERE workspace_id = $1
           AND document_type = 'standup'
           AND properties->>'author_id' = $6
           AND properties->>'date' = $7
       )`,
      [
        workspaceId,
        `Standup ${dateStr}`,
        JSON.stringify({ seed_key: SEED_KEY, author_id: primaryUser.id, date: dateStr }),
        JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `Standup update for ${dateStr}.` }] }] }),
        primaryUser.id,
        primaryUser.id,
        dateStr,
      ]
    );
  }
}

async function verifyCounts(pool: pg.Pool, workspaceId: string): Promise<void> {
  const documentsCountResult = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM documents
     WHERE workspace_id = $1 AND deleted_at IS NULL`,
    [workspaceId]
  );
  const issuesCountResult = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM documents
     WHERE workspace_id = $1 AND document_type = 'issue' AND deleted_at IS NULL`,
    [workspaceId]
  );
  const sprintsCountResult = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM documents
     WHERE workspace_id = $1 AND document_type = 'sprint' AND deleted_at IS NULL`,
    [workspaceId]
  );
  const usersCountResult = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM users
     WHERE email = 'perf.admin@ship.local' OR email LIKE 'perf.user%@ship.local'`
  );
  const seedKeyDocsResult = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM documents
     WHERE workspace_id = $1
       AND deleted_at IS NULL
       AND properties->>'seed_key' = $2`,
    [workspaceId, SEED_KEY]
  );

  const counts = {
    documents: documentsCountResult.rows[0].count,
    issues: issuesCountResult.rows[0].count,
    sprints: sprintsCountResult.rows[0].count,
    users: usersCountResult.rows[0].count,
  };
  const seedKeyDocsCount = seedKeyDocsResult.rows[0].count;

  const failures = Object.entries(MIN_COUNTS)
    .filter(([key, min]) => counts[key as keyof typeof counts] < min)
    .map(([key, min]) => `${key}: expected >= ${min}, got ${counts[key as keyof typeof counts]}`);

  if (failures.length > 0) {
    throw new Error(`Performance seed verification failed: ${failures.join('; ')}`);
  }
  if (seedKeyDocsCount !== EXPECTED_SEED_KEY_DOCUMENTS) {
    throw new Error(
      `Performance seed verification failed: expected ${EXPECTED_SEED_KEY_DOCUMENTS} seed-keyed docs, got ${seedKeyDocsCount}. This indicates a non-idempotent seed run.`
    );
  }

  console.log('✅ Performance seed verification passed');
  console.log(`   documents=${counts.documents}, issues=${counts.issues}, sprints=${counts.sprints}, users=${counts.users}`);
  console.log(`   seed_key_documents=${seedKeyDocsCount}`);
}

async function seedPerformance() {
  await loadProductionSecrets();

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  try {
    console.log('🌱 Starting performance benchmark seed...');

    // Keep schema initialization behavior aligned with regular seed script for fresh DBs.
    const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
    await pool.query(schema);

    const workspace = await ensureWorkspace(pool);
    const users = await ensurePerfUsers(pool, workspace.id);
    const personMap = await getPersonMap(pool, workspace.id);
    const programs = await ensurePrograms(pool, workspace.id, users);
    const projects = await ensureProjects(pool, workspace.id, users, programs);
    const sprints = await ensureSprints(pool, workspace.id, users, personMap, projects, workspace.sprintStartDate);
    await ensureIssues(pool, workspace.id, users, projects, sprints);
    await ensureWikiDocs(pool, workspace.id, users);
    await ensureMyWeekSupport(pool, workspace.id, workspace.sprintStartDate, personMap, users, projects);
    await verifyCounts(pool, workspace.id);

    await pool.query(
      `UPDATE users SET last_workspace_id = $1 WHERE email = 'perf.admin@ship.local'`,
      [workspace.id]
    );

    console.log('🎉 Performance seed complete!');
    console.log('   workspace:', WORKSPACE_NAME);
    console.log('   login email: perf.admin@ship.local');
    console.log('   login password: admin123');
  } catch (error) {
    console.error('❌ Performance seed failed:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

seedPerformance();
