import { CSSProperties, useEffect, useState } from 'react';
import { useConfig, DEFAULT_THRESHOLDS, Theme } from '../context/ConfigContext';
import { useToast } from '../context/ToastContext';
import { Switch } from '../components/common/Switch';
import { Loader2, RotateCcw, RefreshCw } from 'lucide-react';
import { SettingsSection } from '../components/settings/SettingsSection';
import { ProtectedApps } from '../components/settings/ProtectedApps';
import { StartupSection } from '../components/settings/StartupSection';

type ThresholdKey = 'cpu_threshold' | 'ram_threshold' | 'disk_threshold';

const SAVE_DEBOUNCE_MS = 500; // Phase 5 §4.1: one request after the user stops moving the slider

const THEME_OPTIONS: { theme: Theme; label: string }[] = [
  { theme: 'dark', label: 'Dark' },
  { theme: 'light', label: 'Light' },
];

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

// A miniature of the app drawn in the given theme's own palette
function ThemePreview({ theme }: { theme: Theme }) {
  return (
    <div data-palette={theme} aria-hidden="true" className="flex h-[4.5rem] overflow-hidden rounded-md border border-line bg-canvas">
      <div className="flex w-6 flex-col items-center gap-1.5 border-r border-line bg-sidebar pt-2">
        <span className="h-2 w-2 rounded-full bg-crimson" />
        <span className="h-[3px] w-3 rounded-full bg-ink-faint" />
        <span className="h-[3px] w-3 rounded-full bg-line-strong" />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-2">
        <span className="h-1.5 w-12 rounded-full bg-ink" />
        <div className="flex gap-1.5">
          <span className="h-4 flex-1 rounded-sm border border-line bg-surface" />
          <span className="h-4 flex-1 rounded-sm border border-line bg-surface" />
          <span className="h-4 flex-1 rounded-sm border border-line bg-surface" />
        </div>
        <span className="flex-1 rounded-sm border border-line bg-surface" />
      </div>
    </div>
  );
}

export function Settings() {
  const { config, isLoadingConfig, configError, reloadConfig, updateSetting, resetThresholds, theme, setTheme } = useConfig();
  const { addToast } = useToast();

  const [cpu, setCpu] = useThresholdSlider('cpu_threshold', 'CPU threshold', config?.cpu_threshold);
  const [ram, setRam] = useThresholdSlider('ram_threshold', 'memory threshold', config?.ram_threshold);
  const [disk, setDisk] = useThresholdSlider('disk_threshold', 'disk threshold', config?.disk_threshold);

  const soundAlerts = config?.sound_alerts ?? true;

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
    <div className="@container w-full max-w-6xl">
      {/* Two columns when the page is wide enough, so everything is visible without scrolling */}
      <div className="grid items-start gap-5 @4xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-5">
          {/* Card 1: Alert Thresholds */}
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

          {/* Protected apps: the backend enforces these, the page only edits them */}
          <ProtectedApps />

          <StartupSection />

          {/* Card 3: System Integrations */}
          <SettingsSection title="System Integrations">
            <div className="flex items-center justify-between gap-6 px-5 py-4">
              <div>
                <p className="text-[0.8125rem] font-medium text-ink">Enable Sound Notifications</p>
                <p className="mt-0.5 text-xs text-ink-soft">Play an alert chime when a threshold is breached.</p>
              </div>
              <Switch checked={soundAlerts} onChange={toggleSound} disabled={!config} label="Enable Sound Notifications" />
            </div>
          </SettingsSection>
        </div>

        {/* Card 2: Appearance (client-side only, Phase 5 §5.1) */}
        <SettingsSection title="Appearance" description="Choose between the dark and light interface.">
          <div role="radiogroup" aria-label="Theme" className="grid max-w-md grid-cols-2 gap-4 p-5">
            {THEME_OPTIONS.map(({ theme: option, label }) => {
              const isSelected = theme === option;
              return (
                <button
                  key={option}
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setTheme(option)}
                  className={`rounded-lg border p-2 text-left transition-colors ${isSelected ? 'border-crimson bg-crimson-wash' : 'border-line hover:border-line-strong'}`}
                >
                  <ThemePreview theme={option} />
                  <span className="mt-2 flex items-center gap-2 px-0.5 text-[0.8125rem] font-medium text-ink">
                    <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-full border ${isSelected ? 'border-crimson' : 'border-line-strong'}`}>
                      {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-crimson" />}
                    </span>
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </SettingsSection>
      </div>
    </div>
  );
}
