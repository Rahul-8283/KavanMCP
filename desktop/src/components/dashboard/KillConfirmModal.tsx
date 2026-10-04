import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';
import type { Process } from '../../context/ProcessContext';

interface TierCopy {
  text: string;
  tone: string;
  blocked: boolean;
}

// Warning copy from Phase 8 §3.2. Tier 1 locks the Confirm button.
const TIER_COPY: Record<number, TierCopy> = {
  1: { text: 'CRITICAL SYSTEM PROCESS. Termination blocked.', tone: 'text-red-600 dark:text-red-400', blocked: true },
  2: { text: 'WARNING: Essential process. Termination may cause system instability.', tone: 'text-amber-600 dark:text-amber-400', blocked: false },
  3: { text: 'Safe to terminate.', tone: 'text-text-secondary', blocked: false },
  4: { text: 'Unverified process. Termination recommended.', tone: 'text-red-600 dark:text-red-400', blocked: false },
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !isBusy) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="kill-modal-title"
        className="w-full max-w-md bg-bg-secondary border border-border rounded-lg shadow-xl p-6"
      >
        <h3 id="kill-modal-title" className="text-lg font-semibold text-text-primary">
          Terminate {target.name}?
        </h3>

        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-text-secondary">Target</dt>
          <dd className="text-text-primary font-medium truncate">{target.name}</dd>
          <dt className="text-text-secondary">PID</dt>
          <dd className="text-text-primary font-mono">{target.pid}</dd>
        </dl>

        <p className="mt-4 text-sm text-text-primary">
          Terminating this will free <strong>{target.memory_mb.toFixed(1)} MB</strong> and drop CPU usage by{' '}
          <strong>{target.cpu_percent.toFixed(1)}%</strong>.
        </p>

        <p className={`mt-3 text-sm font-medium ${copy.tone}`}>{copy.text}</p>

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3 mt-6">
          <button
            autoFocus
            onClick={onCancel}
            disabled={isBusy}
            className="px-4 py-2 rounded-md border border-border text-sm text-text-primary hover:bg-hover-bg transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={copy.blocked || isBusy}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
          >
            {isBusy && <Loader2 className="w-4 h-4 animate-spin" />}
            Confirm Termination
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
