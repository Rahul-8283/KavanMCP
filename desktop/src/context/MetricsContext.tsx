import { createContext, useContext, useState, ReactNode } from 'react';

interface MetricsState {
  cpu: number;
  ram: number;
  disk: number;
  lastUpdated: string;
}

interface MetricsContextType {
  metrics: MetricsState;
  updateMetrics: (newMetrics: Partial<MetricsState>) => void;
}

const MetricsContext = createContext<MetricsContextType | undefined>(undefined);

export function MetricsProvider({ children }: { children: ReactNode }) {
  const [metrics, setMetrics] = useState<MetricsState>({ cpu: 0, ram: 0, disk: 0, lastUpdated: new Date().toISOString() });

  const updateMetrics = (newMetrics: Partial<MetricsState>) => {
    setMetrics(prev => ({ ...prev, ...newMetrics, lastUpdated: new Date().toISOString() }));
  };

  return (
    <MetricsContext.Provider value={{ metrics, updateMetrics }}>
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
