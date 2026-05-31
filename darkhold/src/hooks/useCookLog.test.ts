import { describe, it, expect } from 'vitest';
import { buildCookLogTimestamp, isCookedOnDate, isDateInCookLogRange } from './useCookLog';
import type { CookedByDate } from './useCookLog';

describe('isCookedOnDate', () => {
  it('returns false when cookedByDate is undefined', () => {
    expect(isCookedOnDate(undefined, 1, '2026-01-01')).toBe(false);
  });

  it('returns false when date is not in the map', () => {
    const data: CookedByDate = { '2026-01-02': [5] };
    expect(isCookedOnDate(data, 5, '2026-01-01')).toBe(false);
  });

  it('returns false when recipe id is not in the date list', () => {
    const data: CookedByDate = { '2026-01-01': [3, 7] };
    expect(isCookedOnDate(data, 5, '2026-01-01')).toBe(false);
  });

  it('returns true when recipe id is present for the date', () => {
    const data: CookedByDate = { '2026-01-01': [3, 5, 7] };
    expect(isCookedOnDate(data, 5, '2026-01-01')).toBe(true);
  });

  it('returns false for empty recipe list', () => {
    const data: CookedByDate = { '2026-01-01': [] };
    expect(isCookedOnDate(data, 1, '2026-01-01')).toBe(false);
  });
});

describe('buildCookLogTimestamp', () => {
  it('uses meal type time for a historical date', () => {
    const ts = buildCookLogTimestamp('2026-01-01', { id: 1, name: 'Dinner', time: '18:30' });
    expect(ts).toBe('2026-01-01T18:30:00');
  });

  it('pads a HH:MM time with seconds', () => {
    const ts = buildCookLogTimestamp('2026-01-01', { id: 1, name: 'Lunch', time: '12:00' });
    expect(ts).toBe('2026-01-01T12:00:00');
  });

  it('keeps HH:MM:SS time as-is', () => {
    const ts = buildCookLogTimestamp('2026-01-01', { id: 1, name: 'Lunch', time: '12:00:00' });
    expect(ts).toBe('2026-01-01T12:00:00');
  });

  it('falls back to noon when no meal type time is provided', () => {
    const ts = buildCookLogTimestamp('2026-01-01');
    expect(ts).toBe('2026-01-01T12:00:00');
  });

  it('falls back to noon when meal type has no time field', () => {
    const ts = buildCookLogTimestamp('2026-01-01', { id: 1, name: 'Breakfast' });
    expect(ts).toBe('2026-01-01T12:00:00');
  });

  it('returns current ISO datetime for today', () => {
    const today = new Date().toISOString().split('T')[0];
    const ts = buildCookLogTimestamp(today, { id: 1, name: 'Dinner' });
    expect(ts.startsWith(today + 'T')).toBe(true);
    expect(ts).not.toBe(`${today}T12:00:00`); // not the historical fallback
  });
});

describe('isDateInCookLogRange', () => {
  it('returns true when a date is covered by the cached range', () => {
    expect(isDateInCookLogRange(['cook-log', '2026-05-23', '2026-05-29'], '2026-05-25')).toBe(true);
  });

  it('returns false when a date falls outside the cached range', () => {
    expect(isDateInCookLogRange(['cook-log', '2026-05-23', '2026-05-29'], '2026-05-30')).toBe(
      false,
    );
  });

  it('returns false for unrelated cache keys', () => {
    expect(isDateInCookLogRange(['meal-plan', '2026-05-23', '2026-05-29'], '2026-05-25')).toBe(
      false,
    );
  });
});
