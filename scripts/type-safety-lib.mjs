import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export const VIOLATION_KEYS = [
  'explicit_any',
  'type_assertion_as',
  'non_null_assertion',
  'ts_comment_directive',
  'untyped_parameter',
  'missing_return_type',
];

export const PACKAGES = [
  { name: 'api', srcDir: 'api/src', tsconfig: 'api/tsconfig.json' },
  { name: 'web', srcDir: 'web/src', tsconfig: 'web/tsconfig.json' },
  { name: 'shared', srcDir: 'shared/src', tsconfig: 'shared/tsconfig.json' },
];

const FILE_EXT_RE = /\.(ts|tsx|mts|cts)$/i;

export function emptyCounts() {
  return {
    explicit_any: 0,
    type_assertion_as: 0,
    non_null_assertion: 0,
    ts_comment_directive: 0,
    untyped_parameter: 0,
    missing_return_type: 0,
  };
}

export function totalCount(counts) {
  return VIOLATION_KEYS.reduce((sum, key) => sum + counts[key], 0);
}

export function sumCounts(target, source) {
  for (const key of VIOLATION_KEYS) {
    target[key] += source[key];
  }
}

export function readJsonFileSafe(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

export function relativePath(root, absolutePath) {
  return path.relative(root, absolutePath).replaceAll(path.sep, '/');
}

export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'snapshot';
}

export function isTestLikeFile(filePath) {
  return (
    /(^|\/)__tests__(\/|$)/.test(filePath) ||
    /\.(test|spec)\.(ts|tsx|mts|cts)$/.test(filePath) ||
    filePath.startsWith('e2e/')
  );
}

function walkFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'dist' || entry.name === 'node_modules') continue;
      files.push(...walkFiles(fullPath));
      continue;
    }
    if (!FILE_EXT_RE.test(entry.name)) continue;
    if (entry.name.endsWith('.d.ts')) continue;
    files.push(fullPath);
  }

  return files;
}

function isFunctionLikeWithBody(node) {
  if (ts.isFunctionDeclaration(node)) return Boolean(node.body);
  if (ts.isFunctionExpression(node)) return Boolean(node.body);
  if (ts.isArrowFunction(node)) return true;
  if (ts.isMethodDeclaration(node)) return Boolean(node.body);
  if (ts.isGetAccessorDeclaration(node)) return Boolean(node.body);
  return false;
}

function shouldCountUntypedParam(param) {
  if (param.type) return false;
  if (ts.isIdentifier(param.name) && param.name.text === 'this') return false;
  return true;
}

function extractViolationCounts(filePath, fileContent) {
  const scriptKind = filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(filePath, fileContent, ts.ScriptTarget.Latest, true, scriptKind);
  const counts = emptyCounts();

  const commentMatches = fileContent.match(/@ts-(ignore|expect-error)\b/g);
  counts.ts_comment_directive = commentMatches ? commentMatches.length : 0;

  function visit(node) {
    if (ts.isAsExpression(node)) counts.type_assertion_as += 1;
    if (ts.isNonNullExpression(node)) counts.non_null_assertion += 1;
    if (node.kind === ts.SyntaxKind.AnyKeyword) counts.explicit_any += 1;

    if (ts.isFunctionLike(node)) {
      for (const param of node.parameters) {
        if (shouldCountUntypedParam(param)) counts.untyped_parameter += 1;
      }
      if (isFunctionLikeWithBody(node) && !node.type) {
        counts.missing_return_type += 1;
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return counts;
}

function resolveExtendedTsconfig(baseConfigPath, extendsValue) {
  if (extendsValue.startsWith('.')) {
    const rawPath = path.resolve(path.dirname(baseConfigPath), extendsValue);
    if (rawPath.endsWith('.json')) return rawPath;
    return `${rawPath}.json`;
  }
  return null;
}

function resolveEffectiveStrict(tsconfigPath, seen = new Set()) {
  const normalized = path.resolve(tsconfigPath);
  if (seen.has(normalized)) return false;
  seen.add(normalized);

  const readResult = ts.readConfigFile(normalized, ts.sys.readFile);
  if (readResult.error || !readResult.config) return false;
  const config = readResult.config;

  if (
    config.compilerOptions &&
    Object.prototype.hasOwnProperty.call(config.compilerOptions, 'strict')
  ) {
    return Boolean(config.compilerOptions.strict);
  }

  if (typeof config.extends === 'string') {
    const extended = resolveExtendedTsconfig(normalized, config.extends);
    if (extended && fs.existsSync(extended)) {
      return resolveEffectiveStrict(extended, seen);
    }
  }

  return false;
}

function countStrictErrorsForProject(tsconfigPath) {
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (configFile.error || !configFile.config) return 0;

  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(tsconfigPath),
    { strict: true, noEmit: true },
    tsconfigPath,
  );

  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
    projectReferences: parsed.projectReferences,
  });

  return ts.getPreEmitDiagnostics(program).length;
}

function statusBand(currentTotal, previousTotal) {
  if (typeof previousTotal !== 'number') return 'Baseline';
  if (previousTotal === 0) return currentTotal === 0 ? 'Stable' : 'Regressing';
  const tolerance = Math.max(1, Math.round(previousTotal * 0.01));
  const delta = currentTotal - previousTotal;
  if (delta < -tolerance) return 'Improving';
  if (delta > tolerance) return 'Regressing';
  return 'Stable';
}

function topReasons(counts) {
  const pairs = VIOLATION_KEYS.map((key) => [key, counts[key]]).filter(([, value]) => value > 0);
  pairs.sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  return pairs
    .slice(0, 2)
    .map(([key, value]) => `${key} (${value})`)
    .join(', ');
}

export function collectTypeSafetyMetrics(root, previousLatestPath = path.join(root, 'reports', 'type-safety', 'latest.json')) {
  const generatedAt = new Date().toISOString();
  const packageBreakdown = {};
  const fileBreakdown = [];
  const overallCounts = emptyCounts();
  const productionCounts = emptyCounts();
  const testCounts = emptyCounts();

  for (const pkg of PACKAGES) {
    const packageCounts = emptyCounts();
    const files = walkFiles(path.join(root, pkg.srcDir));

    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf8');
      const counts = extractViolationCounts(filePath, content);
      const file = relativePath(root, filePath);
      const isTest = isTestLikeFile(file);
      const total = totalCount(counts);

      if (total > 0) {
        fileBreakdown.push({
          file,
          package: pkg.name,
          is_test_like: isTest,
          total,
          counts,
        });
      }

      sumCounts(packageCounts, counts);
      sumCounts(overallCounts, counts);
      sumCounts(isTest ? testCounts : productionCounts, counts);
    }

    packageBreakdown[pkg.name] = packageCounts;
  }

  const strictModeByConfig = {
    root: {
      path: 'tsconfig.json',
      strict: resolveEffectiveStrict(path.join(root, 'tsconfig.json')),
    },
    api: {
      path: 'api/tsconfig.json',
      strict: resolveEffectiveStrict(path.join(root, 'api', 'tsconfig.json')),
    },
    web: {
      path: 'web/tsconfig.json',
      strict: resolveEffectiveStrict(path.join(root, 'web', 'tsconfig.json')),
    },
    shared: {
      path: 'shared/tsconfig.json',
      strict: resolveEffectiveStrict(path.join(root, 'shared', 'tsconfig.json')),
    },
  };

  const strictModeEnabled = Object.values(strictModeByConfig).every((entry) => entry.strict);
  const topFileCandidates = strictModeEnabled
    ? fileBreakdown.filter((fileStat) => !fileStat.is_test_like)
    : fileBreakdown;

  topFileCandidates.sort((a, b) => b.total - a.total || a.file.localeCompare(b.file));
  const topFiles = topFileCandidates.slice(0, 5).map((fileStat) => ({
    file: fileStat.file,
    package: fileStat.package,
    total: fileStat.total,
    counts: fileStat.counts,
    explanation:
      fileStat.total === 0
        ? 'No violations.'
        : `Dominant violation types: ${topReasons(fileStat.counts)}.`,
  }));

  let strictModeErrorCount = null;
  if (!strictModeEnabled) {
    strictModeErrorCount = PACKAGES.reduce(
      (sum, pkg) => sum + countStrictErrorsForProject(path.join(root, pkg.tsconfig)),
      0,
    );
  }

  const previousLatest = readJsonFileSafe(previousLatestPath);
  const totalViolations = totalCount(overallCounts);
  const previousTotal = previousLatest?.totals?.overall ?? null;
  const overallDelta = typeof previousTotal === 'number' ? totalViolations - previousTotal : null;
  const perTypeDelta = {};

  for (const key of VIOLATION_KEYS) {
    const previousValue = previousLatest?.totals?.by_violation_type?.[key];
    perTypeDelta[key] = typeof previousValue === 'number' ? overallCounts[key] - previousValue : null;
  }

  return {
    schema_version: 2,
    generated_at: generatedAt,
    strict_mode: {
      enabled: strictModeEnabled,
      by_config: strictModeByConfig,
      strict_error_count_if_disabled: strictModeErrorCount,
      strict_error_count_total_if_disabled: strictModeErrorCount,
    },
    totals: {
      overall: totalViolations,
      production_only: totalCount(productionCounts),
      tests_only: totalCount(testCounts),
      by_violation_type: overallCounts,
      by_scope: {
        production_only: productionCounts,
        tests_only: testCounts,
      },
    },
    package_breakdown: packageBreakdown,
    file_breakdown: fileBreakdown.sort((a, b) => b.total - a.total || a.file.localeCompare(b.file)),
    top_violation_dense_files: topFiles,
    delta_from_previous: {
      overall: overallDelta,
      by_violation_type: perTypeDelta,
      status_band: statusBand(totalViolations, previousTotal),
    },
    matching_rules: {
      explicit_any: 'AST nodes where type annotation uses AnyKeyword.',
      type_assertion_as: 'AST AsExpression nodes.',
      non_null_assertion: 'AST NonNullExpression nodes.',
      ts_comment_directive: 'Text matches for @ts-ignore and @ts-expect-error.',
      untyped_parameter: 'Function-like parameters with no explicit type annotation.',
      missing_return_type: 'Function-like implementations with body and no explicit return type annotation.',
    },
  };
}

export function writeTypeSafetyOutputs(root, report, {
  outputDir = path.join(root, 'reports', 'type-safety'),
  appendHistory = true,
} = {}) {
  const latestJsonPath = path.join(outputDir, 'latest.json');
  const latestMdPath = path.join(outputDir, 'latest.md');
  const historyPath = path.join(outputDir, 'history.jsonl');

  ensureDir(outputDir);
  fs.writeFileSync(latestJsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  if (appendHistory) {
    fs.appendFileSync(historyPath, `${JSON.stringify(report)}\n`, 'utf8');
  }

  const topFilesMarkdown =
    report.top_violation_dense_files.length === 0
      ? '- None'
      : report.top_violation_dense_files
          .map(
            (entry, idx) =>
              `${idx + 1}. \`${entry.file}\` (${entry.total}) - ${entry.explanation}`
          )
          .join('\n');

  const markdown = `# Type Safety Audit Report

Generated: ${report.generated_at}

## Summary

| Metric | Baseline |
|---|---|
| Total violations | ${report.totals.overall} |
| Production-only violations | ${report.totals.production_only} |
| Test-only violations | ${report.totals.tests_only} |
| Total any types | ${report.totals.by_violation_type.explicit_any} |
| Total type assertions (as) | ${report.totals.by_violation_type.type_assertion_as} |
| Total non-null assertions (!) | ${report.totals.by_violation_type.non_null_assertion} |
| Total @ts-ignore / @ts-expect-error | ${report.totals.by_violation_type.ts_comment_directive} |
| Strict mode enabled? | ${report.strict_mode.enabled ? 'Yes' : 'No'} |
| Strict mode error count (if disabled) | ${report.strict_mode.strict_error_count_if_disabled ?? 'N/A'} |
| Top 5 violation-dense files | See section below |

## Trend Status

- Status: **${report.delta_from_previous.status_band}**
- Total violations: ${report.totals.overall}
- Delta from previous: ${report.delta_from_previous.overall === null ? 'N/A (baseline)' : report.delta_from_previous.overall}

## Package Breakdown

| Package | explicit_any | type_assertion_as | non_null_assertion | ts_comment_directive | untyped_parameter | missing_return_type | total |
|---|---:|---:|---:|---:|---:|---:|---:|
${PACKAGES.map((pkg) => {
  const c = report.package_breakdown[pkg.name];
  return `| ${pkg.name} | ${c.explicit_any} | ${c.type_assertion_as} | ${c.non_null_assertion} | ${c.ts_comment_directive} | ${c.untyped_parameter} | ${c.missing_return_type} | ${totalCount(c)} |`;
}).join('\n')}

## Top 5 Violation-Dense Files

${topFilesMarkdown}
`;

  fs.writeFileSync(latestMdPath, markdown, 'utf8');

  return {
    latest_json_path: latestJsonPath,
    latest_md_path: latestMdPath,
    history_path: historyPath,
  };
}
