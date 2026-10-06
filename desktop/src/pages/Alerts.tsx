import { useEffect, useState } from 'react';
import { Loader2, RefreshCw, Unplug } from 'lucide-react';
import { useAlertHistory, ALERT_LIMIT } from '../context/AlertHistoryContext';
import { AlertFilters } from '../components/alerts/AlertFilters';
import { AlertTable } from '../components/alerts/AlertTable';
import { EmptyState } from '../components/common/EmptyState';

export function Alerts() {
  const { alerts, truncated, filters, setFilters, isLoading, error, hasLoaded, reload } = useAlertHistory();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Opening the page reads the list again, so the relative date presets are measured from now
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

  const renderBody = () => {
    if (!hasLoaded && !error) {
      return <EmptyState icon={<Loader2 className="h-6 w-6 animate-spin" />} message="Loading alert history..." />;
    }

    if (!hasLoaded && error) {
      return (
        <EmptyState icon={<Unplug className="h-6 w-6" strokeWidth={1.5} />} message={`The alert history could not be loaded: ${error}.`}>
          <button onClick={reload} className="btn">
            <RefreshCw size={14} />
            Retry
          </button>
        </EmptyState>
      );
    }

    if (alerts.length === 0) {
      return <EmptyState message="No alerts in this period." />;
    }

    return (
      <>
        {error && (
          <p role="status" className="shrink-0 border-b border-line bg-warn-wash px-5 py-2 text-xs text-warn">
            The list could not be refreshed ({error}). Showing the previous result.
          </p>
        )}
        {truncated && (
          <p role="status" className="shrink-0 border-b border-line bg-warn-wash px-5 py-2 text-xs text-warn">
            Showing the newest {ALERT_LIMIT} alerts. Narrow the date range to see older ones.
          </p>
        )}
        <AlertTable alerts={alerts} selectedId={selectedId} onSelect={setSelectedId} />
      </>
    );
  };

  return (
    <section className="panel @container flex h-full min-h-[19rem] flex-col overflow-hidden">
      <div className="relative flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2.5 border-b border-line px-5 py-3">
        <div className="mr-auto flex items-baseline gap-2.5 pr-2">
          <h2 className="font-display text-[0.9375rem] font-semibold text-ink">Alerts</h2>
          {hasLoaded && <span className="tnum text-xs text-ink-faint">{alerts.length}{truncated ? '+' : ''}</span>}
        </div>

        <AlertFilters filters={filters} onChange={setFilters} />

        <button
          onClick={reload}
          disabled={isLoading}
          title="Refresh alerts"
          aria-label="Refresh alerts"
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
