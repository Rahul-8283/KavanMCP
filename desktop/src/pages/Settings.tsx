import { useState, useEffect } from 'react';
import { useConfig } from '../context/ConfigContext';
import { Loader2, RotateCcw } from 'lucide-react';

export function Settings() {
  const { config, isLoadingConfig, updateThreshold, resetThresholds } = useConfig();

  // Local state for buttery smooth slider dragging
  const [cpuThreshold, setCpuThreshold] = useState(90);
  const [ramThreshold, setRamThreshold] = useState(90);
  const [diskThreshold, setDiskThreshold] = useState(95);

  // Local state for toggles
  const [isDarkTheme, setIsDarkTheme] = useState(() => {
    return localStorage.getItem('theme') !== 'light';
  });
  const [soundAlerts, setSoundAlerts] = useState(true);

  // Sync local state when config is fetched from the backend on boot
  useEffect(() => {
    if (config) {
      setCpuThreshold(config.cpu_threshold);
      setRamThreshold(config.ram_threshold);
      setDiskThreshold(config.disk_threshold);
      setSoundAlerts(config.sound_alerts ?? true);
    }
  }, [config]);

  // Network call triggered ONLY when dragging stops
  const handleMouseUp = (key: 'cpu_threshold' | 'ram_threshold' | 'disk_threshold', val: number) => {
    if (config && config[key] !== val) {
      updateThreshold(key, val);
    }
  };

  const toggleTheme = () => {
    const newTheme = !isDarkTheme;
    setIsDarkTheme(newTheme);
    if (newTheme) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      if (config) updateThreshold('theme' as any, 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
      if (config) updateThreshold('theme' as any, 'light');
    }
  };

  const toggleSound = () => {
    const newVal = !soundAlerts;
    setSoundAlerts(newVal);
    // Persist immediately to backend
    if (config) {
      updateThreshold('sound_alerts' as any, newVal);
    }
  };

  const handleReset = () => {
    setCpuThreshold(90);
    setRamThreshold(90);
    setDiskThreshold(95);
    resetThresholds();
  };

  if (isLoadingConfig) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-text-secondary opacity-50 p-12">
        <Loader2 className="w-8 h-8 animate-spin mb-4" />
        <p className="text-sm tracking-wide">Loading configuration...</p>
      </div>
    );
  }

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
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-input-bg hover:bg-hover-bg border border-border rounded-md text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
              title="Reset to Safe Defaults"
            >
              <RotateCcw size={14} />
              Reset Defaults
            </button>
          </div>
          <div className="p-6 space-y-6">
            
            {/* CPU Slider */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-medium text-text-primary">CPU Usage Warning</label>
                <span className="text-sm font-mono text-text-secondary bg-input-bg px-2 py-1 rounded border border-border">{cpuThreshold}%</span>
              </div>
              <input 
                type="range" 
                min="0" max="100" 
                value={cpuThreshold}
                onChange={(e) => setCpuThreshold(Number(e.target.value))}
                onMouseUp={() => handleMouseUp('cpu_threshold', cpuThreshold)}
                onTouchEnd={() => handleMouseUp('cpu_threshold', cpuThreshold)}
                className="w-full accent-accent cursor-pointer"
              />
            </div>

            {/* RAM Slider */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-medium text-text-primary">Memory Usage Warning</label>
                <span className="text-sm font-mono text-text-secondary bg-input-bg px-2 py-1 rounded border border-border">{ramThreshold}%</span>
              </div>
              <input 
                type="range" 
                min="0" max="100" 
                value={ramThreshold}
                onChange={(e) => setRamThreshold(Number(e.target.value))}
                onMouseUp={() => handleMouseUp('ram_threshold', ramThreshold)}
                onTouchEnd={() => handleMouseUp('ram_threshold', ramThreshold)}
                className="w-full accent-accent cursor-pointer"
              />
            </div>

            {/* Disk Slider */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-medium text-text-primary">Disk Usage Warning</label>
                <span className="text-sm font-mono text-text-secondary bg-input-bg px-2 py-1 rounded border border-border">{diskThreshold}%</span>
              </div>
              <input 
                type="range" 
                min="0" max="100" 
                value={diskThreshold}
                onChange={(e) => setDiskThreshold(Number(e.target.value))}
                onMouseUp={() => handleMouseUp('disk_threshold', diskThreshold)}
                onTouchEnd={() => handleMouseUp('disk_threshold', diskThreshold)}
                className="w-full accent-accent cursor-pointer"
              />
            </div>

          </div>
        </div>

        {/* Card 2: Appearance (Section 5.1) */}
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
                onClick={toggleTheme}
                className={`w-11 h-6 rounded-full transition-colors relative flex items-center cursor-pointer ${isDarkTheme ? 'bg-accent' : 'bg-switch-off border border-border'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white shadow-xs absolute top-1 transition-transform ${isDarkTheme ? 'left-6' : 'left-1'}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Card 3: System Integrations (Section 5.2) */}
        <div className="bg-bg-secondary border border-border rounded-lg overflow-hidden shadow-xs">
          <div className="px-6 py-5 border-b border-border bg-bg-tertiary/40">
            <h2 className="text-sm font-medium text-text-primary tracking-wide uppercase">System Integrations</h2>
          </div>
          <div className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-text-primary">Enable Sound Notifications</label>
                <p className="text-xs text-text-secondary mt-1">Play an alert chime when a critical threshold is breached.</p>
              </div>
              <button 
                onClick={toggleSound}
                className={`w-11 h-6 rounded-full transition-colors relative flex items-center cursor-pointer ${soundAlerts ? 'bg-accent' : 'bg-switch-off border border-border'}`}
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
