import { createContext, useContext, useState, ReactNode } from 'react';

interface ConfigState {
  theme: 'dark' | 'light';
  cpuAlertThreshold: number;
  ramAlertThreshold: number;
}

interface ConfigContextType {
  config: ConfigState;
  updateConfig: (newConfig: Partial<ConfigState>) => void;
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<ConfigState>({
    theme: 'dark', 
    cpuAlertThreshold: 90,
    ramAlertThreshold: 90,
  });

  const updateConfig = (newConfig: Partial<ConfigState>) => {
    setConfig(prev => ({ ...prev, ...newConfig }));
  };

  return (
    <ConfigContext.Provider value={{ config, updateConfig }}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig() {
  const context = useContext(ConfigContext);
  if (context === undefined) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return context;
}
