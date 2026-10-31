import { describe, expect, it } from 'vitest';
import { ApiError } from '../../services/api';
import { BLOCKED_LABELS, describeRestoreError, restoreErrorLevel, restoreSentence } from './wording';

// The codes /api/rollback can answer with, from the backend's ROLLBACK_HTTP_STATUS
const BACKEND_CODES_WITH_A_SENTENCE = ['no_path', 'exe_missing', 'already_restored', 'launch_failed', 'not_found'];

describe('restore wording', () => {
  it.each(BACKEND_CODES_WITH_A_SENTENCE)('%s has a sentence', (code) => {
    expect(restoreSentence(code)).toMatch(/\S/);
  });

  it('uses the sentences the spec states', () => {
    expect(restoreSentence('no_path')).toBe('Kavan could not record where this program lives, so it cannot be restarted.');
    expect(restoreSentence('exe_missing')).toBe('The program file is no longer at its original location.');
    expect(restoreSentence('already_restored')).toBe('This was already restored.');
    expect(restoreSentence('launch_failed')).toBe('Windows could not start this program.');
    expect(restoreSentence('not_found')).toBe('This kill is no longer in the history.');
  });

  it('has no sentence for a code it does not know', () => {
    expect(restoreSentence('whatever')).toBeUndefined();
  });

  it('labels the two reasons a restore can never work', () => {
    expect(BLOCKED_LABELS).toEqual({ no_path: 'No path recorded', exe_missing: 'File missing' });
  });

  it('describes a coded error with its sentence', () => {
    expect(describeRestoreError(new ApiError('launch_failed', 'server words', 500))).toBe('Windows could not start this program.');
  });

  it("falls back to the server's own message for a code without a sentence, such as a database error", () => {
    expect(describeRestoreError(new ApiError('error', 'The audit database could not be read or updated.', 500)))
      .toBe('The audit database could not be read or updated.');
  });

  it('describes anything else by its own message', () => {
    expect(describeRestoreError(new Error('Backend Offline'))).toBe('Backend Offline');
    expect(describeRestoreError('x')).toBe('Unknown error');
  });

  it('toasts a backend that did not answer as critical, a refusal as a warning, and an already-restored kill quietly', () => {
    expect(restoreErrorLevel(new Error('Backend Offline'))).toBe('critical');
    expect(restoreErrorLevel(new ApiError('launch_failed', 'x'))).toBe('warning');
    expect(restoreErrorLevel(new ApiError('already_restored', 'x'))).toBe('info');
  });
});
