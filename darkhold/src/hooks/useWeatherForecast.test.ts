import { describe, it, expect } from 'vitest';
import {
  getWeatherDisruptionBand,
  groupWeatherByDate,
  isWeatherRangeTooOld,
  parseWeatherForecastPayload,
} from './useWeatherForecast';
import type { WeatherDayForecast } from './useWeatherForecast';

describe('parseWeatherForecastPayload', () => {
  it('returns empty array for empty payload', () => {
    expect(parseWeatherForecastPayload({})).toEqual([]);
  });

  it('returns days from payload', () => {
    const days: WeatherDayForecast[] = [
      {
        date: '2026-05-01',
        weatherCode: 1,
        tempMinC: 8,
        tempMaxC: 14,
        sunrise: '2026-05-01T05:20',
        sunset: '2026-05-01T20:35',
        precipitationSumMm: 0,
        precipitationProbabilityMax: 10,
      },
    ];
    expect(parseWeatherForecastPayload({ days })).toEqual(days);
  });
});

describe('groupWeatherByDate', () => {
  it('groups weather day data by date', () => {
    const days: WeatherDayForecast[] = [
      {
        date: '2026-05-01',
        weatherCode: 1,
        tempMinC: 8,
        tempMaxC: 14,
        sunrise: '2026-05-01T05:20',
        sunset: '2026-05-01T20:35',
        precipitationSumMm: 0,
        precipitationProbabilityMax: 10,
      },
      {
        date: '2026-05-02',
        weatherCode: 63,
        tempMinC: 7,
        tempMaxC: 11,
        sunrise: '2026-05-02T05:18',
        sunset: '2026-05-02T20:37',
        precipitationSumMm: 6.5,
        precipitationProbabilityMax: 70,
      },
    ];
    const grouped = groupWeatherByDate(days);
    expect(Object.keys(grouped)).toEqual(['2026-05-01', '2026-05-02']);
    expect(grouped['2026-05-02'].weatherCode).toBe(63);
  });
});

describe('getWeatherDisruptionBand', () => {
  it('returns definitely_disrupted for high rain probability', () => {
    const day: WeatherDayForecast = {
      date: '2026-05-01',
      weatherCode: 61,
      tempMinC: 7,
      tempMaxC: 11,
      sunrise: '2026-05-01T05:20',
      sunset: '2026-05-01T20:35',
      precipitationSumMm: 3,
      precipitationProbabilityMax: 85,
    };
    expect(getWeatherDisruptionBand(day)).toBe('definitely_disrupted');
  });

  it('returns might_be_disrupted for moderate rain levels', () => {
    const day: WeatherDayForecast = {
      date: '2026-05-01',
      weatherCode: 61,
      tempMinC: 7,
      tempMaxC: 11,
      sunrise: '2026-05-01T05:20',
      sunset: '2026-05-01T20:35',
      precipitationSumMm: 2.5,
      precipitationProbabilityMax: 20,
    };
    expect(getWeatherDisruptionBand(day)).toBe('might_be_disrupted');
  });

  it('returns ok for low rain chance and amount', () => {
    const day: WeatherDayForecast = {
      date: '2026-05-01',
      weatherCode: 1,
      tempMinC: 8,
      tempMaxC: 14,
      sunrise: '2026-05-01T05:20',
      sunset: '2026-05-01T20:35',
      precipitationSumMm: 0.1,
      precipitationProbabilityMax: 15,
    };
    expect(getWeatherDisruptionBand(day)).toBe('ok');
  });
});

describe('isWeatherRangeTooOld', () => {
  it('returns true when range end is more than two months old', () => {
    expect(isWeatherRangeTooOld(new Date('2026-03-14T00:00:00Z'), new Date('2026-05-15T12:00:00Z'))).toBe(
      true,
    );
  });

  it('returns false when range end is within the two-month cutoff', () => {
    expect(isWeatherRangeTooOld(new Date('2026-03-15T00:00:00Z'), new Date('2026-05-15T12:00:00Z'))).toBe(
      false,
    );
  });
});
