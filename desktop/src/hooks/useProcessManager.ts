import { useState, useCallback } from 'react';
import { SystemAPI } from '../services/api';
import { useProcess, Process } from '../context/ProcessContext';

export function useProcessManager() {
  const { processes, setProcesses } = useProcess();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshProcesses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await SystemAPI.fetchProcesses();
      // Our Axios interceptor strips the wrapper and returns response.data directly.
      // We cast it here to satisfy TypeScript.
      const data = response as unknown as Process[];
      setProcesses(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch processes');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [setProcesses]);

  const terminateProcess = useCallback(async (pid: number) => {
    try {
      // 1. Confirm kill
      await SystemAPI.confirmKill(pid);
      // 2. Execute kill
      await SystemAPI.executeKill(pid);
      
      // Local mutation: remove process immediately from state without waiting for full refresh
      setProcesses(processes.filter(p => p.pid !== pid));
      return true;
    } catch (err: any) {
      console.error('Failed to terminate process:', err);
      // Throw to let the UI layer display a toast/alert
      throw err;
    }
  }, [processes, setProcesses]);

  return {
    processes,
    loading,
    error,
    refreshProcesses,
    terminateProcess
  };
}
