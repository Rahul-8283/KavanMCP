import { useProcess, Process } from '../../context/ProcessContext';
import { Loader2, ChevronUp, ChevronDown } from 'lucide-react';
import { TierBadge } from './TierBadge';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef, useMemo } from 'react';

export function ProcessTable() {
  const { processes, isLoading, filterTier, setFilterTier, sortConfig, setSortConfig, searchQuery, setSearchQuery } = useProcess();
  const parentRef = useRef<HTMLDivElement>(null);

  const handleSort = (key: string) => {
    if (sortConfig?.key === key) {
      setSortConfig({ key, direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' });
    } else {
      setSortConfig({ key, direction: 'desc' });
    }
  };

  const renderSortIcon = (key: string) => {
    if (sortConfig?.key !== key) return null;
    return sortConfig.direction === 'asc' ? <ChevronUp size={14} className="ml-1" /> : <ChevronDown size={14} className="ml-1" />;
  };

  const processedData = useMemo(() => {
    let data = [...processes];

    // 1. Search Query Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      data = data.filter(p => p.name.toLowerCase().includes(q));
    }

    // 2. Tier Filter
    if (filterTier !== 'ALL') {
      data = data.filter(p => p.tier === filterTier);
    }

    // 3. Sorting
    if (sortConfig) {
      data.sort((a: Process, b: Process) => {
        const key = sortConfig.key as keyof Process;
        const valA = a[key];
        const valB = b[key];
        
        let comparison = 0;
        
        if (typeof valA === 'string' && typeof valB === 'string') {
          comparison = valA.localeCompare(valB);
        } else if (typeof valA === 'number' && typeof valB === 'number') {
          comparison = valA - valB;
        }

        // Tie-breaker: If values match perfectly (e.g. 0.0 CPU), fallback to alphabetical sorting
        if (comparison === 0 && sortConfig.key !== 'name') {
           comparison = a.name.localeCompare(b.name);
        }

        return sortConfig.direction === 'asc' ? comparison : -comparison;
      });
    }

    return data;
  }, [processes, filterTier, sortConfig, searchQuery]);

  // Initialize the Row Virtualizer to guarantee 60 FPS scrolling even with 10,000+ processes
  const rowVirtualizer = useVirtualizer({
    count: processedData.length,
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

  if (processedData.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-text-secondary opacity-50 p-12">
        <p className="text-sm tracking-wide mb-4">No processes found in this Tier.</p>
        <button 
          onClick={() => {
            setFilterTier('ALL');
            setSearchQuery('');
          }}
          className="px-4 py-2 bg-input-bg hover:bg-hover-bg rounded-md border border-border text-text-primary text-xs transition-colors cursor-pointer"
        >
          Clear Filters
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Table Header (Fixed) */}
      <div className="flex text-xs uppercase tracking-widest text-text-secondary bg-input-bg border-b border-border pr-3">
        <button onClick={() => handleSort('name')} className="px-6 py-4 font-medium w-[30%] text-left hover:text-text-primary transition-colors flex items-center select-none group cursor-pointer">
          Process Name <span className="opacity-50 group-hover:opacity-100">{renderSortIcon('name')}</span>
        </button>
        <button onClick={() => handleSort('pid')} className="px-6 py-4 font-medium w-[15%] text-left hover:text-text-primary transition-colors flex items-center select-none group cursor-pointer">
          PID <span className="opacity-50 group-hover:opacity-100">{renderSortIcon('pid')}</span>
        </button>
        <button onClick={() => handleSort('cpu_percent')} className="px-6 py-4 font-medium w-[15%] text-left hover:text-text-primary transition-colors flex items-center select-none group cursor-pointer">
          CPU (%) <span className="opacity-50 group-hover:opacity-100">{renderSortIcon('cpu_percent')}</span>
        </button>
        <button onClick={() => handleSort('memory_mb')} className="px-6 py-4 font-medium w-[20%] text-left hover:text-text-primary transition-colors flex items-center select-none group cursor-pointer">
          Memory (MB) <span className="opacity-50 group-hover:opacity-100">{renderSortIcon('memory_mb')}</span>
        </button>
        <button onClick={() => handleSort('tier')} className="px-6 py-4 font-medium w-[20%] justify-end hover:text-text-primary transition-colors flex items-center select-none group cursor-pointer">
          Security Tier <span className="opacity-50 group-hover:opacity-100">{renderSortIcon('tier')}</span>
        </button>
      </div>

      {/* Table Body (Virtualized) */}
      <div ref={parentRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        <div
          className="relative w-full"
          style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const proc = processedData[virtualRow.index];
            return (
              <div
                key={`${proc.pid}-${proc.name}`}
                className="absolute top-0 left-0 w-full flex items-center text-sm border-b border-border-subtle hover:bg-hover-bg transition-colors"
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
