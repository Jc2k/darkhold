import { describe, expect, it, vi } from 'vitest';
import type { WeatherFeatureCache } from './weatherFeatureCache';
import {
  coalesceDateRanges,
  createEmptyWeatherFeatureCache,
  extendWeatherFeatureCache,
} from './weatherFeatureCache';

describe('weatherFeatureCache', () => {
  it('coalesces contiguous sorted date ranges', () => {
    expect(
      coalesceDateRanges([
        '2026-01-05',
        '2026-01-02',
        '2026-01-03',
        '2026-01-03',
        '2026-01-07',
        '2026-01-09',
        '2026-01-08',
      ]),
    ).toEqual([
      { fromDate: '2026-01-02', toDate: '2026-01-03' },
      { fromDate: '2026-01-05', toDate: '2026-01-05' },
      { fromDate: '2026-01-07', toDate: '2026-01-09' },
    ]);
  });

  it('extends the cache by fetching only missing coalesced ranges', async () => {
    const fetchRange = vi.fn(async (fromDate: string, toDate: string) => {
      if (fromDate === '2026-01-02' && toDate === '2026-01-03') {
        return [
          {
            date: '2026-01-02',
            tempMinC: 2,
            tempMaxC: 8,
            sunrise: '2026-01-02T08:00:00Z',
            sunset: '2026-01-02T16:00:00Z',
            precipitationSumMm: 0.1,
            precipitationProbabilityMax: 10,
          },
          {
            date: '2026-01-03',
            tempMinC: 3,
            tempMaxC: 9,
            sunrise: '2026-01-03T08:00:00Z',
            sunset: '2026-01-03T16:01:00Z',
            precipitationSumMm: 0.2,
            precipitationProbabilityMax: 15,
          },
        ];
      }
      if (fromDate === '2026-01-05' && toDate === '2026-01-05') {
        return [
          {
            date: '2026-01-05',
            tempMinC: 6,
            tempMaxC: 18,
            sunrise: '2026-01-05T07:59:00Z',
            sunset: '2026-01-05T16:05:00Z',
            precipitationSumMm: 2.5,
            precipitationProbabilityMax: 55,
          },
        ];
      }
      throw new Error(`Unexpected range ${fromDate}..${toDate}`);
    });

    const cache: WeatherFeatureCache = {
      ...createEmptyWeatherFeatureCache('2026-01-01T00:00:00.000Z'),
      dates: {
        '2026-01-01': {
          temperatureBand: 'cold',
          precipitationBand: 'dry',
          daylightHours: 8,
          daylightBand: 'short',
          outdoorSuitability: 'poor',
          tags: ['cold-day', 'dry-day', 'short-daylight', 'outdoor-poor'],
        },
        '2026-01-04': {
          temperatureBand: 'cool',
          precipitationBand: 'dry',
          daylightHours: 8.1,
          daylightBand: 'short',
          outdoorSuitability: 'poor',
          tags: ['cool-day', 'dry-day', 'short-daylight', 'outdoor-poor'],
        },
      },
    };

    const next = await extendWeatherFeatureCache(
      cache,
      ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05'],
      fetchRange,
      '2026-01-06T00:00:00.000Z',
      new Date('2026-01-06T12:00:00Z'),
    );

    expect(fetchRange).toHaveBeenCalledTimes(2);
    expect(fetchRange).toHaveBeenNthCalledWith(1, '2026-01-02', '2026-01-03');
    expect(fetchRange).toHaveBeenNthCalledWith(2, '2026-01-05', '2026-01-05');
    expect(next.generatedAt).toBe('2026-01-06T00:00:00.000Z');
    expect(Object.keys(next.dates)).toEqual([
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
      '2026-01-04',
      '2026-01-05',
    ]);
    expect(next.dates['2026-01-05']).toMatchObject({
      temperatureBand: 'mild',
      precipitationBand: 'showery',
      daylightBand: 'short',
      outdoorSuitability: 'fair',
    });
  });
});
