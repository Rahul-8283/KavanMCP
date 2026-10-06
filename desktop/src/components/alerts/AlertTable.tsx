import { useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { AlertEvent } from '../../services/api';
import { formatDuration, formatExact, formatWhen } from '../../utils/time';
import { AlertDetail } from './AlertDetail';
import { LevelBadge } from './LevelBadge';
import { METRIC_LABELS } from './labels';

const ROW_HEIGHT = 36;

const COLUMNS = ['Started', 'Type', 'Severity', 'Peak / Limit', 'Duration', 'Top process'];

/** Re-renders once a second while enabled, so the duration of an ongoing alert keeps counting. */
function useNow(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [enabled]);
  return now;
}

interface AlertTableProps {
  alerts: AlertEvent[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export function AlertTable({ alerts, selectedId, onSelect }: AlertTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const now = useNow(alerts.some((alert) => alert.ended_at === null));

  const rowVirtualizer = useVirtualizer({
    count: alerts.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  // A row selected from another page may be far down the list. It is brought into view once.
  const revealedId = useRef<string | null>(null);
  useEffect(() => {
    if (selectedId === null) {
      revealedId.current = null;
      return;
    }
    if (revealedId.current === selectedId) return;
    const index = alerts.findIndex((alert) => alert.id === selectedId);
    if (index >= 0) {
      revealedId.current = selectedId;
      rowVirtualizer.scrollToIndex(index, { align: 'auto' });
    }
  }, [selectedId, alerts, rowVirtualizer]);

  // The server already sorts ongoing alerts first, then newest first, so the rows are not re-sorted
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-x-auto">
      <div className="flex min-h-0 min-w-[42rem] flex-1 flex-col">
        <div className="alert-grid h-9 shrink-0 border-b border-line bg-sunken pr-[calc(1.25rem+10px)]">
          {COLUMNS.map((label) => (
            <span key={label} className="caps whitespace-nowrap">{label}</span>
          ))}
        </div>

        <div ref={parentRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]">
          <div className="relative w-full" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const alert = alerts[virtualRow.index];
              const isSelected = alert.id === selectedId;
              const isOngoing = alert.ended_at === null;
              const elapsed = isOngoing ? (now - new Date(alert.started_at).getTime()) / 1000 : alert.duration_seconds;

              return (
                // The detail opens beneath its row, so the height is measured instead of assumed
                <div
                  key={alert.id}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  className="absolute left-0 top-0 w-full"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={isSelected}
                    onClick={() => onSelect(isSelected ? null : alert.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect(isSelected ? null : alert.id);
                      }
                    }}
                    className={`alert-grid cursor-pointer border-b border-line-faint text-[0.8125rem] ${isSelected ? 'bg-active' : 'hover:bg-hover'}`}
                    style={{ height: `${ROW_HEIGHT}px` }}
                  >
                    <span className="tnum truncate text-ink" title={formatExact(alert.started_at)}>
                      {formatWhen(alert.started_at)}
                    </span>
                    <span className="flex items-center gap-2 truncate font-medium text-ink">
                      {METRIC_LABELS[alert.metric]}
                      {alert.muted && (
                        <span className="rounded border border-line px-1 text-[0.625rem] font-semibold uppercase tracking-[0.07em] text-ink-faint">
                          Muted
                        </span>
                      )}
                    </span>
                    <span><LevelBadge level={alert.level} /></span>
                    <span className="tnum text-ink">
                      {alert.peak_value.toFixed(1)}% <span className="text-ink-faint">/ {alert.threshold}%</span>
                    </span>
                    <span className="tnum truncate">
                      {isOngoing ? (
                        <span className="inline-flex items-center gap-1.5 font-medium text-crimson-ink">
                          <span className="animate-live h-1.5 w-1.5 rounded-full bg-current" />
                          Ongoing{elapsed !== null && elapsed >= 0 ? ` · ${formatDuration(elapsed)}` : ''}
                        </span>
                      ) : (
                        <span className="text-ink">{formatDuration(elapsed ?? 0)}</span>
                      )}
                    </span>
                    <span className="truncate text-ink-soft" title={alert.top_process?.name}>
                      {alert.top_process?.name ?? '—'}
                    </span>
                  </div>
                  {isSelected && <AlertDetail alert={alert} />}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
