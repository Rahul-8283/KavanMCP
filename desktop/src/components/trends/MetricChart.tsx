import { memo, useMemo, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AlertEvent } from '../../services/api';
import { windowStats, type AverageKey, type ChartPoint, type PeakKey } from '../../utils/series';
import { formatClock, formatDay } from '../../utils/time';
import { ChartTooltip } from './ChartTooltip';

/** Charts sharing this id show their crosshair at the same moment */
export const TRENDS_SYNC_ID = 'kavan-trends';

const DAY_AND_A_HALF_MS = 36 * 3600_000;
const Y_TICKS = [0, 25, 50, 75, 100];
const AXIS_TICK = { fill: 'var(--ink-faint)', fontSize: 11 };
// A 12-second alert on a 7-day chart is thinner than a pixel. It is still drawn this wide.
const MIN_MARKER_SHARE = 1 / 250;

interface MetricChartProps {
  title: string;
  points: ChartPoint[];
  /** The visible window, in epoch milliseconds */
  from: number;
  to: number;
  bucketMs: number;
  averageKey: AverageKey;
  /** Left out for disk, which moves too slowly to have a peak worth drawing */
  peakKey?: PeakKey;
  threshold: number | null;
  /** The alerts marked on this chart */
  alerts: AlertEvent[];
  /** Every alert in view, for the tooltip */
  allAlerts: AlertEvent[];
  now: number;
  onAlertClick: (alert: AlertEvent) => void;
}

function formatStat(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(0)}%`;
}

// Memoised: drawing a chart is the expensive part of this page, so it happens only when its inputs change
export const MetricChart = memo(function MetricChart({
  title, points, from, to, bucketMs, averageKey, peakKey, threshold, alerts, allAlerts, now, onAlertClick,
}: MetricChartProps) {
  // The crosshair follows the pointer on all three charts, but only this one shows the tooltip
  const [isHovered, setIsHovered] = useState(false);

  const data = useMemo(
    () => points.map((point) => {
      const average = point[averageKey];
      const peak = peakKey ? point[peakKey] : null;
      // The band runs from the average up to the peak, so it shows how far the spikes reached
      return { ...point, band: average !== null && peak !== null ? [average, peak] : null };
    }),
    [points, averageKey, peakKey],
  );

  const stats = useMemo(() => windowStats(points, averageKey, peakKey), [points, averageKey, peakKey]);

  const markers = useMemo(() => {
    const minimumWidth = (to - from) * MIN_MARKER_SHARE;
    return alerts
      .map((alert) => {
        const started = new Date(alert.started_at).getTime();
        const ended = alert.ended_at ? new Date(alert.ended_at).getTime() : now;
        const x1 = Math.max(started, from);
        const x2 = Math.min(Math.max(ended, x1 + minimumWidth), to);
        return { alert, x1, x2 };
      })
      .filter(({ x1, x2 }) => x2 > x1);
  }, [alerts, from, to, now]);

  const formatTick = to - from > DAY_AND_A_HALF_MS ? formatDay : formatClock;

  return (
    <section
      className="panel flex min-h-[8rem] flex-1 flex-col"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex shrink-0 items-baseline justify-between px-5 pt-2.5">
        <h2 className="font-display text-[0.9375rem] font-semibold text-ink">{title}</h2>
        <p className="tnum text-xs text-ink-soft">
          avg <span className="font-medium text-ink">{formatStat(stats.average)}</span>
          <span className="ml-4">peak <span className="font-medium text-ink">{formatStat(stats.peak)}</span></span>
        </p>
      </div>

      <div className="min-h-0 flex-1 pb-1 pl-1 pr-4 pt-1">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} syncId={TRENDS_SYNC_ID} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--line-faint)" />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={[from, to]}
              allowDataOverflow
              tickFormatter={formatTick}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: 'var(--line)' }}
              minTickGap={48}
            />
            {/* Always 0 to 100. An axis that rescaled to the data would make 12% look like a crisis. */}
            <YAxis
              domain={[0, 100]}
              ticks={Y_TICKS}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              width={36}
              tickFormatter={(value) => `${value}`}
            />

            {markers.map(({ alert, x1, x2 }) => (
              <ReferenceArea
                key={alert.id}
                x1={x1}
                x2={x2}
                fill="var(--crimson)"
                fillOpacity={0.16}
                stroke="none"
                ifOverflow="hidden"
                style={{ cursor: 'pointer' }}
                onClick={() => onAlertClick(alert)}
              />
            ))}

            {peakKey && (
              <Area
                dataKey="band"
                type="linear"
                stroke="none"
                fill="var(--ink-faint)"
                fillOpacity={0.28}
                connectNulls={false}
                isAnimationActive={false}
                activeDot={false}
              />
            )}
            <Line
              dataKey={averageKey}
              type="linear"
              stroke="var(--ink)"
              strokeWidth={1.5}
              dot={false}
              activeDot={isHovered ? { r: 3, fill: 'var(--ink)', stroke: 'var(--surface)' } : false}
              connectNulls={false}
              isAnimationActive={false}
            />

            {threshold !== null && (
              <ReferenceLine
                y={threshold}
                stroke="var(--crimson)"
                strokeDasharray="4 4"
                ifOverflow="hidden"
                label={{ value: `${threshold}% limit`, position: 'insideTopRight', fill: 'var(--crimson-ink)', fontSize: 11 }}
              />
            )}

            <Tooltip
              isAnimationActive={false}
              cursor={{ stroke: 'var(--line-strong)' }}
              // The tooltip is taller than the plot, so it is allowed to overlap the next panel
              allowEscapeViewBox={{ x: false, y: true }}
              wrapperStyle={{ outline: 'none', zIndex: 20 }}
              content={({ active, payload }) => {
                const point = payload?.[0]?.payload as ChartPoint | undefined;
                if (!isHovered || !active || !point) return null;
                return <ChartTooltip point={point} bucketMs={bucketMs} alerts={allAlerts} now={now} />;
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
});
