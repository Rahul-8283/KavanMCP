import { ApiError, type RestoreBlockedReason } from '../../services/api';
import type { ToastLevel } from '../../context/ToastContext';

// One map from the backend's codes to sentences, shared by the page and the toast
const FAILURE_SENTENCES: Record<string, string> = {
  no_path: 'Kavan could not record where this program lives, so it cannot be restarted.',
  exe_missing: 'The program file is no longer at its original location.',
  already_restored: 'This was already restored.',
  launch_failed: 'Windows could not start this program.',
  not_found: 'This kill is no longer in the history.',
};

/** The sentence for a backend code, or undefined for a code that has none. */
export function restoreSentence(code: string): string | undefined {
  return FAILURE_SENTENCES[code];
}

/** Short wording for a restore that is known to be impossible, for the table cell. */
export const BLOCKED_LABELS: Record<Exclude<RestoreBlockedReason, 'already_restored'>, string> = {
  no_path: 'No path recorded',
  exe_missing: 'File missing',
};

/** What to tell the user about a failed restore. Codes without a sentence use the server's own message. */
export function describeRestoreError(err: unknown): string {
  if (err instanceof ApiError) return restoreSentence(err.code) ?? err.message;
  return err instanceof Error ? err.message : 'Unknown error';
}

/** How loudly to toast a failed restore. A request that never got an answer is the serious case. */
export function restoreErrorLevel(err: unknown): ToastLevel {
  if (!(err instanceof ApiError)) return 'critical';
  return err.code === 'already_restored' ? 'info' : 'warning';
}
