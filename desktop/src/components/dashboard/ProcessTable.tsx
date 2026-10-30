import { useProcess, Process } from '../../context/ProcessContext';
import { ChevronDown, ChevronUp, Loader2, RefreshCw, Search, Shield, Unplug, X } from 'lucide-react';
import { useConfig } from '../../context/ConfigContext';
import { useToast } from '../../context/ToastContext';
import { isListed, normalizeProcessName } from '../../utils/protection';
import { TierBadge } from './TierBadge';
import { TIER_NUMBERS, tierInfo } from './tiers';
import { formatMemoryMb } from './format';
import { ProcessContextMenu } from './ProcessContextMenu';
import { KillConfirmModal } from './KillConfirmModal';
import { useProcessManager } from '../../hooks/useProcessManager';
import { useVirtualizer } from '@tanstack/react-virtual';
import { EmptyState } from '../common/EmptyState';
import { SegmentedControl, type SegmentOption } from '../common/SegmentedControl';
import { useRef, useMemo, useState, useCallback } from 'react';

interface MenuState {
  x: number;
  y: number;
  process: Process;
}

interface Column {
  key: keyof Process;
  label: string;
  isNumeric: boolean;
}

const COLUMNS: Column[] = [
  { key: 'name', label: 'Process Name', isNumeric: false },
  { key: 'pid', label: 'PID', isNumeric: true },
  { key: 'cpu_percent', label: 'CPU (%)', isNumeric: true },
  { key: 'memory_mb', label: 'Memory (MB)', isNumeric: true },
  { key: 'tier', label: 'Security Tier', isNumeric: false },
];

const TIER_FILTER_OPTIONS: SegmentOption<number | 'ALL'>[] = [
  { value: 'ALL', label: 'All' },
  ...TIER_NUMBERS.map((tier) => ({ value: tier, label: tierInfo(tier).label, title: `Tier ${tier}` })),
];

const ROW_HEIGHT = 36; // Pixel height of one row, as the virtualizer positions rows in pixels
const MIN_BAR_RATIO = 0.08; // Below this a bar is a few pixels wide and reads as a stray dot

// A number with a bar showing its size against the rest of the column.
// The bars share the cell's left edge as their origin, so they can be compared down the column.
function Magnitude({ text, ratio }: { text: string; ratio: number }) {
  const clamped = Math.min(Math.max(ratio, 0), 1);
  const width = clamped < MIN_BAR_RATIO ? 0 : clamped;

  return (
    <div className="flex items-center gap-3">
      <span className="proc-bar h-[3px] w-12 shrink-0">
        <span className="block h-full rounded-[1px] bg-ink-faint" style={{ width: `${width * 100}%` }} />
      </span>
      <span className="tnum min-w-0 flex-1 text-right text-ink">{text}</span>
    </div>
  );
}

export function ProcessTable({ onRefresh }: { onRefresh: () => void }) {
  const { processes, isLoading, error, filterTier, setFilterTier, sortConfig, setSortConfig, searchQuery, setSearchQuery } = useProcess();
  const { terminateProcess } = useProcessManager();
  const { config, updateSetting } = useConfig();
  const { addToast } = useToast();
  const parentRef = useRef<HTMLDivElement>(null);
  const neverKill = config?.never_kill ?? [];
  const neverAlert = config?.never_alert ?? [];

  const [menu, setMenu] = useState<MenuState | null>(null);
  const [killTarget, setKillTarget] = useState<Process | null>(null);
  const [killError, setKillError] = useState<string | null>(null);
  const [isKilling, setIsKilling] = useState(false);

  const closeMenu = useCallback(() => setMenu(null), []);

  const closeKillModal = useCallback(() => {
    setKillTarget(null);
    setKillError(null);
  }, []);

  const toggleProtected = async (proc: Process) => {
    const name = normalizeProcessName(proc.name);
    const listed = isListed(name, neverKill);
    if (!listed && neverKill.length >= 200) {
      addToast('The protected list is full (200 names). Remove one first.', 'warning');
      return;
    }
    const next = listed ? neverKill.filter((item) => item !== name) : [...neverKill, name];
    if (!(await updateSetting('never_kill', next))) {
      addToast('Could not save the protected list. The previous list was restored.', 'warning');
    }
  };

  const toggleMuted = async (proc: Process) => {
    const name = normalizeProcessName(proc.name);
    const listed = isListed(name, neverAlert);
    const next = listed ? neverAlert.filter((item) => item !== name) : [...neverAlert, name];
    if (!(await updateSetting('never_alert', next))) {
      addToast('Could not save the alert list. The previous list was restored.', 'warning');
    }
  };

  const clearFilters = () => {
    setFilterTier('ALL');
    setSearchQuery('');
  };

  const handleConfirmKill = async () => {
    if (!killTarget) return;
    setIsKilling(true);
    setKillError(null);
    const stagingError = await terminateProcess(killTarget);
    setIsKilling(false);
    if (stagingError) {
      // Staging was rejected: keep the modal open and show why
      setKillError(stagingError);
    } else {
      closeKillModal();
    }
  };

  const handleSort = (key: string) => {
    if (sortConfig?.key === key) {
      setSortConfig({ key, direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' });
    } else {
      setSortConfig({ key, direction: 'desc' });
    }
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

  // Memory bars are scaled against the largest process, so they stay comparable while filtering
  const largestMemory = useMemo(
    () => processes.reduce((largest, p) => Math.max(largest, p.memory_mb), 0),
    [processes]
  );

  // Initialize the Row Virtualizer to guarantee 60 FPS scrolling even with 10,000+ processes
  const rowVirtualizer = useVirtualizer({
    count: processedData.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10, // Render 10 rows outside the visible viewport to prevent flickering when scrolling fast
  });

  const isFiltered = filterTier !== 'ALL' || searchQuery !== '';
  const hasProcesses = processes.length > 0;

  const renderBody = () => {
    if (isLoading && !hasProcesses) {
      return <EmptyState icon={<Loader2 className="h-6 w-6 animate-spin" />} message="Scanning system processes..." />;
    }

    if (error && !hasProcesses) {
      return (
        <EmptyState icon={<Unplug className="h-6 w-6" strokeWidth={1.5} />} message={`The process list could not be loaded: ${error}.`}>
          <button onClick={onRefresh} className="btn">
            <RefreshCw size={14} />
            Retry
          </button>
        </EmptyState>
      );
    }

    if (!hasProcesses) {
      return <EmptyState message="No processes found." />;
    }

    if (processedData.length === 0) {
      return (
        <EmptyState message="No processes match the current filters.">
          <button onClick={clearFilters} className="btn">Clear Filters</button>
        </EmptyState>
      );
    }

    return (
      <>
        {error && (
          <p role="status" className="shrink-0 border-b border-line bg-warn-wash px-5 py-2 text-xs text-warn">
            The list could not be refreshed ({error}). Showing the previous scan.
          </p>
        )}

        {/* In a window too narrow for the compact columns, the table scrolls sideways instead of clipping */}
        <div className="flex min-h-0 flex-1 flex-col overflow-x-auto">
          <div className="flex min-h-0 min-w-[34.5rem] flex-1 flex-col">
            {/* Table Header (Fixed). The extra right padding matches the body's scrollbar gutter. */}
            <div className="proc-grid h-9 shrink-0 border-b border-line bg-sunken pr-[calc(1.25rem+10px)]">
              {COLUMNS.map(({ key, label, isNumeric }) => {
                const direction = sortConfig?.key === key ? sortConfig.direction : null;
                const SortIcon = direction === 'asc' ? ChevronUp : ChevronDown;
                const sortIcon = direction && <SortIcon size={13} strokeWidth={2.25} className="shrink-0 text-crimson-ink" />;
                return (
                  <button
                    key={key}
                    onClick={() => handleSort(key)}
                    className={`caps flex h-full select-none items-center gap-1 whitespace-nowrap transition-colors hover:text-ink ${isNumeric ? 'justify-end' : ''} ${direction ? 'text-ink' : ''}`}
                  >
                    {/* On numeric columns the icon leads, so the label stays aligned with the figures */}
                    {isNumeric && sortIcon}
                    {label}
                    {!isNumeric && sortIcon}
                  </button>
                );
              })}
            </div>

            {/* Table Body (Virtualized) */}
            <div ref={parentRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]">
              <div className="relative w-full" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const proc = processedData[virtualRow.index];
                  const isMenuTarget = menu?.process.pid === proc.pid;
                  return (
                    <div
                      key={`${proc.pid}-${proc.name}`}
                      onContextMenu={(e) => {
                        e.preventDefault(); // Suppress the browser menu in favour of ours
                        setMenu({ x: e.clientX, y: e.clientY, process: proc });
                      }}
                      className={`proc-grid absolute left-0 top-0 w-full border-b border-line-faint text-[0.8125rem] ${isMenuTarget ? 'bg-active' : 'hover:bg-hover'}`}
                      style={{
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <div className="flex min-w-0 items-center gap-1.5 font-medium text-ink">
                        {isListed(proc.name, neverKill) && (
                          <Shield size={13} strokeWidth={2} className="shrink-0 text-ok" aria-label="Protected by you" />
                        )}
                        <span className="truncate" title={proc.name}>{proc.name}</span>
                      </div>
                      <div className="tnum text-right font-mono text-xs text-ink-soft">
                        {proc.pid}
                      </div>
                      <Magnitude text={proc.cpu_percent.toFixed(1)} ratio={proc.cpu_percent / 100} />
                      <Magnitude text={formatMemoryMb(proc.memory_mb)} ratio={largestMemory > 0 ? proc.memory_mb / largestMemory : 0} />
                      <div>
                        <TierBadge tier={proc.tier} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <p className="flex h-8 shrink-0 items-center border-t border-line px-5 text-xs text-ink-faint">
          Right-click a process to terminate it.
        </p>
      </>
    );
  };

  return (
    <section className="panel @container flex min-h-[19rem] flex-1 flex-col overflow-hidden">
      <div className="relative flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2.5 border-b border-line px-5 py-3">
        <div className="mr-auto flex items-baseline gap-2.5 pr-2">
          <h2 className="font-display text-[0.9375rem] font-semibold text-ink">Monitored Processes</h2>
          {hasProcesses && (
            <span className="tnum text-xs text-ink-faint">
              {isFiltered ? `${processedData.length} of ${processes.length}` : processes.length}
            </span>
          )}
        </div>

        <SegmentedControl options={TIER_FILTER_OPTIONS} value={filterTier} onChange={setFilterTier} ariaLabel="Filter by security tier" />

        <div className="relative w-52">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            type="text"
            placeholder="Search processes..."
            aria-label="Search processes"
            className="field w-full pl-8 pr-8"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery !== '' && (
            <button
              onClick={() => setSearchQuery('')}
              title="Clear search"
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-ink-faint transition-colors hover:bg-hover hover:text-ink"
            >
              <X size={13} />
            </button>
          )}
        </div>

        <button
          onClick={onRefresh}
          disabled={isLoading}
          title="Refresh Processes"
          aria-label="Refresh processes"
          className="btn btn-quiet btn-icon"
        >
          <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
        </button>

        {isLoading && hasProcesses && (
          <div className="absolute inset-x-0 -bottom-px h-0.5 overflow-hidden">
            <div className="animate-sweep h-full w-1/4 bg-crimson" />
          </div>
        )}
      </div>

      {renderBody()}

      {menu && (
        <ProcessContextMenu
          x={menu.x}
          y={menu.y}
          process={menu.process}
          isProtected={isListed(menu.process.name, neverKill)}
          isMuted={isListed(menu.process.name, neverAlert)}
          onClose={closeMenu}
          onTerminate={() => {
            setKillTarget(menu.process);
            setKillError(null);
            closeMenu();
          }}
          onToggleProtected={() => {
            void toggleProtected(menu.process);
            closeMenu();
          }}
          onToggleMuted={() => {
            void toggleMuted(menu.process);
            closeMenu();
          }}
        />
      )}

      <KillConfirmModal
        target={killTarget}
        isBusy={isKilling}
        error={killError}
        isProtected={killTarget !== null && isListed(killTarget.name, neverKill)}
        onConfirm={handleConfirmKill}
        onCancel={closeKillModal}
      />
    </section>
  );
}
