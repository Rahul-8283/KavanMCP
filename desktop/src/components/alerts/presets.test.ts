import { describe, expect, it } from 'vitest';
import { presetsWithin, rangeWithin } from './AlertFilters';

describe('presetsWithin', () => {
  it('offers every preset when 30 days are kept', () => {
    expect(presetsWithin(30)).toEqual(['24h', '7d', '30d', 'custom']);
  });

  it('offers no preset longer than the history kept', () => {
    expect(presetsWithin(14)).toEqual(['24h', '7d', 'custom']);
    expect(presetsWithin(7)).toEqual(['24h', '7d', 'custom']);
  });

  it('always offers a custom range', () => {
    expect(presetsWithin(1)).toContain('custom');
  });
});

describe('rangeWithin', () => {
  it('keeps a range that fits', () => {
    expect(rangeWithin('7d', 7)).toBe('7d');
    expect(rangeWithin('24h', 7)).toBe('24h');
    expect(rangeWithin('30d', 30)).toBe('30d');
  });

  it('falls back to the longest preset that fits', () => {
    expect(rangeWithin('30d', 7)).toBe('7d');
    expect(rangeWithin('30d', 14)).toBe('7d');
  });

  it('leaves a custom range alone', () => {
    expect(rangeWithin('custom', 7)).toBe('custom');
  });
});
