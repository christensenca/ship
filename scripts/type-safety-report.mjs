#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "reports", "type-safety");
const LATEST_JSON_PATH = path.join(OUTPUT_DIR, "latest.json");
const LATEST_MD_PATH = path.join(OUTPUT_DIR, "latest.md");
const HISTORY_PATH = path.join(OUTPUT_DIR, "history.jsonl");

const PACKAGES = [
  { name: "api", srcDir: path.join(ROOT, "api", "src"), tsconfig: path.join(ROOT, "api", "tsconfig.json") },
  { name: "web", srcDir: path.join(ROOT, "web", "src"), tsconfig: path.join(ROOT, "web", "tsconfig.json") },
  { name: "shared", srcDir: path.join(ROOT, "shared", "src"), tsconfig: path.join(ROOT, "shared", "tsconfig.json") },
];

const ROOT_TSCONFIG = path.join(ROOT, "tsconfig.json");
const FILE_EXT_RE = /\.(ts|tsx|mts|cts)$/i;

const VIOLATION_KEYS = [
  "explicit_any",
  "type_assertion_as",
  "non_null_assertion",
  "ts_comment_directive",
  "untyped_parameter",
  "missing_return_type",
];

function emptyCounts() {
  return {
    explicit_any: 0,
    type_assertion_as: 0,
    non_null_assertion: 0,
    ts_comment_directive: 0,
    untyped_parameter: 0,
    missing_return_type: 0,
  };
}

function walkFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "dist" || entry.name === "node_modules") continue;
      files.push(...walkFiles(fullPath));
      continue;
    }
    if (!FILE_EXT_RE.test(entry.name)) continue;
    if (entry.name.endsWith(".d.ts")) continue;
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
  if (ts.isIdentifier(param.name) && param.name.text === "this") return false;
  return true;
}

function extractViolationCounts(filePath, fileContent) {
  const scriptKind = filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
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

function sumCounts(target, source) {
  for (const key of VIOLATION_KEYS) {
    target[key] += source[key];
  }
}

function totalCount(counts) {
  return VIOLATION_KEYS.reduce((sum, key) => sum + counts[key], 0);
}

function relativePath(absolutePath) {
  return path.relative(ROOT, absolutePath).replaceAll(path.sep, "/");
}

function readJsonFileSafe(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function resolveExtendedTsconfig(baseConfigPath, extendsValue) {
  if (extendsValue.startsWith(".")) {
    const rawPath = path.resolve(path.dirname(baseConfigPath), extendsValue);
    if (rawPath.endsWith(".json")) return rawPath;
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
    Object.prototype.hasOwnProperty.call(config.compilerOptions, "strict")
  ) {
    return Boolean(config.compilerOptions.strict);
  }

  if (typeof config.extends === "string") {
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
    tsconfigPath
  );

  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
    projectReferences: parsed.projectReferences,
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  return diagnostics.length;
}

function statusBand(currentTotal, previousTotal) {
  if (typeof previousTotal !== "number") return "Baseline";
  if (previousTotal === 0) return currentTotal === 0 ? "Stable" : "Regressing";
  const tolerance = Math.max(1, Math.round(previousTotal * 0.01));
  const delta = currentTotal - previousTotal;
  if (delta < -tolerance) return "Improving";
  if (delta > tolerance) return "Regressing";
  return "Stable";
}

function topReasons(counts) {
  const pairs = VIOLATION_KEYS.map((key) => [key, counts[key]]).filter(([, value]) => value > 0);
  pairs.sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  return pairs
    .slice(0, 2)
    .map(([key, value]) => `${key} (${value})`)
    .join(", ");
}

function isTestLikeFile(filePath) {
  return (
    /(^|\/)__tests__(\/|$)/.test(filePath) ||
    /\.(test|spec)\.(ts|tsx|mts|cts)$/.test(filePath) ||
    filePath.startsWith("e2e/")
  );
}

function main() {
  const generatedAt = new Date().toISOString();
  const packageBreakdown = {};
  const allFileStats = [];
  const overallCounts = emptyCounts();

  for (const pkg of PACKAGES) {
    const packageCounts = emptyCounts();
    const files = walkFiles(pkg.srcDir);
    for (const filePath of files) {
      const content = fs.readFileSync(filePath, "utf8");
      const counts = extractViolationCounts(filePath, content);
      const fileTotal = totalCount(counts);
      if (fileTotal > 0) {
        allFileStats.push({
          file: relativePath(filePath),
          package: pkg.name,
          total: fileTotal,
          counts,
        });
      }
      sumCounts(packageCounts, counts);
      sumCounts(overallCounts, counts);
    }
    packageBreakdown[pkg.name] = packageCounts;
  }

  const strictModeByConfig = {
    root: {
      path: relativePath(ROOT_TSCONFIG),
      strict: resolveEffectiveStrict(ROOT_TSCONFIG),
    },
    api: {
      path: relativePath(path.join(ROOT, "api", "tsconfig.json")),
      strict: resolveEffectiveStrict(path.join(ROOT, "api", "tsconfig.json")),
    },
    web: {
      path: relativePath(path.join(ROOT, "web", "tsconfig.json")),
      strict: resolveEffectiveStrict(path.join(ROOT, "web", "tsconfig.json")),
    },
    shared: {
      path: relativePath(path.join(ROOT, "shared", "tsconfig.json")),
      strict: resolveEffectiveStrict(path.join(ROOT, "shared", "tsconfig.json")),
    },
  };
  const strictModeEnabled = Object.values(strictModeByConfig).every((entry) => entry.strict);

  const topFileCandidates = strictModeEnabled
    ? allFileStats.filter((fileStat) => !isTestLikeFile(fileStat.file))
    : allFileStats;

  topFileCandidates.sort((a, b) => b.total - a.total || a.file.localeCompare(b.file));
  const topFiles = topFileCandidates.slice(0, 5).map((fileStat) => ({
    file: fileStat.file,
    package: fileStat.package,
    total: fileStat.total,
    counts: fileStat.counts,
    explanation:
      fileStat.total === 0
        ? "No violations."
        : `Dominant violation types: ${topReasons(fileStat.counts)}.`,
  }));

  let strictModeErrorCount = null;
  if (!strictModeEnabled) {
    strictModeErrorCount = PACKAGES.reduce(
      (sum, pkg) => sum + countStrictErrorsForProject(pkg.tsconfig),
      0
    );
  }

  const previousLatest = readJsonFileSafe(LATEST_JSON_PATH);
  const totalViolations = totalCount(overallCounts);
  const previousTotal = previousLatest?.totals?.overall ?? null;
  const overallDelta = typeof previousTotal === "number" ? totalViolations - previousTotal : null;
  const perTypeDelta = {};
  for (const key of VIOLATION_KEYS) {
    const previousValue = previousLatest?.totals?.by_violation_type?.[key];
    perTypeDelta[key] = typeof previousValue === "number" ? overallCounts[key] - previousValue : null;
  }

  const report = {
    generated_at: generatedAt,
    strict_mode: {
      enabled: strictModeEnabled,
      by_config: strictModeByConfig,
      strict_error_count_if_disabled: strictModeErrorCount,
      strict_error_count_total_if_disabled: strictModeErrorCount,
    },
    totals: {
      overall: totalViolations,
      by_violation_type: overallCounts,
    },
    package_breakdown: packageBreakdown,
    top_violation_dense_files: topFiles,
    delta_from_previous: {
      overall: overallDelta,
      by_violation_type: perTypeDelta,
      status_band: statusBand(totalViolations, previousTotal),
    },
    matching_rules: {
      explicit_any: "AST nodes where type annotation uses AnyKeyword.",
      type_assertion_as: "AST AsExpression nodes.",
      non_null_assertion: "AST NonNullExpression nodes.",
      ts_comment_directive: "Text matches for @ts-ignore and @ts-expect-error.",
      untyped_parameter: "Function-like parameters with no explicit type annotation.",
      missing_return_type: "Function-like implementations with body and no explicit return type annotation.",
    },
  };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(LATEST_JSON_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.appendFileSync(HISTORY_PATH, `${JSON.stringify(report)}\n`, "utf8");

  const topFilesMarkdown =
    topFiles.length === 0
      ? "- None"
      : topFiles
          .map(
            (entry, idx) =>
              `${idx + 1}. \`${entry.file}\` (${entry.total}) - ${entry.explanation}`
          )
          .join("\n");

  const markdown = `# Type Safety Audit Report

Generated: ${generatedAt}

## Summary

| Metric | Baseline |
|---|---|
| Total any types | ${overallCounts.explicit_any} |
| Total type assertions (as) | ${overallCounts.type_assertion_as} |
| Total non-null assertions (!) | ${overallCounts.non_null_assertion} |
| Total @ts-ignore / @ts-expect-error | ${overallCounts.ts_comment_directive} |
| Strict mode enabled? | ${strictModeEnabled ? "Yes" : "No"} |
| Strict mode error count (if disabled) | ${strictModeErrorCount ?? "N/A"} |
| Top 5 violation-dense files | See section below |

## Trend Status

- Status: **${report.delta_from_previous.status_band}**
- Total violations: ${totalViolations}
- Delta from previous: ${overallDelta === null ? "N/A (baseline)" : overallDelta}

## Package Breakdown

| Package | explicit_any | type_assertion_as | non_null_assertion | ts_comment_directive | untyped_parameter | missing_return_type | total |
|---|---:|---:|---:|---:|---:|---:|---:|
${PACKAGES.map((pkg) => {
  const c = packageBreakdown[pkg.name];
  return `| ${pkg.name} | ${c.explicit_any} | ${c.type_assertion_as} | ${c.non_null_assertion} | ${c.ts_comment_directive} | ${c.untyped_parameter} | ${c.missing_return_type} | ${totalCount(c)} |`;
}).join("\n")}

## Top 5 Violation-Dense Files

${topFilesMarkdown}
`;

  fs.writeFileSync(LATEST_MD_PATH, markdown, "utf8");

  console.log(`Wrote ${relativePath(LATEST_MD_PATH)}`);
  console.log(`Wrote ${relativePath(LATEST_JSON_PATH)}`);
  console.log(`Appended ${relativePath(HISTORY_PATH)}`);
}

main();
