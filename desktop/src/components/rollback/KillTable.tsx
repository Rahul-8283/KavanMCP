import { useEffect, useState } from 'react';
import type { KillRecord } from '../../services/api';
import { formatMemoryMb } from '../dashboard/format';
import { TierBadge } from '../dashboard/TierBadge';
import { formatAgo, formatExact } from '../../utils/time';
import { RestoreCell } from './RestoreCell';

const COLUMNS = ['Process', 'Killed', 'Memory (MB)', 'Security tier', 'Action'];
// "2 min ago" is read as a clock, so it is kept honest while the page stays open
const CLOCK_TICK_MS = 30_000;

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function TierCell({ tier }: { tier: number | null }) {
  // tierInfo() calls an unknown tier Unverified, which would brand every older kill as suspicious
  if (tier === null) {
    return (
      <span className="cursor-help text-ink-faint" title="Tier was not recorded for kills made before V2.1.">
        —
      </span>
    );
  }
  return <TierBadge tier={tier} />;
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="caps">{label}</dt>
      <dd className="mt-0.5 break-words text-ink">{children}</dd>
    </div>
  );
}

function KillDetail({ kill }: { kill: KillRecord }) {
  return (
    <dl className="grid gap-x-8 gap-y-3 border-b border-line-faint bg-sunken px-5 py-4 text-[0.8125rem] sm:grid-cols-3">
      <div className="space-y-3">
        <Fact label="Process ID at the time">
          <span className="tnum">{kill.pid}</span>
        </Fact>
        <Fact label="CPU it was using">
          <span className="tnum">{kill.cpu_freed_pct.toFixed(1)}%</span>
        </Fact>
      </div>
      <Fact label="Program">
        {kill.executable_path ?? <span className="text-ink-faint">Not recorded</span>}
      </Fact>
      <Fact label="Reason recorded">
        {kill.reasoning ?? <span className="text-ink-faint">None recorded</span>}
      </Fact>
    </dl>
  );
}

interface KillTableProps {
  kills: KillRecord[];
  restoringIds: ReadonlySet<string>;
  failures: Readonly<Record<string, string>>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onRestore: (kill: KillRecord) => void;
}

// The list is short (at most 200, usually a handful), so it is not virtualized
export function KillTable({ kills, restoringIds, failures, selectedId, onSelect, onRestore }: KillTableProps) {
  const now = useNow();

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-x-auto">
      <div className="flex min-h-0 min-w-[43rem] flex-1 flex-col">
        <div className="kill-grid h-9 shrink-0 border-b border-line bg-sunken pr-[calc(1.25rem+10px)]">
          {COLUMNS.map((label) => (
            <span key={label} className={`caps whitespace-nowrap ${label === 'Memory (MB)' ? 'text-right' : ''}`}>
              {label}
            </span>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]">
          {kills.map((kill) => {
            const isSelected = kill.id === selectedId;
            return (
              <div key={kill.id}>
                {/* The row opens on a click anywhere in it. The name is the keyboard's way in. */}
                <div
                  onClick={() => onSelect(isSelected ? null : kill.id)}
                  className={`kill-grid min-h-11 cursor-pointer border-b border-line-faint py-1.5 text-[0.8125rem] ${isSelected ? 'bg-active' : 'hover:bg-hover'}`}
                >
                  <button
                    type="button"
                    aria-expanded={isSelected}
                    title={kill.executable_path ?? undefined}
                    className="truncate text-left font-medium text-ink"
                  >
                    {kill.name}
                  </button>
                  <span className="tnum truncate text-ink" title={formatExact(kill.killed_at)}>
                    {formatAgo(kill.killed_at, now)}
                  </span>
                  <span className="tnum text-right text-ink">{formatMemoryMb(kill.memory_freed_mb)}</span>
                  <span>
                    <TierCell tier={kill.tier} />
                  </span>
                  {/* Restoring is its own action, not a way to open the row */}
                  <div onClick={(e) => e.stopPropagation()}>
                    <RestoreCell
                      kill={kill}
                      isRestoring={restoringIds.has(kill.id)}
                      failure={failures[kill.id]}
                      onRestore={onRestore}
                    />
                  </div>
                </div>
                {isSelected && <KillDetail kill={kill} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
