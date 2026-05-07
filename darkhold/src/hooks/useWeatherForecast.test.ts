import { describe, it, expect } from 'vitest';
import {
  getWeatherDisruptionBand,
  groupWeatherByDate,
  parseWeatherForecastResponse,
  parseWeatherForecastPayload,
} from './useWeatherForecast';
import type { WeatherDayForecast } from './useWeatherForecast';

describe('parseWeatherForecastPayload', () => {
  it('returns empty array for empty payload', () => {
    expect(parseWeatherForecastPayload({})).toEqual([]);
  });

  it('returns days from payload', () => {
    const days: WeatherDayForecast[] = [{
      date: '2026-05-01',
      weatherCode: 1,
      tempMinC: 8,
      tempMaxC: 14,
      sunrise: '2026-05-01T05:20',
      sunset: '2026-05-01T20:35',
      precipitationSumMm: 0,
      precipitationProbabilityMax: 10,
    }];
    expect(parseWeatherForecastPayload({ days })).toEqual(days);
  });
});

describe('parseWeatherForecastResponse', () => {
  it('returns parsed JSON payloads', async () => {
    const res = new Response(JSON.stringify({ days: [] }), {
      headers: { 'Content-Type': 'application/json' },
    });

    await expect(parseWeatherForecastResponse(res)).resolves.toEqual({ days: [] });
  });

  it('returns null for html fallback responses', async () => {
    const res = new Response('<!doctype html><html></html>', {
      headers: { 'Content-Type': 'text/html' },
    });

    await expect(parseWeatherForecastResponse(res)).resolves.toBeNull();
  });

  it('returns null when the response has no json content type', async () => {
    const res = new Response(JSON.stringify({ days: [] }));

    await expect(parseWeatherForecastResponse(res)).resolves.toBeNull();
  });

  it('returns null for invalid json responses', async () => {
    const res = new Response('not json', {
      headers: { 'Content-Type': 'application/json' },
    });

    await expect(parseWeatherForecastResponse(res)).resolves.toBeNull();
  });

  it('returns null for json values that are not objects', async () => {
    const res = new Response('"oops"', {
      headers: { 'Content-Type': 'application/json' },
    });

    await expect(parseWeatherForecastResponse(res)).resolves.toBeNull();
  });

  it('returns null for json arrays', async () => {
    const res = new Response('[]', {
      headers: { 'Content-Type': 'application/json' },
    });

    await expect(parseWeatherForecastResponse(res)).resolves.toBeNull();
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
