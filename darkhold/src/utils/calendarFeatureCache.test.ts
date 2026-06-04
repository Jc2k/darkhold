import { describe, expect, it, vi } from 'vitest';
import type { CalendarFeatureCache } from './calendarFeatureCache';
import {
  coalesceDateRanges,
  createEmptyCalendarFeatureCache,
  extendCalendarFeatureCache,
  getMissingCalendarFeatureDates,
  isCalendarFeatureCache,
  normalizeCacheDates,
} from './calendarFeatureCache';

describe('calendarFeatureCache', () => {
  it('creates and validates an empty cache', () => {
    const cache = createEmptyCalendarFeatureCache('2026-01-01T00:00:00.000Z');
    expect(cache).toEqual({
      schemaVersion: 1,
      generatedAt: '2026-01-01T00:00:00.000Z',
      dates: {},
    });
    expect(isCalendarFeatureCache(cache)).toBe(true);
    expect(isCalendarFeatureCache({ schemaVersion: 999 })).toBe(false);
  });

  it('normalizes cache dates and coalesces ranges', () => {
    expect(
      normalizeCacheDates(
        ['2026-01-03', '2026-01-01T12:00:00Z', 'bad', '2026-01-03'],
        new Date('2026-01-02T00:00:00Z'),
      ),
    ).toEqual(['2026-01-01']);
    expect(coalesceDateRanges(['2026-01-01', '2026-01-02', '2026-01-04'])).toEqual([
      { fromDate: '2026-01-01', toDate: '2026-01-02' },
      { fromDate: '2026-01-04', toDate: '2026-01-04' },
    ]);
  });

  it('finds missing dates and extends the cache with empty historical days', async () => {
    const cache: CalendarFeatureCache = {
      ...createEmptyCalendarFeatureCache('2026-01-01T00:00:00.000Z'),
      dates: {
        '2026-01-01': { bankHoliday: false, appointmentFeatures: [] },
      },
    };
    expect(
      getMissingCalendarFeatureDates(cache, ['2026-01-01', '2026-01-02', '2026-01-03']),
    ).toEqual(['2026-01-02', '2026-01-03']);

    const fetchRange = vi.fn().mockResolvedValue([
      { date: '2026-01-02', bankHoliday: true, appointmentFeatures: [] },
      { date: '2026-01-03', bankHoliday: false, appointmentFeatures: ['bob|long', 'bob|long'] },
    ]);
    const next = await extendCalendarFeatureCache(
      cache,
      ['2026-01-01', '2026-01-02', '2026-01-03'],
      fetchRange,
      '2026-01-04T00:00:00.000Z',
    );

    expect(fetchRange).toHaveBeenCalledWith('2026-01-02', '2026-01-03');
    expect(next).toEqual({
      schemaVersion: 1,
      generatedAt: '2026-01-04T00:00:00.000Z',
      dates: {
        '2026-01-01': { bankHoliday: false, appointmentFeatures: [] },
        '2026-01-02': { bankHoliday: true, appointmentFeatures: [] },
        '2026-01-03': { bankHoliday: false, appointmentFeatures: ['bob|long'] },
      },
    });
  });
});
