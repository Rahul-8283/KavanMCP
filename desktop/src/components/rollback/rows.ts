import type { KillRecord, RestoreBlockedReason, RollbackResult } from '../../services/api';

/** The list after a successful restore: that one row is marked restored, the others are untouched. */
export function applyRestored(kills: KillRecord[], result: Pick<RollbackResult, 'id' | 'rolled_back_at'>, now: Date = new Date()): KillRecord[] {
  return kills.map((kill) =>
    kill.id === result.id
      ? {
          ...kill,
          rolled_back_at: result.rolled_back_at ?? now.toISOString(),
          can_restore: false,
          restore_blocked_reason: 'already_restored',
        }
      : kill,
  );
}

/** The list after the backend says one kill can never be restored, so no button is offered for it. */
export function applyBlocked(kills: KillRecord[], id: string, reason: RestoreBlockedReason): KillRecord[] {
  return kills.map((kill) => (kill.id === id ? { ...kill, can_restore: false, restore_blocked_reason: reason } : kill));
}
