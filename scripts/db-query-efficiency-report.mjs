#!/usr/bin/env node

/**
 * Database Query Efficiency Report
 *
 * Measures database efficiency by exercising the real API routes used by the UI
 * and tracing the SQL emitted by the live Express app. This avoids the copied-SQL
 * drift that made the earlier version untrustworthy.
 *
 * Usage:
 *   pnpm report:db-efficiency
 *
 * Requires:
 *   - PostgreSQL running locally with seeded data
 *   - Execute via tsx so this script can import api/src/*.ts directly
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import request from 'supertest';
import { createApp } from '../api/src/app.ts';
import { pool } from '../api/src/db/client.ts';
import { ensureDir as ensureSharedDir, slugify } from './api-latency-lib.mjs';

process.env.NODE_ENV ??= 'development';
process.env.API_BENCHMARK = '1';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const OUTPUT_DIR = path.join(ROOT, 'reports', 'db-query-efficiency');
const SNAPSHOTS_DIR = path.join(OUTPUT_DIR, 'snapshots');
const LATEST_JSON_PATH = path.join(OUTPUT_DIR, 'latest.json');
const LATEST_MD_PATH = path.join(OUTPUT_DIR, 'latest.md');
const HISTORY_PATH = path.join(OUTPUT_DIR, 'history.jsonl');

function ensureDir() {
  ensureSharedDir(OUTPUT_DIR);
  ensureSharedDir(SNAPSHOTS_DIR);
}

function readJsonSafe(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function round(value, digits = 2) {
  return Math.round(value * 10 ** digits) / 10 ** digits;
}

function maskDatabaseUrl(url) {
  return url.replace(/:[^:@]+@/, ':***@');
}

function normalizeSql(sql) {
  return sql.replace(/\s+/g, ' ').trim();
}

function sqlTemplate(sql) {
  return normalizeSql(sql).replace(/\$\d+/g, '?');
}

function queryType(sql) {
  const match = /^\s*([a-z]+)/i.exec(sql);
  return match ? match[1].toUpperCase() : 'UNKNOWN';
}

function isExplainQuery(sql) {
  return /^\s*EXPLAIN\b/i.test(sql);
}

function isReadQuery(sql) {
  return /^\s*(SELECT|WITH)\b/i.test(sql);
}

function sanitizeParams(params) {
  if (!Array.isArray(params)) return [];
  return params.map((value) => {
    if (value instanceof Date) return value.toISOString();
    if (Buffer.isBuffer(value)) return `[buffer:${value.length}]`;
    return value;
  });
}

function summarizeSql(sql) {
  const oneLine = normalizeSql(sql);
  return oneLine.length > 180 ? `${oneLine.slice(0, 177)}...` : oneLine;
}

function buildSearchTerm(source) {
  const matches = source.match(/[A-Za-z0-9]{3,}/g) || [];
  return (matches[0] || source.slice(0, 3) || 'ship').slice(0, 12);
}

function parseArgs(argv) {
  const result = { label: 'current', refresh: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--label' && argv[i + 1]) {
      result.label = argv[i + 1];
      i += 1;
    } else if (arg === '--refresh' && argv[i + 1]) {
      result.refresh = argv[i + 1];
      i += 1;
    }
  }
  return result;
}

let activeCapture = null;
const originalQuery = pool.query.bind(pool);

pool.query = async function patchedQuery(...args) {
  const queryArg = args[0];
  const sql = typeof queryArg === 'string' ? queryArg : queryArg?.text || '';
  const params = Array.isArray(args[1])
    ? args[1]
    : Array.isArray(queryArg?.values)
      ? queryArg.values
      : [];

  const startedAt = process.hrtime.bigint();

  try {
    const result = await originalQuery(...args);
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

    if (activeCapture && sql && !isExplainQuery(sql)) {
      activeCapture.queries.push({
        sql,
        sql_summary: summarizeSql(sql),
        sql_template: sqlTemplate(sql),
        params: sanitizeParams(params),
        duration_ms: round(durationMs),
        row_count: typeof result?.rowCount === 'number' ? result.rowCount : null,
        query_type: queryType(sql),
      });
    }

    return result;
  } catch (error) {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

    if (activeCapture && sql && !isExplainQuery(sql)) {
      activeCapture.queries.push({
        sql,
        sql_summary: summarizeSql(sql),
        sql_template: sqlTemplate(sql),
        params: sanitizeParams(params),
        duration_ms: round(durationMs),
        row_count: null,
        query_type: queryType(sql),
        error: error instanceof Error ? error.message : String(error),
      });
    }

    throw error;
  }
};

function hasNodeType(node, type) {
  if (!node) return false;
  if (node['Node Type'] === type) return true;
  return Array.isArray(node.Plans) && node.Plans.some((child) => hasNodeType(child, type));
}

function summarizePlan(node, depth = 0) {
  if (!node) return [];
  const prefix = '  '.repeat(depth);
  const actualTime = node['Actual Total Time'];
  const actualRows = node['Actual Rows'];
  const line = actualTime != null
    ? `${prefix}${node['Node Type']} (${round(actualTime)}ms, ${actualRows} rows)`
    : `${prefix}${node['Node Type']}`;

  const lines = [line];
  if (Array.isArray(node.Plans)) {
    for (const child of node.Plans) {
      lines.push(...summarizePlan(child, depth + 1));
    }
  }
  return lines;
}

function detectN1InPlan(node) {
  if (!node) return [];

  const findings = [];
  const actualLoops = node['Actual Loops'] || 1;

  if (node['Subplan Name'] && actualLoops > 1) {
    findings.push({
      type: 'correlated_subplan',
      description: `${node['Subplan Name']} executes ${actualLoops}x (once per outer row)`,
      loops: actualLoops,
    });
  }

  if (Array.isArray(node.Plans)) {
    for (const child of node.Plans) {
      findings.push(...detectN1InPlan(child));
    }
  }

  return findings;
}

function collectSeqScanNodes(node, acc = []) {
  if (!node) return acc;
  if (node['Node Type'] === 'Seq Scan') {
    acc.push({
      relation: node['Relation Name'] || 'unknown',
      filter: node.Filter || null,
      actual_rows: node['Actual Rows'] || 0,
      actual_loops: node['Actual Loops'] || 1,
    });
  }
  if (Array.isArray(node.Plans)) {
    for (const child of node.Plans) {
      collectSeqScanNodes(child, acc);
    }
  }
  return acc;
}

function groupRepeatedReadQueries(queries) {
  const grouped = new Map();

  for (const [index, query] of queries.entries()) {
    if (!isReadQuery(query.sql)) continue;
    const key = query.sql_template;
    const bucket = grouped.get(key) || {
      count: 0,
      params: new Set(),
      sql_summary: query.sql_summary,
      first_index: index,
      indexes: [],
    };
    bucket.count += 1;
    bucket.params.add(JSON.stringify(query.params));
    bucket.indexes.push(index);
    bucket.first_index = Math.min(bucket.first_index, index);
    grouped.set(key, bucket);
  }

  return [...grouped.values()]
    .filter((item) => item.count >= 3 && item.params.size >= 3);
}

function detectRequestFanoutN1(requestResult) {
  const repeatedGroups = groupRepeatedReadQueries(requestResult.queries);
  const findings = [];

  for (const group of repeatedGroups) {
    const parentCandidates = requestResult.queries
      .slice(0, group.first_index)
      .filter((query) => isReadQuery(query.sql) && Number.isFinite(query.row_count) && query.row_count >= 2);

    if (parentCandidates.length === 0) continue;

    const parent = parentCandidates
      .map((query) => ({
        query,
        distance: Math.abs((query.row_count || 0) - group.count),
      }))
      .sort((a, b) => a.distance - b.distance)[0]?.query;

    if (!parent?.row_count) continue;

    const lowerBound = Math.max(3, Math.floor(parent.row_count * 0.6));
    const upperBound = Math.max(parent.row_count + 2, Math.ceil(parent.row_count * 1.5));
    if (group.count < lowerBound || group.count > upperBound) continue;

    findings.push({
      type: 'fanout_n1',
      description: `${group.count} child lookups executed after a parent query returned ${parent.row_count} rows`,
      sql_summary: group.sql_summary,
      executions: group.count,
      distinct_param_sets: group.params.size,
      parent_sql_summary: parent.sql_summary,
      parent_row_count: parent.row_count,
    });
  }

  return findings;
}

function detectRepeatedQueryTemplates(requestResult) {
  return groupRepeatedReadQueries(requestResult.queries)
    .map((item) => ({
      type: 'repeated_query_template',
      description: `${item.count} repeated executions of the same query template within one request`,
      sql_summary: item.sql_summary,
      executions: item.count,
      distinct_param_sets: item.params.size,
    }));
}

async function getIndexesByTable() {
  const result = await originalQuery(`
    SELECT schemaname, tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
  `);

  const indexMap = new Map();
  for (const row of result.rows) {
    const list = indexMap.get(row.tablename) || [];
    list.push({ index_name: row.indexname, index_def: row.indexdef });
    indexMap.set(row.tablename, list);
  }
  return indexMap;
}

async function getTableSizes() {
  const result = await originalQuery(`
    SELECT relname AS table_name, n_live_tup AS row_count
    FROM pg_stat_user_tables
  `);

  const sizeMap = new Map();
  for (const row of result.rows) {
    sizeMap.set(row.table_name, Number(row.row_count || 0));
  }
  return sizeMap;
}

async function explainCapturedQuery(query, cache) {
  const cacheKey = JSON.stringify([query.sql, query.params]);
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  try {
    const result = await originalQuery(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query.sql}`,
      query.params
    );
    const plan = result.rows[0]['QUERY PLAN'][0];
    const analysis = {
      execution_time_ms: round(plan['Execution Time']),
      planning_time_ms: round(plan['Planning Time']),
      total_time_ms: round((plan['Execution Time'] || 0) + (plan['Planning Time'] || 0)),
      has_seq_scan: hasNodeType(plan.Plan, 'Seq Scan'),
      has_nested_loop: hasNodeType(plan.Plan, 'Nested Loop'),
      n1_findings: detectN1InPlan(plan.Plan),
      seq_scan_nodes: collectSeqScanNodes(plan.Plan),
      plan_summary: summarizePlan(plan.Plan),
    };
    cache.set(cacheKey, analysis);
    return analysis;
  } catch (error) {
    const analysis = {
      explain_error: error instanceof Error ? error.message : String(error),
      execution_time_ms: null,
      planning_time_ms: null,
      total_time_ms: null,
      has_seq_scan: false,
      has_nested_loop: false,
      n1_findings: [],
      seq_scan_nodes: [],
      plan_summary: [],
    };
    cache.set(cacheKey, analysis);
    return analysis;
  }
}

async function createSession(userId, workspaceId) {
  const sessionId = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);

  await originalQuery(
    `INSERT INTO sessions (id, user_id, workspace_id, expires_at, last_activity, created_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5, $5, $6, $7)`,
    [sessionId, userId, workspaceId, expiresAt, now, 'db-efficiency-report', '127.0.0.1']
  );

  return sessionId;
}

async function loadContext() {
  const memberResult = await originalQuery(`
    SELECT u.id AS user_id, u.email, wm.workspace_id
    FROM users u
    JOIN workspace_memberships wm ON wm.user_id = u.id
    ORDER BY CASE WHEN u.email = 'dev@ship.local' THEN 0 ELSE 1 END, u.created_at ASC
    LIMIT 1
  `);

  if (memberResult.rows.length === 0) {
    throw new Error('No workspace membership found. Run pnpm db:seed first.');
  }

  const user = memberResult.rows[0];

  const wikiResult = await originalQuery(
    `SELECT id, title
     FROM documents
     WHERE workspace_id = $1
       AND document_type = 'wiki'
       AND archived_at IS NULL
       AND deleted_at IS NULL
     ORDER BY created_at ASC
     LIMIT 1`,
    [user.workspace_id]
  );

  if (wikiResult.rows.length === 0) {
    throw new Error('No wiki documents found. Seed data should include at least one visible document.');
  }

  const searchSourceResult = await originalQuery(
    `SELECT title
     FROM documents
     WHERE workspace_id = $1
       AND archived_at IS NULL
       AND deleted_at IS NULL
       AND title IS NOT NULL
       AND length(trim(title)) > 0
     ORDER BY updated_at DESC
     LIMIT 1`,
    [user.workspace_id]
  );

  const searchSource = searchSourceResult.rows[0]?.title || wikiResult.rows[0].title || 'ship';

  return {
    user_id: user.user_id,
    email: user.email,
    workspace_id: user.workspace_id,
    document_id: wikiResult.rows[0].id,
    document_title: wikiResult.rows[0].title,
    search_term: buildSearchTerm(searchSource),
  };
}

async function runRequest(app, cookie, definition) {
  activeCapture = { queries: [] };
  const startedAt = process.hrtime.bigint();

  try {
    let req = request(app)[definition.method](definition.path).set('Cookie', [`session_id=${cookie}`]);
    if (definition.headers) {
      for (const [key, value] of Object.entries(definition.headers)) {
        req = req.set(key, value);
      }
    }

    const response = await req;
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const capture = activeCapture;
    activeCapture = null;

    return {
      label: definition.label,
      method: definition.method.toUpperCase(),
      path: definition.path,
      status: response.status,
      duration_ms: round(durationMs),
      queries: capture.queries,
      request_n1_findings: detectRepeatedQueryTemplates(capture),
    };
  } catch (error) {
    const capture = activeCapture;
    activeCapture = null;
    throw new Error(`${definition.method.toUpperCase()} ${definition.path} failed: ${error instanceof Error ? error.message : String(error)}\nCaptured ${capture.queries.length} queries before failure.`);
  }
}

function buildFlowDefinitions(context) {
  return [
    {
      name: 'Load main page',
      description: 'My Week page initial load',
      frontend_route: '/my-week',
      requests: [
        { label: 'dashboard data', method: 'get', path: '/api/dashboard/my-week' },
      ],
    },
    {
      name: 'View a document',
      description: `Unified document page load for "${context.document_title}"`,
      frontend_route: `/documents/${context.document_id}`,
      requests: [
        { label: 'document', method: 'get', path: `/api/documents/${context.document_id}` },
        { label: 'document context', method: 'get', path: `/api/documents/${context.document_id}/context` },
        { label: 'document comments', method: 'get', path: `/api/documents/${context.document_id}/comments` },
        { label: 'team members', method: 'get', path: '/api/team/people' },
        { label: 'programs', method: 'get', path: '/api/programs' },
        { label: 'projects', method: 'get', path: '/api/projects' },
      ],
    },
    {
      name: 'List issues',
      description: 'Issues page list query',
      frontend_route: '/issues',
      requests: [
        { label: 'issues', method: 'get', path: '/api/issues' },
      ],
    },
    {
      name: 'Load sprint board',
      description: 'Team allocation board initial load',
      frontend_route: '/team/allocation',
      requests: [
        { label: 'team grid', method: 'get', path: '/api/team/grid' },
        { label: 'team projects', method: 'get', path: '/api/team/projects' },
        { label: 'team assignments', method: 'get', path: '/api/team/assignments' },
      ],
    },
    {
      name: 'Search content',
      description: `Mention search for "${context.search_term}"`,
      frontend_route: `/search?q=${encodeURIComponent(context.search_term)}`,
      requests: [
        { label: 'mentions', method: 'get', path: `/api/search/mentions?q=${encodeURIComponent(context.search_term)}` },
      ],
    },
  ];
}

async function simulateFlows(app, cookie, context) {
  const flows = buildFlowDefinitions(context);
  const flowResults = [];

  for (const flow of flows) {
    process.stdout.write(`  ${flow.name}... `);

    const requestResults = [];
    for (const requestDef of flow.requests) {
      requestResults.push(await runRequest(app, cookie, requestDef));
    }

    const queries = requestResults.flatMap((requestResult) => requestResult.queries);
    const totalQueries = queries.length;
    const totalDbTime = round(queries.reduce((sum, query) => sum + query.duration_ms, 0));
    const slowestQuery = queries.reduce((slowest, current) => (
      !slowest || current.duration_ms > slowest.duration_ms ? current : slowest
    ), null);

    console.log(`${totalQueries} queries, ${totalDbTime}ms DB time, slowest ${slowestQuery?.duration_ms ?? 0}ms`);

    flowResults.push({
      flow: flow.name,
      description: flow.description,
      frontend_route: flow.frontend_route,
      requests: requestResults,
      query_count: totalQueries,
      total_time_ms: totalDbTime,
      slowest_query_ms: slowestQuery?.duration_ms ?? 0,
      slowest_query_summary: slowestQuery?.sql_summary ?? null,
      n1_detected: false,
      n1_findings: [],
      has_seq_scan: false,
      has_nested_loop: false,
      unnecessary_data_findings: [],
      seq_scan_findings: [],
      query_details: [],
    });
  }

  return flowResults;
}

function detectUnnecessaryDataFetching(query) {
  if (!isReadQuery(query.sql)) return null;

  const normalized = normalizeSql(query.sql).toLowerCase();
  const rowsReturned = query.row_count ?? 0;

  if (rowsReturned >= 25 && /\bcontent\b/.test(normalized)) {
    return {
      type: 'bulk_content_fetch',
      description: `Fetched content column for ${rowsReturned} rows`,
      sql_summary: query.sql_summary,
    };
  }

  if (rowsReturned >= 50 && /\bproperties\b/.test(normalized)) {
    return {
      type: 'bulk_properties_fetch',
      description: `Fetched properties JSON for ${rowsReturned} rows`,
      sql_summary: query.sql_summary,
    };
  }

  return null;
}

function buildIndexFindings(flowResults, indexesByTable, tableSizes) {
  const findings = [];

  for (const flow of flowResults) {
    for (const query of flow.query_details) {
      if (!query.seq_scan_nodes?.length) continue;

      for (const seqScan of query.seq_scan_nodes) {
        const rowCount = tableSizes.get(seqScan.relation) || 0;
        if (rowCount < 100) continue;

        findings.push({
          flow: flow.flow,
          request: query.request_label,
          relation: seqScan.relation,
          row_count: rowCount,
          filter: seqScan.filter,
          existing_indexes: (indexesByTable.get(seqScan.relation) || []).map((index) => index.index_name),
          recommendation: seqScan.filter
            ? `Seq Scan on ${seqScan.relation} (${rowCount} rows) with filter ${seqScan.filter}. Review existing indexes or add an index matching that predicate/expression.`
            : `Seq Scan on ${seqScan.relation} (${rowCount} rows). Review whether an index should support this access pattern.`,
        });
      }
    }
  }

  const seen = new Set();
  return findings.filter((finding) => {
    const key = JSON.stringify([finding.flow, finding.request, finding.relation, finding.filter]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function analyzeObservedQueries(flowResults) {
  const explainCache = new Map();
  const tableSizes = await getTableSizes();

  for (const flow of flowResults) {
    const requestLevelN1 = [];
    const unnecessaryDataFindings = [];
    const seqScanFindings = [];
    const queryDetails = [];

    for (const requestResult of flow.requests) {
      const fanoutFindings = detectRequestFanoutN1(requestResult);
      if (fanoutFindings.length > 0) {
        requestLevelN1.push(...fanoutFindings.map((finding) => ({
          ...finding,
          request_label: requestResult.label,
        })));
      }

      for (const query of requestResult.queries) {
        let analysis = {
          execution_time_ms: null,
          planning_time_ms: null,
          total_time_ms: query.duration_ms,
          has_seq_scan: false,
          has_nested_loop: false,
          n1_findings: [],
          seq_scan_nodes: [],
          plan_summary: [],
        };

        if (isReadQuery(query.sql)) {
          analysis = await explainCapturedQuery(query, explainCache);
        }

        const dataFetchingFinding = detectUnnecessaryDataFetching(query);
        if (dataFetchingFinding) {
          unnecessaryDataFindings.push({
            ...dataFetchingFinding,
            request_label: requestResult.label,
          });
        }

        if (analysis.seq_scan_nodes.length > 0) {
          seqScanFindings.push(...analysis.seq_scan_nodes.map((seqScan) => ({
            ...seqScan,
            request_label: requestResult.label,
            sql_summary: query.sql_summary,
          })));
        }

        queryDetails.push({
          request_label: requestResult.label,
          path: requestResult.path,
          observed_duration_ms: query.duration_ms,
          sql: query.sql,
          params: query.params,
          sql_summary: query.sql_summary,
          query_type: query.query_type,
          row_count: query.row_count,
          ...analysis,
        });
      }
    }

    const planN1 = queryDetails.flatMap((detail) =>
      (detail.n1_findings || []).map((finding) => ({
        ...finding,
        request_label: detail.request_label,
        sql_summary: detail.sql_summary,
      }))
    );

    flow.query_details = queryDetails;
    flow.n1_findings = [...requestLevelN1, ...planN1];
    flow.n1_detected = flow.n1_findings.length > 0;
    flow.has_seq_scan = queryDetails.some((detail) =>
      (detail.seq_scan_nodes || []).some((seqScan) => (tableSizes.get(seqScan.relation) || 0) >= 100)
    );
    flow.has_nested_loop = queryDetails.some((detail) => detail.has_nested_loop);
    flow.unnecessary_data_findings = unnecessaryDataFindings;
    flow.seq_scan_findings = seqScanFindings;
  }

  const indexesByTable = await getIndexesByTable();
  const indexFindings = buildIndexFindings(flowResults, indexesByTable, tableSizes);

  return { flowResults, indexFindings };
}

function recalculateFlowN1(flowResults) {
  for (const flow of flowResults) {
    const requestLevelN1 = [];

    for (const requestResult of flow.requests || []) {
      const fanoutFindings = detectRequestFanoutN1(requestResult);
      if (fanoutFindings.length > 0) {
        requestLevelN1.push(...fanoutFindings.map((finding) => ({
          ...finding,
          request_label: requestResult.label,
        })));
      }
    }

    const planN1 = (flow.query_details || []).flatMap((detail) =>
      (detail.n1_findings || []).map((finding) => ({
        ...finding,
        request_label: detail.request_label,
        sql_summary: detail.sql_summary,
      }))
    );

    flow.n1_findings = [...requestLevelN1, ...planN1];
    flow.n1_detected = flow.n1_findings.length > 0;
  }

  return flowResults;
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Database Query Efficiency Report');
  lines.push('');
  lines.push(`Generated: ${report.generated_at}`);
  lines.push(`Label: ${report.label}`);
  lines.push(`Database: ${report.database}`);
  lines.push('');
  lines.push('## How To Read This Report');
  lines.push('');
  lines.push('- **Workflow** = a full user action, such as loading a page.');
  lines.push('- **Request** = one HTTP call made during that workflow.');
  lines.push('- **SQL query** = one database statement executed inside a request.');
  lines.push('- Workflow DB time is the sum of SQL query time across all requests in that workflow.');
  lines.push('- Request DB time is the sum of SQL query time inside that single request.');
  lines.push('');
  lines.push('## Methodology');
  lines.push('');
  lines.push('- Source of truth: live API route tracing against the real Express app, not copied SQL.');
  lines.push('- Authentication: session cookie auth, so auth middleware queries are included.');
  lines.push('- Query capture: every `pool.query()` emitted during each request.');
  lines.push('- Plan analysis: `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` rerun only for observed read queries.');
  lines.push('- N+1 detection: flags correlated SQL subplans and repeated child lookups whose count scales with parent rows inside a request.');
  lines.push('- Flow mapping uses the frontend routes and API calls the UI actually makes on initial load.');
  lines.push('');
  lines.push('## Workflow Summary');
  lines.push('');
  lines.push('| Workflow | Total SQL Queries | Slowest SQL Query (ms) | N+1 Detected? |');
  lines.push('|---|---:|---:|---|');
  for (const flow of report.flow_results) {
    lines.push(`| ${flow.flow} | ${flow.query_count} | ${flow.slowest_query_ms}ms | ${flow.n1_detected ? 'Yes' : 'No'} |`);
  }
  lines.push('');

  lines.push('## Workflow Breakdown');
  lines.push('');
  for (const flow of report.flow_results) {
    lines.push(`### ${flow.flow}`);
    lines.push(`_${flow.description}_`);
    lines.push('');
    lines.push('**Workflow Overview**');
    lines.push('');
    lines.push(`- Frontend route: \`${flow.frontend_route}\``);
    lines.push(`- Total SQL queries: ${flow.query_count}`);
    lines.push(`- Total DB time: ${flow.total_time_ms}ms`);
    lines.push(`- Slowest observed SQL query: ${flow.slowest_query_ms}ms`);
    lines.push(`- Sequential scans: ${flow.has_seq_scan ? 'Yes' : 'No'}`);
    lines.push(`- Nested loops: ${flow.has_nested_loop ? 'Yes' : 'No'}`);
    if (flow.n1_findings.length > 0) {
      lines.push('- N+1 findings:');
      for (const finding of flow.n1_findings) {
        const source = finding.request_label ? ` (${finding.request_label})` : '';
        lines.push(`  - ${finding.description}${source}`);
      }
    }
    if (flow.unnecessary_data_findings.length > 0) {
      lines.push('- Unnecessary data fetching:');
      for (const finding of flow.unnecessary_data_findings) {
        lines.push(`  - ${finding.description} (${finding.request_label})`);
      }
    }
    lines.push('');
    lines.push('**Requests In This Workflow**');
    lines.push('');
    lines.push('| Request | Path | Status | SQL Query Count | DB Time (ms) |');
    lines.push('|---|---|---:|---:|---:|');
    for (const requestResult of flow.requests) {
      const dbTime = round(requestResult.queries.reduce((sum, query) => sum + query.duration_ms, 0));
      lines.push(`| ${requestResult.label} | \`${requestResult.path}\` | ${requestResult.status} | ${requestResult.queries.length} | ${dbTime} |`);
    }
    lines.push('');
  }

  const slowQueries = report.flow_results
    .flatMap((flow) => flow.query_details.map((query) => ({ ...query, flow: flow.flow })))
    .filter((query) => query.query_type === 'SELECT' || query.query_type === 'WITH')
    .sort((a, b) => b.observed_duration_ms - a.observed_duration_ms)
    .slice(0, 8);

  if (slowQueries.length > 0) {
    lines.push('## Individual SQL Query Plans');
    lines.push('');
    for (const query of slowQueries) {
      lines.push(`### ${query.flow} / ${query.request_label} (${query.observed_duration_ms}ms)`);
      lines.push('');
      lines.push(`Workflow request: \`${query.request_label}\``);
      lines.push('');
      lines.push(`SQL: \`${query.sql_summary}\``);
      lines.push('');
      if (query.plan_summary.length > 0) {
        lines.push('```');
        for (const line of query.plan_summary) {
          lines.push(line);
        }
        lines.push('```');
        lines.push('');
      } else if (query.explain_error) {
        lines.push(`Plan unavailable: ${query.explain_error}`);
        lines.push('');
      }
    }
  }

  if (report.index_findings.length > 0) {
    lines.push('## Predicate / Index Review');
    lines.push('');
    for (const finding of report.index_findings) {
      lines.push(`- ${finding.recommendation}`);
      if (finding.existing_indexes.length > 0) {
        lines.push(`  Existing indexes: ${finding.existing_indexes.join(', ')}`);
      }
    }
    lines.push('');
  }

  lines.push('## Trend');
  lines.push('');
  if (report.delta_from_previous.status === 'baseline') {
    lines.push('- Status: **Baseline** (first run with live-route tracing)');
  } else {
    lines.push(`- Status: **${report.delta_from_previous.status}**`);
    lines.push(`- Avg query duration delta: ${report.delta_from_previous.avg_query_duration_delta_ms}ms`);
  }
  lines.push('');

  return lines.join('\n');
}

async function main() {
  ensureDir();
  const { label, refresh } = parseArgs(process.argv.slice(2));

  if (refresh) {
    const refreshPath = path.isAbsolute(refresh) ? refresh : path.join(ROOT, refresh);
    const existing = readJsonSafe(refreshPath);
    if (!existing) {
      throw new Error(`Unable to read report JSON from ${refreshPath}`);
    }

    existing.label ??= path.basename(refreshPath, '.json');
    existing.flow_results = recalculateFlowN1(existing.flow_results || []);
    const refreshedMarkdown = buildMarkdown(existing);
    fs.writeFileSync(refreshPath, `${JSON.stringify(existing, null, 2)}\n`, 'utf8');

    const markdownPath = refreshPath.endsWith('.json')
      ? refreshPath.slice(0, -5) + '.md'
      : `${refreshPath}.md`;
    fs.writeFileSync(markdownPath, `${refreshedMarkdown}\n`, 'utf8');

    console.log(`Refreshed ${path.relative(ROOT, refreshPath)}`);
    console.log(`Refreshed ${path.relative(ROOT, markdownPath)}`);
    return;
  }

  console.log('Database Query Efficiency Report');
  console.log('================================\n');

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL not set. Ensure api/.env.local exists.');
  }

  console.log(`Connecting to database: ${maskDatabaseUrl(databaseUrl)}`);

  const context = await loadContext();
  console.log(`Using workspace ${context.workspace_id}, user ${context.email}, document "${context.document_title}", search term "${context.search_term}"`);

  const sessionId = await createSession(context.user_id, context.workspace_id);
  const app = createApp();

  try {
    console.log('\nExercising live user flows:\n');
    const capturedFlowResults = await simulateFlows(app, sessionId, context);
    const { flowResults, indexFindings } = await analyzeObservedQueries(capturedFlowResults);

    const previous = readJsonSafe(LATEST_JSON_PATH);
    const allQueries = flowResults.flatMap((flow) => flow.requests.flatMap((requestResult) => requestResult.queries));
    const avgQueryDurationMs = allQueries.length > 0
      ? round(allQueries.reduce((sum, query) => sum + query.duration_ms, 0) / allQueries.length)
      : null;

    const prevAvg = previous?.summary?.avg_query_duration_ms;
    let deltaStatus = 'baseline';
    let deltaMs = null;
    if (typeof avgQueryDurationMs === 'number' && typeof prevAvg === 'number') {
      deltaMs = round(avgQueryDurationMs - prevAvg);
      deltaStatus = deltaMs < -0.5 ? 'improving' : deltaMs > 0.5 ? 'regressing' : 'stable';
    }

    const report = {
      label,
      generated_at: new Date().toISOString(),
      database: maskDatabaseUrl(databaseUrl),
      methodology: {
        source: 'live-route-tracing',
        authentication: 'session-cookie',
      },
      context: {
        user_email: context.email,
        workspace_id: context.workspace_id,
        document_id: context.document_id,
        document_title: context.document_title,
        search_term: context.search_term,
      },
      flow_results: flowResults,
      index_findings: indexFindings,
      summary: {
        avg_query_duration_ms: avgQueryDurationMs,
        total_flow_queries: flowResults.reduce((sum, flow) => sum + flow.query_count, 0),
        total_flow_time_ms: round(flowResults.reduce((sum, flow) => sum + flow.total_time_ms, 0)),
        n1_detected_count: flowResults.filter((flow) => flow.n1_detected).length,
        seq_scan_flow_count: flowResults.filter((flow) => flow.has_seq_scan).length,
      },
      delta_from_previous: {
        status: deltaStatus,
        avg_query_duration_delta_ms: deltaMs,
      },
    };

    const snapshotSlug = `${report.generated_at.replaceAll(':', '-').replaceAll('.', '-') }--${slugify(label)}`;
    const snapshotJsonPath = path.join(SNAPSHOTS_DIR, `${snapshotSlug}.json`);
    const snapshotMdPath = path.join(SNAPSHOTS_DIR, `${snapshotSlug}.md`);

    fs.writeFileSync(LATEST_JSON_PATH, JSON.stringify(report, null, 2) + '\n', 'utf8');
    fs.appendFileSync(HISTORY_PATH, JSON.stringify(report) + '\n', 'utf8');
    const markdown = buildMarkdown(report);
    fs.writeFileSync(LATEST_MD_PATH, markdown, 'utf8');
    fs.writeFileSync(snapshotJsonPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
    fs.writeFileSync(snapshotMdPath, markdown, 'utf8');

    console.log(`\nWrote ${path.relative(ROOT, LATEST_MD_PATH)}`);
    console.log(`Wrote ${path.relative(ROOT, snapshotJsonPath)}`);
  } finally {
    await originalQuery('DELETE FROM sessions WHERE id = $1', [sessionId]).catch(() => {});
    await pool.end().catch(() => {});
  }
}

main().catch((error) => {
  if (error instanceof Error) {
    console.error(`\nReport failed: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
  } else {
    console.error('\nReport failed:');
    console.error(error);
  }
  process.exit(1);
});
