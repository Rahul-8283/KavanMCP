import { useCallback, useEffect, useRef, useState } from 'react';
import { useMetrics } from '../context/MetricsContext';
import type { ToastLevel } from '../context/ToastContext';
import { applyBlocked, applyRestored } from '../components/rollback/rows';
import { describeRestoreError } from '../components/rollback/wording';
import { ApiError, SystemAPI, type KillRecord } from '../services/api';
import { ConnectionStatus } from './useWebSocketConnection';

/** What a restore came to, so the page knows whether to toast. The row itself is updated by the hook. */
export type RestoreOutcome =
  | { kind: 'restored'; name: string }
  /** Already restored, or known to be impossible: the row says so and nothing else is needed */
  | { kind: 'quiet' }
  /** The reason is shown beneath the row's button, which stays for a retry */
  | { kind: 'failed' }
  | { kind: 'toast'; level: ToastLevel; message: string };

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

/** Recently killed processes over the last `hours` hours, and restoring them one at a time. */
export function useKillHistory(hours: number) {
  const { status } = useMetrics();
  const [kills, setKills] = useState<KillRecord[]>([]);
  const [backendElevated, setBackendElevated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [restoringIds, setRestoringIds] = useState<ReadonlySet<string>>(new Set());
  const [failures, setFailures] = useState<Readonly<Record<string, string>>>({});

  // Only the newest request may write its result: an older, slower one would overwrite it
  const requestRef = useRef(0);
  // A second click lands before React has re-rendered the disabled button, so the guard is synchronous
  const inFlight = useRef<Set<string>>(new Set());

  const reload = useCallback(async () => {
    const request = ++requestRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const response = await SystemAPI.fetchKills(hours);
      if (request !== requestRef.current) return;
      setKills(response.kills);
      setBackendElevated(response.backend_elevated);
      setFailures({});
      setHasLoaded(true);
    } catch (err) {
      if (request !== requestRef.current) return;
      console.error('Failed to load recent kills:', err);
      setError(describeError(err));
    } finally {
      if (request === requestRef.current) setIsLoading(false);
    }
  }, [hours]);

  // A load that failed while the backend was down is repeated once it is back
  const wasConnected = useRef(status === ConnectionStatus.CONNECTED);
  useEffect(() => {
    const isConnected = status === ConnectionStatus.CONNECTED;
    if (isConnected && !wasConnected.current) void reload();
    wasConnected.current = isConnected;
  }, [status, reload]);

  const setFailure = useCallback((id: string, message: string | null) => {
    setFailures((prev) => {
      if (message === null) {
        if (!(id in prev)) return prev;
        const { [id]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: message };
    });
  }, []);

  const restore = useCallback(async (kill: KillRecord): Promise<RestoreOutcome | null> => {
    if (inFlight.current.has(kill.id)) return null;
    inFlight.current.add(kill.id);
    setRestoringIds((prev) => new Set(prev).add(kill.id));
    setFailure(kill.id, null);

    try {
      const result = await SystemAPI.rollbackKill(kill.id);
      setKills((prev) => applyRestored(prev, result));
      return { kind: 'restored', name: result.name };
    } catch (err) {
      if (!(err instanceof ApiError)) {
        // No answer from the backend: the row goes back to how it was and the user is told
        return { kind: 'toast', level: 'critical', message: describeRestoreError(err) };
      }
      switch (err.code) {
        case 'already_restored':
          // Someone got there first, which is the outcome the user wanted. The list says when.
          await reload();
          return { kind: 'quiet' };
        case 'exe_missing':
        case 'no_path':
          setKills((prev) => applyBlocked(prev, kill.id, err.code as 'exe_missing' | 'no_path'));
          return { kind: 'quiet' };
        case 'not_found':
          // The row is not in the history any more, so a message beside it would vanish with it
          await reload();
          return { kind: 'toast', level: 'warning', message: describeRestoreError(err) };
        default:
          setFailure(kill.id, describeRestoreError(err));
          return { kind: 'failed' };
      }
    } finally {
      inFlight.current.delete(kill.id);
      setRestoringIds((prev) => {
        const next = new Set(prev);
        next.delete(kill.id);
        return next;
      });
    }
  }, [reload, setFailure]);

  return { kills, backendElevated, isLoading, error, hasLoaded, reload, restore, restoringIds, failures };
}
