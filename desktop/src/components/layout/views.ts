export type View = 'dashboard' | 'settings';

export const VIEW_META: Record<View, { title: string; description: string }> = {
  dashboard: {
    title: 'System Overview',
    description: 'Real-time telemetry and process intelligence.',
  },
  settings: {
    title: 'Settings',
    description: 'Configure system alerts and application preferences.',
  },
};
