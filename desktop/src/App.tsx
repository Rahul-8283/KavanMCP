import { useEffect } from "react";
import { MainLayout } from "./components/layout/MainLayout";
import { useWebSocketConnection } from "./hooks/useWebSocketConnection";
import { useMetrics } from "./context/MetricsContext";
import { GaugeCard } from "./components/dashboard/GaugeCard";
import { Cpu, Activity, HardDrive, RefreshCw } from "lucide-react";
import { useProcessManager } from "./hooks/useProcessManager";
import { ProcessTable } from "./components/dashboard/ProcessTable";

function App() {
  useWebSocketConnection(); // Start the WebSocket pipeline globally
  const { metrics, status } = useMetrics();
  const { fetchProcesses, isLoading } = useProcessManager();
  
  const isOffline = status !== 'CONNECTED';

  // Initial fetch of processes
  useEffect(() => {
    fetchProcesses();
  }, [fetchProcesses]);

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

        <div>
          {/* Live Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <GaugeCard 
              title="CPU Usage" 
              value={metrics.cpu} 
              icon={<Cpu size={16} />} 
              isOffline={isOffline}
            />
            <GaugeCard 
              title="Memory Usage" 
              value={metrics.ram} 
              icon={<Activity size={16} />} 
              isOffline={isOffline}
            />
            <GaugeCard 
              title="Disk Usage" 
              value={metrics.disk} 
              icon={<HardDrive size={16} />} 
              isOffline={isOffline}
            />
          </div>
          {metrics.lastUpdated && (
            <div className="text-right text-xs text-text-secondary opacity-50 mt-3 tracking-wide">
              Last updated: {new Date(metrics.lastUpdated).toLocaleTimeString()}
            </div>
          )}
        </div>

        {/* Process Table Section */}
        <div className="flex-1 bg-bg-secondary border border-border rounded-lg overflow-hidden flex flex-col min-h-0">
          <div className="px-6 py-5 border-b border-border bg-bg-secondary/50 flex justify-between items-center">
            <h2 className="text-sm font-medium text-text-primary tracking-wide uppercase">Monitored Processes</h2>
            <button 
              onClick={fetchProcesses}
              disabled={isLoading}
              className="p-1.5 rounded-md hover:bg-white/10 text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
              title="Refresh Processes"
            >
              <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
            </button>
          </div>
          
          <ProcessTable />
        </div>
      </div>
    </MainLayout>
  );
}

export default App;
