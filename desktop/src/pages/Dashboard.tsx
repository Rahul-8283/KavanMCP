import { useMetrics } from "../context/MetricsContext";
import { useConfig, DEFAULT_THRESHOLDS } from "../context/ConfigContext";
import { GaugeCard } from "../components/dashboard/GaugeCard";
import { Cpu, HardDrive, MemoryStick } from "lucide-react";
import { useProcessManager } from "../hooks/useProcessManager";
import { useProcess } from "../context/ProcessContext";
import { ProcessTable } from "../components/dashboard/ProcessTable";
import { useEffect, useRef } from "react";

export function Dashboard() {
  const { metrics, status } = useMetrics();
  const { config } = useConfig();
  const { fetchProcesses } = useProcessManager();
  const { error } = useProcess();

  const isOffline = status !== 'CONNECTED';
  // Until the saved thresholds arrive, the dials show the defaults the backend starts with
  const thresholds = config ?? DEFAULT_THRESHOLDS;

  // Initial fetch of processes
  useEffect(() => {
    fetchProcesses();
  }, [fetchProcesses]);

  // If the list failed to load while the backend was down, load it when the connection returns.
  // This reacts to the reconnect event only; the table is still never polled.
  const wasOffline = useRef(isOffline);
  useEffect(() => {
    if (wasOffline.current && !isOffline && error) {
      fetchProcesses();
    }
    wasOffline.current = isOffline;
  }, [isOffline, error, fetchProcesses]);

  return (
    <div className="flex h-full flex-col gap-5">
      {/* Live Metrics */}
      <div className="grid shrink-0 grid-cols-3 gap-4">
        <GaugeCard
          title="CPU Usage"
          value={metrics.cpu}
          threshold={thresholds.cpu_threshold}
          icon={<Cpu size={18} strokeWidth={1.5} />}
          isOffline={isOffline}
        />
        <GaugeCard
          title="Memory Usage"
          value={metrics.ram}
          threshold={thresholds.ram_threshold}
          icon={<MemoryStick size={18} strokeWidth={1.5} />}
          isOffline={isOffline}
        />
        <GaugeCard
          title="Disk Usage"
          value={metrics.disk}
          threshold={thresholds.disk_threshold}
          icon={<HardDrive size={18} strokeWidth={1.5} />}
          isOffline={isOffline}
        />
      </div>

      <ProcessTable onRefresh={fetchProcesses} />
    </div>
  );
}
