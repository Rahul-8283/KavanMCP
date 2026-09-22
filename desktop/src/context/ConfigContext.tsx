import React, { createContext, useContext, useState, useEffect } from 'react';
import { SystemAPI } from '../services/api';

interface Config {
  cpu_threshold: number;
  ram_threshold: number;
  disk_threshold: number;
  theme: string;
  sound_alerts: boolean;
}

interface ConfigContextType {
  config: Config | null;
  isLoadingConfig: boolean;
  updateThreshold: (key: keyof Config, value: number) => Promise<void>;
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);

  // Phase 5 Section 2.1: Boot Initialization
  useEffect(() => {
    SystemAPI.fetchConfig()
      .then((data: any) => {
        setConfig(data);
        setIsLoadingConfig(false);
      })
      .catch(err => {
        console.error("Failed to fetch config from backend", err);
        setIsLoadingConfig(false);
      });
  }, []);

  // Phase 5 Section 2.2: Backend Persistence
  const updateThreshold = async (key: keyof Config, value: number) => {
    // Optimistic UI update so it feels instant
    setConfig(prev => prev ? { ...prev, [key]: value } : null);
    
    try {
      await SystemAPI.updateThresholds({
        [key]: value
      });
    } catch (err) {
      console.error(`Failed to push ${key} update to server`, err);
    }
  };

  return (
    <ConfigContext.Provider value={{ config, isLoadingConfig, updateThreshold }}>
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
