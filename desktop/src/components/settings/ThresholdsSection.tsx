import type { CSSProperties } from 'react';
import { Loader2, RefreshCw, RotateCcw } from 'lucide-react';
import { DEFAULT_THRESHOLDS, useConfig } from '../../context/ConfigContext';
import { useToast } from '../../context/ToastContext';
import { SettingsSection } from './SettingsSection';
import { useDebouncedSetting } from './useDebouncedSetting';

type ThresholdKey = 'cpu_threshold' | 'ram_threshold' | 'disk_threshold';

export function ThresholdsSection() {
  const { config, isLoadingConfig, configError, reloadConfig, resetThresholds } = useConfig();
  const { addToast } = useToast();

  const [cpu, setCpu] = useDebouncedSetting('cpu_threshold', 'CPU threshold', config?.cpu_threshold, DEFAULT_THRESHOLDS.cpu_threshold);
  const [ram, setRam] = useDebouncedSetting('ram_threshold', 'memory threshold', config?.ram_threshold, DEFAULT_THRESHOLDS.ram_threshold);
  const [disk, setDisk] = useDebouncedSetting('disk_threshold', 'disk threshold', config?.disk_threshold, DEFAULT_THRESHOLDS.disk_threshold);

  const handleReset = async () => {
    // Setting the sliders first cancels any save still waiting in the debounce window
    setCpu(DEFAULT_THRESHOLDS.cpu_threshold);
    setRam(DEFAULT_THRESHOLDS.ram_threshold);
    setDisk(DEFAULT_THRESHOLDS.disk_threshold);
    const ok = await resetThresholds();
    if (!ok) addToast('Could not reset thresholds. The previous values were restored.', 'warning');
  };

  const sliders: { key: ThresholdKey; label: string; value: number; set: (v: number) => void }[] = [
    { key: 'cpu_threshold', label: 'CPU Usage Warning', value: cpu, set: setCpu },
    { key: 'ram_threshold', label: 'Memory Usage Warning', value: ram, set: setRam },
    { key: 'disk_threshold', label: 'Disk Usage Warning', value: disk, set: setDisk },
  ];

  return (
    <SettingsSection
      title="Alert Thresholds"
      description="Adjust when Kavan should warn you about resource usage."
      action={
        <button onClick={handleReset} disabled={!config} className="btn shrink-0" title="Reset to Safe Defaults">
          <RotateCcw size={14} />
          Reset Defaults
        </button>
      }
    >
      {isLoadingConfig && !config && (
        <div className="flex items-center gap-3 px-5 py-6 text-[0.8125rem] text-ink-soft">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading settings from the backend...
        </div>
      )}

      {!isLoadingConfig && !config && (
        <div className="flex items-center justify-between gap-4 px-5 py-6">
          <p className="text-[0.8125rem] text-crimson-ink">{configError ?? 'Settings are unavailable.'}</p>
          <button onClick={reloadConfig} className="btn shrink-0">
            <RefreshCw size={14} />
            Retry
          </button>
        </div>
      )}

      {config && (
        <div className="divide-y divide-line-faint">
          {sliders.map(({ key, label, value, set }) => (
            <div key={key} className="grid grid-cols-[10.5rem_1fr_3rem] items-center gap-5 px-5 py-4">
              <label htmlFor={key} className="text-[0.8125rem] font-medium text-ink">{label}</label>
              <input
                id={key}
                type="range"
                min={0}
                max={100}
                value={value}
                onChange={(e) => set(Number(e.target.value))}
                className="range"
                style={{ '--fill': `${value}%` } as CSSProperties}
              />
              <span className="tnum text-right font-display text-[0.9375rem] text-ink">{value}%</span>
            </div>
          ))}
        </div>
      )}
    </SettingsSection>
  );
}
