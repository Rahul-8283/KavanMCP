import type { ReactNode } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { useConfig } from '../../context/ConfigContext';

/**
 * The body of a section whose values live on the backend. Until they load it shows a spinner,
 * and if they cannot be loaded, the reason and a Retry button.
 */
export function ConfigGate({ children }: { children: ReactNode }) {
  const { config, isLoadingConfig, configError, reloadConfig } = useConfig();

  if (config) return <>{children}</>;

  if (isLoadingConfig) {
    return (
      <div className="flex items-center gap-3 px-5 py-6 text-[0.8125rem] text-ink-soft">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading settings from the backend...
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-4 px-5 py-6">
      <p className="text-[0.8125rem] text-crimson-ink">{configError ?? 'Settings are unavailable.'}</p>
      <button onClick={reloadConfig} className="btn shrink-0">
        <RefreshCw size={14} />
        Retry
      </button>
    </div>
  );
}
