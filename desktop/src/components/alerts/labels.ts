import type { AlertMetric } from '../../services/api';

export const METRIC_LABELS: Record<AlertMetric, string> = {
  cpu: 'CPU',
  ram: 'Memory',
  disk: 'Disk',
  process: 'Process',
};

/** A process's own reading is memory in MB for a memory alert and CPU % for the others. */
export function formatProcessValue(metric: AlertMetric, value: number): string {
  return metric === 'ram' ? `${Math.round(value).toLocaleString()} MB` : `${value.toFixed(1)}%`;
}
