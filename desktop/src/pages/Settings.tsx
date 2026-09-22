import { useState } from 'react';

export function Settings() {
  // Local state for sliders (skipping Section 4/5 network and local storage integration)
  const [cpuThreshold, setCpuThreshold] = useState(90);
  const [ramThreshold, setRamThreshold] = useState(90);
  const [diskThreshold, setDiskThreshold] = useState(95);

  return (
    <div className="flex flex-col space-y-8 max-w-4xl w-full h-full pb-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-text-primary">Settings</h1>
        <p className="text-text-secondary mt-1">Configure system alerts and application preferences.</p>
      </div>

      <div className="space-y-6">
        {/* Card 1: Alert Thresholds */}
        <div className="bg-bg-secondary border border-border rounded-lg overflow-hidden">
          <div className="px-6 py-5 border-b border-border bg-bg-secondary/50">
            <h2 className="text-sm font-medium text-text-primary tracking-wide uppercase">Alert Thresholds</h2>
            <p className="text-xs text-text-secondary mt-1">Adjust when Kavan should warn you about resource usage.</p>
          </div>
          <div className="p-6 space-y-6">
            
            {/* CPU Slider */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-medium text-text-primary">CPU Usage Warning</label>
                <span className="text-sm font-mono text-text-secondary bg-black/20 px-2 py-1 rounded border border-border/50">{cpuThreshold}%</span>
              </div>
              <input 
                type="range" 
                min="0" max="100" 
                value={cpuThreshold}
                onChange={(e) => setCpuThreshold(Number(e.target.value))}
                className="w-full accent-white"
              />
            </div>

            {/* RAM Slider */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-medium text-text-primary">Memory Usage Warning</label>
                <span className="text-sm font-mono text-text-secondary bg-black/20 px-2 py-1 rounded border border-border/50">{ramThreshold}%</span>
              </div>
              <input 
                type="range" 
                min="0" max="100" 
                value={ramThreshold}
                onChange={(e) => setRamThreshold(Number(e.target.value))}
                className="w-full accent-white"
              />
            </div>

            {/* Disk Slider */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-medium text-text-primary">Disk Usage Warning</label>
                <span className="text-sm font-mono text-text-secondary bg-black/20 px-2 py-1 rounded border border-border/50">{diskThreshold}%</span>
              </div>
              <input 
                type="range" 
                min="0" max="100" 
                value={diskThreshold}
                onChange={(e) => setDiskThreshold(Number(e.target.value))}
                className="w-full accent-white"
              />
            </div>

          </div>
        </div>

        {/* Card 2: Appearance (Placeholder for Section 5) */}
        <div className="bg-bg-secondary border border-border rounded-lg overflow-hidden">
          <div className="px-6 py-5 border-b border-border bg-bg-secondary/50">
            <h2 className="text-sm font-medium text-text-primary tracking-wide uppercase">Appearance</h2>
          </div>
          <div className="p-6">
            <p className="text-sm text-text-secondary italic">Theme settings will be implemented in Section 5.</p>
          </div>
        </div>

        {/* Card 3: System Integrations (Placeholder for Section 5) */}
        <div className="bg-bg-secondary border border-border rounded-lg overflow-hidden">
          <div className="px-6 py-5 border-b border-border bg-bg-secondary/50">
            <h2 className="text-sm font-medium text-text-primary tracking-wide uppercase">System Integrations</h2>
          </div>
          <div className="p-6">
            <p className="text-sm text-text-secondary italic">Sound alerts will be implemented in Section 5.</p>
          </div>
        </div>
        
      </div>
    </div>
  );
}
