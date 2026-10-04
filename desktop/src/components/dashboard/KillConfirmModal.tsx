import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';
import type { Process } from '../../context/ProcessContext';
import { TierBadge } from './TierBadge';
import { formatMemoryMb } from './format';

interface TierCopy {
  text: string;
  tone: string;
  blocked: boolean;
}

const TONE_CRIMSON = 'border-crimson bg-crimson-wash text-crimson-ink';
const TONE_WARN = 'border-warn bg-warn-wash text-warn';
const TONE_NEUTRAL = 'border-line-strong bg-sunken text-ink-soft';

// Warning copy from Phase 8 §3.2. Tier 1 locks the Confirm button.
const TIER_COPY: Record<number, TierCopy> = {
  1: { text: 'CRITICAL SYSTEM PROCESS. Termination blocked.', tone: TONE_CRIMSON, blocked: true },
  2: { text: 'WARNING: Essential process. Termination may cause system instability.', tone: TONE_WARN, blocked: false },
  3: { text: 'Safe to terminate.', tone: TONE_NEUTRAL, blocked: false },
  4: { text: 'Unverified process. Termination recommended.', tone: TONE_CRIMSON, blocked: false },
};

interface KillConfirmModalProps {
  target: Process | null;
  isBusy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function KillConfirmModal({ target, isBusy, error, onConfirm, onCancel }: KillConfirmModalProps) {
  useEffect(() => {
    if (!target) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isBusy) onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [target, isBusy, onCancel]);

  if (!target) return null;

  // Unknown tiers fall back to the most cautious copy, matching TierBadge's default
  const copy = TIER_COPY[target.tier] ?? TIER_COPY[4];

  return createPortal(
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !isBusy) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="kill-modal-title"
        className="animate-pop-in w-full max-w-md overflow-hidden rounded-xl border border-line-strong bg-raised shadow-pop"
      >
        <div className="px-6 pt-5">
          <p className="caps">Terminate process</p>
          <h3 id="kill-modal-title" className="mt-1.5 truncate font-display text-lg font-semibold text-ink" title={target.name}>
            Terminate {target.name}?
          </h3>
        </div>

        <dl className="mx-6 mt-4 grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-2.5 border-y border-line py-4 text-[0.8125rem]">
          <dt className="text-ink-soft">Target</dt>
          <dd className="truncate text-right font-medium text-ink">{target.name}</dd>
          <dt className="text-ink-soft">PID</dt>
          <dd className="tnum text-right font-mono text-ink">{target.pid}</dd>
          <dt className="text-ink-soft">Security tier</dt>
          <dd className="flex justify-end"><TierBadge tier={target.tier} /></dd>
          <dt className="text-ink-soft">Memory freed</dt>
          <dd className="tnum text-right font-medium text-ink">{formatMemoryMb(target.memory_mb)} MB</dd>
          <dt className="text-ink-soft">CPU released</dt>
          <dd className="tnum text-right font-medium text-ink">{target.cpu_percent.toFixed(1)}%</dd>
        </dl>

        <div className="space-y-2.5 px-6 pt-4">
          <p className={`rounded-r-md border-l-2 px-3 py-2 text-[0.8125rem] font-medium ${copy.tone}`}>{copy.text}</p>
          {error && (
            <p role="alert" className={`rounded-r-md border-l-2 px-3 py-2 text-[0.8125rem] ${TONE_CRIMSON}`}>
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2.5 px-6 pb-5 pt-5">
          <button autoFocus onClick={onCancel} disabled={isBusy} className="btn h-9 px-4">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={copy.blocked || isBusy} className="btn btn-primary h-9 px-4">
            {isBusy && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirm Termination
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
