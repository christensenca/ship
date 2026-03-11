#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  collectTypeSafetyMetrics,
  ensureDir,
  readJsonFileSafe,
  relativePath,
  slugify,
  writeTypeSafetyOutputs,
} from './type-safety-lib.mjs';

const ROOT = process.cwd();

function parseArgs(argv) {
  const result = {
    label: 'snapshot',
    outputRoot: ROOT,
    updateLatest: true,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--label' && argv[i + 1]) {
      result.label = argv[i + 1];
      i += 1;
    } else if (arg === '--output-root' && argv[i + 1]) {
      result.outputRoot = path.resolve(argv[i + 1]);
      i += 1;
    } else if (arg === '--no-update-latest') {
      result.updateLatest = false;
    }
  }
  return result;
}

function stripAnsi(value) {
  return value.replace(/[\x1b\x9b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

function summarizeText(value, maxLength = 4000) {
  const normalized = stripAnsi(String(value || '')).trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}\n...[truncated]`;
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

function getGitMetadata(root) {
  function git(args) {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  }

  let head = null;
  let branch = null;
  let dirty = true;
  let status = '';

  try { head = git(['rev-parse', 'HEAD']); } catch {}
  try { branch = git(['branch', '--show-current']) || null; } catch {}
  try {
    status = git(['status', '--short']);
    dirty = status.length > 0;
  } catch {}

  return {
    head,
    branch,
    dirty,
    status_short: status,
  };
}

function collectFailedSuites(parsed, root) {
  const failedSuites = [];
  for (const suite of parsed?.testResults || []) {
    const file = relativePath(root, suite.name || '');
    const assertionResults = suite.assertionResults || [];
    const hasFailedAssertions = assertionResults.some((test) => test.status === 'failed');
    if (suite.message || (suite.status === 'failed' && !hasFailedAssertions)) {
      failedSuites.push({
        file,
        fingerprint: `${file}::suite`,
        message: summarizeText(suite.message || suite.failureMessage || ''),
      });
    }
  }
  return failedSuites;
}

function runVitestPackage(packageName) {
  const packageDir = path.join(ROOT, packageName);
  const outputDir = path.join(ROOT, 'reports', 'type-safety');
  const outputFile = path.join(outputDir, `${packageName}-vitest.json`);
  const startedAt = Date.now();

  fs.rmSync(outputFile, { force: true });

  const result = spawnSync(
    'pnpm',
    ['exec', 'vitest', 'run', '--reporter=json', '--outputFile', outputFile],
    {
      cwd: packageDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      timeout: 300_000,
      maxBuffer: 50 * 1024 * 1024,
    },
  );

  const rawOutput = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
  const parsed = readJsonFileSafe(outputFile) || extractJsonObject(rawOutput);
  const failedTests = [];
  const tests = [];

  if (parsed?.testResults) {
    for (const suite of parsed.testResults) {
      const file = relativePath(ROOT, suite.name || '');
      for (const test of suite.assertionResults || []) {
        const fingerprint = `${packageName}::${file}::${test.fullName || test.title}`;
        const normalized = {
          file,
          test: test.fullName || test.title,
          fingerprint,
          status: test.status,
        };
        tests.push(normalized);
        if (test.status === 'failed') failedTests.push(normalized);
      }
    }
  }

  const failedSuites = collectFailedSuites(parsed, ROOT).map((suite) => ({
    ...suite,
    fingerprint: `${packageName}::${suite.file}::suite`,
  }));

  return {
    package: packageName,
    command: `pnpm exec vitest run --reporter=json --outputFile ${relativePath(ROOT, outputFile)}`,
    status: result.status === 0 ? 'passed' : (parsed ? 'failed' : 'errored'),
    exit_code: result.status,
    runtime_ms: Date.now() - startedAt,
    total: parsed?.numTotalTests || 0,
    passed: parsed?.numPassedTests || 0,
    failed: parsed?.numFailedTests || 0,
    skipped: (parsed?.numPendingTests || 0) + (parsed?.numTodoTests || 0),
    test_files: parsed?.testResults?.length || parsed?.numTotalTestSuites || 0,
    failed_tests: failedTests,
    failed_suites: failedSuites,
    tests,
    stderr_summary: summarizeText(result.stderr),
    stdout_summary: summarizeText(result.stdout),
    raw_output_summary: summarizeText(rawOutput),
  };
}

function buildSnapshot(label, outputRoot, updateLatest) {
  const typeSafety = collectTypeSafetyMetrics(ROOT);
  if (updateLatest) {
    writeTypeSafetyOutputs(outputRoot, typeSafety, { appendHistory: true });
  }

  return {
    schema_version: 1,
    snapshot_id: `${new Date().toISOString().replace(/[:.]/g, '-')}-${slugify(label)}`,
    label,
    generated_at: new Date().toISOString(),
    git: getGitMetadata(ROOT),
    type_safety: typeSafety,
    tests: {
      web: runVitestPackage('web'),
      api: runVitestPackage('api'),
    },
  };
}

function main() {
  const { label, outputRoot, updateLatest } = parseArgs(process.argv.slice(2));
  const snapshot = buildSnapshot(label, outputRoot, updateLatest);
  const outputDir = path.join(outputRoot, 'reports', 'type-safety');
  const snapshotsDir = path.join(outputDir, 'snapshots');
  ensureDir(snapshotsDir);

  const filename = `${snapshot.generated_at.replace(/[:.]/g, '-') }--${slugify(label)}.json`;
  const outputPath = path.join(snapshotsDir, filename);
  fs.writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

  console.log(`Wrote ${relativePath(outputRoot, outputPath)}`);
  console.log(`Captured web tests: ${snapshot.tests.web.failed} failed, ${snapshot.tests.web.passed} passed`);
  console.log(`Captured api tests: ${snapshot.tests.api.failed} failed, ${snapshot.tests.api.passed} passed`);
}

main();
