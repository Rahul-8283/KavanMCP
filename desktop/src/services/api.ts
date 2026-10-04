import axios from 'axios';

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
}

// 4.3 Service Definitions
export const SystemAPI = {
  fetchProcesses: () => apiClient.get('/api/list_processes'),
  confirmKill: (pid: number) =>
    apiClient.post<StagedTermination, StagedTermination>('/api/confirm_termination', { pid }, { timeout: TERMINATION_TIMEOUT_MS }),
  executeKill: (pid: number) =>
    apiClient.post<TerminationResult, TerminationResult>('/api/execute_termination', { pid }, { timeout: TERMINATION_TIMEOUT_MS }),
  fetchConfig: () => apiClient.get('/api/get_config'),
  updateThresholds: (payload: Record<string, any>) => apiClient.post('/api/update_thresholds', payload)
};
