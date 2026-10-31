import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { SystemAPI, type AlertEvent, type AlertFilters, type AlertLevel, type AlertMetric } from '../services/api';
import { useMetrics } from './MetricsContext';
import { ConnectionStatus } from '../hooks/useWebSocketConnection';
import { applyAlertEvent, RANGE_MS, windowFor, type TimeWindow } from '../utils/alertList';

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

export const ALERT_LIMIT = 500;
// Only ongoing episodes are wanted from the seed request, and the API lists those first
const ONGOING_SEED_LIMIT = 50;

function toApiFilters(filters: AlertViewFilters, window: TimeWindow): AlertFilters {
  return {
    from: new Date(window.from).toISOString(),
    ...(window.to !== null && { to: new Date(window.to).toISOString() }),
    ...(filters.metric !== 'all' && { metric: filters.metric }),
    ...(filters.level !== 'all' && { level: filters.level }),
    limit: ALERT_LIMIT,
  };
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

    setAlerts(prev => applyAlertEvent(prev, alert, filtersRef.current, Date.now()));
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
