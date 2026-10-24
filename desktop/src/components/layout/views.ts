export type View = 'dashboard' | 'alerts' | 'trends' | 'killed' | 'settings';

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
  killed: {
    title: 'Recently Killed',
    description: 'Processes Kavan terminated, and a way to bring them back.',
  },
  settings: {
    title: 'Settings',
    description: 'Configure system alerts and application preferences.',
  },
};
