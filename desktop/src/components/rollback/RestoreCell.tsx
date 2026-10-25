import { Loader2, Undo2 } from 'lucide-react';
import type { KillRecord } from '../../services/api';
import { formatClockOrDay } from '../../utils/time';
import { BLOCKED_LABELS, restoreSentence } from './wording';

interface RestoreCellProps {
  kill: KillRecord;
  isRestoring: boolean;
  /** Why the last attempt failed. The button stays, so the user can try again. */
  failure?: string;
  onRestore: (kill: KillRecord) => void;
}

/** What a row offers: a button, a spinner, the time it was restored, or the reason it cannot be. */
export function RestoreCell({ kill, isRestoring, failure, onRestore }: RestoreCellProps) {
  if (kill.rolled_back_at || kill.restore_blocked_reason === 'already_restored') {
    return (
      <span className="tnum text-xs text-ink-faint">
        {kill.rolled_back_at ? `Restored ${formatClockOrDay(kill.rolled_back_at)}` : 'Restored'}
      </span>
    );
  }

  if (!kill.can_restore) {
    const reason = kill.restore_blocked_reason;
    const label = reason ? BLOCKED_LABELS[reason] : 'Cannot restore';
    return (
      <span className="cursor-help text-xs text-ink-faint" title={reason ? restoreSentence(reason) : undefined}>
        {label}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => onRestore(kill)}
        disabled={isRestoring}
        aria-label={`Restore ${kill.name}`}
        aria-busy={isRestoring}
        className="btn"
      >
        {isRestoring ? <Loader2 size={14} className="animate-spin" /> : <Undo2 size={14} />}
        Restore
      </button>
      {failure && (
        <p role="alert" className="text-xs leading-4 text-crimson-ink">
          {failure}
        </p>
      )}
    </div>
  );
}
