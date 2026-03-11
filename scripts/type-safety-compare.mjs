#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { ensureDir, readJsonFileSafe, relativePath, slugify } from './type-safety-lib.mjs';

const ROOT = process.cwd();
const SNAPSHOTS_DIR = path.join(ROOT, 'reports', 'type-safety', 'snapshots');
const COMPARISONS_DIR = path.join(ROOT, 'reports', 'type-safety', 'comparisons');

function parseArgs(argv) {
  const result = {
    baseline: null,
    current: null,
    top: 20,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--baseline' && argv[i + 1]) {
      result.baseline = argv[i + 1];
      i += 1;
    } else if (arg === '--current' && argv[i + 1]) {
      result.current = argv[i + 1];
      i += 1;
    } else if (arg === '--top' && argv[i + 1]) {
      result.top = Number.parseInt(argv[i + 1], 10) || 20;
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

function resolveSnapshot(reference, fallback = 'latest') {
  const files = listSnapshotFiles();
  if (files.length === 0) {
    throw new Error('No snapshots found in reports/type-safety/snapshots');
  }

  if (!reference || reference === 'latest') {
    return readJsonFileSafe(files[files.length - 1]);
  }

  if (fs.existsSync(reference)) {
    return readJsonFileSafe(reference);
  }

  const byLabel = files
    .map((file) => readJsonFileSafe(file))
    .filter(Boolean)
    .filter((snapshot) => snapshot.label === reference)
    .sort((a, b) => a.generated_at.localeCompare(b.generated_at));

  if (byLabel.length > 0) {
    return byLabel[byLabel.length - 1];
  }

  const byFileName = files.find((file) => path.basename(file) === reference);
  if (byFileName) {
    return readJsonFileSafe(byFileName);
  }

  if (fallback === 'latest') {
    return readJsonFileSafe(files[files.length - 1]);
  }

  throw new Error(`Unable to resolve snapshot: ${reference}`);
}

function compareScalars(label, baseline, current) {
  return { label, baseline, current, delta: current - baseline };
}

function buildFileMap(snapshot) {
  const map = new Map();
  for (const file of snapshot.type_safety.file_breakdown || []) {
    map.set(file.file, file);
  }
  return map;
}

function compareFiles(baselineSnapshot, currentSnapshot, topCount) {
  const baselineMap = buildFileMap(baselineSnapshot);
  const currentMap = buildFileMap(currentSnapshot);
  const allFiles = new Set([...baselineMap.keys(), ...currentMap.keys()]);
  const comparisons = [];

  for (const file of allFiles) {
    const baselineEntry = baselineMap.get(file);
    const currentEntry = currentMap.get(file);
    const isTestLike = baselineEntry?.is_test_like ?? currentEntry?.is_test_like ?? false;
    comparisons.push({
      file,
      package: baselineEntry?.package ?? currentEntry?.package ?? 'unknown',
      is_test_like: isTestLike,
      baseline_total: baselineEntry?.total ?? 0,
      current_total: currentEntry?.total ?? 0,
      delta: (currentEntry?.total ?? 0) - (baselineEntry?.total ?? 0),
      baseline_counts: baselineEntry?.counts ?? null,
      current_counts: currentEntry?.counts ?? null,
    });
  }

  const productionOnly = comparisons.filter((entry) => !entry.is_test_like);
  const byBaseline = [...productionOnly].sort((a, b) =>
    b.baseline_total - a.baseline_total || a.file.localeCompare(b.file)
  );
  const byDeltaMagnitude = [...productionOnly].sort((a, b) =>
    Math.abs(b.delta) - Math.abs(a.delta) || b.baseline_total - a.baseline_total || a.file.localeCompare(b.file)
  );

  return {
    all_production_files: productionOnly,
    top_by_baseline_total: byBaseline.slice(0, topCount),
    top_by_delta_magnitude: byDeltaMagnitude.slice(0, topCount),
  };
}

function compareFailureLists(baselineItems, currentItems) {
  const baselineSet = new Set((baselineItems || []).map((item) => item.fingerprint));
  const currentSet = new Set((currentItems || []).map((item) => item.fingerprint));
  const baselineMap = new Map((baselineItems || []).map((item) => [item.fingerprint, item]));
  const currentMap = new Map((currentItems || []).map((item) => [item.fingerprint, item]));

  const newFailures = [...currentSet].filter((key) => !baselineSet.has(key)).map((key) => currentMap.get(key));
  const resolvedFailures = [...baselineSet].filter((key) => !currentSet.has(key)).map((key) => baselineMap.get(key));
  const persistentFailures = [...currentSet].filter((key) => baselineSet.has(key)).map((key) => currentMap.get(key));

  newFailures.sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));
  resolvedFailures.sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));
  persistentFailures.sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));

  return {
    new_failures: newFailures,
    resolved_failures: resolvedFailures,
    persistent_failures: persistentFailures,
  };
}

function compareTests(baselineSnapshot, currentSnapshot) {
  const packages = ['web', 'api'];
  const result = {};

  for (const pkg of packages) {
    const baseline = baselineSnapshot.tests?.[pkg] ?? {};
    const current = currentSnapshot.tests?.[pkg] ?? {};

    result[pkg] = {
      baseline_status: baseline.status ?? 'unknown',
      current_status: current.status ?? 'unknown',
      counts: {
        total: compareScalars('total', baseline.total ?? 0, current.total ?? 0),
        passed: compareScalars('passed', baseline.passed ?? 0, current.passed ?? 0),
        failed: compareScalars('failed', baseline.failed ?? 0, current.failed ?? 0),
        skipped: compareScalars('skipped', baseline.skipped ?? 0, current.skipped ?? 0),
      },
      failed_tests: compareFailureLists(baseline.failed_tests, current.failed_tests),
      failed_suites: compareFailureLists(baseline.failed_suites, current.failed_suites),
    };
  }

  return result;
}

function buildComparison(baselineSnapshot, currentSnapshot, topCount) {
  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    baseline: {
      snapshot_id: baselineSnapshot.snapshot_id,
      label: baselineSnapshot.label,
      generated_at: baselineSnapshot.generated_at,
    },
    current: {
      snapshot_id: currentSnapshot.snapshot_id,
      label: currentSnapshot.label,
      generated_at: currentSnapshot.generated_at,
    },
    charts: {
      totals: [
        compareScalars('overall', baselineSnapshot.type_safety.totals.overall, currentSnapshot.type_safety.totals.overall),
        compareScalars('production_only', baselineSnapshot.type_safety.totals.production_only, currentSnapshot.type_safety.totals.production_only),
        compareScalars('tests_only', baselineSnapshot.type_safety.totals.tests_only, currentSnapshot.type_safety.totals.tests_only),
      ],
      by_violation_type: Object.entries(baselineSnapshot.type_safety.totals.by_violation_type).map(([key, baselineValue]) =>
        compareScalars(key, baselineValue, currentSnapshot.type_safety.totals.by_violation_type[key] ?? 0)
      ),
      by_file: compareFiles(baselineSnapshot, currentSnapshot, topCount),
    },
    tests: compareTests(baselineSnapshot, currentSnapshot),
  };
}

function main() {
  const { baseline, current, top } = parseArgs(process.argv.slice(2));
  const baselineSnapshot = resolveSnapshot(baseline, null);
  const currentSnapshot = resolveSnapshot(current, 'latest');

  if (!baselineSnapshot) {
    throw new Error('Unable to resolve baseline snapshot');
  }
  if (!currentSnapshot) {
    throw new Error('Unable to resolve current snapshot');
  }

  const comparison = buildComparison(baselineSnapshot, currentSnapshot, top);
  ensureDir(COMPARISONS_DIR);
  const outputPath = path.join(
    COMPARISONS_DIR,
    `${slugify(baselineSnapshot.label)}__${slugify(currentSnapshot.label)}.json`,
  );
  fs.writeFileSync(outputPath, `${JSON.stringify(comparison, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${relativePath(ROOT, outputPath)}`);
}

main();
