export type DashboardView = 'my-work' | 'overview';

export function isDashboardView(value: string | null): value is DashboardView {
  return value === 'my-work' || value === 'overview';
}

export function parseDashboardView(value: string | null): DashboardView {
  return isDashboardView(value) ? value : 'my-work';
}
