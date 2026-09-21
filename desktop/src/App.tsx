import { useEffect } from "react";
import { MainLayout } from "./components/layout/MainLayout";
import { useWebSocketConnection } from "./hooks/useWebSocketConnection";
import { useMetrics } from "./context/MetricsContext";
import { GaugeCard } from "./components/dashboard/GaugeCard";
import { Cpu, Activity, HardDrive } from "lucide-react";

function App() {
  useWebSocketConnection(); // Start the WebSocket pipeline globally
  const { metrics } = useMetrics();

  useEffect(() => {
    // Clear any lingering CSS zoom property from previous HMR states
    (document.body.style as any).zoom = '';
    
    let currentSize = 16; // Default browser font-size in px

    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Ctrl (Windows/Linux) or Cmd (Mac)
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          currentSize = Math.min(currentSize + 1, 24);
          document.documentElement.style.fontSize = `${currentSize}px`;
        } else if (e.key === '-') {
          e.preventDefault();
          currentSize = Math.max(currentSize - 1, 10);
          document.documentElement.style.fontSize = `${currentSize}px`;
        } else if (e.key === '0') {
          e.preventDefault();
          currentSize = 16;
          document.documentElement.style.fontSize = `${currentSize}px`;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  return (
    <MainLayout>
      <div className="flex flex-col space-y-8 max-w-7xl mx-auto w-full h-full">
        
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-text-primary">System Overview</h1>
          <p className="text-text-secondary mt-1">Real-time telemetry and process intelligence.</p>
        </div>

        {/* Live Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <GaugeCard 
            title="CPU Usage" 
            value={metrics.cpu} 
            icon={<Cpu size={16} />} 
          />
          <GaugeCard 
            title="Memory Usage" 
            value={metrics.ram} 
            icon={<Activity size={16} />} 
          />
          <GaugeCard 
            title="Disk Usage" 
            value={metrics.disk} 
            icon={<HardDrive size={16} />} 
          />
        </div>

        {/* Process Table Mock */}
        <div className="flex-1 bg-bg-secondary border border-border rounded-lg overflow-hidden flex flex-col min-h-0">
          <div className="px-6 py-5 border-b border-border bg-bg-secondary/50">
            <h2 className="text-sm font-medium text-text-primary tracking-wide uppercase">Monitored Processes</h2>
          </div>
          
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead>
                <tr className="border-b border-border/50 text-xs uppercase tracking-widest text-text-secondary bg-black/20">
                  <th className="px-6 py-4 font-medium">Process Name</th>
                  <th className="px-6 py-4 font-medium">PID</th>
                  <th className="px-6 py-4 font-medium">CPU (%)</th>
                  <th className="px-6 py-4 font-medium">Memory (MB)</th>
                  <th className="px-6 py-4 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-border/50">
                <tr className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4 font-medium text-text-primary">Code.exe</td>
                  <td className="px-6 py-4 text-text-secondary font-mono text-xs">14208</td>
                  <td className="px-6 py-4 text-text-primary">12.4</td>
                  <td className="px-6 py-4 text-text-primary">450.2</td>
                  <td className="px-6 py-4 text-right">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-sm text-[10px] font-medium tracking-widest uppercase bg-green-500/10 text-green-400 border border-green-500/20">Running</span>
                  </td>
                </tr>
                <tr className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4 font-medium text-text-primary">chrome.exe</td>
                  <td className="px-6 py-4 text-text-secondary font-mono text-xs">9844</td>
                  <td className="px-6 py-4 text-text-primary">8.1</td>
                  <td className="px-6 py-4 text-text-primary">1024.5</td>
                  <td className="px-6 py-4 text-right">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-sm text-[10px] font-medium tracking-widest uppercase bg-green-500/10 text-green-400 border border-green-500/20">Running</span>
                  </td>
                </tr>
                <tr className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4 font-medium text-text-primary">python.exe</td>
                  <td className="px-6 py-4 text-text-secondary font-mono text-xs">3392</td>
                  <td className="px-6 py-4 text-text-primary">0.5</td>
                  <td className="px-6 py-4 text-text-primary">64.0</td>
                  <td className="px-6 py-4 text-right">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-sm text-[10px] font-medium tracking-widest uppercase bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">Sleeping</span>
                  </td>
                </tr>
                <tr className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4 font-medium text-text-primary">docker-desktop.exe</td>
                  <td className="px-6 py-4 text-text-secondary font-mono text-xs">11204</td>
                  <td className="px-6 py-4 text-text-primary">3.2</td>
                  <td className="px-6 py-4 text-text-primary">2048.8</td>
                  <td className="px-6 py-4 text-right">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-sm text-[10px] font-medium tracking-widest uppercase bg-green-500/10 text-green-400 border border-green-500/20">Running</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}

export default App;
