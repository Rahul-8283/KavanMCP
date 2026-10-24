import axios from 'axios';
import type { Process } from '../context/ProcessContext';

// Errors that the backend describes with a machine-readable code (see ws_server.py)
export class ApiError extends Error {
  code: string;
  status?: number;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

// 4.1 Axios Instance Configuration
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  timeout: 5000, // If Python backend doesn't respond in 5s, assume dead
  headers: {
    'Content-Type': 'application/json'
  }
});

// 4.2 Interceptors & Global Error Handling
apiClient.interceptors.response.use(
  (response) => {
    // Strip away the Axios wrapper object, returning just the data
    return response.data;
  },
  (error) => {
    if (error.code === 'ECONNREFUSED' || error.message.includes('Network Error') || error.code === 'ECONNABORTED') {
      // Dispatch a global event so the UI Header can turn the status dot Red
      window.dispatchEvent(new CustomEvent('backend-offline'));
      console.error('[API] Backend is completely offline or unreachable (5000ms timeout).');
      return Promise.reject(new Error('Backend Offline'));
    }

    if (error.response) {
      const status = error.response.status;
      const detail = error.response.data?.detail;

      // Coded errors carry their own user-facing message from the server
      if (detail && typeof detail === 'object' && typeof detail.code === 'string') {
        return Promise.reject(new ApiError(detail.code, detail.message, status));
      }

      // Standardize 500 or 403 errors for UI Toast alerts
      if (status === 403) {
        console.error('[API] Access Denied. Ensure FastMCP has Admin privileges.');
        return Promise.reject(new Error('Access Denied: Administrator Privileges Required'));
      }
      if (status === 500) {
        console.error('[API] Internal Server Error on Python backend.');
        return Promise.reject(new Error(typeof detail === 'string' ? detail : 'Internal Server Error'));
      }
    }

    return Promise.reject(error);
  }
);

// Termination waits up to 3s for the OS before force-killing, so it needs more than the default 5s
const TERMINATION_TIMEOUT_MS = 10000;
// Scanning every process takes seconds on a busy machine, well past the default 5s
const PROCESS_SCAN_TIMEOUT_MS = 20000;

export interface StagedTermination {
  status: 'pending';
  pid: number;
  name: string;
  tier: number;
  cpu_percent: number;
  memory_mb: number;
  message: string;
}

export interface TerminationResult {
  status: 'success';
  pid: number;
  name: string;
  path: string | null;
  freed_mb: number;
  freed_cpu: number;
  /** The id of the kill's audit row, which names it for an undo. Null if the audit write failed. */
  audit_id: string | null;
}

export type RestoreBlockedReason = 'no_path' | 'exe_missing' | 'already_restored';

export interface KillRecord {
  id: string;
  name: string;
  pid: number;
  /** Null for kills made before V2.1, when the tier was not recorded */
  tier: number | null;
  killed_at: string;
  memory_freed_mb: number;
  cpu_freed_pct: number;
  executable_path: string | null;
  reasoning: string | null;
  rolled_back_at: string | null;
  can_restore: boolean;
  restore_blocked_reason: RestoreBlockedReason | null;
}

export interface KillsResponse {
  /** A restored program inherits the backend's Administrator rights */
  backend_elevated: boolean;
  kills: KillRecord[];
}

export interface RollbackResult {
  status: 'success';
  id: string;
  name: string;
  new_pid: number;
  rolled_back_at: string | null;
}

export type AlertMetric = 'cpu' | 'ram' | 'disk' | 'process';
export type AlertLevel = 'warning' | 'critical';

export interface AlertEvent {
  id: string;
  metric: AlertMetric;
  level: AlertLevel;
  threshold: number;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  peak_value: number;
  readings: { cpu: number; ram: number; disk: number };
  top_process: { name: string; pid: number; value: number } | null;
  muted: boolean;
}

export interface AlertFilters {
  from?: string;
  to?: string;
  metric?: AlertMetric;
  level?: AlertLevel;
  limit?: number;
}

export interface AlertsResponse {
  alerts: AlertEvent[];
  truncated: boolean;
}

export type HistoryRange = '1h' | '6h' | '24h' | '7d';

export interface MetricsPoint {
  /** Start of the bucket */
  t: string;
  cpu_avg: number;
  cpu_max: number;
  ram_avg: number;
  ram_max: number;
  disk_avg: number;
  /** The share of the bucket the backend was sampling for, 0 to 1 */
  coverage: number;
}

export interface MetricsHistory {
  from: string;
  to: string;
  bucket_seconds: number;
  /** The oldest recorded minute, or null while nothing has been recorded */
  recording_since: string | null;
  thresholds: { cpu: number | null; ram: number | null; disk: number | null };
  /** Buckets with no data are left out */
  points: MetricsPoint[];
}

// 4.3 Service Definitions
export const SystemAPI = {
  fetchProcesses: () =>
    apiClient.get<Process[], Process[]>('/api/list_processes', { timeout: PROCESS_SCAN_TIMEOUT_MS }),
  confirmKill: (pid: number) =>
    apiClient.post<StagedTermination, StagedTermination>('/api/confirm_termination', { pid }, { timeout: TERMINATION_TIMEOUT_MS }),
  executeKill: (pid: number) =>
    apiClient.post<TerminationResult, TerminationResult>('/api/execute_termination', { pid }, { timeout: TERMINATION_TIMEOUT_MS }),
  fetchKills: (hours: number) =>
    apiClient.get<KillsResponse, KillsResponse>('/api/kills', { params: { hours } }),
  rollbackKill: (id: string) =>
    apiClient.post<RollbackResult, RollbackResult>('/api/rollback', { id }, { timeout: TERMINATION_TIMEOUT_MS }),
  fetchConfig: () => apiClient.get('/api/get_config'),
  updateThresholds: (payload: Record<string, any>) => apiClient.post('/api/update_thresholds', payload),
  fetchAlerts: (filters: AlertFilters) =>
    apiClient.get<AlertsResponse, AlertsResponse>('/api/alerts', { params: filters }),
  /** A preset range ending now, or an exact window. The server picks the bucket size. */
  fetchMetricsHistory: (window: HistoryRange | { from: string; to: string }) =>
    apiClient.get<MetricsHistory, MetricsHistory>('/api/metrics/history', {
      params: typeof window === 'string' ? { range: window } : window,
    })
};
