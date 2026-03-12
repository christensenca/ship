#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { ensureDir, formatNumber, formatPercent, readJsonFileSafe, slugify } from './api-latency-lib.mjs';

const ROOT = process.cwd();
const REPORTS_DIR = path.join(ROOT, 'reports', 'api-latency');
const SNAPSHOTS_DIR = path.join(REPORTS_DIR, 'snapshots');
const COMPARISONS_DIR = path.join(REPORTS_DIR, 'comparisons');

function parseArgs(argv) {
  const result = {
    baseline: null,
    current: 'latest',
  };

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
    return {
      path: path.join(REPORTS_DIR, 'latest.json'),
      data: readJsonFileSafe(path.join(REPORTS_DIR, 'latest.json')),
    };
  }

  const directPath = path.isAbsolute(reference)
    ? reference
    : path.join(SNAPSHOTS_DIR, reference.endsWith('.json') ? reference : `${reference}.json`);
  if (fs.existsSync(directPath)) {
    return { path: directPath, data: readJsonFileSafe(directPath) };
  }

  const snapshotFile = listSnapshotFiles().find((file) => path.basename(file).includes(reference));
  if (snapshotFile) {
    return { path: snapshotFile, data: readJsonFileSafe(snapshotFile) };
  }

  return { path: directPath, data: null };
}

function compareRow(label, baseline, current) {
  const deltaMs = current - baseline;
  const deltaPct = baseline > 0 ? ((current - baseline) / baseline) * 100 : null;
  return { label, baseline, current, delta_ms: deltaMs, delta_pct: deltaPct };
}

function getResult(report, endpointPath, concurrency) {
  return report.results.find((row) => row.path === endpointPath && row.concurrency === concurrency) || null;
}

function buildComparison(baseline, current) {
  const endpointPaths = current.endpoints.map((endpoint) => endpoint.path);
  const c25 = endpointPaths.map((endpointPath) => {
    const baseRow = getResult(baseline, endpointPath, 25);
    const currentRow = getResult(current, endpointPath, 25);
    return {
      path: endpointPath,
      p95_ms: compareRow('p95_ms', baseRow?.p95_ms ?? 0, currentRow?.p95_ms ?? 0),
      p99_ms: compareRow('p99_ms', baseRow?.p99_ms ?? 0, currentRow?.p99_ms ?? 0),
    };
  });

  const docsIssuesPaths = ['/api/documents?type=wiki', '/api/issues'];
  const concurrencyBreakdown = docsIssuesPaths.flatMap((endpointPath) => (
    [10, 25, 50].map((concurrency) => {
      const baseRow = getResult(baseline, endpointPath, concurrency);
      const currentRow = getResult(current, endpointPath, concurrency);
      return {
        path: endpointPath,
        concurrency,
        p95_ms: compareRow('p95_ms', baseRow?.p95_ms ?? 0, currentRow?.p95_ms ?? 0),
      };
    })
  ));

  const phaseBreakdowns = endpointPaths
    .map((endpointPath) => {
      const baselineBreakdown = baseline.route_breakdowns?.[endpointPath];
      const currentBreakdown = current.route_breakdowns?.[endpointPath];
      if (!baselineBreakdown || !currentBreakdown) {
        return null;
      }

      const phaseNames = [...new Set([
        ...Object.keys(baselineBreakdown.phases || {}),
        ...Object.keys(currentBreakdown.phases || {}),
      ])].sort();

      return {
        path: endpointPath,
        phases: phaseNames.map((phase) => compareRow(
          phase,
          baselineBreakdown.phases?.[phase]?.p95_ms ?? 0,
          currentBreakdown.phases?.[phase]?.p95_ms ?? 0
        )),
      };
    })
    .filter(Boolean);

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
    gate: {
      metric: 'p95_ms',
      concurrency: 25,
      threshold_pct: -20,
    },
    c25,
    docs_and_issues_by_concurrency: concurrencyBreakdown,
    phase_breakdowns: phaseBreakdowns,
  };
}

function buildMarkdown(comparison) {
  const c25Rows = comparison.c25.map((item) => (
    `| ${item.path} | ${formatNumber(item.p95_ms.baseline)} | ${formatNumber(item.p95_ms.current)} | ${formatNumber(item.p95_ms.delta_ms)} | ${formatPercent(item.p95_ms.delta_pct)} |`
  )).join('\n');

  const gateRows = comparison.c25
    .filter((item) => item.path === '/api/documents?type=wiki' || item.path === '/api/issues')
    .map((item) => {
      const meetsTarget = Number.isFinite(item.p95_ms.delta_pct) && item.p95_ms.delta_pct <= comparison.gate.threshold_pct;
      return `- \`${item.path}\`: ${formatPercent(item.p95_ms.delta_pct)} (${meetsTarget ? 'meets' : 'misses'} 20% target)`;
    })
    .join('\n');

  const phaseSections = (comparison.phase_breakdowns || [])
    .map((endpoint) => {
      const rows = endpoint.phases
        .map((phase) => `| ${phase.label} | ${formatNumber(phase.baseline)} | ${formatNumber(phase.current)} | ${formatNumber(phase.delta_ms)} | ${formatPercent(phase.delta_pct)} |`)
        .join('\n');
      return `### ${endpoint.path}\n\n| Phase (P95) | Baseline | Current | Delta (ms) | Delta (%) |\n|---|---:|---:|---:|---:|\n${rows}`;
    })
    .join('\n\n');

  return `# API Latency Comparison\n\nBaseline: ${comparison.baseline.label} (${comparison.baseline.generated_at})\nCurrent: ${comparison.current.label} (${comparison.current.generated_at})\nGate: P95 @ c=${comparison.gate.concurrency}, improvement >= 20%\n\n## c=25 Before/After\n\n| Endpoint | Baseline P95 | Current P95 | Delta (ms) | Delta (%) |\n|---|---:|---:|---:|---:|\n${c25Rows}\n\n## Gate Status\n\n${gateRows}\n${phaseSections ? `\n\n## App-Layer Phase Breakdown\n\n${phaseSections}\n` : ''}\n## Scope Notes\n\n- This comparison reflects non-SQL request-path changes only.\n- Remaining query-planner and index work is intentionally deferred to the separate SQL optimization pass.\n`;
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
  fs.writeFileSync(mdPath, buildMarkdown(comparison), 'utf8');

  console.log(`Wrote ${path.relative(ROOT, jsonPath)}`);
  console.log(`Wrote ${path.relative(ROOT, mdPath)}`);
}

main();
