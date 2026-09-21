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

    // Standardize 500 or 403 errors for UI Toast alerts
    if (error.response) {
      const status = error.response.status;
      if (status === 403) {
        console.error('[API] Access Denied. Ensure FastMCP has Admin privileges.');
        return Promise.reject(new Error('Access Denied: Administrator Privileges Required'));
      }
      if (status === 500) {
        console.error('[API] Internal Server Error on Python backend.');
        return Promise.reject(new Error(error.response.data?.detail || 'Internal Server Error'));
      }
    }

    return Promise.reject(error);
  }
);

// 4.3 Service Definitions
export const SystemAPI = {
  fetchProcesses: () => apiClient.get('/api/list_processes'),
  confirmKill: (pid: number) => apiClient.post('/api/confirm_termination', { pid }),
  executeKill: (pid: number) => apiClient.post('/api/execute_termination', { pid })
};
