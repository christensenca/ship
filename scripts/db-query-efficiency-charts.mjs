#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {
  ensureDir,
  escapeXml,
  formatNumber,
  formatPercent,
  readJsonFileSafe,
  renderLegend,
  slugify,
  writeSvgChart,
} from './api-latency-lib.mjs';

const ROOT = process.cwd();
const COMPARISONS_DIR = path.join(ROOT, 'reports', 'db-query-efficiency', 'comparisons');
const CHARTS_DIR = path.join(ROOT, 'reports', 'db-query-efficiency', 'charts');
const COLORS = {
  baseline: '#9ca3af',
  current: '#2563eb',
  grid: '#e5e7eb',
  axis: '#6b7280',
  text: '#111827',
  deltaPositive: '#b91c1c',
  deltaNegative: '#047857',
};

function parseArgs(argv) {
  const result = { comparison: 'latest' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--comparison' && argv[i + 1]) {
      result.comparison = argv[i + 1];
      i += 1;
    }
  }
  return result;
}

function listComparisonFiles() {
  if (!fs.existsSync(COMPARISONS_DIR)) return [];
  return fs.readdirSync(COMPARISONS_DIR)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => path.join(COMPARISONS_DIR, file));
}

function resolveComparison(reference) {
  const files = listComparisonFiles();
  if (files.length === 0) {
    throw new Error('No comparison files found in reports/db-query-efficiency/comparisons');
  }

  if (!reference || reference === 'latest') {
    return { path: files[files.length - 1], data: readJsonFileSafe(files[files.length - 1]) };
  }

  const explicitPath = path.isAbsolute(reference)
    ? reference
    : path.join(COMPARISONS_DIR, reference.endsWith('.json') ? reference : `${reference}.json`);
  if (fs.existsSync(explicitPath)) {
    return { path: explicitPath, data: readJsonFileSafe(explicitPath) };
  }

  const direct = files.find((file) => path.basename(file) === reference || path.basename(file).includes(reference));
  if (direct) {
    return { path: direct, data: readJsonFileSafe(direct) };
  }

  throw new Error(`Unable to resolve comparison: ${reference}`);
}

function renderVerticalPairedBarChart({ title, items, outputPath, height = 460, rotateLabels = false }) {
  const width = 1100;
  const margin = { top: 122, right: 48, bottom: rotateLabels ? 210 : 120, left: 72 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxValue = Math.max(1, ...items.flatMap((item) => [item.baseline, item.current]));
  const groupWidth = plotWidth / items.length;
  const pairGap = 8;
  const barWidth = Math.min(90, (groupWidth - 40 - pairGap) / 2);

  const grid = [];
  for (let i = 0; i <= 5; i += 1) {
    const value = (maxValue / 5) * i;
    const y = margin.top + plotHeight - ((value / maxValue) * plotHeight);
    grid.push(`
      <line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" stroke="${COLORS.grid}" />
      <text x="${margin.left - 10}" y="${y + 4}" text-anchor="end" font-size="12" fill="${COLORS.axis}">${escapeXml(formatNumber(value))}</text>
    `);
  }

  const groups = items.map((item, index) => {
    const groupX = margin.left + groupWidth * index;
    const baselineHeight = (item.baseline / maxValue) * plotHeight;
    const currentHeight = (item.current / maxValue) * plotHeight;
    const baselineX = groupX + ((groupWidth - ((barWidth * 2) + pairGap)) / 2);
    const currentX = baselineX + barWidth + pairGap;
    const baselineY = margin.top + plotHeight - baselineHeight;
    const currentY = margin.top + plotHeight - currentHeight;
    const deltaColor = item.deltaPct <= 0 ? COLORS.deltaNegative : COLORS.deltaPositive;
    const labelX = groupX + (groupWidth / 2);
    const labelY = margin.top + plotHeight + 24;
    const deltaY = margin.top + plotHeight + (rotateLabels ? 120 : 44);
    const labelMarkup = rotateLabels
      ? `<text x="${labelX}" y="${labelY}" text-anchor="end" font-size="12" fill="${COLORS.text}" transform="rotate(-45 ${labelX} ${labelY})">${escapeXml(item.label)}</text>`
      : `<text x="${labelX}" y="${labelY}" text-anchor="middle" font-size="12" fill="${COLORS.text}">${escapeXml(item.label)}</text>`;
    const deltaMarkup = `<text x="${labelX}" y="${deltaY}" text-anchor="middle" font-size="11" fill="${deltaColor}">${escapeXml(formatPercent(item.deltaPct))}</text>`;
    return `
      <g font-family="ui-sans-serif, system-ui, sans-serif">
        <rect x="${baselineX}" y="${baselineY}" width="${barWidth}" height="${baselineHeight}" rx="4" fill="${COLORS.baseline}" />
        <rect x="${currentX}" y="${currentY}" width="${barWidth}" height="${currentHeight}" rx="4" fill="${COLORS.current}" />
        <text x="${baselineX + (barWidth / 2)}" y="${baselineY - 8}" text-anchor="middle" font-size="11" fill="${COLORS.axis}">${escapeXml(formatNumber(item.baseline))}</text>
        <text x="${currentX + (barWidth / 2)}" y="${currentY - 8}" text-anchor="middle" font-size="11" fill="${COLORS.axis}">${escapeXml(formatNumber(item.current))}</text>
        ${labelMarkup}
        ${deltaMarkup}
      </g>
    `;
  }).join('');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="white" />
  <text x="${margin.left}" y="34" font-family="ui-sans-serif, system-ui, sans-serif" font-size="28" font-weight="700" fill="${COLORS.text}">${escapeXml(title)}</text>
  <g transform="translate(${margin.left}, 76)">
    ${renderLegend(COLORS)}
  </g>
  <line x1="${margin.left}" y1="${margin.top + plotHeight}" x2="${width - margin.right}" y2="${margin.top + plotHeight}" stroke="${COLORS.axis}" />
  ${grid.join('')}
  ${groups}
</svg>`;

  writeSvgChart(outputPath, svg);
}

function main() {
  const { comparison: comparisonRef } = parseArgs(process.argv.slice(2));
  const resolved = resolveComparison(comparisonRef);
  const comparison = resolved.data;
  if (!comparison) {
    throw new Error(`Unable to read comparison data from ${resolved.path}`);
  }

  ensureDir(CHARTS_DIR);
  const slug = slugify(`${comparison.baseline.label}-${comparison.current.label}`);
  const flowOutputPath = path.join(CHARTS_DIR, `${slug}--flow-db-time.svg`);
  const requestOutputPath = path.join(CHARTS_DIR, `${slug}--request-db-time.svg`);

  renderVerticalPairedBarChart({
    title: 'DB Efficiency: User Flow Total DB Time',
    items: comparison.flows.map((flow) => ({
      label: flow.flow,
      baseline: flow.total_db_time_ms.baseline,
      current: flow.total_db_time_ms.current,
      deltaPct: flow.total_db_time_ms.delta_pct ?? 0,
    })),
    outputPath: flowOutputPath,
    height: 500,
  });

  renderVerticalPairedBarChart({
    title: 'DB Efficiency: Request DB Time',
    items: comparison.requests.map((request) => ({
      label: request.request_label,
      baseline: request.db_time_ms.baseline,
      current: request.db_time_ms.current,
      deltaPct: request.db_time_ms.delta_pct ?? 0,
    })),
    outputPath: requestOutputPath,
    height: 560,
    rotateLabels: true,
  });

  console.log(`Wrote ${path.relative(ROOT, flowOutputPath)}`);
  console.log(`Wrote ${path.relative(ROOT, requestOutputPath)}`);
}

main();
