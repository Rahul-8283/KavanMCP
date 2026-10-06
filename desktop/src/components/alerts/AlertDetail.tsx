import { ChartLine } from 'lucide-react';
import { useNavigation } from '../../context/NavigationContext';
import type { AlertEvent } from '../../services/api';
import { formatExact } from '../../utils/time';
import { formatProcessValue } from './labels';

function Reading({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="caps">{label}</dt>
      <dd className="tnum mt-0.5 text-[0.8125rem] text-ink">{value.toFixed(1)}%</dd>
    </div>
  );
}

const GRAPH_MARGIN_MS = 30 * 60_000;
// The graphs are drawn from the metrics history, which is kept for 7 days
const GRAPH_HISTORY_MS = 7 * 24 * 3600_000;

export function AlertDetail({ alert }: { alert: AlertEvent }) {
  const { top_process: process } = alert;
  const { navigate } = useNavigation();

  const started = new Date(alert.started_at).getTime();
  const ended = alert.ended_at ? new Date(alert.ended_at).getTime() : Date.now();
  const isOnGraph = Date.now() - ended < GRAPH_HISTORY_MS;

  const showOnGraph = () => {
    const now = Date.now();
    navigate('trends', {
      kind: 'window',
      from: Math.max(started - GRAPH_MARGIN_MS, now - GRAPH_HISTORY_MS),
      to: Math.min(ended + GRAPH_MARGIN_MS, now),
    });
  };

  return (
    <div className="grid gap-x-8 gap-y-4 border-b border-line-faint bg-sunken px-5 py-4 text-[0.8125rem] sm:grid-cols-3">
      <dl className="space-y-3">
        <div>
          <dt className="caps">Started</dt>
          <dd className="mt-0.5 text-ink">{formatExact(alert.started_at)}</dd>
        </div>
        <div>
          <dt className="caps">Ended</dt>
          <dd className="mt-0.5 text-ink">{alert.ended_at ? formatExact(alert.ended_at) : 'Still ongoing'}</dd>
        </div>
      </dl>

      <div>
        <p className="caps">At the moment it started</p>
        <dl className="mt-1.5 grid grid-cols-3 gap-4">
          <Reading label="CPU" value={alert.readings.cpu} />
          <Reading label="Memory" value={alert.readings.ram} />
          <Reading label="Disk" value={alert.readings.disk} />
        </dl>
      </div>

      <div>
        <p className="caps">Top process at the time</p>
        {process ? (
          <p className="mt-1.5 text-ink">
            <span className="font-medium">{process.name}</span>
            <span className="tnum ml-2 text-ink-soft">PID {process.pid} · {formatProcessValue(alert.metric, process.value)}</span>
          </p>
        ) : (
          <p className="mt-1.5 text-ink-faint">None recorded</p>
        )}
        {alert.metric === 'process' && <p className="mt-1 text-xs text-ink-soft">No visible window</p>}
        <button
          onClick={showOnGraph}
          disabled={!isOnGraph}
          title={isOnGraph ? undefined : 'The graphs cover the last 7 days'}
          className="btn mt-3"
        >
          <ChartLine size={14} />
          Show on graph
        </button>
      </div>
    </div>
  );
}
