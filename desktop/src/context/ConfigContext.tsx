import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { SystemAPI } from '../services/api';

export interface Config {
  cpu_threshold: number;
  ram_threshold: number;
  disk_threshold: number;
  theme: string;
  sound_alerts: boolean;
  /** Process names Kavan will never terminate, by anyone. Lower-cased by the backend. */
  never_kill: string[];
  /** Process names Kavan records but does not announce. */
  never_alert: string[];
}

export type Theme = 'dark' | 'light';

// Thresholds and the sound toggle live on the backend (it evaluates alerts).
export type BackendSetting = 'cpu_threshold' | 'ram_threshold' | 'disk_threshold' | 'sound_alerts' | 'never_kill' | 'never_alert';
export type BackendSettingValue = number | boolean | string[];

export const DEFAULT_THRESHOLDS = {
  cpu_threshold: 90,
  ram_threshold: 90,
  disk_threshold: 95,
};

interface ConfigContextType {
  config: Config | null;
  isLoadingConfig: boolean;
  configError: string | null;
  reloadConfig: () => void;
  // Resolves false when the server rejected the change; the local value is rolled back.
  updateSetting: (key: BackendSetting, value: BackendSettingValue) => Promise<boolean>;
  resetThresholds: () => Promise<boolean>;
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

function readStoredTheme(): Theme {
  return localStorage.getItem('theme') === 'light' ? 'light' : 'dark';
}

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);
  // Mirrors the latest config so handlers can read the pre-change value synchronously
  const configRef = useRef<Config | null>(null);
  configRef.current = config;

  // Phase 5 Section 2.1: Boot Initialization
  useEffect(() => {
    let cancelled = false;
    setIsLoadingConfig(true);
    setConfigError(null);
    SystemAPI.fetchConfig()
      .then((data: any) => {
        if (cancelled) return;
        setConfig(data);
      })
      .catch(err => {
        if (cancelled) return;
        console.error('Failed to fetch config from backend', err);
        setConfigError('Could not load settings from the backend.');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingConfig(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  const reloadConfig = useCallback(() => setLoadAttempt(n => n + 1), []);

  // Phase 5 Section 2.2: Backend Persistence (optimistic, rolled back on failure)
  const updateSetting = useCallback(async (key: BackendSetting, value: BackendSettingValue): Promise<boolean> => {
    const previous = configRef.current?.[key];
    setConfig(prev => (prev ? { ...prev, [key]: value } : prev));

    try {
      await SystemAPI.updateThresholds({ [key]: value });
      return true;
    } catch (err) {
      console.error(`Failed to push ${key} update to server`, err);
      if (previous !== undefined) {
        setConfig(prev => (prev ? { ...prev, [key]: previous } : prev));
      }
      return false;
    }
  }, []);

  // Phase 5 Section 6.2: Visual Reset
  const resetThresholds = useCallback(async (): Promise<boolean> => {
    const previous = configRef.current;
    setConfig(prev => (prev ? { ...prev, ...DEFAULT_THRESHOLDS } : prev));

    try {
      await SystemAPI.updateThresholds(DEFAULT_THRESHOLDS);
      return true;
    } catch (err) {
      console.error('Failed to reset thresholds on server', err);
      if (previous) setConfig(previous);
      return false;
    }
  }, []);

  // Phase 5 Section 5.1: theme is client-side only. The class is also set
  // synchronously in index.html so there is no flash on boot.
  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    localStorage.setItem('theme', next);
    document.documentElement.classList.toggle('dark', next === 'dark');
  }, []);

  return (
    <ConfigContext.Provider value={{
      config,
      isLoadingConfig,
      configError,
      reloadConfig,
      updateSetting,
      resetThresholds,
      theme,
      setTheme,
    }}>
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
