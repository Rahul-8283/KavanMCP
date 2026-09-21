import { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { ConnectionStatus } from '../hooks/useWebSocketConnection';

interface MetricsState {
  cpu: number;
  ram: number;
  disk: number;
  lastUpdated: string | null;
}

interface MetricsContextType {
  metrics: MetricsState;
  updateMetrics: (newMetrics: Partial<MetricsState>) => void;
  status: ConnectionStatus;
  setStatus: (status: ConnectionStatus) => void;
}

const MetricsContext = createContext<MetricsContextType | undefined>(undefined);

export function MetricsProvider({ children }: { children: ReactNode }) {
  const [metrics, setMetrics] = useState<MetricsState>({ cpu: 0, ram: 0, disk: 0, lastUpdated: null });
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);

  const updateMetrics = useCallback((newMetrics: Partial<MetricsState>) => {
    setMetrics(prev => ({ 
        ...prev, 
        ...newMetrics, 
        // If a real timestamp came from backend, use it; else fallback
        lastUpdated: newMetrics.lastUpdated !== undefined ? newMetrics.lastUpdated : new Date().toISOString() 
    }));
  }, []);

  return (
    <MetricsContext.Provider value={{ metrics, updateMetrics, status, setStatus }}>
      {children}
    </MetricsContext.Provider>
  );
}

export function useMetrics() {
  const context = useContext(MetricsContext);
  if (context === undefined) {
    throw new Error('useMetrics must be used within a MetricsProvider');
  }
  return context;
}
