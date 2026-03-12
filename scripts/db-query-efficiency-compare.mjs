#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {
  ensureDir,
  formatNumber,
  formatPercent,
  readJsonFileSafe,
  slugify,
} from './api-latency-lib.mjs';

const ROOT = process.cwd();
const REPORTS_DIR = path.join(ROOT, 'reports', 'db-query-efficiency');
const SNAPSHOTS_DIR = path.join(REPORTS_DIR, 'snapshots');
const COMPARISONS_DIR = path.join(REPORTS_DIR, 'comparisons');
const AFFECTED_REQUESTS = new Set(['programs', 'projects']);

function parseArgs(argv) {
  const result = { baseline: null, current: 'latest' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--baseline' && argv[i + 1]) {
      result.baseline = argv[i + 1];
      i += 1;
    } else if (arg === '--current' && argv[i + 1]) {
      result.current = argv[i + 1];
      i += 1;
    }
  }
  return result;
}

function listSnapshotFiles() {
  if (!fs.existsSync(SNAPSHOTS_DIR)) return [];
  return fs.readdirSync(SNAPSHOTS_DIR)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => path.join(SNAPSHOTS_DIR, file));
}

function resolveSnapshot(reference) {
  if (!reference || reference === 'latest') {
    const latestPath = path.join(REPORTS_DIR, 'latest.json');
    return { path: latestPath, data: readJsonFileSafe(latestPath) };
  }

  const explicitPath = path.isAbsolute(reference)
    ? reference
    : path.join(SNAPSHOTS_DIR, reference.endsWith('.json') ? reference : `${reference}.json`);
  if (fs.existsSync(explicitPath)) {
    return { path: explicitPath, data: readJsonFileSafe(explicitPath) };
  }

  const snapshotFile = listSnapshotFiles().find((file) => path.basename(file).includes(reference));
  if (snapshotFile) {
    return { path: snapshotFile, data: readJsonFileSafe(snapshotFile) };
  }

  return { path: explicitPath, data: null };
}

function compareRow(label, baseline, current) {
  const deltaMs = current - baseline;
  const deltaPct = baseline > 0 ? ((current - baseline) / baseline) * 100 : null;
  return { label, baseline, current, delta_ms: deltaMs, delta_pct: deltaPct };
}

function keyFlow(flow) {
  return flow.flow;
}

function summarizeRequestDuration(request) {
  return request.queries.reduce((sum, query) => sum + query.duration_ms, 0);
}

function getFlow(report, name) {
  return report.flow_results.find((flow) => flow.flow === name) || null;
}

function getRequest(flow, label) {
  return flow?.requests?.find((request) => request.label === label) || null;
}

function flattenRequests(report) {
  return report.flow_results.flatMap((flow) =>
    flow.requests.map((request) => ({
      flow: flow.flow,
      request_label: request.label,
      path: request.path,
      request,
    }))
  );
}

function getSlowestAffectedQuery(flow, requestLabel) {
  if (!flow?.query_details) return null;
  return flow.query_details
    .filter((detail) => detail.request_label === requestLabel && (detail.query_type === 'SELECT' || detail.query_type === 'WITH'))
    .sort((a, b) => b.observed_duration_ms - a.observed_duration_ms)[0] || null;
}

function buildComparison(baseline, current) {
  const flowNames = [...new Set([
    ...baseline.flow_results.map(keyFlow),
    ...current.flow_results.map(keyFlow),
  ])];

  const flows = flowNames.map((flowName) => {
    const baseFlow = getFlow(baseline, flowName);
    const currentFlow = getFlow(current, flowName);
    return {
      flow: flowName,
      query_count: compareRow('query_count', baseFlow?.query_count ?? 0, currentFlow?.query_count ?? 0),
      total_db_time_ms: compareRow('total_db_time_ms', baseFlow?.total_time_ms ?? 0, currentFlow?.total_time_ms ?? 0),
      slowest_query_ms: compareRow('slowest_query_ms', baseFlow?.slowest_query_ms ?? 0, currentFlow?.slowest_query_ms ?? 0),
    };
  });

  const baselineRequests = flattenRequests(baseline);
  const currentRequests = flattenRequests(current);
  const requestKeys = [...new Set([
    ...baselineRequests.map((row) => `${row.flow}::${row.request_label}`),
    ...currentRequests.map((row) => `${row.flow}::${row.request_label}`),
  ])];

  const requests = requestKeys.map((requestKey) => {
    const [flowName, requestLabel] = requestKey.split('::');
    const baseRequestRow = baselineRequests.find((row) => row.flow === flowName && row.request_label === requestLabel) || null;
    const currentRequestRow = currentRequests.find((row) => row.flow === flowName && row.request_label === requestLabel) || null;
    const baseFlow = getFlow(baseline, flowName);
    const currentFlow = getFlow(current, flowName);
    const baseSlowQuery = getSlowestAffectedQuery(baseFlow, requestLabel);
    const currentSlowQuery = getSlowestAffectedQuery(currentFlow, requestLabel);

    return {
      flow: flowName,
      request_label: requestLabel,
      path: currentRequestRow?.path || baseRequestRow?.path || null,
      db_time_ms: compareRow(
        'db_time_ms',
        baseRequestRow?.request ? summarizeRequestDuration(baseRequestRow.request) : 0,
        currentRequestRow?.request ? summarizeRequestDuration(currentRequestRow.request) : 0
      ),
      slowest_query_ms: compareRow(
        'slowest_query_ms',
        baseSlowQuery?.observed_duration_ms ?? 0,
        currentSlowQuery?.observed_duration_ms ?? 0
      ),
    };
  });

  const viewDocBaseline = getFlow(baseline, 'View a document');
  const viewDocCurrent = getFlow(current, 'View a document');
  const affected_requests = [...AFFECTED_REQUESTS].map((requestLabel) => {
    const baseRequest = getRequest(viewDocBaseline, requestLabel);
    const currentRequest = getRequest(viewDocCurrent, requestLabel);
    const baseSlowQuery = getSlowestAffectedQuery(viewDocBaseline, requestLabel);
    const currentSlowQuery = getSlowestAffectedQuery(viewDocCurrent, requestLabel);

    return {
      request_label: requestLabel,
      path: currentRequest?.path || baseRequest?.path || null,
      db_time_ms: compareRow(
        'db_time_ms',
        baseRequest ? summarizeRequestDuration(baseRequest) : 0,
        currentRequest ? summarizeRequestDuration(currentRequest) : 0
      ),
      slowest_query_ms: compareRow(
        'slowest_query_ms',
        baseSlowQuery?.observed_duration_ms ?? 0,
        currentSlowQuery?.observed_duration_ms ?? 0
      ),
      baseline_query: baseSlowQuery ? {
        sql_summary: baseSlowQuery.sql_summary,
        observed_duration_ms: baseSlowQuery.observed_duration_ms,
        explain_total_time_ms: baseSlowQuery.total_time_ms,
        plan_summary: baseSlowQuery.plan_summary,
      } : null,
      current_query: currentSlowQuery ? {
        sql_summary: currentSlowQuery.sql_summary,
        observed_duration_ms: currentSlowQuery.observed_duration_ms,
        explain_total_time_ms: currentSlowQuery.total_time_ms,
        plan_summary: currentSlowQuery.plan_summary,
      } : null,
    };
  });

  const affectedSlowestImprovement = affected_requests
    .map((request) => request.slowest_query_ms.delta_pct)
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b)[0] ?? null;

  return {
    generated_at: new Date().toISOString(),
    baseline: {
      label: baseline.label ?? 'baseline',
      generated_at: baseline.generated_at,
      path: baseline.__resolvedPath,
    },
    current: {
      label: current.label ?? 'current',
      generated_at: current.generated_at,
      path: current.__resolvedPath,
    },
    target: {
      metric: 'slowest_query_ms',
      threshold_pct: -50,
      met: Number.isFinite(affectedSlowestImprovement) ? affectedSlowestImprovement <= -50 : false,
    },
    flows,
    requests,
    affected_requests,
  };
}

function buildMarkdown(comparison) {
  const chartSlug = slugify(`${comparison.baseline.label}-${comparison.current.label}`);
  const flowChartPath = `../charts/${chartSlug}--flow-db-time.svg`;
  const requestChartPath = `../charts/${chartSlug}--request-db-time.svg`;
  const flowRows = comparison.flows.map((flow) => (
    `| ${flow.flow} | ${formatNumber(flow.query_count.baseline, 0)} | ${formatNumber(flow.query_count.current, 0)} | ${formatPercent(flow.query_count.delta_pct)} | ${formatNumber(flow.total_db_time_ms.baseline)} | ${formatNumber(flow.total_db_time_ms.current)} | ${formatPercent(flow.total_db_time_ms.delta_pct)} | ${formatNumber(flow.slowest_query_ms.baseline)} | ${formatNumber(flow.slowest_query_ms.current)} | ${formatPercent(flow.slowest_query_ms.delta_pct)} |`
  )).join('\n');

  const requestRows = comparison.requests.map((request) => (
    `| ${request.flow} | ${request.request_label} | ${request.path || 'N/A'} | ${formatNumber(request.db_time_ms.baseline)} | ${formatNumber(request.db_time_ms.current)} | ${formatPercent(request.db_time_ms.delta_pct)} | ${formatNumber(request.slowest_query_ms.baseline)} | ${formatNumber(request.slowest_query_ms.current)} | ${formatPercent(request.slowest_query_ms.delta_pct)} |`
  )).join('\n');

  const explainSections = comparison.affected_requests.map((request) => {
    const baselinePlan = request.baseline_query?.plan_summary?.join('\n') || 'Unavailable';
    const currentPlan = request.current_query?.plan_summary?.join('\n') || 'Unavailable';
    return `### ${request.request_label}\n\nWhat was inefficient: correlated subplans were executed per outer row in the baseline query for this endpoint.\nWhy the rewrite helps: the current query precomputes counts/status once and joins the aggregated results back by id, so the planner can execute the work set-wise instead of row-by-row.\n\nBaseline slow query: \`${request.baseline_query?.sql_summary || 'Unavailable'}\`\nObserved: ${formatNumber(request.baseline_query?.observed_duration_ms ?? NaN)}ms, EXPLAIN total: ${formatNumber(request.baseline_query?.explain_total_time_ms ?? NaN)}ms\n\nCurrent slow query: \`${request.current_query?.sql_summary || 'Unavailable'}\`\nObserved: ${formatNumber(request.current_query?.observed_duration_ms ?? NaN)}ms, EXPLAIN total: ${formatNumber(request.current_query?.explain_total_time_ms ?? NaN)}ms\n\nBaseline plan:\n\`\`\`\n${baselinePlan}\n\`\`\`\n\nCurrent plan:\n\`\`\`\n${currentPlan}\n\`\`\``;
  }).join('\n\n');

  return `# DB Query Efficiency Comparison

Baseline: ${comparison.baseline.label} (${comparison.baseline.generated_at})
Current: ${comparison.current.label} (${comparison.current.generated_at})
Target: 50% improvement on the slowest affected query
Status: ${comparison.target.met ? 'Met' : 'Not met'}

## Flow Summary

![User flow DB time chart](${flowChartPath})

| Flow | Baseline Queries | Current Queries | Query Delta (%) | Baseline DB Time (ms) | Current DB Time (ms) | DB Time Delta (%) | Baseline Slowest (ms) | Current Slowest (ms) | Slowest Delta (%) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
${flowRows}

## Request Summary

![Request DB time chart](${requestChartPath})

| Flow | Request | Path | Baseline DB Time (ms) | Current DB Time (ms) | DB Time Delta (%) | Baseline Slowest (ms) | Current Slowest (ms) | Slowest Delta (%) |
|---|---|---|---:|---:|---:|---:|---:|---:|
${requestRows}

## Before / After EXPLAIN ANALYZE

${explainSections}
`;
}

function main() {
  const { baseline: baselineRef, current: currentRef } = parseArgs(process.argv.slice(2));
  if (!baselineRef) {
    throw new Error('Missing required --baseline <snapshot>');
  }

  const baselineResolved = resolveSnapshot(baselineRef);
  const currentResolved = resolveSnapshot(currentRef);

  if (!baselineResolved.data) {
    throw new Error(`Unable to resolve baseline snapshot: ${baselineRef}`);
  }
  if (!currentResolved.data) {
    throw new Error(`Unable to resolve current snapshot: ${currentRef}`);
  }

  baselineResolved.data.__resolvedPath = baselineResolved.path;
  currentResolved.data.__resolvedPath = currentResolved.path;

  const comparison = buildComparison(baselineResolved.data, currentResolved.data);
  const slug = `${slugify(comparison.baseline.label)}__${slugify(comparison.current.label)}`;
  const jsonPath = path.join(COMPARISONS_DIR, `${slug}.json`);
  const mdPath = path.join(COMPARISONS_DIR, `${slug}.md`);

  ensureDir(COMPARISONS_DIR);
  fs.writeFileSync(jsonPath, `${JSON.stringify(comparison, null, 2)}\n`, 'utf8');
  fs.writeFileSync(mdPath, `${buildMarkdown(comparison)}\n`, 'utf8');

  console.log(`Wrote ${path.relative(ROOT, jsonPath)}`);
  console.log(`Wrote ${path.relative(ROOT, mdPath)}`);
}

main();
