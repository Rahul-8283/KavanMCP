import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Unplug } from 'lucide-react';
import { EmptyState } from '../components/common/EmptyState';
import { SegmentedControl, type SegmentOption } from '../components/common/SegmentedControl';
import { KillTable } from '../components/rollback/KillTable';
import { useToast } from '../context/ToastContext';
import { useKillHistory } from '../hooks/useKillHistory';
import type { KillRecord } from '../services/api';

const RANGES: readonly SegmentOption<number>[] = [
  { value: 24, label: '24 hours' },
  { value: 168, label: '7 days' },
];
const RANGE_WORDS: Record<number, string> = { 24: '24 hours', 168: '7 days' };
// The backend returns at most this many, so a full list may be only the newest of more
const KILL_LIMIT = 200;

export function RecentlyKilled() {
  const [hours, setHours] = useState(24);
  const { kills, backendElevated, isLoading, error, hasLoaded, reload, restore, restoringIds, failures } = useKillHistory(hours);
  const { addToast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Opening the page, or changing the window, reads the list. It is not polled: a kill made
  // elsewhere shows the next time the page is opened.
  useEffect(() => {
    void reload();
  }, [reload]);

  // Escape closes the expanded row
  useEffect(() => {
    if (selectedId === null) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedId(null);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [selectedId]);

  const handleRestore = useCallback(async (kill: KillRecord) => {
    const outcome = await restore(kill);
    if (outcome?.kind === 'restored') addToast(`Relaunched ${outcome.name}.`, 'success');
    else if (outcome?.kind === 'toast') addToast(outcome.message, outcome.level);
  }, [restore, addToast]);

  const renderBody = () => {
    if (!hasLoaded && !error) {
      return <EmptyState icon={<Loader2 className="h-6 w-6 animate-spin" />} message="Loading recent kills..." />;
    }

    if (!hasLoaded && error) {
      return (
        <EmptyState icon={<Unplug className="h-6 w-6" strokeWidth={1.5} />} message={`The recent kills could not be loaded: ${error}.`}>
          <button onClick={reload} className="btn">
            <RefreshCw size={14} />
            Retry
          </button>
        </EmptyState>
      );
    }

    if (kills.length === 0) {
      return <EmptyState message={`Nothing was terminated in the last ${RANGE_WORDS[hours]}.`} />;
    }

    return (
      <>
        {error && (
          <p role="status" className="shrink-0 border-b border-line bg-warn-wash px-5 py-2 text-xs text-warn">
            The list could not be refreshed ({error}). Showing the previous result.
          </p>
        )}
        <KillTable
          kills={kills}
          restoringIds={restoringIds}
          failures={failures}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onRestore={handleRestore}
        />
        <p className="flex h-8 shrink-0 items-center border-t border-line px-5 text-xs text-ink-faint">
          Restoring starts the program again. It cannot bring back unsaved work.
        </p>
        {/* A restored program inherits Kavan's rights, so the user is told before the click, not after */}
        {backendElevated && (
          <p role="status" className="shrink-0 border-t border-line bg-warn-wash px-5 py-2 text-xs text-warn">
            Kavan is running as Administrator, so a restored program will also run as Administrator.
          </p>
        )}
      </>
    );
  };

  return (
    <section className="panel @container flex h-full min-h-[19rem] flex-col overflow-hidden">
      <div className="relative flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2.5 border-b border-line px-5 py-3">
        <div className="mr-auto flex items-baseline gap-2.5 pr-2">
          <h2 className="font-display text-[0.9375rem] font-semibold text-ink">Terminated</h2>
          {hasLoaded && <span className="tnum text-xs text-ink-faint">{kills.length}{kills.length >= KILL_LIMIT ? '+' : ''}</span>}
        </div>

        <SegmentedControl options={RANGES} value={hours} onChange={setHours} ariaLabel="Period" />

        <button
          onClick={reload}
          disabled={isLoading}
          title="Refresh the list"
          aria-label="Refresh the list"
          className="btn btn-quiet btn-icon"
        >
          <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
        </button>

        {isLoading && hasLoaded && (
          <div className="absolute inset-x-0 -bottom-px h-0.5 overflow-hidden">
            <div className="animate-sweep h-full w-1/4 bg-crimson" />
          </div>
        )}
      </div>

      {renderBody()}
    </section>
  );
}
