import { useEffect, useState } from 'react';
import { useConfig, DEFAULT_THRESHOLDS } from '../context/ConfigContext';
import { useToast } from '../context/ToastContext';
import { Loader2, RotateCcw, RefreshCw } from 'lucide-react';

type ThresholdKey = 'cpu_threshold' | 'ram_threshold' | 'disk_threshold';

const SAVE_DEBOUNCE_MS = 500; // Phase 5 §4.1: one request after the user stops moving the slider

// Local slider value for smooth dragging, persisted to the backend once it settles.
function useThresholdSlider(key: ThresholdKey, label: string, saved: number | undefined) {
  const { updateSetting } = useConfig();
  const { addToast } = useToast();
  const [value, setValue] = useState<number>(DEFAULT_THRESHOLDS[key]);

  // Server-side changes (initial load, rollback after a failed save, reset) take over the slider
  useEffect(() => {
    if (saved !== undefined) setValue(saved);
  }, [saved]);

  useEffect(() => {
    if (saved === undefined || value === saved) return;
    const timer = setTimeout(async () => {
      const ok = await updateSetting(key, value);
      if (!ok) addToast(`Could not save ${label}. The previous value was restored.`, 'warning');
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value, saved, key, label, updateSetting, addToast]);

  return [value, setValue] as const;
}

export function Settings() {
  const { config, isLoadingConfig, configError, reloadConfig, updateSetting, resetThresholds, theme, setTheme } = useConfig();
  const { addToast } = useToast();

  const [cpu, setCpu] = useThresholdSlider('cpu_threshold', 'CPU threshold', config?.cpu_threshold);
  const [ram, setRam] = useThresholdSlider('ram_threshold', 'memory threshold', config?.ram_threshold);
  const [disk, setDisk] = useThresholdSlider('disk_threshold', 'disk threshold', config?.disk_threshold);

  const soundAlerts = config?.sound_alerts ?? true;
  const isDarkTheme = theme === 'dark';

  const handleReset = async () => {
    // Setting the sliders first cancels any save still waiting in the debounce window
    setCpu(DEFAULT_THRESHOLDS.cpu_threshold);
    setRam(DEFAULT_THRESHOLDS.ram_threshold);
    setDisk(DEFAULT_THRESHOLDS.disk_threshold);
    const ok = await resetThresholds();
    if (!ok) addToast('Could not reset thresholds. The previous values were restored.', 'warning');
  };

  const toggleSound = async () => {
    const ok = await updateSetting('sound_alerts', !soundAlerts);
    if (!ok) addToast('Could not save the sound setting. It was reverted.', 'warning');
  };

  const sliders: { key: ThresholdKey; label: string; value: number; set: (v: number) => void }[] = [
    { key: 'cpu_threshold', label: 'CPU Usage Warning', value: cpu, set: setCpu },
    { key: 'ram_threshold', label: 'Memory Usage Warning', value: ram, set: setRam },
    { key: 'disk_threshold', label: 'Disk Usage Warning', value: disk, set: setDisk },
  ];

  return (
    <div className="flex flex-col space-y-8 max-w-4xl w-full h-full pb-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-text-primary">Settings</h1>
        <p className="text-text-secondary mt-1">Configure system alerts and application preferences.</p>
      </div>

      <div className="space-y-6">
        {/* Card 1: Alert Thresholds */}
        <div className="bg-bg-secondary border border-border rounded-lg overflow-hidden shadow-xs">
          <div className="px-6 py-5 border-b border-border bg-bg-tertiary/40 flex justify-between items-center">
            <div>
              <h2 className="text-sm font-medium text-text-primary tracking-wide uppercase">Alert Thresholds</h2>
              <p className="text-xs text-text-secondary mt-1">Adjust when Kavan should warn you about resource usage.</p>
            </div>
            <button
              onClick={handleReset}
              disabled={!config}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-input-bg hover:bg-hover-bg border border-border rounded-md text-text-secondary hover:text-text-primary transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title="Reset to Safe Defaults"
            >
              <RotateCcw size={14} />
              Reset Defaults
            </button>
          </div>

          {isLoadingConfig && !config && (
            <div className="p-6 flex items-center gap-3 text-sm text-text-secondary">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading settings from the backend...
            </div>
          )}

          {!isLoadingConfig && !config && (
            <div className="p-6 flex items-center justify-between gap-4">
              <p className="text-sm text-red-600 dark:text-red-400">{configError ?? 'Settings are unavailable.'}</p>
              <button
                onClick={reloadConfig}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-input-bg hover:bg-hover-bg border border-border rounded-md text-text-primary transition-colors cursor-pointer"
              >
                <RefreshCw size={14} />
                Retry
              </button>
            </div>
          )}

          {config && (
            <div className="p-6 space-y-6">
              {sliders.map(({ key, label, value, set }) => (
                <div key={key}>
                  <div className="flex justify-between items-center mb-2">
                    <label htmlFor={key} className="text-sm font-medium text-text-primary">{label}</label>
                    <span className="text-sm font-mono text-text-secondary bg-input-bg px-2 py-1 rounded border border-border">{value}%</span>
                  </div>
                  <input
                    id={key}
                    type="range"
                    min={0}
                    max={100}
                    value={value}
                    onChange={(e) => set(Number(e.target.value))}
                    className="w-full accent-accent cursor-pointer"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Card 2: Appearance (client-side only, Phase 5 §5.1) */}
        <div className="bg-bg-secondary border border-border rounded-lg overflow-hidden shadow-xs">
          <div className="px-6 py-5 border-b border-border bg-bg-tertiary/40">
            <h2 className="text-sm font-medium text-text-primary tracking-wide uppercase">Appearance</h2>
          </div>
          <div className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-text-primary">Dark Theme</label>
                <p className="text-xs text-text-secondary mt-1">Toggle between light and dark UI.</p>
              </div>
              <button
                role="switch"
                aria-checked={isDarkTheme}
                onClick={() => setTheme(isDarkTheme ? 'light' : 'dark')}
                className={`w-11 h-6 rounded-full transition-colors relative flex items-center cursor-pointer ${isDarkTheme ? 'bg-accent' : 'bg-switch-off border border-border'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white shadow-xs absolute top-1 transition-transform ${isDarkTheme ? 'left-6' : 'left-1'}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Card 3: System Integrations */}
        <div className="bg-bg-secondary border border-border rounded-lg overflow-hidden shadow-xs">
          <div className="px-6 py-5 border-b border-border bg-bg-tertiary/40">
            <h2 className="text-sm font-medium text-text-primary tracking-wide uppercase">System Integrations</h2>
          </div>
          <div className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-text-primary">Enable Sound Notifications</label>
                <p className="text-xs text-text-secondary mt-1">Play an alert chime when a threshold is breached.</p>
              </div>
              <button
                role="switch"
                aria-checked={soundAlerts}
                onClick={toggleSound}
                disabled={!config}
                className={`w-11 h-6 rounded-full transition-colors relative flex items-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${soundAlerts ? 'bg-accent' : 'bg-switch-off border border-border'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white shadow-xs absolute top-1 transition-transform ${soundAlerts ? 'left-6' : 'left-1'}`} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
