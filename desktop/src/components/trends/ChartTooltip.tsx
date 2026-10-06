import type { AlertEvent } from '../../services/api';
import type { ChartPoint } from '../../utils/series';
import { formatClock, formatDay, formatDuration } from '../../utils/time';
import { METRIC_LABELS } from '../alerts/labels';

const MINUTE_MS = 60_000;

function describeAlert(alert: AlertEvent): string {
  const level = alert.level === 'critical' ? 'Critical' : 'Warning';
  const duration = alert.duration_seconds === null ? 'ongoing' : formatDuration(alert.duration_seconds);
  const process = alert.top_process ? `, top process ${alert.top_process.name}` : '';
  return `${level} ${METRIC_LABELS[alert.metric]} alert, ${duration}${process}`;
}

function describeCoverage(coverage: number, bucketMs: number): string {
  const minutes = Math.round(bucketMs / MINUTE_MS);
  if (minutes <= 1) return 'Recorded for part of this minute';
  return `Recorded for ${Math.max(1, Math.round(coverage * minutes))} of ${minutes} minutes`;
}

function Row({ label, average, peak }: { label: string; average: number | null; peak?: number | null }) {
  return (
    <tr>
      <th scope="row" className="pr-4 text-left font-medium text-ink-soft">{label}</th>
      {average === null ? (
        <td colSpan={2} className="text-ink-faint">No data</td>
      ) : peak === undefined ? (
        <td colSpan={2} className="tnum text-ink">{average.toFixed(1)}%</td>
      ) : (
        <>
          <td className="tnum pr-3 text-ink">avg {average.toFixed(1)}%</td>
          <td className="tnum text-ink-soft">peak {peak === null ? '—' : `${peak.toFixed(1)}%`}</td>
        </>
      )}
    </tr>
  );
}

interface ChartTooltipProps {
  point: ChartPoint;
  bucketMs: number;
  /** Every alert in view. Those overlapping this bucket are listed. */
  alerts: AlertEvent[];
  now: number;
}

export function ChartTooltip({ point, bucketMs, alerts, now }: ChartTooltipProps) {
  const bucketEnd = point.t + bucketMs;
  const overlapping = alerts.filter((alert) => {
    const started = new Date(alert.started_at).getTime();
    const ended = alert.ended_at ? new Date(alert.ended_at).getTime() : now;
    return started < bucketEnd && ended >= point.t;
  });

  return (
    <div className="panel pointer-events-none bg-raised px-3 py-2.5 text-xs shadow-pop">
      <p className="tnum font-medium text-ink">
        {formatDay(point.t)}, {formatClock(point.t)} to {formatClock(bucketEnd)}
      </p>
      <table className="mt-1.5">
        <tbody>
          <Row label="CPU" average={point.cpu_avg} peak={point.cpu_max} />
          <Row label="Memory" average={point.ram_avg} peak={point.ram_max} />
          <Row label="Disk" average={point.disk_avg} />
        </tbody>
      </table>
      {point.coverage !== null && point.coverage < 1 && (
        <p className="mt-1.5 text-ink-faint">{describeCoverage(point.coverage, bucketMs)}</p>
      )}
      {overlapping.map((alert) => (
        <p key={alert.id} className="mt-1.5 max-w-[19rem] text-crimson-ink">{describeAlert(alert)}</p>
      ))}
    </div>
  );
}
