import { describe, expect, it } from 'vitest';
import type { MetricsHistory, MetricsPoint } from '../services/api';
import { fillGaps, sliceByTime, windowStats, type ChartPoint } from './series';

const MINUTE = 60_000;
const T0 = Date.UTC(2026, 9, 1, 10, 0, 0);
const iso = (ms: number) => new Date(ms).toISOString();

function point(offsetBuckets: number, bucketMs: number, cpu: number, coverage = 1): MetricsPoint {
  return {
    t: iso(T0 + offsetBuckets * bucketMs),
    cpu_avg: cpu, cpu_max: cpu + 10, ram_avg: 50, ram_max: 55, disk_avg: 40, coverage,
  };
}

function history(buckets: number, points: MetricsPoint[], bucketSeconds = 60): MetricsHistory {
  return {
    from: iso(T0),
    to: iso(T0 + buckets * bucketSeconds * 1000),
    bucket_seconds: bucketSeconds,
    recording_since: iso(T0),
    thresholds: { cpu: 90, ram: 90, disk: 95 },
    points,
  };
}

describe('fillGaps', () => {
  it('emits one point for every bucket in the window', () => {
    expect(fillGaps(history(10, [point(0, MINUTE, 20)]))).toHaveLength(10);
  });

  it('puts a null in every bucket the server left out, never a value', () => {
    const filled = fillGaps(history(5, [point(0, MINUTE, 20), point(4, MINUTE, 30)]));

    expect(filled.map((p) => p.cpu_avg)).toEqual([20, null, null, null, 30]);
    for (const gap of filled.slice(1, 4)) {
      expect(gap).toMatchObject({ cpu_max: null, ram_avg: null, ram_max: null, disk_avg: null, coverage: null });
    }
  });

  it('places each recorded point in its own bucket, in time order', () => {
    const filled = fillGaps(history(3, [point(2, MINUTE, 22), point(0, MINUTE, 11)]));

    expect(filled.map((p) => p.t)).toEqual([T0, T0 + MINUTE, T0 + 2 * MINUTE]);
    expect(filled.map((p) => p.cpu_avg)).toEqual([11, null, 22]);
  });

  it('keeps the coverage the server sent', () => {
    expect(fillGaps(history(2, [point(0, MINUTE, 20, 0.5)]))[0].coverage).toBe(0.5);
  });

  it('works for any bucket size, such as 2 hours', () => {
    const bucket = 2 * 3600;
    const filled = fillGaps(history(4, [point(1, bucket * 1000, 25)], bucket));

    expect(filled.map((p) => p.cpu_avg)).toEqual([null, 25, null, null]);
  });

  it('draws nothing for an empty or reversed window, and for a zero bucket', () => {
    expect(fillGaps({ ...history(0, []), to: iso(T0) })).toEqual([]);
    expect(fillGaps({ ...history(5, []), from: iso(T0 + 10 * MINUTE) })).toEqual([]);
    expect(fillGaps(history(5, [], 0))).toEqual([]);
  });

  it('is all gaps when nothing was recorded', () => {
    expect(fillGaps(history(4, [])).every((p) => p.cpu_avg === null)).toBe(true);
  });
});

const chart = (cpu: number | null, max: number | null, coverage: number | null): ChartPoint => ({
  t: 0, cpu_avg: cpu, cpu_max: max, ram_avg: null, ram_max: null, disk_avg: null, coverage,
});

describe('sliceByTime', () => {
  it('keeps the buckets that start inside the window, from inclusive and to exclusive', () => {
    const points = [0, 1, 2, 3].map((n) => ({ ...chart(n, n, 1), t: n * MINUTE }));

    expect(sliceByTime(points, MINUTE, 3 * MINUTE).map((p) => p.t)).toEqual([MINUTE, 2 * MINUTE]);
  });
});

describe('windowStats', () => {
  it('weights each bucket by its coverage, so a half-covered bucket counts for half', () => {
    const stats = windowStats([chart(80, 90, 1), chart(20, 25, 0.5)], 'cpu_avg', 'cpu_max');

    expect(stats.average).toBeCloseTo((80 * 1 + 20 * 0.5) / 1.5);
    expect(stats.peak).toBe(90);
  });

  it('ignores gaps', () => {
    expect(windowStats([chart(40, 50, 1), chart(null, null, null)], 'cpu_avg', 'cpu_max')).toEqual({ average: 40, peak: 50 });
  });

  it('is null with no data at all', () => {
    expect(windowStats([], 'cpu_avg')).toEqual({ average: null, peak: null });
    expect(windowStats([chart(null, null, null)], 'cpu_avg', 'cpu_max')).toEqual({ average: null, peak: null });
  });

  it('takes the peak from the average when there is no peak key', () => {
    expect(windowStats([chart(10, null, 1), chart(30, null, 1)], 'cpu_avg').peak).toBe(30);
  });
});
