import { useCallback } from 'react';
import { useProcess, Process } from '../context/ProcessContext';
import { useToast } from '../context/ToastContext';
import { SystemAPI, ApiError } from '../services/api';
import { describeRestoreError, restoreErrorLevel } from '../components/rollback/wording';

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Unknown error';
}

export function useProcessManager() {
  const { setProcesses, setIsLoading, setError, isLoading, removeProcess } = useProcess();
  const { addToast } = useToast();

  const fetchProcesses = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setProcesses(await SystemAPI.fetchProcesses());
    } catch (err) {
      console.error('Failed to fetch processes:', err);
      setError(describeError(err));
    } finally {
      setIsLoading(false);
    }
  }, [setProcesses, setIsLoading, setError]);

  /** Starts a just-killed program again, from the Undo on the kill's toast. */
  const undoKill = useCallback(async (auditId: string, name: string) => {
    try {
      await SystemAPI.rollbackKill(auditId);
      addToast(`Relaunched ${name}.`, 'success');
    } catch (err) {
      addToast(describeRestoreError(err), restoreErrorLevel(err));
    }
  }, [addToast]);

  /**
   * Phase 8 kill cascade: confirm_termination (stage) then execute_termination (kill).
   * Resolves to an error message for the modal to display inline if staging is rejected,
   * or null once the cascade has finished (success or a toasted failure).
   */
  const terminateProcess = useCallback(async (proc: Process): Promise<string | null> => {
    // Step 1: stage the PID on the backend. Failure aborts and stays inside the modal.
    try {
      await SystemAPI.confirmKill(proc.pid);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'not_found') {
        removeProcess(proc.pid);
        addToast('Process already closed.', 'warning');
        return null;
      }
      return describeError(err);
    }

    // Step 2: execute the kill. Failures are reported as toasts and the modal closes.
    try {
      const result = await SystemAPI.executeKill(proc.pid);
      removeProcess(proc.pid);
      // A kill that was not recorded has no id and cannot be restored, so it offers no Undo
      const auditId = result.audit_id;
      addToast(
        `Successfully terminated ${proc.name}. Freed ${Math.round(result.freed_mb)}MB.`,
        'success',
        auditId ? { label: 'Undo', onAction: () => undoKill(auditId, proc.name) } : undefined,
      );
    } catch (err) {
      if (err instanceof ApiError && err.code === 'not_found') {
        // The process exited between the user's click and the kill
        removeProcess(proc.pid);
        addToast('Process already closed.', 'warning');
      } else {
        addToast(describeError(err), 'critical');
      }
    }

    return null;
  }, [removeProcess, addToast, undoKill]);

  return { fetchProcesses, terminateProcess, isLoading };
}
