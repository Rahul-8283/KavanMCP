import { describe, expect, it } from 'vitest';
import { formatAgo, formatClockOrDay, formatDuration, formatWhen } from './time';

// Built from local-time parts, because the formatters read local time
const local = (y: number, mo: number, d: number, h: number, mi: number, s = 0) => new Date(y, mo, d, h, mi, s);
const NOW = local(2026, 9, 5, 12, 0, 30); // 5 Oct 2026, 12:00:30

describe('formatDuration', () => {
  it.each([
    [0, '0s'],
    [8, '8s'],
    [59, '59s'],
    [60, '1m 00s'],
    [268, '4m 28s'],
    [3599, '59m 59s'],
    [3600, '1h 0m'],
    [4320, '1h 12m'],
    [86_400, '24h 0m'],
  ])('%i seconds is %s', (seconds, text) => {
    expect(formatDuration(seconds)).toBe(text);
  });

  it('never goes negative or shows a fraction', () => {
    expect(formatDuration(-5)).toBe('0s');
    expect(formatDuration(59.9)).toBe('59s');
  });
});

describe('formatWhen', () => {
  it('shows seconds for a moment today', () => {
    expect(formatWhen(local(2026, 9, 5, 8, 30, 12).toISOString(), NOW)).toBe('08:30:12');
  });

  it('says Yesterday for the day before, and keeps the clock', () => {
    expect(formatWhen(local(2026, 9, 4, 22, 14).toISOString(), NOW)).toBe('Yesterday 22:14');
  });

  it('is a date a week ago, without the year', () => {
    expect(formatWhen(local(2026, 9, 2, 22, 14).toISOString(), NOW)).toBe('2 Oct 22:14');
  });

  it('adds the year when it is not this one', () => {
    expect(formatWhen(local(2025, 11, 31, 23, 59).toISOString(), NOW)).toBe('31 Dec 2025 23:59');
  });

  it('treats just after midnight as Yesterday for a moment just before it', () => {
    const justAfterMidnight = local(2026, 9, 5, 0, 5);
    expect(formatWhen(local(2026, 9, 4, 23, 55).toISOString(), justAfterMidnight)).toBe('Yesterday 23:55');
  });
});

describe('formatAgo', () => {
  it('is Just now under a minute, including a moment in the future from clock skew', () => {
    expect(formatAgo(local(2026, 9, 5, 12, 0, 0).toISOString(), NOW)).toBe('Just now');
    expect(formatAgo(local(2026, 9, 5, 12, 0, 45).toISOString(), NOW)).toBe('Just now');
  });

  it('counts minutes up to an hour', () => {
    expect(formatAgo(local(2026, 9, 5, 11, 58, 0).toISOString(), NOW)).toBe('2 min ago');
    expect(formatAgo(local(2026, 9, 5, 11, 1, 0).toISOString(), NOW)).toBe('59 min ago');
  });

  it('counts hours within the same day, singular for one', () => {
    expect(formatAgo(local(2026, 9, 5, 11, 0, 0).toISOString(), NOW)).toBe('1 hour ago');
    expect(formatAgo(local(2026, 9, 5, 9, 0, 0).toISOString(), NOW)).toBe('3 hours ago');
  });

  it('falls back to the date once it was not today', () => {
    expect(formatAgo(local(2026, 9, 4, 22, 10).toISOString(), NOW)).toBe('Yesterday 22:10');
  });

  it('is still minutes across the date line', () => {
    expect(formatAgo(local(2026, 9, 4, 23, 50).toISOString(), local(2026, 9, 5, 0, 10))).toBe('20 min ago');
  });
});

describe('formatClockOrDay', () => {
  it('is a clock for today and a date for any other day', () => {
    expect(formatClockOrDay(local(2026, 9, 5, 9, 43, 30).toISOString(), NOW)).toBe('09:43');
    expect(formatClockOrDay(local(2026, 9, 4, 22, 14).toISOString(), NOW)).toBe('Yesterday 22:14');
  });
});
