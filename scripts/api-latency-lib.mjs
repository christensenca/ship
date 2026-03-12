import fs from 'node:fs';
import path from 'node:path';

export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function readJsonFileSafe(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

export function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'snapshot';
}

export function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return 'N/A';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatPercent(value, digits = 1) {
  if (!Number.isFinite(value)) return 'N/A';
  return `${value > 0 ? '+' : ''}${formatNumber(value, digits)}%`;
}

export function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function renderLegend(colors) {
  return `
    <g font-family="ui-sans-serif, system-ui, sans-serif" font-size="12" fill="${colors.text}">
      <rect x="0" y="0" width="12" height="12" rx="2" fill="${colors.baseline}" />
      <text x="18" y="10">Baseline</text>
      <rect x="96" y="0" width="12" height="12" rx="2" fill="${colors.current}" />
      <text x="114" y="10">Current</text>
    </g>
  `;
}

export function writeSvgChart(outputPath, contents) {
  ensureDir(path.dirname(outputPath));
  fs.writeFileSync(outputPath, `${contents}\n`, 'utf8');
}
