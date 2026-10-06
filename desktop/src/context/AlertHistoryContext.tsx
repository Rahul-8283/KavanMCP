import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { SystemAPI, type AlertEvent, type AlertFilters, type AlertLevel, type AlertMetric } from '../services/api';
import { useMetrics } from './MetricsContext';
import { ConnectionStatus } from '../hooks/useWebSocketConnection';

export type DateRange = '24h' | '7d' | '30d' | 'custom';

export interface AlertViewFilters {
  range: DateRange;
  /** datetime-local values, only used when range is 'custom' */
  customFrom: string;
  customTo: string;
  metric: AlertMetric | 'all';
  level: AlertLevel | 'all';
}

export const DEFAULT_ALERT_FILTERS: AlertViewFilters = {
  range: '24h',
  customFrom: '',
  customTo: '',
  metric: 'all',
  level: 'all',
};

const RANGE_MS: Record<Exclude<DateRange, 'custom'>, number> = {
  '24h': 24 * 3600_000,
  '7d': 7 * 24 * 3600_000,
  '30d': 30 * 24 * 3600_000,
};

export const ALERT_LIMIT = 500;
// Only ongoing episodes are wanted from the seed request, and the API lists those first
const ONGOING_SEED_LIMIT = 50;

interface Window {
  from: number;
  to: number | null;
}

/** Presets are relative to now and are recomputed on every call. */
function windowFor(filters: AlertViewFilters, now: number): Window {
  if (filters.range === 'custom') {
    const from = filters.customFrom ? new Date(filters.customFrom).getTime() : now - RANGE_MS['24h'];
    const to = filters.customTo ? new Date(filters.customTo).getTime() : null;
    return { from, to };
  }
  return { from: now - RANGE_MS[filters.range], to: null };
}

function toApiFilters(filters: AlertViewFilters, window: Window): AlertFilters {
  return {
    from: new Date(window.from).toISOString(),
    ...(window.to !== null && { to: new Date(window.to).toISOString() }),
    ...(filters.metric !== 'all' && { metric: filters.metric }),
    ...(filters.level !== 'all' && { level: filters.level }),
    limit: ALERT_LIMIT,
  };
}

function matches(alert: AlertEvent, filters: AlertViewFilters, window: Window): boolean {
  const started = new Date(alert.started_at).getTime();
  return (
    started >= window.from &&
    (window.to === null || started < window.to) &&
    (filters.metric === 'all' || alert.metric === filters.metric) &&
    (filters.level === 'all' || alert.level === filters.level)
  );
}

/** The API's order: ongoing episodes first, then newest first. */
function inServerOrder(alerts: AlertEvent[]): AlertEvent[] {
  return [...alerts].sort((a, b) => {
    const ongoing = Number(b.ended_at === null) - Number(a.ended_at === null);
    return ongoing || b.started_at.localeCompare(a.started_at);
  });
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

interface AlertHistoryContextType {
  alerts: AlertEvent[];
  /** More alerts matched than were returned */
  truncated: boolean;
  filters: AlertViewFilters;
  setFilters: (filters: AlertViewFilters) => void;
  isLoading: boolean;
  error: string | null;
  /** The list has been loaded at least once with the current backend */
  hasLoaded: boolean;
  reload: () => Promise<void>;
  applyEvent: (alert: AlertEvent) => void;
  /** Open episodes, whatever the filters, for the sidebar marker */
  ongoingCount: number;
}

const AlertHistoryContext = createContext<AlertHistoryContextType | undefined>(undefined);

export function AlertHistoryProvider({ children }: { children: ReactNode }) {
  const { status } = useMetrics();
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [filters, setFiltersState] = useState<AlertViewFilters>(DEFAULT_ALERT_FILTERS);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [ongoingIds, setOngoingIds] = useState<ReadonlySet<string>>(new Set());

  // Live events arrive through a socket effect created once, so they read the filters through a ref
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  // Only the newest request may write its result: an older, slower one would overwrite it
  const requestRef = useRef(0);

  const reload = useCallback(async () => {
    const request = ++requestRef.current;
    const current = filtersRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const response = await SystemAPI.fetchAlerts(toApiFilters(current, windowFor(current, Date.now())));
      if (request !== requestRef.current) return;
      setAlerts(response.alerts);
      setTruncated(response.truncated);
      setHasLoaded(true);
    } catch (err) {
      if (request !== requestRef.current) return;
      console.error('Failed to load alert history:', err);
      setError(describeError(err));
    } finally {
      if (request === requestRef.current) setIsLoading(false);
    }
  }, []);

  const setFilters = useCallback((next: AlertViewFilters) => {
    filtersRef.current = next;
    setFiltersState(next);
    void reload();
  }, [reload]);

  const applyEvent = useCallback((alert: AlertEvent) => {
    // The marker counts every open episode, so it ignores the filters
    setOngoingIds(prev => {
      const next = new Set(prev);
      if (alert.ended_at === null) next.add(alert.id);
      else next.delete(alert.id);
      return next;
    });

    setAlerts(prev => {
      const known = prev.some(a => a.id === alert.id);
      // A listed row is always updated, so an ongoing alert visibly ends. A new one must fit the view.
      if (!known && !matches(alert, filtersRef.current, windowFor(filtersRef.current, Date.now()))) return prev;
      return inServerOrder(known ? prev.map(a => (a.id === alert.id ? alert : a)) : [alert, ...prev]);
    });
  }, []);

  // On every (re)connection: events sent while disconnected were missed, so the list and the
  // open-episode count are read again. This also covers a load that failed while the backend was down.
  const wasConnected = useRef(false);
  useEffect(() => {
    const isConnected = status === ConnectionStatus.CONNECTED;
    if (isConnected && !wasConnected.current) {
      void reload();
      SystemAPI.fetchAlerts({ from: new Date(Date.now() - RANGE_MS['30d']).toISOString(), limit: ONGOING_SEED_LIMIT })
        .then(response => setOngoingIds(new Set(response.alerts.filter(a => a.ended_at === null).map(a => a.id))))
        .catch(err => console.error('Failed to count ongoing alerts:', err));
    }
    wasConnected.current = isConnected;
  }, [status, reload]);

  const value = useMemo(() => ({
    alerts, truncated, filters, setFilters, isLoading, error, hasLoaded, reload, applyEvent,
    ongoingCount: ongoingIds.size,
  }), [alerts, truncated, filters, setFilters, isLoading, error, hasLoaded, reload, applyEvent, ongoingIds]);

  return <AlertHistoryContext.Provider value={value}>{children}</AlertHistoryContext.Provider>;
}

export function useAlertHistory() {
  const context = useContext(AlertHistoryContext);
  if (context === undefined) {
    throw new Error('useAlertHistory must be used within an AlertHistoryProvider');
  }
  return context;
}
