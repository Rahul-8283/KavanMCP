import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, RotateCcw, Unplug } from 'lucide-react';
import { EmptyState } from '../components/common/EmptyState';
import { SegmentedControl, type SegmentOption } from '../components/common/SegmentedControl';
import { MetricChart } from '../components/trends/MetricChart';
import { OverviewStrip, type BrushRange } from '../components/trends/OverviewStrip';
import { useMetrics } from '../context/MetricsContext';
import { useNavigation } from '../context/NavigationContext';
import { ConnectionStatus } from '../hooks/useWebSocketConnection';
import { SystemAPI, type AlertEvent, type HistoryRange, type MetricsHistory } from '../services/api';
import { fillGaps, sliceByTime } from '../utils/series';
import { formatClock, formatDay, formatDayTime } from '../utils/time';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

const RANGE_OPTIONS: SegmentOption<HistoryRange>[] = [
  { value: '1h', label: '1 hour' },
  { value: '6h', label: '6 hours' },
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
];

const RANGE_MS: Record<HistoryRange, number> = {
  '1h': HOUR_MS,
  '6h': 6 * HOUR_MS,
  '24h': 24 * HOUR_MS,
  '7d': 7 * 24 * HOUR_MS,
};
// Shortest first, so the first one long enough is the tightest fit
const RANGES_BY_LENGTH: HistoryRange[] = ['1h', '6h', '24h', '7d'];

// The server refuses a window shorter than this
const MIN_FOCUS_MS = 10 * MINUTE_MS;
// The brush reports every pixel of a drag. The finer data is requested once it settles.
const BRUSH_SETTLE_MS = 250;
// A new minute of history arrives once a minute
const REFRESH_MS = MINUTE_MS;
const ALERT_LIMIT = 500;

interface TimeWindow {
  from: number;
  to: number;
}

const windowOf = (history: MetricsHistory): TimeWindow => ({
  from: new Date(history.from).getTime(),
  to: new Date(history.to).getTime(),
});

const sameWindow = (a: TimeWindow, b: TimeWindow) => a.from === b.from && a.to === b.to;

function describeBucket(seconds: number): string {
  const minutes = seconds / 60;
  return minutes < 60 ? `${minutes}-minute points` : `${minutes / 60}-hour points`;
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

function ChartSkeleton() {
  return (
    <>
      {['CPU', 'Memory', 'Disk'].map((title) => (
        <section key={title} className="panel flex min-h-[8rem] flex-1 flex-col px-5 py-3">
          <h2 className="font-display text-[0.9375rem] font-semibold text-ink">{title}</h2>
          <div className="mt-3 flex-1 animate-pulse rounded bg-sunken" />
        </section>
      ))}
    </>
  );
}

export function Trends() {
  const { status } = useMetrics();
  const { target, navigate, clearTarget } = useNavigation();

  // The context: everything loaded into the overview strip
  const [range, setRange] = useState<HistoryRange>('24h');
  const [context, setContext] = useState<MetricsHistory | null>(null);
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [loadedAt, setLoadedAt] = useState(() => Date.now());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  // The focus: the brushed window the three charts show. null means the whole context.
  // `preview` follows the brush as it moves and only feeds the "Showing" line. `focus` is where
  // the brush settled: redrawing three charts on every pixel of a drag makes the drag itself lag.
  const [preview, setPreview] = useState<TimeWindow | null>(null);
  const [focus, setFocus] = useState<TimeWindow | null>(null);
  const [detail, setDetail] = useState<{ window: TimeWindow; history: MetricsHistory } | null>(null);
  const [brush, setBrush] = useState<{ version: number; initial: BrushRange | null }>({ version: 0, initial: null });

  // A window another page asked for, applied once the context that contains it has loaded
  const wantedWindow = useRef<TimeWindow | null>(null);
  const contextRequest = useRef(0);
  const detailRequest = useRef(0);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearFocus = useCallback(() => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    setPreview(null);
    setFocus(null);
    setDetail(null);
    setBrush((prev) => ({ version: prev.version + 1, initial: null }));
  }, []);

  // Arriving from "Show on graph": load the shortest range that reaches back far enough
  useEffect(() => {
    if (target?.kind !== 'window') return;
    wantedWindow.current = { from: target.from, to: target.to };
    const reach = Date.now() - target.from;
    setRange(RANGES_BY_LENGTH.find((candidate) => RANGE_MS[candidate] >= reach) ?? '7d');
    setRefreshTick((tick) => tick + 1);
    clearTarget();
  }, [target, clearTarget]);

  // Load the context, and the alerts to mark on it
  useEffect(() => {
    const request = ++contextRequest.current;
    setIsLoading(true);

    const alertsFrom = new Date(Date.now() - RANGE_MS[range] - 2 * HOUR_MS).toISOString();
    Promise.all([
      SystemAPI.fetchMetricsHistory(range),
      // The markers are an addition. Without them the charts are still worth showing.
      SystemAPI.fetchAlerts({ from: alertsFrom, limit: ALERT_LIMIT }).catch((err) => {
        console.error('Failed to load the alerts for the graphs:', err);
        return null;
      }),
    ])
      .then(([history, alertPage]) => {
        if (request !== contextRequest.current) return;
        setContext(history);
        if (alertPage) setAlerts(alertPage.alerts);
        setLoadedAt(Date.now());
        setError(null);

        const wanted = wantedWindow.current;
        if (wanted) {
          wantedWindow.current = null;
          const bounds = windowOf(history);
          const step = history.bucket_seconds * 1000;
          const from = Math.max(wanted.from, bounds.from);
          const to = Math.min(Math.max(wanted.to, from + MIN_FOCUS_MS), bounds.to);
          if (to > from) {
            const lastIndex = Math.round((bounds.to - bounds.from) / step) - 1;
            const startIndex = Math.min(Math.max(Math.floor((from - bounds.from) / step), 0), lastIndex);
            const endIndex = Math.min(Math.max(Math.ceil((to - bounds.from) / step) - 1, startIndex), lastIndex);
            const window = { from, to };
            setPreview(window);
            setFocus(window);
            setBrush((prev) => ({ version: prev.version + 1, initial: { startIndex, endIndex } }));
          }
        }
      })
      .catch((err) => {
        if (request !== contextRequest.current) return;
        console.error('Failed to load the metrics history:', err);
        setError(describeError(err));
      })
      .finally(() => {
        if (request === contextRequest.current) setIsLoading(false);
      });
  }, [range, refreshTick]);

  // Load the focus window on its own: the server answers a shorter window with finer buckets
  useEffect(() => {
    const request = ++detailRequest.current;
    if (!focus) {
      setDetail(null);
      return;
    }
    SystemAPI.fetchMetricsHistory({ from: new Date(focus.from).toISOString(), to: new Date(focus.to).toISOString() })
      .then((history) => {
        if (request === detailRequest.current) setDetail({ window: focus, history });
      })
      // The charts keep showing the coarser context data for this window
      .catch((err) => console.error('Failed to load the focused window:', err));
  }, [focus, refreshTick]);

  const contextPoints = useMemo(() => (context ? fillGaps(context) : []), [context]);
  const contextWindow = useMemo(() => (context ? windowOf(context) : null), [context]);

  const handleBrush = useCallback(({ startIndex, endIndex }: BrushRange) => {
    if (!context || contextPoints.length === 0) return;
    if (settleTimer.current) clearTimeout(settleTimer.current);

    const isWholeContext = startIndex <= 0 && endIndex >= contextPoints.length - 1;
    let next: TimeWindow | null = null;
    if (!isWholeContext) {
      const step = context.bucket_seconds * 1000;
      const bounds = windowOf(context);
      let from = contextPoints[startIndex].t;
      let to = contextPoints[endIndex].t + step;
      if (to - from < MIN_FOCUS_MS) {
        to = Math.min(from + MIN_FOCUS_MS, bounds.to);
        from = to - MIN_FOCUS_MS;
      }
      next = { from, to };
    }

    setPreview(next);
    settleTimer.current = setTimeout(() => setFocus(next), BRUSH_SETTLE_MS);
  }, [context, contextPoints]);

  useEffect(() => () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
  }, []);

  const chooseRange = (next: HistoryRange) => {
    if (next === range) return;
    clearFocus();
    setRange(next);
  };

  // While the window being shown ends at "now", read the new minute as it arrives.
  // A window in the past cannot change, so it is left alone. The timer ends with the page.
  const followsNow = !focus || (contextWindow !== null && context !== null
    && focus.to >= contextWindow.to - context.bucket_seconds * 1000);
  const isConnected = status === ConnectionStatus.CONNECTED;
  useEffect(() => {
    if (!followsNow || !isConnected) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') setRefreshTick((tick) => tick + 1);
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [followsNow, isConnected]);

  // A load that failed while the backend was down is repeated when the connection returns
  const wasConnected = useRef(isConnected);
  useEffect(() => {
    if (isConnected && !wasConnected.current && error) setRefreshTick((tick) => tick + 1);
    wasConnected.current = isConnected;
  }, [isConnected, error]);

  const openAlert = useCallback((alert: AlertEvent) => {
    navigate('alerts', { kind: 'alert', alertId: alert.id, startedAt: alert.started_at });
  }, [navigate]);

  const retry = () => setRefreshTick((tick) => tick + 1);

  // What the charts draw. All of it is memoised, so the charts redraw when their data changes
  // and not each time the brush moves or the page re-renders for another reason.
  const view = focus ?? contextWindow;
  // The finer data is used once it has arrived for exactly the window on screen
  const fine = detail && focus && sameWindow(detail.window, focus) ? detail.history : null;
  const source = fine ?? context;
  const points = useMemo(() => {
    if (!view) return [];
    return sliceByTime(fine ? fillGaps(fine) : contextPoints, view.from, view.to);
  }, [fine, contextPoints, view]);

  const markers = useMemo(() => {
    const inView = view
      ? alerts.filter((alert) => {
          const started = new Date(alert.started_at).getTime();
          const ended = alert.ended_at ? new Date(alert.ended_at).getTime() : loadedAt;
          return started < view.to && ended >= view.from;
        })
      : [];
    return {
      all: inView,
      // A process alert is about CPU, so it is marked on the CPU chart
      cpu: inView.filter((alert) => alert.metric === 'cpu' || alert.metric === 'process'),
      ram: inView.filter((alert) => alert.metric === 'ram'),
      disk: inView.filter((alert) => alert.metric === 'disk'),
    };
  }, [alerts, view, loadedAt]);

  const wholeContext = useMemo(
    () => ({ startIndex: 0, endIndex: Math.max(contextPoints.length - 1, 0) }),
    [contextPoints.length],
  );

  const renderBody = () => {
    if (!context || !contextWindow) {
      if (error) {
        return (
          <section className="panel flex flex-1">
            <EmptyState icon={<Unplug className="h-6 w-6" strokeWidth={1.5} />} message={`The history could not be loaded: ${error}.`}>
              <button onClick={retry} className="btn">
                <RefreshCw size={14} />
                Retry
              </button>
            </EmptyState>
          </section>
        );
      }
      return <ChartSkeleton />;
    }

    if (context.recording_since === null) {
      return (
        <section className="panel flex flex-1">
          <EmptyState message="Kavan has not recorded any history yet. The first points appear after a minute." />
        </section>
      );
    }

    if (!view || !source) return null;
    const shared = {
      points, from: view.from, to: view.to, bucketMs: source.bucket_seconds * 1000,
      allAlerts: markers.all, now: loadedAt, onAlertClick: openAlert,
    };

    return (
      <>
        {error && (
          <p role="status" className="panel shrink-0 bg-warn-wash px-5 py-2 text-xs text-warn">
            The graphs could not be refreshed ({error}). Showing the previous result.
          </p>
        )}
        <MetricChart
          {...shared}
          title="CPU"
          averageKey="cpu_avg"
          peakKey="cpu_max"
          threshold={source.thresholds.cpu}
          alerts={markers.cpu}
        />
        <MetricChart
          {...shared}
          title="Memory"
          averageKey="ram_avg"
          peakKey="ram_max"
          threshold={source.thresholds.ram}
          alerts={markers.ram}
        />
        <MetricChart
          {...shared}
          title="Disk"
          averageKey="disk_avg"
          threshold={source.thresholds.disk}
          alerts={markers.disk}
        />
        {contextPoints.length > 1 && (
          <OverviewStrip
            // Remounted when the loaded range changes shape or the window is moved from outside
            key={`${brush.version}-${context.bucket_seconds}-${contextPoints.length}`}
            points={contextPoints}
            initial={brush.initial ?? wholeContext}
            onChange={handleBrush}
          />
        )}
      </>
    );
  };

  // The line above the charts follows the brush while it moves
  const shown = preview ?? contextWindow;
  const isSettled = preview === focus || (preview !== null && focus !== null && sameWindow(preview, focus));
  const recordingSince = context?.recording_since ? new Date(context.recording_since).getTime() : null;

  return (
    <div className="flex h-full min-h-[34rem] flex-col gap-2.5">
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2">
        <SegmentedControl options={RANGE_OPTIONS} value={range} onChange={chooseRange} ariaLabel="Range" />

        {shown && context?.recording_since && (
          <p className="tnum mr-auto text-xs text-ink-soft">
            Showing {formatDayTime(shown.from)} to {formatDayTime(shown.to)}
            {isSettled && source && <span className="text-ink-faint"> · {describeBucket(source.bucket_seconds)}</span>}
            {recordingSince !== null && recordingSince > shown.from && (
              <span className="text-ink-faint"> · Recording since {formatDay(recordingSince)}, {formatClock(recordingSince)}.</span>
            )}
          </p>
        )}

        <button onClick={clearFocus} disabled={!preview} className="btn ml-auto" title="Show the whole range">
          <RotateCcw size={14} />
          Reset
        </button>
        <button
          onClick={retry}
          disabled={isLoading}
          title="Refresh graphs"
          aria-label="Refresh graphs"
          className="btn btn-quiet btn-icon"
        >
          <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {renderBody()}
    </div>
  );
}
