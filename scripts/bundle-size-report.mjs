#!/usr/bin/env node

/**
 * Bundle Size Audit Script
 *
 * Builds the production frontend and generates:
 * - reports/bundle-size/latest.json  (structured size data)
 * - reports/bundle-size/treemap.html (interactive treemap visualization)
 *
 * All sizes use the visualizer's "rendered" metric (post-treeshake, pre-minify)
 * which matches what the interactive treemap displays.
 *
 * Usage: node scripts/bundle-size-report.mjs
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const WEB = join(ROOT, 'web');
const REPORTS_DIR = join(ROOT, 'reports', 'bundle-size');
const BASELINE_DATE = '2026-03-10';
const BASELINE_INITIAL_CHUNK_RENDERED_KB = 4532.3;
const TARGET_INITIAL_CHUNK_RENDERED_KB = +(BASELINE_INITIAL_CHUNK_RENDERED_KB * 0.8).toFixed(1);

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: WEB, encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024, ...opts }).trim();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Step 1: Build shared + web
console.log('Building shared types...');
run('pnpm build', { cwd: join(ROOT, 'shared') });

console.log('Building production frontend with treemap visualizer...');
run('ANALYZE=true npx vite build 2>&1');

// Step 2: Check for unused dependencies by grepping exact import patterns
console.log('Checking for unused dependencies...');
const pkgJson = JSON.parse(readFileSync(join(WEB, 'package.json'), 'utf-8'));
const deps = Object.keys(pkgJson.dependencies || {});
const unusedDeps = [];

for (const dep of deps) {
  if (dep === 'react' || dep.startsWith('@ship/')) continue;
  try {
    const escapedDep = escapeRegex(dep);
    const importPattern = `from ['"]${escapedDep}([/'"])`;
    const globPattern = `import\\.meta\\.glob.*${escapedDep}`;
    const dynamicPattern = `import\\(['"]${escapedDep}`;

    // Check for standard ES imports: from 'pkg' or from "pkg"
    const importResult = run(`rg -l -g '*.ts' -g '*.tsx' ${JSON.stringify(importPattern)} src || true`);
    // Check for import.meta.glob patterns (e.g. @uswds/uswds icons)
    const globResult = run(`rg -l -g '*.ts' -g '*.tsx' ${JSON.stringify(globPattern)} src || true`);
    // Check for dynamic import() calls
    const dynamicResult = run(`rg -l -g '*.ts' -g '*.tsx' ${JSON.stringify(dynamicPattern)} src || true`);
    if (!importResult.trim() && !globResult.trim() && !dynamicResult.trim()) {
      unusedDeps.push(dep);
    }
  } catch {
    unusedDeps.push(dep);
  }
}

// Step 3: Parse treemap for all data (single source of truth)
mkdirSync(REPORTS_DIR, { recursive: true });

const statsPath = join(WEB, 'stats.html');
if (!existsSync(statsPath)) {
  console.error('ERROR: stats.html not found. Build with ANALYZE=true failed.');
  process.exit(1);
}

console.log('Parsing treemap for bundle sizes...');
const html = readFileSync(statsPath, 'utf-8');
const dataMatch = html.match(/const data = ({.*?});/s);
if (!dataMatch) {
  console.error('ERROR: Could not parse treemap data from stats.html');
  process.exit(1);
}

const visData = JSON.parse(dataMatch[1]);

// Build chunk-level and dependency-level size maps from the visualizer data
// nodeMetas: metaUid -> { id (filepath), moduleParts: { chunkFile: partUid } }
// nodeParts: partUid -> { renderedLength, gzipLength, brotliLength, metaUid }

const chunkSizes = {};   // chunkName -> { rendered, gzip, brotli }
const pkgSizes = {};     // pkgName -> { rendered, gzip }

for (const meta of Object.values(visData.nodeMetas)) {
  const filePath = meta.id || '';
  if (!meta.moduleParts) continue;

  for (const [chunkName, partUid] of Object.entries(meta.moduleParts)) {
    const part = visData.nodeParts[partUid];
    if (!part) continue;

    const rendered = part.renderedLength || 0;
    const gzip = part.gzipLength || 0;
    const brotli = part.brotliLength || 0;
    if (rendered === 0) continue;

    // Aggregate by chunk
    if (!chunkSizes[chunkName]) chunkSizes[chunkName] = { rendered: 0, gzip: 0, brotli: 0 };
    chunkSizes[chunkName].rendered += rendered;
    chunkSizes[chunkName].gzip += gzip;
    chunkSizes[chunkName].brotli += brotli;

    // Aggregate by package
    let pkgName;
    const m = filePath.match(/node_modules\/\.pnpm\/([^/]+)/);
    if (m) {
      pkgName = m[1].replace(/\+/g, '/');
      const atIdx = pkgName.lastIndexOf('@');
      if (atIdx > 0) pkgName = pkgName.substring(0, atIdx);
    } else if (filePath.includes('/src/') || filePath.includes('/shared/')) {
      pkgName = 'app code';
    } else {
      pkgName = 'other';
    }

    if (!pkgSizes[pkgName]) pkgSizes[pkgName] = { rendered: 0, gzip: 0 };
    pkgSizes[pkgName].rendered += rendered;
    pkgSizes[pkgName].gzip += gzip;
  }
}

// Sort chunks by rendered size descending
const sortedChunks = Object.entries(chunkSizes)
  .sort((a, b) => b[1].rendered - a[1].rendered)
  .map(([name, sizes]) => ({
    name,
    rendered_kb: +(sizes.rendered / 1024).toFixed(1),
    gzip_kb: +(sizes.gzip / 1024).toFixed(1),
    brotli_kb: +(sizes.brotli / 1024).toFixed(1),
  }));

// Sort dependencies by rendered size descending
const totalRendered = Object.values(pkgSizes).reduce((s, v) => s + v.rendered, 0);
const dependencyBreakdown = Object.entries(pkgSizes)
  .sort((a, b) => b[1].rendered - a[1].rendered)
  .map(([name, sizes]) => ({
    name,
    rendered_kb: +(sizes.rendered / 1024).toFixed(1),
    gzip_kb: +(sizes.gzip / 1024).toFixed(1),
    percent: +((sizes.rendered / totalRendered) * 100).toFixed(1),
  }));

const totalGzip = Object.values(chunkSizes).reduce((s, v) => s + v.gzip, 0);
const totalBrotli = Object.values(chunkSizes).reduce((s, v) => s + v.brotli, 0);
const largest = sortedChunks[0] || { name: 'unknown', rendered_kb: 0, gzip_kb: 0, brotli_kb: 0 };
const initialChunks = sortedChunks.filter((chunk) => /(^|\/)assets\/index-[^/]+\.js$/.test(chunk.name));
const initialChunkName = initialChunks.map((chunk) => chunk.name).join(', ') || 'none';
const initialChunkRenderedKb = +initialChunks.reduce((sum, chunk) => sum + chunk.rendered_kb, 0).toFixed(1);
const initialChunkGzipKb = +initialChunks.reduce((sum, chunk) => sum + chunk.gzip_kb, 0).toFixed(1);

// Copy treemap to reports
copyFileSync(statsPath, join(REPORTS_DIR, 'treemap.html'));
console.log('Treemap saved to: reports/bundle-size/treemap.html');

// Step 4: Generate report
const report = {
  audit: 'Bundle Size',
  date: new Date().toISOString().split('T')[0],
  note: 'All sizes are "rendered" (post-treeshake, pre-minify) matching the treemap visualization. Gzip/brotli are estimated compressed sizes of the rendered output.',
  summary: {
    total_rendered_kb: +(totalRendered / 1024).toFixed(1),
    total_gzip_kb: +(totalGzip / 1024).toFixed(1),
    total_brotli_kb: +(totalBrotli / 1024).toFixed(1),
    initial_chunk: initialChunkName,
    initial_chunk_rendered_kb: initialChunkRenderedKb,
    initial_chunk_gzip_kb: initialChunkGzipKb,
    baseline_date: BASELINE_DATE,
    target_initial_chunk_rendered_kb: TARGET_INITIAL_CHUNK_RENDERED_KB,
    passes_initial_budget: initialChunkRenderedKb <= TARGET_INITIAL_CHUNK_RENDERED_KB,
    largest_chunk: largest,
    number_of_chunks: sortedChunks.length,
    top_dependencies: dependencyBreakdown.filter(d => d.name !== 'other').slice(0, 10),
    unused_dependencies: unusedDeps,
  },
  chunks: sortedChunks.slice(0, 20),
  dependency_breakdown: dependencyBreakdown,
};

const reportPath = join(REPORTS_DIR, 'latest.json');
writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(`\nReport written to: ${reportPath}`);

// Print summary
console.log('\n=== Bundle Size Summary ===');
console.log(`Total rendered: ${(totalRendered / 1024).toFixed(1)} KB`);
console.log(`Total gzip:     ${(totalGzip / 1024).toFixed(1)} KB`);
console.log(`Total brotli:   ${(totalBrotli / 1024).toFixed(1)} KB`);
console.log(`Chunks:         ${sortedChunks.length}`);
console.log(`Largest chunk:  ${largest.name} (${largest.rendered_kb} KB rendered, ${largest.gzip_kb} KB gzip)`);

if (dependencyBreakdown.length > 0) {
  console.log('\nTop 10 dependencies (rendered size):');
  for (const dep of dependencyBreakdown.filter(d => d.name !== 'other').slice(0, 10)) {
    console.log(`  ${String(dep.rendered_kb).padStart(8)} KB  ${String(dep.gzip_kb).padStart(7)} KB gz  ${String(dep.percent).padStart(5)}%  ${dep.name}`);
  }
}
if (unusedDeps.length > 0) {
  console.log(`\nUnused deps:    ${unusedDeps.join(', ')}`);
} else {
  console.log(`\nUnused deps:    none`);
}
