import { useCallback } from 'react';
import axios from 'axios';
import { useProcess } from '../context/ProcessContext';

export function useProcessManager() {
  const { setProcesses, setIsLoading, setError, isLoading } = useProcess();

  const fetchProcesses = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await axios.get('http://localhost:8000/api/list_processes');
      setProcesses(response.data);
    } catch (err: any) {
      console.error('Failed to fetch processes:', err);
      setError(err.message || 'Failed to fetch processes');
    } finally {
      setIsLoading(false);
    }
  }, [setProcesses, setIsLoading, setError]);

  return { fetchProcesses, isLoading };
}
