/**
 * Accessibility Compliance Audit
 *
 * Runs axe-core WCAG 2.1 AA scans and Lighthouse accessibility audits
 * across all major pages. Writes structured results to
 * reports/accessibility/raw-audit.json for the report script.
 *
 * Usage:
 *   npx playwright test e2e/accessibility-audit.spec.ts
 *   pnpm audit:accessibility   # runs this + generates report
 */

import { test, expect } from './fixtures/isolated-env';
import AxeBuilder from '@axe-core/playwright';
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Pages to audit
// ---------------------------------------------------------------------------

const UNAUTH_PAGES = [
  { name: 'Login', url: '/login' },
];

const AUTH_PAGES = [
  { name: 'My Week', url: '/my-week' },
  { name: 'Dashboard', url: '/dashboard' },
  { name: 'Documents', url: '/docs' },
  { name: 'Issues', url: '/issues' },
  { name: 'Projects', url: '/projects' },
  { name: 'Programs', url: '/programs' },
  { name: 'Team Directory', url: '/team/directory' },
  { name: 'Team Allocation', url: '/team/allocation' },
  { name: 'Status Overview', url: '/team/status' },
  { name: 'Org Chart', url: '/team/org-chart' },
  { name: 'Reviews', url: '/team/reviews' },
  { name: 'Settings', url: '/settings' },
];

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const LIGHTHOUSE_READINESS: Record<string, string[]> = {
  '/login': ['#email', '#password', 'button[type="submit"]'],
  '/my-week': ['h1', 'text=Weekly Plan'],
  '/dashboard': ['h1', 'text=Dashboard'],
  '/docs': ['main'],
  '/issues': ['main'],
  '/projects': ['main'],
  '/programs': ['main'],
  '/team/directory': ['main'],
  '/team/allocation': ['main', 'text=Show archived'],
  '/team/status': ['text=Status Overview', 'input[type="checkbox"]'],
  '/team/org-chart': ['main'],
  '/team/reviews': ['main'],
  '/settings': ['text=Workspace Settings', 'table', 'select'],
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ViolationCounts {
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
}

interface PageResult {
  name: string;
  url: string;
  lighthouse_score: number | null;
  violations: Array<{
    id: string;
    impact: string;
    description: string;
    help: string;
    helpUrl: string;
    nodes: Array<{ html: string; target: string[] }>;
  }>;
  violation_counts: ViolationCounts;
  passes: number;
  incomplete: number;
}

interface AuditResults {
  generated_at: string;
  pages: PageResult[];
}

// ---------------------------------------------------------------------------
// Shared state across serial tests
// ---------------------------------------------------------------------------

const auditResults: AuditResults = { generated_at: '', pages: [] };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countBySeverity(violations: Array<{ impact?: string | null }>): ViolationCounts {
  const counts: ViolationCounts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const v of violations) {
    const impact = v.impact as keyof ViolationCounts;
    if (impact in counts) counts[impact] += Math.max(1, 'nodes' in v && Array.isArray(v.nodes) ? v.nodes.length : 1);
  }
  return counts;
}

function formatAxeResult(
  name: string,
  url: string,
  results: Awaited<ReturnType<AxeBuilder['analyze']>>,
): PageResult {
  return {
    name,
    url,
    lighthouse_score: null,
    violations: results.violations.map((v) => ({
      id: v.id,
      impact: v.impact ?? 'unknown',
      description: v.description,
      help: v.help,
      helpUrl: v.helpUrl,
      nodes: v.nodes.map((n) => ({
        html: n.html,
        target: n.target.map(String),
      })),
    })),
    violation_counts: countBySeverity(results.violations),
    passes: results.passes.length,
    incomplete: results.incomplete.length,
  };
}

async function waitForLighthouseReady(
  page: {
    waitForSelector: (selector: string, options?: { timeout?: number }) => Promise<unknown>;
    waitForFunction: (fn: () => boolean, options?: { timeout?: number }) => Promise<unknown>;
  },
  url: string,
): Promise<void> {
  const selectors = LIGHTHOUSE_READINESS[url] ?? ['main'];
  for (const selector of selectors) {
    await page.waitForSelector(selector, { timeout: 15000 });
  }

  await page.waitForFunction(() => document.readyState === 'complete', { timeout: 10000 });
  await page.waitForFunction(() => {
    const busy = document.querySelector('[aria-busy="true"]');
    return !busy;
  }, { timeout: 10000 }).catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Accessibility Audit', () => {
  test.describe.configure({ mode: 'serial' });

  test('audit unauthenticated pages', async ({ page }) => {
    // Clear results in case of retry
    auditResults.pages = [];

    for (const pageInfo of UNAUTH_PAGES) {
      await page.goto(pageInfo.url);
      await page.waitForLoadState('networkidle');

      const results = await new AxeBuilder({ page })
        .withTags(WCAG_TAGS)
        .analyze();

      auditResults.pages.push(formatAxeResult(pageInfo.name, pageInfo.url, results));
    }
  });

  test('audit authenticated pages', async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.locator('#email').fill('dev@ship.local');
    await page.locator('#password').fill('admin123');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).not.toHaveURL('/login', { timeout: 10000 });

    for (const pageInfo of AUTH_PAGES) {
      await page.goto(pageInfo.url);
      await page.waitForLoadState('networkidle');

      const results = await new AxeBuilder({ page })
        .withTags(WCAG_TAGS)
        .analyze();

      auditResults.pages.push(formatAxeResult(pageInfo.name, pageInfo.url, results));
    }
  });

  test('collect Lighthouse accessibility scores', async ({ baseURL }) => {
    // Lighthouse snapshot mode on each page; ~5-10s per page, 13 pages
    test.setTimeout(300000);
    expect(baseURL).toBeTruthy();

    const { startFlow } = await import('lighthouse');
    const chromeLauncher = await import('chrome-launcher');
    const puppeteer = await import('puppeteer-core');

    // Launch a separate Chrome instance for Lighthouse
    const chrome = await chromeLauncher.launch({
      chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu'],
    });

    try {
      // Connect puppeteer-core to Chrome via CDP
      const response = await fetch(`http://localhost:${chrome.port}/json/version`);
      const { webSocketDebuggerUrl } = (await response.json()) as { webSocketDebuggerUrl: string };
      const browser = await puppeteer.connect({ browserWSEndpoint: webSocketDebuggerUrl });
      const ppPage = (await browser.pages())[0] || await browser.newPage();
      const lighthouseDir = path.join(process.cwd(), 'reports', 'accessibility', 'lighthouse');
      fs.mkdirSync(lighthouseDir, { recursive: true });

      // Login via puppeteer so session cookies persist in this browser
      await ppPage.goto(`${baseURL}/login`, { waitUntil: 'domcontentloaded' });
      await waitForLighthouseReady(ppPage, '/login');

      {
        const flow = await startFlow(ppPage, { name: 'Login' });
        await flow.snapshot({ stepName: 'Login' });
        const flowResult = await flow.createFlowResult();
        const lhr = flowResult.steps[0]?.lhr;
        if (lhr) {
          const lhrPath = path.join(lighthouseDir, 'login.json');
          fs.writeFileSync(lhrPath, JSON.stringify(lhr, null, 2) + '\n');
        }
        const loginResult = auditResults.pages.find((page) => page.url === '/login');
        if (loginResult) {
          const score = lhr?.categories?.accessibility?.score;
          loginResult.lighthouse_score = typeof score === 'number' ? Math.round(score * 100) : null;
        }
      }

      await ppPage.type('#email', 'dev@ship.local');
      await ppPage.type('#password', 'admin123');
      await ppPage.click('button[type="submit"]');
      await ppPage.waitForFunction(() => window.location.pathname !== '/login', { timeout: 15000 });
      await new Promise((r) => setTimeout(r, 1500));

      // Audit each page using a stabilized snapshot of the fully-rendered route.
      for (const pageResult of auditResults.pages.filter((page) => page.url !== '/login')) {
        try {
          await ppPage.goto(`${baseURL}${pageResult.url}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await waitForLighthouseReady(ppPage, pageResult.url);

          const flow = await startFlow(ppPage, { name: pageResult.name });
          await flow.snapshot({ stepName: pageResult.name });
          const flowResult = await flow.createFlowResult();
          const lhr = flowResult.steps[0]?.lhr;

          if (lhr) {
            const slug = pageResult.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            const lhrPath = path.join(lighthouseDir, `${slug}.json`);
            fs.writeFileSync(lhrPath, JSON.stringify(lhr, null, 2) + '\n');
          }

          const score = lhr?.categories?.accessibility?.score;
          pageResult.lighthouse_score = typeof score === 'number'
            ? Math.round(score * 100)
            : null;
        } catch (err) {
          console.warn(`Lighthouse failed for ${pageResult.url}: ${(err as Error).message}`);
          pageResult.lighthouse_score = null;
        }
      }

      await browser.disconnect();
    } finally {
      chrome.kill();
    }
  });

  test.afterAll(async () => {
    if (auditResults.pages.length === 0) return;

    auditResults.generated_at = new Date().toISOString();

    const outputDir = path.join(process.cwd(), 'reports', 'accessibility');
    fs.mkdirSync(outputDir, { recursive: true });

    const outputPath = path.join(outputDir, 'raw-audit.json');
    fs.writeFileSync(outputPath, JSON.stringify(auditResults, null, 2) + '\n');

    console.log(`\nAccessibility audit complete: ${auditResults.pages.length} pages audited`);
    console.log(`Wrote ${path.relative(process.cwd(), outputPath)}`);

    // Print summary table
    console.log('\n  Page                  | Crit | Serious | Mod | Minor | LH Score');
    console.log('  ' + '-'.repeat(72));
    for (const p of auditResults.pages) {
      const c = p.violation_counts;
      const lh = p.lighthouse_score !== null ? String(p.lighthouse_score) : 'N/A';
      console.log(
        `  ${p.name.padEnd(22)} | ${String(c.critical).padStart(4)} | ${String(c.serious).padStart(7)} | ${String(c.moderate).padStart(3)} | ${String(c.minor).padStart(5)} | ${lh.padStart(8)}`,
      );
    }
  });
});
