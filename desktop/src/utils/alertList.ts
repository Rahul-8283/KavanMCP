import type { AlertEvent } from '../services/api';
import type { AlertViewFilters, DateRange } from '../context/AlertHistoryContext';

export const RANGE_MS: Record<Exclude<DateRange, 'custom'>, number> = {
  '24h': 24 * 3600_000,
  '7d': 7 * 24 * 3600_000,
  '30d': 30 * 24 * 3600_000,
};

export interface TimeWindow {
  from: number;
  to: number | null;
}

/** Presets are relative to now and are recomputed on every call. */
export function windowFor(filters: AlertViewFilters, now: number): TimeWindow {
  if (filters.range === 'custom') {
    const from = filters.customFrom ? new Date(filters.customFrom).getTime() : now - RANGE_MS['24h'];
    const to = filters.customTo ? new Date(filters.customTo).getTime() : null;
    return { from, to };
  }
  return { from: now - RANGE_MS[filters.range], to: null };
}

export function matches(alert: AlertEvent, filters: AlertViewFilters, window: TimeWindow): boolean {
  const started = new Date(alert.started_at).getTime();
  return (
    started >= window.from &&
    (window.to === null || started < window.to) &&
    (filters.metric === 'all' || alert.metric === filters.metric) &&
    (filters.level === 'all' || alert.level === filters.level)
  );
}

/** The API's order: ongoing episodes first, then newest first. */
export function inServerOrder(alerts: AlertEvent[]): AlertEvent[] {
  return [...alerts].sort((a, b) => {
    const ongoing = Number(b.ended_at === null) - Number(a.ended_at === null);
    return ongoing || b.started_at.localeCompare(a.started_at);
  });
}

/**
 * The listed alerts after a live event. A listed row is always updated, so an ongoing alert
 * visibly ends. A new one is added only if it fits the filters the user is looking at.
 */
export function applyAlertEvent(listed: AlertEvent[], alert: AlertEvent, filters: AlertViewFilters, now: number): AlertEvent[] {
  const known = listed.some((a) => a.id === alert.id);
  if (!known && !matches(alert, filters, windowFor(filters, now))) return listed;
  return inServerOrder(known ? listed.map((a) => (a.id === alert.id ? alert : a)) : [alert, ...listed]);
}
