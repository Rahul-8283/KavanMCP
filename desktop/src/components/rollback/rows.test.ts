import { describe, expect, it } from 'vitest';
import type { KillRecord } from '../../services/api';
import { applyBlocked, applyRestored } from './rows';

const kill = (id: string, extra: Partial<KillRecord> = {}): KillRecord => ({
  id, name: 'a.exe', pid: 1, tier: 3, killed_at: '2026-10-05T09:41:07Z', memory_freed_mb: 1, cpu_freed_pct: 0,
  executable_path: 'C:\\a.exe', reasoning: null, rolled_back_at: null, can_restore: true, restore_blocked_reason: null, ...extra,
});

describe('applyRestored', () => {
  it('marks only the restored row, and leaves the others as the very same objects', () => {
    const list = [kill('a'), kill('b'), kill('c')];

    const result = applyRestored(list, { id: 'b', rolled_back_at: '2026-10-05T09:43:30Z' });

    expect(result[0]).toBe(list[0]);
    expect(result[2]).toBe(list[2]);
    expect(result[1]).toMatchObject({ rolled_back_at: '2026-10-05T09:43:30Z', can_restore: false, restore_blocked_reason: 'already_restored' });
  });

  it('does not change the list it was given', () => {
    const list = [kill('a'), kill('b')];
    const before = JSON.stringify(list);

    applyRestored(list, { id: 'a', rolled_back_at: 'x' });

    expect(JSON.stringify(list)).toBe(before);
  });

  it('falls back to now when the response carries no time', () => {
    const result = applyRestored([kill('a')], { id: 'a', rolled_back_at: null }, new Date('2026-01-02T03:04:05Z'));

    expect(result[0].rolled_back_at).toBe('2026-01-02T03:04:05.000Z');
  });

  it('changes nothing for an id that is not listed', () => {
    const list = [kill('a')];

    expect(applyRestored(list, { id: 'zzz', rolled_back_at: 'x' })).toEqual(list);
  });
});

describe('applyBlocked', () => {
  it('stops offering a restore for that one row, without marking it restored', () => {
    const result = applyBlocked([kill('a'), kill('b')], 'b', 'exe_missing');

    expect(result[0].can_restore).toBe(true);
    expect(result[1]).toMatchObject({ can_restore: false, restore_blocked_reason: 'exe_missing', rolled_back_at: null });
  });
});
