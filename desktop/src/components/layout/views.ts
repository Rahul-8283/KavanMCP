export type View = 'dashboard' | 'alerts' | 'trends' | 'settings';

export const VIEW_META: Record<View, { title: string; description: string }> = {
  dashboard: {
    title: 'System Overview',
    description: 'Real-time telemetry and process intelligence.',
  },
  alerts: {
    title: 'Alert History',
    description: 'Every alert Kavan has raised, including while the window was closed.',
  },
  trends: {
    title: 'Performance Trends',
    description: 'How CPU, memory and disk have behaved over time.',
  },
  settings: {
    title: 'Settings',
    description: 'Configure system alerts and application preferences.',
  },
};
