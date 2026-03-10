#!/usr/bin/env node

/**
 * Test Coverage & Quality Report
 *
 * Measures test suite health across:
 * - API unit tests
 * - Web unit tests
 * - Playwright E2E tests
 *
 * The report is designed to answer Category 5 directly:
 * - total tests
 * - pass / fail / flaky
 * - suite runtime
 * - critical flow coverage gaps
 * - line / branch coverage for api + web
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, 'reports', 'test-coverage');
const LATEST_JSON_PATH = path.join(OUTPUT_DIR, 'latest.json');
const LATEST_MD_PATH = path.join(OUTPUT_DIR, 'latest.md');
const HISTORY_PATH = path.join(OUTPUT_DIR, 'history.jsonl');
const TEST_RESULTS_DIR = path.join(ROOT, 'test-results');

const INCLUDE_E2E = process.env.TEST_COVERAGE_SKIP_E2E !== '1';
const FLAKE_RUNS = Math.max(1, parseInt(process.env.TEST_COVERAGE_FLAKE_RUNS || '3', 10));

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJsonSafe(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function relativePath(absolutePath) {
  return path.relative(ROOT, absolutePath).replaceAll(path.sep, '/');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripAnsi(value) {
  return value.replace(/[\x1b\x9b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

function walkFiles(dirPath, pattern) {
  if (!fs.existsSync(dirPath)) return [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'coverage') continue;
      files.push(...walkFiles(fullPath, pattern));
      continue;
    }
    if (pattern.test(entry.name)) files.push(fullPath);
  }

  return files;
}

function discoverTestFiles() {
  const apiTests = walkFiles(path.join(ROOT, 'api', 'src'), /\.test\.(ts|tsx)$/);
  const webTests = walkFiles(path.join(ROOT, 'web', 'src'), /\.test\.(ts|tsx)$/);
  const e2eTests = walkFiles(path.join(ROOT, 'e2e'), /\.spec\.(ts|tsx)$/);

  return {
    api: apiTests.map(relativePath),
    web: webTests.map(relativePath),
    e2e: e2eTests.map(relativePath),
  };
}

function readTestContents(testFiles) {
  const contents = new Map();
  for (const file of [...testFiles.api, ...testFiles.web, ...testFiles.e2e]) {
    const fullPath = path.join(ROOT, file);
    if (!fs.existsSync(fullPath)) continue;
    try {
      contents.set(file, fs.readFileSync(fullPath, 'utf8'));
    } catch {
      // ignore unreadable files
    }
  }
  return contents;
}

function discoverSourceFiles(srcDir, excludePatterns = []) {
  if (!fs.existsSync(srcDir)) return [];
  return walkFiles(srcDir, /\.(ts|tsx)$/)
    .map(relativePath)
    .filter((file) => {
      if (file.includes('.test.') || file.includes('.spec.')) return false;
      if (file.includes('/test/') || file.includes('/__tests__/')) return false;
      return !excludePatterns.some((pattern) => file.includes(pattern));
    });
}

function extractJsonObject(output, startToken = '{"numTotal') {
  const clean = stripAnsi(output);
  const jsonStart = clean.indexOf(startToken);
  if (jsonStart < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = jsonStart; i < clean.length; i += 1) {
    const ch = clean[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(clean.slice(jsonStart, i + 1));
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

function parseVitestJson(output, elapsedMs, packageName, coverageDir) {
  const result = {
    package: packageName,
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    runtime_ms: elapsedMs,
    test_files: 0,
    failed_tests: [],
    tests: [],
    coverage: null,
  };

  const parsed = extractJsonObject(output);
  if (parsed) {
    result.test_files = parsed.testResults?.length || parsed.numTotalTestSuites || 0;
    result.total = parsed.numTotalTests || 0;
    result.passed = parsed.numPassedTests || 0;
    result.failed = parsed.numFailedTests || 0;
    result.skipped = (parsed.numPendingTests || 0) + (parsed.numTodoTests || 0);

    for (const suite of parsed.testResults || []) {
      const file = relativePath(suite.name || '');
      for (const test of suite.assertionResults || []) {
        const normalized = {
          file,
          test: test.fullName || test.title,
          status: test.status,
        };
        result.tests.push(normalized);
        if (test.status === 'failed') result.failed_tests.push(normalized);
      }
    }
  }

  const coverageSummaryPath = path.join(coverageDir, 'coverage-summary.json');
  const coverageData = readJsonSafe(coverageSummaryPath);
  if (coverageData?.total) {
    result.coverage = {
      lines: coverageData.total.lines?.pct ?? null,
      branches: coverageData.total.branches?.pct ?? null,
      functions: coverageData.total.functions?.pct ?? null,
      statements: coverageData.total.statements?.pct ?? null,
    };
  }

  return result;
}

function runUnitTests(packageName) {
  console.log(`  Running ${packageName} unit tests with coverage...`);
  const start = Date.now();
  const pkgDir = path.join(ROOT, packageName);
  const coverageDir = path.join(OUTPUT_DIR, `${packageName}-coverage`);

  function execVitest(command) {
    try {
      return execSync(command, {
        cwd: pkgDir,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 300_000,
        maxBuffer: 50 * 1024 * 1024,
        env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      });
    } catch (error) {
      return `${error.stdout || ''}\n${error.stderr || ''}`;
    }
  }

  const output = execVitest(
    `pnpm exec vitest run --coverage --coverage.reportOnFailure --coverage.reportsDirectory=${coverageDir} --reporter=json`
  );
  const result = parseVitestJson(output, Date.now() - start, packageName, coverageDir);

  if (result.total === 0 && output.includes('MISSING DEPENDENCY')) {
    console.log(`  Coverage dependency missing in ${packageName}; re-running without coverage.`);
    const fallback = execVitest('pnpm exec vitest run --reporter=json');
    return parseVitestJson(fallback, Date.now() - start, packageName, coverageDir);
  }

  return result;
}

function detectVitestFlakyTests(packageName) {
  const pkgDir = path.join(ROOT, packageName);
  const runs = [];

  for (let i = 0; i < FLAKE_RUNS; i += 1) {
    process.stdout.write(`    Run ${i + 1}/${FLAKE_RUNS}... `);
    const started = Date.now();
    let output = '';

    try {
      output = execSync('pnpm exec vitest run --reporter=json', {
        cwd: pkgDir,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 300_000,
        maxBuffer: 50 * 1024 * 1024,
        env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      });
    } catch (error) {
      output = `${error.stdout || ''}\n${error.stderr || ''}`;
    }

    const parsed = extractJsonObject(output);
    const statuses = new Map();
    if (parsed?.testResults) {
      for (const suite of parsed.testResults) {
        const file = relativePath(suite.name || '');
        for (const test of suite.assertionResults || []) {
          statuses.set(`${file}::${test.fullName || test.title}`, test.status);
        }
      }
      console.log(`${parsed.numPassedTests || 0} passed, ${parsed.numFailedTests || 0} failed (${Date.now() - started}ms)`);
    } else {
      console.log(`no parseable output (${Date.now() - started}ms)`);
    }
    runs.push(statuses);
  }

  return compareRunStatuses(runs);
}

function clearPlaywrightArtifacts() {
  fs.rmSync(TEST_RESULTS_DIR, { recursive: true, force: true });
  ensureDir(TEST_RESULTS_DIR);
}

function runPlaywrightSuite({ label, retries = 0 } = {}) {
  const logsDir = path.join(OUTPUT_DIR, 'logs');
  ensureDir(logsDir);
  clearPlaywrightArtifacts();

  const stdoutPath = path.join(logsDir, `${label}.stdout.log`);
  const stderrPath = path.join(logsDir, `${label}.stderr.log`);
  const stdoutFd = fs.openSync(stdoutPath, 'w');
  const stderrFd = fs.openSync(stderrPath, 'w');

  const started = Date.now();
  const result = spawnSync(
    'npx',
    ['playwright', 'test', '--reporter=./e2e/progress-reporter.ts', `--retries=${retries}`],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        PW_TEST_HTML_REPORT_OPEN: 'never',
        SHIP_TEST_RESULTS_DIR: TEST_RESULTS_DIR,
      },
      stdio: ['ignore', stdoutFd, stderrFd],
    }
  );
  fs.closeSync(stdoutFd);
  fs.closeSync(stderrFd);

  const parsed = readJsonSafe(path.join(TEST_RESULTS_DIR, 'results.json'));
  const summary = readJsonSafe(path.join(TEST_RESULTS_DIR, 'summary.json'));

  if (!parsed) {
    return {
      package: 'e2e',
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      flaky: 0,
      runtime_ms: Date.now() - started,
      failed_tests: [],
      flaky_tests: [],
      tests: [],
      exit_code: result.status,
      stdout_log: relativePath(stdoutPath),
      stderr_log: relativePath(stderrPath),
      summary,
    };
  }

  const normalizedTests = parsed.tests.map((test) => ({
    file: `e2e/${test.test}`,
    test: test.title,
    status: test.status,
    outcome: test.outcome,
    retries: test.retries,
    duration: test.duration,
    errors: test.errors,
  }));

  return {
    package: 'e2e',
    total: parsed.total,
    passed: parsed.passed,
    failed: parsed.failed,
    skipped: parsed.skipped,
    flaky: parsed.flaky,
    runtime_ms: parsed.duration_ms ?? Date.now() - started,
    failed_tests: normalizedTests.filter((test) => test.status === 'failed'),
    flaky_tests: normalizedTests.filter((test) => test.outcome === 'flaky'),
    tests: normalizedTests,
    exit_code: result.status,
    stdout_log: relativePath(stdoutPath),
    stderr_log: relativePath(stderrPath),
    summary,
  };
}

function detectPlaywrightFlakyTests() {
  const runs = [];

  for (let i = 0; i < FLAKE_RUNS; i += 1) {
    process.stdout.write(`    Run ${i + 1}/${FLAKE_RUNS}... `);
    const result = runPlaywrightSuite({ label: `e2e-flake-${i + 1}`, retries: 0 });
    console.log(`${result.passed} passed, ${result.failed} failed (${result.runtime_ms}ms)`);

    const statuses = new Map();
    for (const test of result.tests) {
      statuses.set(`${test.file}::${test.test}`, test.status);
    }
    runs.push(statuses);
  }

  return compareRunStatuses(runs);
}

function compareRunStatuses(runs) {
  const allKeys = new Set();
  for (const run of runs) {
    for (const key of run.keys()) allKeys.add(key);
  }

  const flaky = [];
  const consistentFailures = [];

  for (const key of allKeys) {
    const statuses = runs.map((run) => run.get(key) || 'missing');
    const unique = new Set(statuses);
    const [file, test] = key.split('::', 2);

    if (unique.has('passed') && unique.has('failed')) {
      flaky.push({
        file,
        test,
        pass_rate: `${statuses.filter((status) => status === 'passed').length}/${runs.length}`,
        statuses,
      });
      continue;
    }

    if (unique.size === 1 && unique.has('failed')) {
      consistentFailures.push({ file, test });
    }
  }

  return { flaky, consistent_failures: consistentFailures, run_count: runs.length };
}

function analyzeTestQuality(testFiles, testContents) {
  const issues = [];

  for (const file of [...testFiles.api, ...testFiles.web, ...testFiles.e2e]) {
    const content = testContents.get(file) || '';
    if (!content) continue;

    const skipMatches = content.match(/test\.skip\s*\(/g);
    if (skipMatches) {
      issues.push({
        file,
        type: 'skipped_test',
        count: skipMatches.length,
        description: `${skipMatches.length} test.skip() call(s) present`,
      });
    }

    const fixmeMatches = content.match(/test\.fixme\s*\(/g);
    if (fixmeMatches) {
      issues.push({
        file,
        type: 'fixme_test',
        count: fixmeMatches.length,
        description: `${fixmeMatches.length} test.fixme() call(s) present`,
      });
    }

    const emptyBodyMatches = content.match(/(?:it|test)\s*\([^,]+,\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{\s*(?:\/\/[^\n]*\s*|\/\*[\s\S]*?\*\/\s*)*\}\s*\)/g);
    if (emptyBodyMatches) {
      issues.push({
        file,
        type: 'empty_test',
        count: emptyBodyMatches.length,
        description: `${emptyBodyMatches.length} empty test body/bodies detected`,
      });
    }

    const assertionCount = (content.match(/\bexpect\s*\(/g) || []).length;
    const smokeAssertions = (content.match(/\.toBeVisible\s*\(|\.toBeInTheDocument\s*\(|\.toHaveURL\s*\(/g) || []).length;
    if (assertionCount > 0 && assertionCount <= 2 && smokeAssertions === assertionCount) {
      issues.push({
        file,
        type: 'smoke_test',
        count: assertionCount,
        description: `Only ${assertionCount} smoke-level assertion(s) detected`,
      });
    }
  }

  return issues;
}

function findMatchingTests(testContents, regexes = []) {
  const matches = [];
  for (const [file, content] of testContents.entries()) {
    if (regexes.some((regex) => regex.test(file) || regex.test(content))) matches.push(file);
  }
  return [...new Set(matches)].sort();
}

function mapCriticalFlows(testContents) {
  const flows = [
    {
      flow: 'Auth',
      risk: 'Users cannot sign in, sign out, or maintain secure sessions',
      unitMatchers: [/auth\.test\./, /useSessionTimeout\.test\./],
      e2eMatchers: [/auth\.spec\./, /authorization\.spec\./, /session-timeout\.spec\./],
    },
    {
      flow: 'Document CRUD',
      risk: 'Core document creation and editing workflows break',
      unitMatchers: [/documents\.test\./, /documents-visibility\.test\./],
      e2eMatchers: [/documents\.spec\./, /document-workflows\.spec\./, /docs-mode\.spec\./],
    },
    {
      flow: 'Real-time sync',
      risk: 'Concurrent edits lose data or diverge between users',
      unitMatchers: [/collaboration\.test\./, /api-content-preservation\.test\./],
      e2eMatchers: [/real-integration\.spec\./, /document-isolation\.spec\./, /backlinks\.spec\./],
    },
    {
      flow: 'Sprint management',
      risk: 'Week planning, reviews, and sprint assignment workflows break',
      unitMatchers: [/weeks\.test\./, /iterations\.test\./, /sprint-reviews\.test\./],
      e2eMatchers: [/weeks\.spec\./, /weekly-accountability\.spec\./, /program-mode-week-ux\.spec\./, /manager-reviews\.spec\./, /request-changes-api\.spec\./],
    },
    {
      flow: 'Programs',
      risk: 'Program CRUD and week views break',
      unitMatchers: [/projects\.test\./],
      e2eMatchers: [/programs\.spec\./, /program-mode-week-ux\.spec\./],
    },
    {
      flow: 'Team allocation',
      risk: 'Assignments, reviews, or staffing views drift from actual data',
      unitMatchers: [/weeks\.test\./, /reports-to\.test\./],
      e2eMatchers: [/team-mode\.spec\./, /pending-invites-allocation\.spec\./, /manager-reviews\.spec\./, /project-weeks\.spec\./],
    },
    {
      flow: 'Invites and onboarding',
      risk: 'Workspace invite and acceptance flows break for new users',
      unitMatchers: [/workspaces\.test\./],
      e2eMatchers: [/workspaces\.spec\./, /existing-user-invite\.spec\./, /pending-invites-allocation\.spec\./],
    },
    {
      flow: 'Feedback intake',
      risk: 'Public feedback submissions fail or triage state is wrong',
      unitMatchers: [],
      e2eMatchers: [/feedback-consolidation\.spec\./],
    },
    {
      flow: 'Dashboard / my-week',
      risk: 'Users see stale or incomplete planning status',
      unitMatchers: [/Dashboard\.test\./],
      e2eMatchers: [/my-week-stale-data\.spec\./, /accountability-banner-urgency\.spec\./, /accountability-week\.spec\./],
    },
    {
      flow: 'Comments',
      risk: 'Inline discussion and comment permissions regress silently',
      unitMatchers: [],
      e2eMatchers: [/inline-comments\.spec\./],
    },
  ];

  return flows.map((flow) => {
    const unitTests = findMatchingTests(testContents, flow.unitMatchers).filter((file) => !file.startsWith('e2e/'));
    const e2eTests = findMatchingTests(testContents, flow.e2eMatchers).filter((file) => file.startsWith('e2e/'));
    const testCount = unitTests.length + e2eTests.length;
    let depth = 'none';
    if (unitTests.length > 0 && e2eTests.length > 0) depth = 'unit+e2e';
    else if (unitTests.length > 0) depth = 'unit only';
    else if (e2eTests.length > 0) depth = 'e2e only';

    return {
      flow: flow.flow,
      risk: flow.risk,
      covered: testCount > 0,
      has_unit: unitTests.length > 0,
      depth,
      unit_tests: unitTests,
      e2e_tests: e2eTests,
      test_count: testCount,
    };
  });
}

function routeEvidenceMatchers(baseName) {
  const specific = {
    'admin-credentials': [/\/api\/admin\/credentials/, /admin credentials/i],
    admin: [/\/api\/admin\b/, /\/admin\b/, /workspace admin/i],
    ai: [/\/api\/ai\//, /analyze-plan/, /analyze-retro/],
    associations: [/belongs_to/, /backlink/i, /association/i],
    'caia-auth': [/caia/i, /\/api\/auth\//],
    claude: [/claude/i],
    comments: [/\/api\/comments\b/, /inline comments/i],
    dashboard: [/\/api\/dashboard\b/, /\/my-week\b/, /DashboardPage/, /urgency/i],
    feedback: [/\/api\/feedback\b/, /\/feedback\//, /triage/i],
    invites: [/\/api\/invites\//, /\/api\/workspaces\/.+\/invites/, /invite/i],
    programs: [/\/api\/programs\b/, /\/programs\b/],
    setup: [/\/setup\b/, /setup/i],
    team: [/\/api\/team\//, /\/team\/allocation\b/, /\/team\/reviews\b/],
    'weekly-plans': [/\/api\/weekly-plans\b/, /\/api\/weekly-retros\b/, /project-allocation-grid/],
  };

  return specific[baseName] || [new RegExp(`/api/${escapeRegExp(baseName)}\\b`)];
}

function findCoverageGaps(testFiles, testContents) {
  const apiSources = discoverSourceFiles(path.join(ROOT, 'api', 'src'), ['migrations', 'db/seed']);
  const webSources = discoverSourceFiles(path.join(ROOT, 'web', 'src'), ['test/', 'vite-env']);
  const allTests = [...testFiles.api, ...testFiles.web, ...testFiles.e2e];

  function hasDirectSameNameTest(sourceFile) {
    const baseName = path.basename(sourceFile).replace(/\.(ts|tsx)$/, '');
    return allTests.some((testFile) => {
      const testBase = path.basename(testFile).replace(/\.(test|spec)\.(ts|tsx)$/, '');
      return testBase === baseName;
    });
  }

  function hasRouteEvidence(sourceFile) {
    const baseName = path.basename(sourceFile, path.extname(sourceFile));
    const matchers = routeEvidenceMatchers(baseName);

    for (const [file, content] of testContents.entries()) {
      if (matchers.some((regex) => regex.test(file) || regex.test(content))) return true;
    }
    return false;
  }

  const routeFiles = apiSources.filter((file) => file.includes('/routes/') && !file.endsWith('/index.ts'));
  const routesWithoutEvidence = routeFiles.filter((file) => !hasRouteEvidence(file));
  const routesWithoutDirectTest = routeFiles.filter((file) => !hasDirectSameNameTest(file));
  const componentsWithoutDirectTest = webSources.filter((file) => file.includes('/components/') && file.endsWith('.tsx') && !hasDirectSameNameTest(file));
  const hooksWithoutDirectTest = webSources.filter((file) => file.includes('/hooks/') && !hasDirectSameNameTest(file));

  return {
    total_api_sources: apiSources.length,
    total_web_sources: webSources.length,
    routes_without_evidence: routesWithoutEvidence,
    routes_without_direct_test: routesWithoutDirectTest,
    components_without_direct_test: componentsWithoutDirectTest.slice(0, 20),
    hooks_without_direct_test: hooksWithoutDirectTest,
  };
}

function buildMarkdown(report) {
  const uncoveredFlows = report.critical_flows.filter((flow) => !flow.covered);
  const zeroCoverageFlows = report.critical_flows.filter((flow) => flow.depth === 'none');
  const noUnitFlows = report.critical_flows.filter((flow) => !flow.has_unit);
  const failedTests = [...report.api_results.failed_tests, ...report.web_results.failed_tests, ...(report.e2e_results?.failed_tests || [])];

  const lines = [];
  lines.push('# Test Coverage & Quality Report');
  lines.push('');
  lines.push(`Generated: ${report.generated_at}`);
  lines.push('');
  lines.push('## Audit Deliverable');
  lines.push('');
  lines.push('| Metric | Baseline |');
  lines.push('|---|---|');
  lines.push(`| Total tests | ${report.summary.total_tests} |`);
  lines.push(`| Pass / Fail / Flaky | ${report.summary.total_passed} / ${report.summary.total_failed} / ${report.summary.flaky_count} |`);
  lines.push(`| Suite runtime | ${report.summary.suite_runtime_seconds}s |`);
  lines.push(`| Critical flows with zero coverage | ${zeroCoverageFlows.length === 0 ? 'None' : zeroCoverageFlows.map((flow) => flow.flow).join('; ')} |`);
  lines.push(`| Code coverage % | web: ${report.web_results.coverage ? `${report.web_results.coverage.lines}% lines / ${report.web_results.coverage.branches}% branches` : 'Not measured'} / api: ${report.api_results.coverage ? `${report.api_results.coverage.lines}% lines / ${report.api_results.coverage.branches}% branches` : 'Not measured'} |`);
  lines.push('');

  lines.push('## Executed Suites');
  lines.push('');
  lines.push('| Suite | Tests | Passed | Failed | Skipped | Runtime |');
  lines.push('|---|---:|---:|---:|---:|---:|');
  lines.push(`| api | ${report.api_results.total} | ${report.api_results.passed} | ${report.api_results.failed} | ${report.api_results.skipped} | ${report.api_results.runtime_ms}ms |`);
  lines.push(`| web | ${report.web_results.total} | ${report.web_results.passed} | ${report.web_results.failed} | ${report.web_results.skipped} | ${report.web_results.runtime_ms}ms |`);
  if (report.e2e_results) {
    lines.push(`| e2e | ${report.e2e_results.total} | ${report.e2e_results.passed} | ${report.e2e_results.failed} | ${report.e2e_results.skipped} | ${report.e2e_results.runtime_ms}ms |`);
  }
  lines.push('');

  if (failedTests.length > 0) {
    lines.push('## Failed Tests');
    lines.push('');
    for (const test of failedTests) {
      lines.push(`- \`${test.file}\`: ${test.test || test.name}`);
    }
    lines.push('');
  }

  lines.push('## Flaky Tests');
  lines.push('');
  if (report.flaky_tests.length === 0) {
    lines.push('None detected across repeated runs.');
  } else {
    for (const test of report.flaky_tests) {
      lines.push(`- \`${test.file}\`: ${test.test} (${test.pass_rate})`);
    }
  }
  lines.push('');

  if (report.e2e_results?.flaky_tests?.length) {
    lines.push('## Playwright Retry-Flaky Tests');
    lines.push('');
    for (const test of report.e2e_results.flaky_tests) {
      lines.push(`- \`${test.file}\`: ${test.test} (${test.retries} retr${test.retries === 1 ? 'y' : 'ies'})`);
    }
    lines.push('');
  }

  lines.push('## Code Coverage');
  lines.push('');
  lines.push('| Package | Lines | Branches | Functions | Statements |');
  lines.push('|---|---:|---:|---:|---:|');
  for (const suite of [report.api_results, report.web_results]) {
    if (suite.coverage) {
      lines.push(`| ${suite.package} | ${suite.coverage.lines}% | ${suite.coverage.branches}% | ${suite.coverage.functions}% | ${suite.coverage.statements}% |`);
    } else {
      lines.push(`| ${suite.package} | - | - | - | - |`);
    }
  }
  lines.push('');

  lines.push('## Critical Flow Coverage');
  lines.push('');
  lines.push('| Flow | Depth | Evidence Count | Risk if Untested |');
  lines.push('|---|---|---:|---|');
  for (const flow of report.critical_flows) {
    lines.push(`| ${flow.flow} | ${flow.depth} | ${flow.test_count} | ${flow.risk} |`);
  }
  lines.push('');

  if (zeroCoverageFlows.length > 0) {
    lines.push('### Critical Flows With Zero Coverage');
    lines.push('');
    for (const flow of zeroCoverageFlows) {
      lines.push(`- **${flow.flow}**: ${flow.risk}`);
    }
    lines.push('');
  }

  if (noUnitFlows.length > 0) {
    lines.push('### Critical Flows Missing Unit Coverage');
    lines.push('');
    for (const flow of noUnitFlows) {
      lines.push(`- **${flow.flow}**: ${flow.depth === 'e2e only' ? flow.e2e_tests.join(', ') : 'no evidence'}`);
    }
    lines.push('');
  }

  if (report.quality_issues.length > 0) {
    lines.push('## Test Quality Notes');
    lines.push('');
    for (const issue of report.quality_issues) {
      lines.push(`- \`${issue.file}\`: ${issue.description}`);
    }
    lines.push('');
  }

  lines.push('## Coverage Gaps');
  lines.push('');
  lines.push(`- Routes without any detected test evidence: ${report.coverage_gaps.routes_without_evidence.length}`);
  lines.push(`- Routes without a direct same-name test file: ${report.coverage_gaps.routes_without_direct_test.length}`);
  lines.push(`- Components without a direct same-name test file: ${report.coverage_gaps.components_without_direct_test.length}`);
  lines.push(`- Hooks without a direct same-name test file: ${report.coverage_gaps.hooks_without_direct_test.length}`);
  lines.push('');

  if (report.coverage_gaps.routes_without_evidence.length > 0) {
    lines.push('### Routes Without Any Detected Test Evidence');
    lines.push('');
    for (const file of report.coverage_gaps.routes_without_evidence) {
      lines.push(`- \`${file}\``);
    }
    lines.push('');
  }

  if (report.coverage_gaps.routes_without_direct_test.length > 0) {
    lines.push('### Routes Without Direct Same-Name Test Files');
    lines.push('');
    for (const file of report.coverage_gaps.routes_without_direct_test) {
      lines.push(`- \`${file}\``);
    }
    lines.push('');
  }

  lines.push('## Inventory');
  lines.push('');
  lines.push(`- API unit test files: ${report.test_files.api.length}`);
  lines.push(`- Web unit test files: ${report.test_files.web.length}`);
  lines.push(`- E2E spec files: ${report.test_files.e2e.length}`);
  lines.push('');

  lines.push('## Trend');
  lines.push('');
  if (report.delta_from_previous.status === 'Baseline') {
    lines.push('- Status: **Baseline**');
  } else {
    lines.push(`- Status: **${report.delta_from_previous.status}**`);
    lines.push(`- Test delta: ${report.delta_from_previous.total_test_delta >= 0 ? '+' : ''}${report.delta_from_previous.total_test_delta}`);
    lines.push(`- Failure delta: ${report.delta_from_previous.failed_delta >= 0 ? '+' : ''}${report.delta_from_previous.failed_delta}`);
  }
  lines.push('');

  return lines.join('\n');
}

async function main() {
  ensureDir(OUTPUT_DIR);
  console.log('Test Coverage & Quality Report');
  console.log('==============================\n');

  console.log('Discovering test files...');
  const testFiles = discoverTestFiles();
  const testContents = readTestContents(testFiles);
  console.log(`  API unit tests: ${testFiles.api.length} files`);
  console.log(`  Web unit tests: ${testFiles.web.length} files`);
  console.log(`  E2E spec files: ${testFiles.e2e.length} files`);
  console.log('');

  console.log('Running unit tests with coverage:\n');
  const apiResults = runUnitTests('api');
  console.log(`  API: ${apiResults.passed}/${apiResults.total} passed in ${apiResults.runtime_ms}ms`);
  if (apiResults.coverage) {
    console.log(`  API coverage: ${apiResults.coverage.lines}% lines, ${apiResults.coverage.branches}% branches`);
  }
  console.log('');

  const webResults = runUnitTests('web');
  console.log(`  Web: ${webResults.passed}/${webResults.total} passed in ${webResults.runtime_ms}ms`);
  if (webResults.coverage) {
    console.log(`  Web coverage: ${webResults.coverage.lines}% lines, ${webResults.coverage.branches}% branches`);
  }
  console.log('');

  let e2eResults = null;
  if (INCLUDE_E2E) {
    console.log('Running Playwright E2E suite...\n');
    e2eResults = runPlaywrightSuite({ label: 'e2e-baseline', retries: 0 });
    console.log(`  E2E: ${e2eResults.passed}/${e2eResults.total} passed in ${e2eResults.runtime_ms}ms`);
    console.log(`  E2E flaky-on-retry in baseline run: ${e2eResults.flaky}`);
    console.log('');
  } else {
    console.log('Skipping Playwright E2E suite because TEST_COVERAGE_SKIP_E2E=1.\n');
  }

  console.log('Analyzing critical flow coverage...');
  const criticalFlows = mapCriticalFlows(testContents);
  const zeroCoverageFlows = criticalFlows.filter((flow) => !flow.covered);
  const noUnitFlows = criticalFlows.filter((flow) => !flow.has_unit);
  console.log(`  ${criticalFlows.length - zeroCoverageFlows.length}/${criticalFlows.length} critical flows have some test evidence`);
  console.log(`  ${noUnitFlows.length} critical flow(s) still rely on E2E only or have no evidence`);
  console.log('');

  console.log('Analyzing test quality...');
  const qualityIssues = analyzeTestQuality(testFiles, testContents);
  console.log(`  ${qualityIssues.length} notable quality signal(s) found`);
  console.log('');

  console.log(`Detecting flaky tests (${FLAKE_RUNS} runs each):\n`);
  console.log('  API:');
  const apiFlakyResults = detectVitestFlakyTests('api');
  console.log('  Web:');
  const webFlakyResults = detectVitestFlakyTests('web');

  let e2eFlakyResults = { flaky: [], consistent_failures: [], run_count: 0 };
  if (INCLUDE_E2E) {
    console.log('  E2E:');
    e2eFlakyResults = detectPlaywrightFlakyTests();
  }

  const allFlaky = [
    ...apiFlakyResults.flaky,
    ...webFlakyResults.flaky,
    ...e2eFlakyResults.flaky,
  ];
  const allConsistentFailures = [
    ...apiFlakyResults.consistent_failures,
    ...webFlakyResults.consistent_failures,
    ...e2eFlakyResults.consistent_failures,
  ];
  console.log(`\n  Flaky tests found: ${allFlaky.length}`);
  console.log(`  Consistent failures: ${allConsistentFailures.length}`);
  console.log('');

  console.log('Finding coverage gaps...');
  const coverageGaps = findCoverageGaps(testFiles, testContents);
  console.log(`  Routes without evidence: ${coverageGaps.routes_without_evidence.length}`);
  console.log(`  Routes without direct same-name test files: ${coverageGaps.routes_without_direct_test.length}`);
  console.log(`  Hooks without direct same-name test files: ${coverageGaps.hooks_without_direct_test.length}`);
  console.log('');

  const previous = readJsonSafe(LATEST_JSON_PATH);
  const totalTests = apiResults.total + webResults.total + (e2eResults?.total || 0);
  const totalPassed = apiResults.passed + webResults.passed + (e2eResults?.passed || 0);
  const totalFailed = apiResults.failed + webResults.failed + (e2eResults?.failed || 0);
  const totalSkipped = apiResults.skipped + webResults.skipped + (e2eResults?.skipped || 0);
  const suiteRuntimeMs = apiResults.runtime_ms + webResults.runtime_ms + (e2eResults?.runtime_ms || 0);

  const prevTotalTests = previous?.summary?.total_tests;
  const prevTotalFailed = previous?.summary?.total_failed;

  const report = {
    generated_at: new Date().toISOString(),
    flake_runs: FLAKE_RUNS,
    test_files: testFiles,
    api_results: apiResults,
    web_results: webResults,
    e2e_results: e2eResults,
    critical_flows: criticalFlows,
    quality_issues: qualityIssues,
    coverage_gaps: coverageGaps,
    flaky_tests: allFlaky,
    consistent_failures: allConsistentFailures,
    summary: {
      total_tests: totalTests,
      total_passed: totalPassed,
      total_failed: totalFailed,
      total_skipped: totalSkipped,
      flaky_count: allFlaky.length,
      suite_runtime_ms: suiteRuntimeMs,
      suite_runtime_seconds: Number((suiteRuntimeMs / 1000).toFixed(1)),
      critical_flows_with_zero_coverage: zeroCoverageFlows.map((flow) => flow.flow),
      critical_flows_without_unit_coverage: noUnitFlows.map((flow) => flow.flow),
      api_coverage_lines: apiResults.coverage?.lines ?? null,
      web_coverage_lines: webResults.coverage?.lines ?? null,
    },
    delta_from_previous: {
      status: typeof prevTotalTests === 'number'
        ? (totalTests === prevTotalTests ? 'Stable' : totalTests > prevTotalTests ? 'Improving' : 'Regressing')
        : 'Baseline',
      total_test_delta: typeof prevTotalTests === 'number' ? totalTests - prevTotalTests : null,
      failed_delta: typeof prevTotalFailed === 'number' ? totalFailed - prevTotalFailed : null,
    },
  };

  fs.writeFileSync(LATEST_JSON_PATH, JSON.stringify(report, null, 2) + '\n', 'utf8');
  fs.appendFileSync(HISTORY_PATH, JSON.stringify(report) + '\n', 'utf8');
  fs.writeFileSync(LATEST_MD_PATH, buildMarkdown(report), 'utf8');

  console.log(`Wrote ${relativePath(LATEST_MD_PATH)}`);
  console.log(`Wrote ${relativePath(LATEST_JSON_PATH)}`);
  console.log(`Appended ${relativePath(HISTORY_PATH)}`);

  console.log('\n--- Summary ---');
  console.log(`Total tests: ${totalTests}`);
  console.log(`Pass / Fail / Flaky: ${totalPassed} / ${totalFailed} / ${allFlaky.length}`);
  console.log(`Suite runtime: ${report.summary.suite_runtime_seconds}s`);
  console.log(`Critical flows with zero coverage: ${zeroCoverageFlows.length}`);
  console.log(`Critical flows without unit coverage: ${noUnitFlows.length}`);
  console.log(`API coverage: ${apiResults.coverage ? `${apiResults.coverage.lines}% lines` : 'N/A'}`);
  console.log(`Web coverage: ${webResults.coverage ? `${webResults.coverage.lines}% lines` : 'N/A'}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
