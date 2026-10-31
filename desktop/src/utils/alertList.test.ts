import { describe, expect, it } from 'vitest';
import type { AlertViewFilters } from '../context/AlertHistoryContext';
import type { AlertEvent } from '../services/api';
import { applyAlertEvent, windowFor } from './alertList';

const NOW = Date.UTC(2026, 9, 5, 12, 0, 0);
const HOUR = 3600_000;
const iso = (ms: number) => new Date(ms).toISOString();

const FILTERS: AlertViewFilters = { range: '24h', customFrom: '', customTo: '', metric: 'all', level: 'all' };

function alert(id: string, startedHoursAgo: number, extra: Partial<AlertEvent> = {}): AlertEvent {
  return {
    id, metric: 'cpu', level: 'warning', threshold: 90, started_at: iso(NOW - startedHoursAgo * HOUR),
    ended_at: iso(NOW - startedHoursAgo * HOUR + 60_000), duration_seconds: 60, peak_value: 93,
    readings: { cpu: 93, ram: 50, disk: 40 }, top_process: null, muted: false, ...extra,
  };
}

describe('applyAlertEvent', () => {
  it('adds a new alert that fits the filters', () => {
    const result = applyAlertEvent([alert('a', 2)], alert('b', 1), FILTERS, NOW);

    expect(result.map((a) => a.id)).toEqual(['b', 'a']);
  });

  it('ignores a new alert outside the date range', () => {
    const listed = [alert('a', 2)];

    expect(applyAlertEvent(listed, alert('old', 30), FILTERS, NOW)).toBe(listed);
  });

  it('ignores a new alert of a type or severity the filters exclude', () => {
    const listed = [alert('a', 2)];

    expect(applyAlertEvent(listed, alert('ram', 1, { metric: 'ram' }), { ...FILTERS, metric: 'cpu' }, NOW)).toBe(listed);
    expect(applyAlertEvent(listed, alert('crit', 1, { level: 'critical' }), { ...FILTERS, level: 'warning' }, NOW)).toBe(listed);
  });

  it('always updates an alert that is already listed, even if it no longer fits the filters', () => {
    const ongoing = alert('a', 2, { ended_at: null, duration_seconds: null });
    const ended = alert('a', 2, { ended_at: iso(NOW - HOUR) });

    // The view is now narrowed to critical only, which the alert is not
    const result = applyAlertEvent([ongoing], ended, { ...FILTERS, level: 'critical' }, NOW);

    expect(result).toHaveLength(1);
    expect(result[0].ended_at).toBe(ended.ended_at);
  });

  it('keeps the server order: ongoing first, then newest first', () => {
    const listed = [alert('ongoing', 5, { ended_at: null }), alert('older', 4), alert('oldest', 3)];

    const result = applyAlertEvent(listed, alert('newest', 0.5), FILTERS, NOW);

    expect(result.map((a) => a.id)).toEqual(['ongoing', 'newest', 'oldest', 'older']);
  });

  it('puts an alert that is still ongoing above finished ones', () => {
    const result = applyAlertEvent([alert('done', 1)], alert('live', 2, { ended_at: null }), FILTERS, NOW);

    expect(result.map((a) => a.id)).toEqual(['live', 'done']);
  });

  it('does not change the list it was given', () => {
    const listed = [alert('a', 2)];
    const before = JSON.stringify(listed);

    applyAlertEvent(listed, alert('b', 1), FILTERS, NOW);

    expect(JSON.stringify(listed)).toBe(before);
  });

  it('honours a custom range, whose end is exclusive', () => {
    const filters: AlertViewFilters = { ...FILTERS, range: 'custom', customFrom: iso(NOW - 3 * HOUR), customTo: iso(NOW - 1 * HOUR) };

    expect(applyAlertEvent([], alert('in', 2), filters, NOW).map((a) => a.id)).toEqual(['in']);
    expect(applyAlertEvent([], alert('at-end', 1), filters, NOW)).toEqual([]);
    expect(applyAlertEvent([], alert('before', 4), filters, NOW)).toEqual([]);
  });
});

describe('windowFor', () => {
  it('measures a preset from now', () => {
    expect(windowFor({ ...FILTERS, range: '7d' }, NOW)).toEqual({ from: NOW - 7 * 24 * HOUR, to: null });
  });

  it('a custom range with no start falls back to 24 hours, with no end', () => {
    expect(windowFor({ ...FILTERS, range: 'custom' }, NOW)).toEqual({ from: NOW - 24 * HOUR, to: null });
  });
});
