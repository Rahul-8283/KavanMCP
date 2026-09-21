import { useProcess } from '../../context/ProcessContext';
import { Loader2 } from 'lucide-react';
import { TierBadge } from './TierBadge';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';

export function ProcessTable() {
  const { processes, isLoading } = useProcess();
  const parentRef = useRef<HTMLDivElement>(null);

  // Initialize the Row Virtualizer to guarantee 60 FPS scrolling even with 10,000+ processes
  const rowVirtualizer = useVirtualizer({
    count: processes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 53, // Approximate pixel height of one row
    overscan: 10, // Render 10 rows outside the visible viewport to prevent flickering when scrolling fast
  });

  if (isLoading && processes.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-text-secondary opacity-50 p-12">
        <Loader2 className="w-8 h-8 animate-spin mb-4" />
        <p className="text-sm tracking-wide">Scanning system processes...</p>
      </div>
    );
  }

  if (processes.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-text-secondary opacity-50 p-12">
        <p className="text-sm tracking-wide">No processes found.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Table Header (Fixed) */}
      <div className="flex text-xs uppercase tracking-widest text-text-secondary bg-black/20 border-b border-border/50 pr-3">
        <div className="px-6 py-4 font-medium w-[30%]">Process Name</div>
        <div className="px-6 py-4 font-medium w-[15%]">PID</div>
        <div className="px-6 py-4 font-medium w-[15%]">CPU (%)</div>
        <div className="px-6 py-4 font-medium w-[20%]">Memory (MB)</div>
        <div className="px-6 py-4 font-medium text-right w-[20%]">Security Tier</div>
      </div>

      {/* Table Body (Virtualized) */}
      <div ref={parentRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        <div
          className="relative w-full"
          style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const proc = processes[virtualRow.index];
            return (
              <div
                key={`${proc.pid}-${proc.name}`}
                className="absolute top-0 left-0 w-full flex items-center text-sm border-b border-border/20 hover:bg-white/[0.02] transition-colors"
                style={{
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div className="px-6 py-4 font-medium text-text-primary truncate w-[30%]" title={proc.name}>
                  {proc.name}
                </div>
                <div className="px-6 py-4 text-text-secondary font-mono text-xs w-[15%]">
                  {proc.pid}
                </div>
                <div className="px-6 py-4 text-text-primary w-[15%]">
                  {proc.cpu_percent.toFixed(1)}
                </div>
                <div className="px-6 py-4 text-text-primary w-[20%]">
                  {proc.memory_mb.toFixed(1)}
                </div>
                <div className="px-6 py-4 text-right w-[20%]">
                  <TierBadge tier={proc.tier} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
