import type { MetricsHistory } from '../services/api';

/** One bucket of the chart. Values are null for a bucket the backend recorded nothing in. */
export interface ChartPoint {
  /** Start of the bucket, in epoch milliseconds */
  t: number;
  cpu_avg: number | null;
  cpu_max: number | null;
  ram_avg: number | null;
  ram_max: number | null;
  disk_avg: number | null;
  coverage: number | null;
}

export type AverageKey = 'cpu_avg' | 'ram_avg' | 'disk_avg';
export type PeakKey = 'cpu_max' | 'ram_max';

const EMPTY = { cpu_avg: null, cpu_max: null, ram_avg: null, ram_max: null, disk_avg: null, coverage: null };

/**
 * The server leaves out buckets it has no data for. Plotted as they arrive, the line would
 * run straight across a night the machine was off, as though it had been measured.
 * This emits a point for every bucket from `from` to `to`, with nulls for the missing ones,
 * so a chart that does not connect nulls draws the gap as a gap.
 */
export function fillGaps(history: MetricsHistory): ChartPoint[] {
  const step = history.bucket_seconds * 1000;
  const start = new Date(history.from).getTime();
  const end = new Date(history.to).getTime();
  if (!(step > 0) || !(end > start)) return [];

  const recorded = new Map(history.points.map((point) => [new Date(point.t).getTime(), point]));
  const filled: ChartPoint[] = [];
  for (let t = start; t < end; t += step) {
    const point = recorded.get(t);
    filled.push(point
      ? {
          t,
          cpu_avg: point.cpu_avg,
          cpu_max: point.cpu_max,
          ram_avg: point.ram_avg,
          ram_max: point.ram_max,
          disk_avg: point.disk_avg,
          coverage: point.coverage,
        }
      : { t, ...EMPTY });
  }
  return filled;
}

/** The buckets that start inside [from, to). */
export function sliceByTime(points: ChartPoint[], from: number, to: number): ChartPoint[] {
  return points.filter((point) => point.t >= from && point.t < to);
}

export interface WindowStats {
  average: number | null;
  peak: number | null;
}

/**
 * The average and the peak over the recorded buckets. Each bucket's average is weighted by its
 * coverage, so a bucket the backend half covered counts for half. Both are null with no data.
 */
export function windowStats(points: ChartPoint[], averageKey: AverageKey, peakKey?: PeakKey): WindowStats {
  let weighted = 0;
  let weight = 0;
  let peak: number | null = null;

  for (const point of points) {
    const average = point[averageKey];
    if (average === null) continue;
    const coverage = point.coverage ?? 1;
    weighted += average * coverage;
    weight += coverage;
    const high = peakKey ? point[peakKey] : average;
    if (high !== null && (peak === null || high > peak)) peak = high;
  }

  return { average: weight > 0 ? weighted / weight : null, peak };
}
