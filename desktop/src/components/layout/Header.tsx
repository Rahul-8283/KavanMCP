import { useMetrics } from '../../context/MetricsContext';
import { ConnectionStatus } from '../../hooks/useWebSocketConnection';
import { VIEW_META, type View } from './views';

const STATUS_DISPLAY: Record<ConnectionStatus, { text: string; tone: string; isLive: boolean }> = {
  [ConnectionStatus.CONNECTED]: { text: 'Backend Active', tone: 'text-ok', isLive: true },
  [ConnectionStatus.CONNECTING]: { text: 'Connecting...', tone: 'text-warn', isLive: true },
  [ConnectionStatus.DISCONNECTED]: { text: 'Offline', tone: 'text-crimson-ink', isLive: false },
};

export function Header({ view }: { view: View }) {
  const { status, metrics } = useMetrics();
  const { title, description } = VIEW_META[view];
  const display = STATUS_DISPLAY[status];

  return (
    <header className="flex shrink-0 items-end justify-between gap-6 px-7 pb-5 pt-6">
      <div className="min-w-0">
        <h1 className="truncate font-display text-[1.375rem] font-semibold leading-tight tracking-[-0.01em] text-ink">
          {title}
        </h1>
        <p className="mt-1 truncate text-[0.8125rem] text-ink-soft">{description}</p>
      </div>

      <div className="flex shrink-0 items-center gap-4">
        {metrics.lastUpdated && (
          <span className="tnum text-xs text-ink-faint">
            Last updated {new Date(metrics.lastUpdated).toLocaleTimeString()}
          </span>
        )}
        <div className="flex h-7 items-center gap-2 rounded-md border border-line bg-surface pl-2.5 pr-3">
          <span className={`h-1.5 w-1.5 rounded-full bg-current ${display.tone} ${display.isLive ? 'animate-live' : ''}`} />
          <span className="text-xs font-medium text-ink">{display.text}</span>
        </div>
      </div>
    </header>
  );
}
