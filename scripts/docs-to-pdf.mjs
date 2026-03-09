#!/usr/bin/env node
/**
 * Converts docs/codebase-orientation.md to PDF using Playwright (already installed for E2E).
 * Usage: pnpm docs:pdf
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { marked } from 'marked';
import { chromium } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const mdPath = join(root, 'docs', 'codebase-orientation.md');
const pdfPath = join(root, 'docs', 'codebase-orientation.pdf');

const md = readFileSync(mdPath, 'utf-8');
const body = marked.parse(md);

const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 2rem; line-height: 1.5; }
    h1 { font-size: 1.75rem; border-bottom: 1px solid #ccc; padding-bottom: 0.5rem; }
    h2 { font-size: 1.4rem; margin-top: 1.5rem; }
    h3 { font-size: 1.2rem; margin-top: 1.25rem; }
    h4 { font-size: 1.05rem; margin-top: 1rem; }
    table { border-collapse: collapse; margin: 1rem 0; width: 100%; font-size: 0.9rem; }
    th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
    th { background: #f5f5f5; }
    pre {
      background: #f5f5f5; padding: 1rem; margin: 1rem 0;
      font-family: ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas, monospace;
      font-size: 0.65rem; line-height: 1.3;
      white-space: pre; overflow: visible;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
      max-width: 100%;
    }
    code { background: #f0f0f0; padding: 2px 4px; font-size: 0.9em; font-family: inherit; }
    pre code { background: transparent; padding: 0; }
    li { margin: 0.25rem 0; }
    hr { margin: 2rem 0; border: none; border-top: 1px solid #ccc; }
    @media print { pre { break-inside: avoid; } }
  </style>
</head>
<body>
${body}
</body>
</html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'networkidle' });
await page.pdf({
  path: pdfPath,
  format: 'A4',
  margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
  printBackground: true,
});
await browser.close();

console.log('Created:', pdfPath);
