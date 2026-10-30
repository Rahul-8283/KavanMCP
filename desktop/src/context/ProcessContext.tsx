import { createContext, useContext, useState, ReactNode, useCallback } from 'react';

export interface Process {
  pid: number;
  name: string;
  cpu_percent: number;
  memory_mb: number;
  tier: number;
  is_headless?: boolean;
  anomaly_flags?: string[];
  create_time?: number;
  /** On the user's never-kill list, from the backend */
  protected?: boolean;
}

interface ProcessContextType {
  processes: Process[];
  setProcesses: (processes: Process[]) => void;
  removeProcess: (pid: number) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;
  sortConfig: { key: string; direction: 'asc' | 'desc' } | null;
  setSortConfig: (config: { key: string; direction: 'asc' | 'desc' } | null) => void;
  filterTier: number | 'ALL';
  setFilterTier: (tier: number | 'ALL') => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

const ProcessContext = createContext<ProcessContextType | undefined>(undefined);

export function ProcessProvider({ children }: { children: ReactNode }) {
  const [processes, setProcesses] = useState<Process[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [filterTier, setFilterTier] = useState<number | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Phase 8 optimistic deletion: drop one row locally instead of re-fetching 500+ processes
  const removeProcess = useCallback((pid: number) => {
    setProcesses(prev => prev.filter(p => p.pid !== pid));
  }, []);

  return (
    <ProcessContext.Provider value={{
      processes, setProcesses, removeProcess,
      isLoading, setIsLoading,
      error, setError,
      sortConfig, setSortConfig,
      filterTier, setFilterTier,
      searchQuery, setSearchQuery 
    }}>
      {children}
    </ProcessContext.Provider>
  );
}

export function useProcess() {
  const context = useContext(ProcessContext);
  if (context === undefined) {
    throw new Error('useProcess must be used within a ProcessProvider');
  }
  return context;
}
