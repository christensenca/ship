#!/usr/bin/env node

/**
 * Accessibility Compliance Report Generator
 *
 * Reads raw audit data from reports/accessibility/raw-audit.json
 * (produced by e2e/accessibility-audit.spec.ts) and generates:
 *   - reports/accessibility/latest.json  (structured metrics)
 *   - reports/accessibility/latest.md    (human-readable report)
 *   - reports/accessibility/history.jsonl (trend tracking)
 *
 * Usage:
 *   node scripts/accessibility-report.mjs
 *   pnpm report:accessibility
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "reports", "accessibility");
const RAW_AUDIT_PATH = path.join(OUTPUT_DIR, "raw-audit.json");
const LATEST_JSON_PATH = path.join(OUTPUT_DIR, "latest.json");
const LATEST_MD_PATH = path.join(OUTPUT_DIR, "latest.md");
const HISTORY_PATH = path.join(OUTPUT_DIR, "history.jsonl");

// ARIA-related axe rule IDs for the "Missing ARIA labels/roles" metric
const ARIA_RULE_IDS = [
  "aria-allowed-attr",
  "aria-allowed-role",
  "aria-command-name",
  "aria-dialog-name",
  "aria-hidden-body",
  "aria-hidden-focus",
  "aria-input-field-name",
  "aria-meter-name",
  "aria-progressbar-name",
  "aria-required-attr",
  "aria-required-children",
  "aria-required-parent",
  "aria-roledescription",
  "aria-roles",
  "aria-toggle-field-name",
  "aria-tooltip-name",
  "aria-valid-attr",
  "aria-valid-attr-value",
  "button-name",
  "image-alt",
  "input-image-alt",
  "label",
  "label-title-only",
  "link-name",
  "role-img-alt",
  "select-name",
  "svg-img-alt",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readJsonSafe(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
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

function relativePath(absolutePath) {
  return path.relative(ROOT, absolutePath).replaceAll(path.sep, "/");
}

function truncateHtml(html, maxLen = 60) {
  if (!html || html.length <= maxLen) return html || "";
  return html.slice(0, maxLen) + "…";
}

function escapeMarkdown(str) {
  return str.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  // 1. Read raw audit data
  const rawAudit = readJsonSafe(RAW_AUDIT_PATH);
  if (!rawAudit || !Array.isArray(rawAudit.pages) || rawAudit.pages.length === 0) {
    console.error(
      "Error: No raw audit data found at reports/accessibility/raw-audit.json\n" +
      "Run the accessibility audit first:\n" +
      "  npx playwright test e2e/accessibility-audit.spec.ts"
    );
    process.exit(1);
  }

  // 2. Read previous report for trend comparison
  const previous = readJsonSafe(LATEST_JSON_PATH);

  const generatedAt = new Date().toISOString();
  const pages = rawAudit.pages;

  // 3. Compute aggregate metrics
  const totals = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  let totalViolations = 0;
  let colorContrastFailures = 0;
  let ariaFailures = 0;
  const violationTypeMap = new Map(); // ruleId -> { count, impact, description }
  const colorContrastDetails = []; // { page, html, target }
  const ariaDetails = []; // { page, rule, html, target }
  const missingAriaLocations = [];

  for (const page of pages) {
    for (const v of page.violations || []) {
      const nodeCount = v.nodes?.length || 0;
      const weightedCount = Math.max(1, nodeCount);

      if (v.impact && v.impact in totals) {
        totals[v.impact] += weightedCount;
        totalViolations += weightedCount;
      }

      // Track violation types
      if (violationTypeMap.has(v.id)) {
        violationTypeMap.get(v.id).count += nodeCount;
      } else {
        violationTypeMap.set(v.id, {
          count: nodeCount,
          impact: v.impact,
          description: v.help || v.description,
        });
      }

      // Color contrast failures
      if (v.id === "color-contrast") {
        colorContrastFailures += nodeCount;
        for (const node of v.nodes || []) {
          colorContrastDetails.push({
            page: page.name,
            html: truncateHtml(node.html),
            target: (node.target || []).join(", "),
          });
        }
      }

      // ARIA / label failures
      if (ARIA_RULE_IDS.includes(v.id)) {
        ariaFailures += nodeCount;
        for (const node of v.nodes || []) {
          const detail = {
            page: page.name,
            rule: v.id,
            html: truncateHtml(node.html),
            target: (node.target || []).join(", "),
          };
          ariaDetails.push(detail);
          missingAriaLocations.push(`${page.name}: ${detail.target || detail.html}`);
        }
      }
    }
  }

  // Lighthouse metrics
  const lighthouseScores = pages
    .filter((p) => p.lighthouse_score !== null && p.lighthouse_score !== undefined)
    .map((p) => ({ name: p.name, url: p.url, score: p.lighthouse_score }));

  const hasLighthouse = lighthouseScores.length > 0;
  const avgLighthouseScore = hasLighthouse
    ? Math.round(lighthouseScores.reduce((s, p) => s + p.score, 0) / lighthouseScores.length)
    : null;
  const lowestLighthouse = hasLighthouse
    ? lighthouseScores.reduce((min, p) => (p.score < min.score ? p : min), lighthouseScores[0])
    : null;

  // Top violation types (sorted by count descending)
  const topViolations = [...violationTypeMap.entries()]
    .map(([id, info]) => ({ id, ...info }))
    .sort((a, b) => b.count - a.count);

  // Trend comparison
  const previousTotal = previous?.totals?.total_violations ?? null;
  const overallDelta = typeof previousTotal === "number" ? totalViolations - previousTotal : null;
  const band = statusBand(totalViolations, previousTotal);

  // Per-severity delta
  const severityDelta = {};
  for (const severity of ["critical", "serious", "moderate", "minor"]) {
    const prev = previous?.totals?.[severity];
    severityDelta[severity] = typeof prev === "number" ? totals[severity] - prev : null;
  }

  // 4. Build report object
  const report = {
    generated_at: generatedAt,
    raw_audit_generated_at: rawAudit.generated_at,
    totals: {
      total_violations: totalViolations,
      ...totals,
      color_contrast_failures: colorContrastFailures,
      aria_failures: ariaFailures,
      pages_audited: pages.length,
    },
    lighthouse: {
      average_score: avgLighthouseScore,
      lowest_score: lowestLighthouse?.score ?? null,
      lowest_page: lowestLighthouse?.name ?? null,
      scores: lighthouseScores,
    },
    per_page: pages.map((p) => ({
      name: p.name,
      url: p.url,
      lighthouse_score: p.lighthouse_score,
      violation_counts: p.violation_counts,
      total: (p.violation_counts?.critical || 0) +
        (p.violation_counts?.serious || 0) +
        (p.violation_counts?.moderate || 0) +
        (p.violation_counts?.minor || 0),
      passes: p.passes,
      incomplete: p.incomplete,
    })),
    top_violations: topViolations.slice(0, 10),
    delta_from_previous: {
      overall: overallDelta,
      by_severity: severityDelta,
      status_band: band,
    },
    deliverable: {
      lighthouse_per_page: lighthouseScores,
      total_critical_serious_violations: totals.critical + totals.serious,
      keyboard_navigation_completeness: "Manual assessment required by user (Full / Partial / Broken)",
      color_contrast_failures: colorContrastFailures,
      missing_aria_labels_or_roles: missingAriaLocations,
      screen_reader_testing: "Manual VoiceOver/NVDA assessment required",
    },
  };

  // 5. Write outputs
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(LATEST_JSON_PATH, JSON.stringify(report, null, 2) + "\n", "utf8");
  fs.appendFileSync(HISTORY_PATH, JSON.stringify(report) + "\n", "utf8");

  // 6. Build markdown
  const deltaStr = overallDelta === null
    ? "N/A (baseline)"
    : overallDelta > 0 ? `+${overallDelta}` : String(overallDelta);

  const lighthouseLowestStr = lowestLighthouse
    ? `${lowestLighthouse.score} (${lowestLighthouse.name})`
    : "N/A";
  const lighthouseAvgStr = avgLighthouseScore !== null ? String(avgLighthouseScore) : "N/A";
  const lighthouseList = hasLighthouse
    ? lighthouseScores.map((p) => `${p.name}: ${p.score}`).join("<br>")
    : "N/A";
  const totalCriticalSerious = totals.critical + totals.serious;
  const missingAriaSummary = missingAriaLocations.length === 1
    ? `1 location across all audited pages: ${escapeMarkdown(missingAriaLocations[0])}`
    : missingAriaLocations.length > 1
      ? `${missingAriaLocations.length} locations across all audited pages: ${missingAriaLocations.map(escapeMarkdown).join("<br>")}`
      : "None found across audited pages";
  const missingAriaBaseline = missingAriaLocations.length > 0
    ? missingAriaLocations.map(escapeMarkdown).join("<br>")
    : "None found";

  let md = `# Accessibility Compliance Report

Generated: ${generatedAt}

## Audit Deliverable

| Metric | Your Baseline |
|---|---|
| Lighthouse accessibility score (per page) | ${lighthouseList} |
| Total Critical/Serious violations | ${totalCriticalSerious} affected elements (${totals.critical} critical, ${totals.serious} serious) |
| Keyboard navigation completeness | Manual assessment required by user: Full / Partial / Broken |
| Color contrast failures | ${colorContrastFailures} |
| Missing ARIA labels or roles | ${missingAriaSummary} |

## Trend

- Status: **${band}**
- Total violations: ${totalViolations} (delta: ${deltaStr})
- Pages audited: ${pages.length}
- Missing ARIA/name/role issues found by automated audit: ${missingAriaLocations.length}
- Screen reader testing: Manual VoiceOver/NVDA assessment required
`;

  // Lighthouse scores by page
  if (hasLighthouse) {
    md += `
## Lighthouse Scores by Page

| Page | URL | Score |
|---|---|---:|
`;
    for (const p of pages) {
      const score = p.lighthouse_score !== null ? String(p.lighthouse_score) : "N/A";
      md += `| ${p.name} | \`${p.url}\` | ${score} |\n`;
    }
  }

  // Per-page violations
  md += `
## Per-Page Violations

| Page | Critical | Serious | Moderate | Minor | Total |
|---|---:|---:|---:|---:|---:|
`;
  for (const p of report.per_page) {
    const c = p.violation_counts || { critical: 0, serious: 0, moderate: 0, minor: 0 };
    md += `| ${p.name} | ${c.critical} | ${c.serious} | ${c.moderate} | ${c.minor} | ${p.total} |\n`;
  }

  // Top violation types
  if (topViolations.length > 0) {
    md += `
## Top Violation Types

| Rule | Impact | Count | Description |
|---|---|---:|---|
`;
    for (const v of topViolations.slice(0, 15)) {
      md += `| ${v.id} | ${v.impact} | ${v.count} | ${escapeMarkdown(v.description)} |\n`;
    }
  }

  // Color contrast failures
  if (colorContrastDetails.length > 0) {
    md += `
## Color Contrast Failures

| Page | Element | Target Selector |
|---|---|---|
`;
    for (const d of colorContrastDetails.slice(0, 30)) {
      md += `| ${d.page} | \`${escapeMarkdown(d.html)}\` | \`${escapeMarkdown(d.target)}\` |\n`;
    }
    if (colorContrastDetails.length > 30) {
      md += `\n_...and ${colorContrastDetails.length - 30} more_\n`;
    }
  }

  // Missing ARIA labels/roles
  if (ariaDetails.length > 0) {
    md += `
## Missing ARIA Labels/Roles

| Page | Rule | Element | Target Selector |
|---|---|---|---|
`;
    for (const d of ariaDetails.slice(0, 30)) {
      md += `| ${d.page} | ${d.rule} | \`${escapeMarkdown(d.html)}\` | \`${escapeMarkdown(d.target)}\` |\n`;
    }
    if (ariaDetails.length > 30) {
      md += `\n_...and ${ariaDetails.length - 30} more_\n`;
    }
  }

  fs.writeFileSync(LATEST_MD_PATH, md, "utf8");

  // 7. Console output
  console.log(`Wrote ${relativePath(LATEST_MD_PATH)}`);
  console.log(`Wrote ${relativePath(LATEST_JSON_PATH)}`);
  console.log(`Appended ${relativePath(HISTORY_PATH)}`);
  console.log(`\nStatus: ${band} | Total violations: ${totalViolations} (${deltaStr})`);
  if (hasLighthouse) {
    console.log(`Lighthouse: avg ${lighthouseAvgStr}, lowest ${lighthouseLowestStr}`);
  }
}

main();
