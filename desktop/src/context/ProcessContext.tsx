import { createContext, useContext, useState, ReactNode } from 'react';

export interface Process {
  pid: number;
  name: string;
  cpu_percent: number;
  memory_mb: number;
  status: string;
}

interface ProcessContextType {
  processes: Process[];
  setProcesses: (processes: Process[]) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;
  sortConfig: { key: keyof Process; direction: 'asc' | 'desc' };
  setSortConfig: (config: { key: keyof Process; direction: 'asc' | 'desc' }) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

const ProcessContext = createContext<ProcessContextType | undefined>(undefined);

export function ProcessProvider({ children }: { children: ReactNode }) {
  const [processes, setProcesses] = useState<Process[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: keyof Process; direction: 'asc' | 'desc' }>({ key: 'cpu_percent', direction: 'desc' });
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <ProcessContext.Provider value={{ 
      processes, setProcesses, 
      isLoading, setIsLoading,
      error, setError,
      sortConfig, setSortConfig,
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
