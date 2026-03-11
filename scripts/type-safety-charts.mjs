#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { ensureDir, readJsonFileSafe, relativePath, slugify } from './type-safety-lib.mjs';

const ROOT = process.cwd();
const COMPARISONS_DIR = path.join(ROOT, 'reports', 'type-safety', 'comparisons');
const CHARTS_DIR = path.join(ROOT, 'reports', 'type-safety', 'charts');
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
  const result = {
    comparison: null,
    top: 10,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--comparison' && argv[i + 1]) {
      result.comparison = argv[i + 1];
      i += 1;
    } else if (arg === '--top' && argv[i + 1]) {
      result.top = Number.parseInt(argv[i + 1], 10) || 10;
      i += 1;
    }
  }

  return result;
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
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
    throw new Error('No comparison files found in reports/type-safety/comparisons');
  }

  if (!reference || reference === 'latest') {
    return { path: files[files.length - 1], data: readJsonFileSafe(files[files.length - 1]) };
  }

  const explicitPath = path.isAbsolute(reference)
    ? reference
    : path.join(COMPARISONS_DIR, reference);
  if (fs.existsSync(explicitPath)) {
    return { path: explicitPath, data: readJsonFileSafe(explicitPath) };
  }

  const direct = files.find((file) => path.basename(file) === reference);
  if (direct) {
    return { path: direct, data: readJsonFileSafe(direct) };
  }

  throw new Error(`Unable to resolve comparison: ${reference}`);
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatDelta(value) {
  if (value === 0) return '0';
  return `${value > 0 ? '+' : ''}${formatNumber(value)}`;
}

function truncateLabel(value, maxLength = 32) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

function formatChartLabel(value) {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function renderLegend() {
  return `
    <g font-family="ui-sans-serif, system-ui, sans-serif" font-size="12" fill="${COLORS.text}">
      <rect x="0" y="0" width="12" height="12" rx="2" fill="${COLORS.baseline}" />
      <text x="18" y="10">Baseline</text>
      <rect x="96" y="0" width="12" height="12" rx="2" fill="${COLORS.current}" />
      <text x="114" y="10">Current</text>
    </g>
  `;
}

function renderVerticalPairedBarChart({ title, items, outputPath, height = 520 }) {
  const width = 1400;
  const margin = { top: 122, right: 48, bottom: 146, left: 72 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxValue = Math.max(1, ...items.flatMap((item) => [item.baseline, item.current]));
  const groupWidth = plotWidth / items.length;
  const pairGap = 3;
  const groupPadding = Math.max(12, Math.min(28, groupWidth * 0.12));
  const barWidth = Math.min(58, (groupWidth - groupPadding - pairGap) / 2);
  const yTicks = 5;

  const grid = [];
  for (let i = 0; i <= yTicks; i += 1) {
    const value = (maxValue / yTicks) * i;
    const y = margin.top + plotHeight - ((value / maxValue) * plotHeight);
    grid.push(`
      <line x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}" stroke="${COLORS.grid}" />
      <text x="${margin.left - 10}" y="${y + 4}" text-anchor="end" font-size="12" fill="${COLORS.axis}">${escapeXml(formatNumber(Math.round(value)))}</text>
    `);
  }

  const groups = items.map((item, index) => {
    const groupX = margin.left + groupWidth * index;
    const baselineHeight = (item.baseline / maxValue) * plotHeight;
    const currentHeight = (item.current / maxValue) * plotHeight;
    const pairWidth = (barWidth * 2) + pairGap;
    const baselineX = groupX + ((groupWidth - pairWidth) / 2);
    const currentX = baselineX + barWidth + pairGap;
    const baselineY = margin.top + plotHeight - baselineHeight;
    const currentY = margin.top + plotHeight - currentHeight;
    const deltaColor = item.delta <= 0 ? COLORS.deltaNegative : COLORS.deltaPositive;
    const label = truncateLabel(formatChartLabel(item.label), 22);
    return `
      <g font-family="ui-sans-serif, system-ui, sans-serif">
        <rect x="${baselineX}" y="${baselineY}" width="${barWidth}" height="${baselineHeight}" rx="4" fill="${COLORS.baseline}" />
        <rect x="${currentX}" y="${currentY}" width="${barWidth}" height="${currentHeight}" rx="4" fill="${COLORS.current}" />
        <text x="${baselineX + (barWidth / 2)}" y="${baselineY - 8}" text-anchor="middle" font-size="11" fill="${COLORS.axis}">${escapeXml(formatNumber(item.baseline))}</text>
        <text x="${currentX + (barWidth / 2)}" y="${currentY - 8}" text-anchor="middle" font-size="11" fill="${COLORS.axis}">${escapeXml(formatNumber(item.current))}</text>
        <text x="${groupX + (groupWidth / 2)}" y="${margin.top + plotHeight + 24}" text-anchor="middle" font-size="12" fill="${COLORS.text}">${escapeXml(label)}</text>
        <text x="${groupX + (groupWidth / 2)}" y="${margin.top + plotHeight + 44}" text-anchor="middle" font-size="11" fill="${deltaColor}">delta ${escapeXml(formatDelta(item.delta))}</text>
      </g>
    `;
  }).join('');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="white" />
  <text x="${margin.left}" y="34" font-family="ui-sans-serif, system-ui, sans-serif" font-size="28" font-weight="700" fill="${COLORS.text}">${escapeXml(title)}</text>
  <g transform="translate(${margin.left}, 76)">
    ${renderLegend()}
  </g>
  <line x1="${margin.left}" y1="${margin.top + plotHeight}" x2="${width - margin.right}" y2="${margin.top + plotHeight}" stroke="${COLORS.axis}" />
  ${grid.join('')}
  ${groups}
</svg>`;

  fs.writeFileSync(outputPath, `${svg}\n`, 'utf8');
}

function renderHorizontalPairedBarChart({ title, items, outputPath }) {
  const width = 1400;
  const rowHeight = 38;
  const margin = { top: 122, right: 72, bottom: 34, left: 420 };
  const height = margin.top + margin.bottom + (items.length * rowHeight);
  const plotWidth = width - margin.left - margin.right;
  const maxValue = Math.max(1, ...items.flatMap((item) => [item.baseline, item.current]));
  const barHeight = 12;
  const pairGap = 2;

  const grid = [];
  const ticks = 5;
  for (let i = 0; i <= ticks; i += 1) {
    const value = (maxValue / ticks) * i;
    const x = margin.left + ((value / maxValue) * plotWidth);
    grid.push(`
      <line x1="${x}" y1="${margin.top - 8}" x2="${x}" y2="${height - margin.bottom}" stroke="${COLORS.grid}" />
      <text x="${x}" y="${margin.top - 14}" text-anchor="middle" font-size="12" fill="${COLORS.axis}">${escapeXml(formatNumber(Math.round(value)))}</text>
    `);
  }

  const rows = items.map((item, index) => {
    const y = margin.top + (index * rowHeight);
    const baselineWidth = (item.baseline / maxValue) * plotWidth;
    const currentWidth = (item.current / maxValue) * plotWidth;
    return `
      <g font-family="ui-sans-serif, system-ui, sans-serif">
        <text x="${margin.left - 12}" y="${y + 13}" text-anchor="end" font-size="12" fill="${COLORS.text}">${escapeXml(truncateLabel(formatChartLabel(item.label), 52))}</text>
        <rect x="${margin.left}" y="${y}" width="${baselineWidth}" height="${barHeight}" rx="3" fill="${COLORS.baseline}" />
        <rect x="${margin.left}" y="${y + barHeight + pairGap}" width="${currentWidth}" height="${barHeight}" rx="3" fill="${COLORS.current}" />
        <text x="${margin.left + baselineWidth + 8}" y="${y + 10}" font-size="11" fill="${COLORS.axis}">${escapeXml(formatNumber(item.baseline))}</text>
        <text x="${margin.left + currentWidth + 8}" y="${y + (barHeight * 2) + pairGap - 2}" font-size="11" fill="${COLORS.axis}">${escapeXml(formatNumber(item.current))}</text>
      </g>
    `;
  }).join('');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="white" />
  <text x="${margin.left}" y="34" font-family="ui-sans-serif, system-ui, sans-serif" font-size="28" font-weight="700" fill="${COLORS.text}">${escapeXml(title)}</text>
  <g transform="translate(${margin.left}, 76)">
    ${renderLegend()}
  </g>
  ${grid.join('')}
  ${rows}
</svg>`;

  fs.writeFileSync(outputPath, `${svg}\n`, 'utf8');
}

function buildFileChartItems(comparison, topCount) {
  return comparison.charts.by_file.top_by_baseline_total
    .slice(0, topCount)
    .map((entry) => ({
      label: entry.file,
      baseline: entry.baseline_total,
      current: entry.current_total,
      delta: entry.delta,
    }));
}

function main() {
  const { comparison: comparisonRef, top } = parseArgs(process.argv.slice(2));
  const resolved = resolveComparison(comparisonRef);
  const comparison = resolved.data;

  if (!comparison) {
    throw new Error(`Unable to read comparison data from ${resolved.path}`);
  }

  ensureDir(CHARTS_DIR);
  const slug = slugify(`${comparison.baseline.label}-${comparison.current.label}`);
  const totalsPath = path.join(CHARTS_DIR, `${slug}--totals.svg`);
  const typesPath = path.join(CHARTS_DIR, `${slug}--violation-types.svg`);
  const filesPath = path.join(CHARTS_DIR, `${slug}--top-files.svg`);

  renderVerticalPairedBarChart({
    title: 'Totals',
    items: comparison.charts.totals.map((item) => ({
      label: item.label,
      baseline: item.baseline,
      current: item.current,
      delta: item.delta,
    })),
    outputPath: totalsPath,
    height: 500,
  });

  renderVerticalPairedBarChart({
    title: 'Violation Types',
    items: comparison.charts.by_violation_type.map((item) => ({
      label: item.label,
      baseline: item.baseline,
      current: item.current,
      delta: item.delta,
    })),
    outputPath: typesPath,
    height: 560,
  });

  renderHorizontalPairedBarChart({
    title: `Top ${top} Files`,
    items: buildFileChartItems(comparison, top),
    outputPath: filesPath,
  });

  console.log(`Wrote ${relativePath(ROOT, totalsPath)}`);
  console.log(`Wrote ${relativePath(ROOT, typesPath)}`);
  console.log(`Wrote ${relativePath(ROOT, filesPath)}`);
}

main();
