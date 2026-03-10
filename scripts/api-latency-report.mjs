#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import autocannon from 'autocannon';

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, 'reports', 'api-latency');
const LATEST_JSON_PATH = path.join(OUTPUT_DIR, 'latest.json');
const LATEST_MD_PATH = path.join(OUTPUT_DIR, 'latest.md');
const HISTORY_PATH = path.join(OUTPUT_DIR, 'history.jsonl');
const SLOW_ENDPOINTS_PATH = path.join(OUTPUT_DIR, 'slow-endpoints.md');

const API_URL = process.env.API_URL || process.env.VITE_API_URL || 'http://localhost:3000';
const PERF_EMAIL = process.env.PERF_BENCH_EMAIL || 'perf.admin@ship.local';
const PERF_PASSWORD = process.env.PERF_BENCH_PASSWORD || 'admin123';

const CONCURRENCY_LEVELS = [10, 25, 50];
const WARMUP_SECONDS = 15;
const DURATION_SECONDS = 30;

const ENDPOINTS = [
  { name: 'Documents (wiki list)', path: '/api/documents?type=wiki' },
  { name: 'Issues list', path: '/api/issues' },
  { name: 'Projects list', path: '/api/projects' },
  { name: 'Programs list', path: '/api/programs' },
  { name: 'Dashboard my-week', path: '/api/dashboard/my-week' },
];

function ensureDir() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function readJsonSafe(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function percentile(latency, key, fallback = 0) {
  if (latency && typeof latency[key] === 'number') return latency[key];
  return fallback;
}

function toMs(value) {
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function non2xxCount(result) {
  const buckets = ['1xx', '3xx', '4xx', '5xx'];
  return buckets.reduce((sum, key) => sum + (Number(result[key]) || 0), 0);
}

function statusBand(delta) {
  if (delta == null) return 'Baseline';
  if (delta < 0) return 'Improving';
  if (delta > 0) return 'Regressing';
  return 'Stable';
}

function hypothesisForPath(pathname) {
  if (pathname.startsWith('/api/issues')) {
    return 'Heavy joins + belongs_to association expansion can increase query time as issue volume grows.';
  }
  if (pathname.startsWith('/api/projects')) {
    return 'Derived status and nested count subqueries add per-row computation under larger project/sprint datasets.';
  }
  if (pathname.startsWith('/api/programs')) {
    return 'Program list includes issue/sprint count subqueries, so aggregate counting cost can dominate response time.';
  }
  if (pathname.startsWith('/api/documents')) {
    return 'Visibility filters + ordering over larger wiki sets can trigger more expensive scans/sorts without selective indexes.';
  }
  if (pathname.startsWith('/api/dashboard/my-week')) {
    return 'Multiple sequential queries (person, plan/retro, standups, allocations) compound latency versus single-list endpoints.';
  }
  return 'Likely dominated by query complexity and workspace data volume.';
}

async function loginAndGetCookie() {
  const csrfResponse = await fetch(`${API_URL}/api/csrf-token`, {
    method: 'GET',
  });
  if (!csrfResponse.ok) {
    throw new Error(`Failed to fetch CSRF token (${csrfResponse.status})`);
  }
  const csrfJson = await csrfResponse.json();
  const csrfToken = csrfJson?.token;
  const csrfCookieRaw = csrfResponse.headers.get('set-cookie');
  const csrfCookie = csrfCookieRaw ? csrfCookieRaw.split(';')[0] : '';

  const loginResponse = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
      ...(csrfCookie ? { Cookie: csrfCookie } : {}),
    },
    body: JSON.stringify({ email: PERF_EMAIL, password: PERF_PASSWORD }),
  });

  if (!loginResponse.ok) {
    const body = await loginResponse.text();
    throw new Error(`Login failed (${loginResponse.status}): ${body.slice(0, 300)}`);
  }

  const rawSetCookie = loginResponse.headers.get('set-cookie');
  if (!rawSetCookie) {
    throw new Error('Login succeeded but no set-cookie header was returned.');
  }

  return rawSetCookie.split(';')[0];
}

async function runAutocannon(url, connections, seconds, headers) {
  return new Promise((resolve, reject) => {
    const instance = autocannon({
      url,
      method: 'GET',
      connections,
      duration: seconds,
      headers,
      timeout: 20,
      pipelining: 1,
    }, (err, result) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(result);
    });

    instance.on('error', reject);
  });
}

function buildMarkdown(report) {
  const summaryRows = ENDPOINTS.map((endpoint) => {
    const c25 = report.results.find(r => r.path === endpoint.path && r.concurrency === 25);
    return `| ${endpoint.path} | ${c25?.p50_ms ?? 'N/A'} | ${c25?.p95_ms ?? 'N/A'} | ${c25?.p99_ms ?? 'N/A'} |`;
  }).join('\n');

  const perConcurrencySections = CONCURRENCY_LEVELS.map((concurrency) => {
    const rows = report.results
      .filter(r => r.concurrency === concurrency)
      .map(r => `| ${r.path} | ${r.p50_ms} | ${r.p95_ms} | ${r.p99_ms} | ${r.rps} | ${r.non_2xx} |`)
      .join('\n');

    return `### Concurrency ${concurrency}\n\n| Endpoint | P50 (ms) | P95 (ms) | P99 (ms) | Req/sec | Non-2xx |\n|---|---:|---:|---:|---:|---:|\n${rows}`;
  }).join('\n\n');

  const slowest = report.slowest_endpoints
    .map((s, idx) => `${idx + 1}. \`${s.path}\` (P95=${s.p95_ms}ms @ c=${s.concurrency}) - ${s.hypothesis}`)
    .join('\n');

  return `# API Latency Audit Report\n\nGenerated: ${report.generated_at}\nAPI URL: ${report.api_url}\nWarmup: ${WARMUP_SECONDS}s @ c=10\nMeasured: ${DURATION_SECONDS}s @ c=10,25,50\n\n## Audit Deliverable Table (P95/P99 focus at c=25)\n\n| Endpoint | P50 | P95 | P99 |\n|---|---:|---:|---:|\n${summaryRows}\n\n## Trend\n\n- Overall status: **${report.delta_from_previous.status_band}**\n- Average P95 delta (ms): ${report.delta_from_previous.avg_p95_ms_delta ?? 'N/A'}\n\n## Detailed Results\n\n${perConcurrencySections}\n\n## Slowest Endpoints\n\n${slowest || '- None'}\n`;
}

function buildSlowEndpointsMarkdown(report) {
  const lines = report.slowest_endpoints.map((entry, idx) => {
    return `${idx + 1}. Endpoint: \`${entry.path}\`\n   Observed: P95=${entry.p95_ms}ms, P99=${entry.p99_ms}ms at concurrency ${entry.concurrency}\n   Hypothesis: ${entry.hypothesis}`;
  });

  return `# Slow Endpoints Analysis\n\nGenerated: ${report.generated_at}\n\n${lines.join('\n\n') || 'No endpoint data available.'}\n`;
}

async function main() {
  ensureDir();

  const health = await fetch(`${API_URL}/health`);
  if (!health.ok) {
    throw new Error(`API health check failed at ${API_URL}/health with status ${health.status}`);
  }

  const cookie = await loginAndGetCookie();
  const headers = { Cookie: cookie };

  const results = [];

  for (const endpoint of ENDPOINTS) {
    const endpointUrl = `${API_URL}${endpoint.path}`;

    // Warmup run (not included in final metrics)
    await runAutocannon(endpointUrl, 10, WARMUP_SECONDS, headers);

    for (const concurrency of CONCURRENCY_LEVELS) {
      const result = await runAutocannon(endpointUrl, concurrency, DURATION_SECONDS, headers);
      const latency = result.latency || {};
      const p50 = toMs(percentile(latency, 'p50', latency.average || 0));
      const p95 = toMs(percentile(latency, 'p95', latency.p97_5 || latency.p99 || 0));
      const p99 = toMs(percentile(latency, 'p99', latency.max || 0));

      results.push({
        endpoint: endpoint.name,
        path: endpoint.path,
        concurrency,
        p50_ms: p50,
        p95_ms: p95,
        p99_ms: p99,
        rps: toMs(result.requests?.average || 0),
        non_2xx: non2xxCount(result),
      });
    }
  }

  const previous = readJsonSafe(LATEST_JSON_PATH);

  const avgP95 = results.length > 0
    ? toMs(results.reduce((sum, row) => sum + (row.p95_ms || 0), 0) / results.length)
    : null;

  const previousAvgP95 = previous?.summary?.avg_p95_ms;
  const avgDelta = (typeof avgP95 === 'number' && typeof previousAvgP95 === 'number')
    ? toMs(avgP95 - previousAvgP95)
    : null;

  const slowest = [...results]
    .sort((a, b) => (b.p95_ms || 0) - (a.p95_ms || 0))
    .slice(0, 5)
    .map((row) => ({
      path: row.path,
      endpoint: row.endpoint,
      concurrency: row.concurrency,
      p95_ms: row.p95_ms,
      p99_ms: row.p99_ms,
      hypothesis: hypothesisForPath(row.path),
    }));

  const report = {
    generated_at: new Date().toISOString(),
    api_url: API_URL,
    seed_dataset: {
      strategy: 'dedicated perf seed',
      workspace: 'Perf Benchmark Workspace',
      seed_key: 'api-latency-perf-v1',
    },
    benchmark: {
      tool: 'autocannon',
      warmup_seconds: WARMUP_SECONDS,
      measured_seconds: DURATION_SECONDS,
      concurrency_levels: CONCURRENCY_LEVELS,
    },
    endpoints: ENDPOINTS,
    results,
    summary: {
      avg_p95_ms: avgP95,
    },
    slowest_endpoints: slowest,
    delta_from_previous: {
      avg_p95_ms_delta: avgDelta,
      status_band: statusBand(avgDelta),
    },
    policy: {
      mode: 'report-only',
      fail_on_threshold: false,
    },
  };

  fs.writeFileSync(LATEST_JSON_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.appendFileSync(HISTORY_PATH, `${JSON.stringify(report)}\n`, 'utf8');
  fs.writeFileSync(LATEST_MD_PATH, buildMarkdown(report), 'utf8');
  fs.writeFileSync(SLOW_ENDPOINTS_PATH, buildSlowEndpointsMarkdown(report), 'utf8');

  console.log(`Wrote ${path.relative(ROOT, LATEST_MD_PATH)}`);
  console.log(`Wrote ${path.relative(ROOT, LATEST_JSON_PATH)}`);
  console.log(`Wrote ${path.relative(ROOT, SLOW_ENDPOINTS_PATH)}`);
  console.log(`Appended ${path.relative(ROOT, HISTORY_PATH)}`);
}

main().catch((error) => {
  console.error('API latency report failed:', error);
  process.exit(1);
});
