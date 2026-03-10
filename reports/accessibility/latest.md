# Accessibility Compliance Report

Generated: 2026-03-10T22:32:32.951Z

## Audit Deliverable

| Metric | Your Baseline |
|---|---|
| Lighthouse accessibility score (per page) | Login: 98<br>My Week: 96<br>Dashboard: 96<br>Documents: 100<br>Issues: 100<br>Projects: 100<br>Programs: 100<br>Team Directory: 100<br>Team Allocation: 96<br>Status Overview: 96<br>Org Chart: 100<br>Reviews: 100<br>Settings: 100 |
| Total Critical/Serious violations | 26 affected elements (1 critical, 25 serious) |
| Keyboard navigation completeness | Manual assessment required by user: Full / Partial / Broken |
| Color contrast failures | 25 |
| Missing ARIA labels or roles | 1 location across all audited pages: Settings: tr:nth-child(1) > td:nth-child(3) > select |

## Trend

- Status: **Baseline**
- Total violations: 26 (delta: N/A (baseline))
- Pages audited: 13
- Missing ARIA/name/role issues found by automated audit: 1
- Screen reader testing: Manual VoiceOver/NVDA assessment required

## Lighthouse Scores by Page

| Page | URL | Score |
|---|---|---:|
| Login | `/login` | 98 |
| My Week | `/my-week` | 96 |
| Dashboard | `/dashboard` | 96 |
| Documents | `/docs` | 100 |
| Issues | `/issues` | 100 |
| Projects | `/projects` | 100 |
| Programs | `/programs` | 100 |
| Team Directory | `/team/directory` | 100 |
| Team Allocation | `/team/allocation` | 96 |
| Status Overview | `/team/status` | 96 |
| Org Chart | `/team/org-chart` | 100 |
| Reviews | `/team/reviews` | 100 |
| Settings | `/settings` | 100 |

## Per-Page Violations

| Page | Critical | Serious | Moderate | Minor | Total |
|---|---:|---:|---:|---:|---:|
| Login | 0 | 0 | 0 | 0 | 0 |
| My Week | 0 | 1 | 0 | 0 | 1 |
| Dashboard | 0 | 21 | 0 | 0 | 21 |
| Documents | 0 | 0 | 0 | 0 | 0 |
| Issues | 0 | 0 | 0 | 0 | 0 |
| Projects | 0 | 0 | 0 | 0 | 0 |
| Programs | 0 | 0 | 0 | 0 | 0 |
| Team Directory | 0 | 0 | 0 | 0 | 0 |
| Team Allocation | 0 | 1 | 0 | 0 | 1 |
| Status Overview | 0 | 1 | 0 | 0 | 1 |
| Org Chart | 0 | 0 | 0 | 0 | 0 |
| Reviews | 0 | 1 | 0 | 0 | 1 |
| Settings | 1 | 0 | 0 | 0 | 1 |

## Top Violation Types

| Rule | Impact | Count | Description |
|---|---|---:|---|
| color-contrast | serious | 25 | Elements must meet minimum color contrast ratio thresholds |
| select-name | critical | 1 | Select element must have an accessible name |

## Color Contrast Failures

| Page | Element | Target Selector |
|---|---|---|
| My Week | `<span class="text-xs bg-accent/20 text-accent px-1.5 py-0.5 …` | `.bg-accent\/20.py-0\.5.px-1\.5` |
| Dashboard | `<button class="flex items-center gap-2 rounded-md px-2 py-1.…` | `.bg-accent\/10` |
| Dashboard | `<a class="text-sm hover:underline text-red-100" href="/docum…` | `.text-red-100.hover\:underline[data-discover="true"]:nth-child(1)` |
| Dashboard | `<a class="text-sm hover:underline text-red-100" href="/docum…` | `.text-red-100.hover\:underline[data-discover="true"]:nth-child(2)` |
| Dashboard | `<a class="text-sm hover:underline text-red-100" href="/docum…` | `.text-red-100.hover\:underline[data-discover="true"]:nth-child(3)` |
| Dashboard | `<a class="text-sm hover:underline text-red-100" href="/docum…` | `.text-red-100.hover\:underline[data-discover="true"]:nth-child(4)` |
| Dashboard | `<a class="text-sm hover:underline text-red-100" href="/docum…` | `.text-red-100.hover\:underline[data-discover="true"]:nth-child(5)` |
| Dashboard | `<a class="text-sm hover:underline text-red-100" href="/docum…` | `.text-red-100.hover\:underline[data-discover="true"]:nth-child(6)` |
| Dashboard | `<a class="text-sm hover:underline text-red-100" href="/docum…` | `.text-red-100.hover\:underline[data-discover="true"]:nth-child(7)` |
| Dashboard | `<a class="text-sm hover:underline text-red-100" href="/docum…` | `.text-red-100.hover\:underline[data-discover="true"]:nth-child(8)` |
| Dashboard | `<a class="text-sm hover:underline text-red-100" href="/docum…` | `.text-red-100.hover\:underline[data-discover="true"]:nth-child(9)` |
| Dashboard | `<a class="text-sm hover:underline text-red-100" href="/docum…` | `.text-red-100.hover\:underline[data-discover="true"]:nth-child(10)` |
| Dashboard | `<a class="text-sm hover:underline text-red-100" href="/docum…` | `.text-red-100.hover\:underline[data-discover="true"]:nth-child(11)` |
| Dashboard | `<div class="text-[10px] font-semibold uppercase tracking-wid…` | `.border-border\/50.last\:border-r-0.px-3:nth-child(1) > .text-muted\/50.text-\[10px\].mb-1\.5` |
| Dashboard | `<div class="text-[10px] font-semibold uppercase tracking-wid…` | `.text-accent.text-\[10px\].mb-1\.5` |
| Dashboard | `<div class="text-[10px] font-semibold uppercase tracking-wid…` | `.border-border\/50.last\:border-r-0.px-3:nth-child(3) > .text-muted\/50.text-\[10px\].mb-1\.5` |
| Dashboard | `<div class="text-[10px] font-semibold uppercase tracking-wid…` | `.border-border\/50.last\:border-r-0.px-3:nth-child(4) > .text-muted\/50.text-\[10px\].mb-1\.5` |
| Dashboard | `<div class="flex items-center gap-1.5 text-[11px] font-mediu…` | `.text-\[11px\].mt-1.text-muted\/50` |
| Dashboard | `<div class="text-[10px] font-semibold uppercase tracking-wid…` | `.border-border\/50.last\:border-r-0.px-3:nth-child(5) > .text-muted\/50.text-\[10px\].mb-1\.5` |
| Dashboard | `<div class="text-[10px] font-semibold uppercase tracking-wid…` | `.border-border\/50.last\:border-r-0.px-3:nth-child(6) > .text-muted\/50.text-\[10px\].mb-1\.5` |
| Dashboard | `<div class="text-[10px] font-semibold uppercase tracking-wid…` | `.border-border\/50.last\:border-r-0.px-3:nth-child(7) > .text-muted\/50.text-\[10px\].mb-1\.5` |
| Dashboard | `<div class="text-xs text-muted/60 mb-4">Ship Core</div>` | `.border-red-500\/30.p-6.bg-background:nth-child(1) > .text-muted\/60.text-xs.mb-4` |
| Team Allocation | `<span class="text-xs font-medium text-accent">Week 13</span>` | `.text-accent.font-medium.text-xs` |
| Status Overview | `<span class="text-xs font-medium text-accent">Week 13</span>` | `.text-accent.font-medium.text-xs` |
| Reviews | `<span class="text-xs font-medium text-accent">Week 13</span>` | `.text-accent.font-medium.text-xs` |

## Missing ARIA Labels/Roles

| Page | Rule | Element | Target Selector |
|---|---|---|---|
| Settings | select-name | `<select class="px-2 py-1 rounded text-sm bg-background borde…` | `tr:nth-child(1) > td:nth-child(3) > select` |
