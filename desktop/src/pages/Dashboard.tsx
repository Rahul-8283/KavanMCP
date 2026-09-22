import { useMetrics } from "../context/MetricsContext";
import { GaugeCard } from "../components/dashboard/GaugeCard";
import { Cpu, Activity, HardDrive, RefreshCw, Search, X } from "lucide-react";
import { useProcessManager } from "../hooks/useProcessManager";
import { useProcess } from "../context/ProcessContext";
import { ProcessTable } from "../components/dashboard/ProcessTable";
import { useEffect } from "react";

export function Dashboard() {
  const { metrics, status } = useMetrics();
  const { fetchProcesses, isLoading } = useProcessManager();
  const { filterTier, setFilterTier, searchQuery, setSearchQuery } = useProcess();
  
  const isOffline = status !== 'CONNECTED';

  // Initial fetch of processes
  useEffect(() => {
    fetchProcesses();
  }, [fetchProcesses]);

  return (
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
      <div className="flex-1 bg-bg-secondary border border-border rounded-lg overflow-hidden flex flex-col min-h-0 shadow-xs">
        <div className="px-6 py-5 border-b border-border bg-bg-tertiary/40 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h2 className="text-sm font-medium text-text-primary tracking-wide uppercase shrink-0">Monitored Processes</h2>
          
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-56">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
              <input 
                type="text" 
                placeholder="Search processes..." 
                className="w-full bg-input-bg border border-border rounded-md py-1.5 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-secondary/60 focus:outline-none focus:border-accent transition-colors"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <select 
              className="bg-input-bg border border-border rounded-md py-1.5 px-3 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors cursor-pointer"
              value={filterTier}
              onChange={(e) => setFilterTier(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
            >
              <option value="ALL" className="bg-bg-secondary text-text-primary">All Tiers</option>
              <option value={1} className="bg-bg-secondary text-text-primary">Tier 1 (Critical)</option>
              <option value={2} className="bg-bg-secondary text-text-primary">Tier 2 (Essential)</option>
              <option value={3} className="bg-bg-secondary text-text-primary">Tier 3 (Optional)</option>
              <option value={4} className="bg-bg-secondary text-text-primary">Tier 4 (Suspicious)</option>
            </select>

            {(filterTier !== 'ALL' || searchQuery !== '') && (
              <button
                onClick={() => {
                  setFilterTier('ALL');
                  setSearchQuery('');
                }}
                className="p-1.5 rounded-md hover:bg-hover-bg text-red-500 hover:text-red-600 transition-colors cursor-pointer"
                title="Clear Filters"
              >
                <X size={16} />
              </button>
            )}

            <div className="w-px h-5 bg-border mx-1 hidden md:block"></div>

            <button 
              onClick={fetchProcesses}
              disabled={isLoading}
              className="p-1.5 rounded-md hover:bg-hover-bg text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50 shrink-0 cursor-pointer"
              title="Refresh Processes"
            >
              <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
        
        <ProcessTable />
      </div>
    </div>
  );
}
