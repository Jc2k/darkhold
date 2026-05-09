import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDate } from '../utils/dateUtils';

export interface WeatherDayForecast {
  date: string;
  weatherCode: number;
  tempMinC: number;
  tempMaxC: number;
  sunrise: string;
  sunset: string;
  precipitationSumMm: number;
  precipitationProbabilityMax: number;
}

interface WeatherForecastPayload {
  days?: WeatherDayForecast[];
}

export type WeatherDisruptionBand = 'ok' | 'might_be_disrupted' | 'definitely_disrupted';

export type WeatherByDate = Record<string, WeatherDayForecast>;

// Loose day-level rain disruption bands:
// - "definitely" for heavy rain totals or very high rain probability
// - "might" for moderate totals/probability where outdoor plans may be impacted
// - otherwise "ok"
const DEFINITELY_DISRUPTED_PRECIP_MM = 8;
const DEFINITELY_DISRUPTED_PRECIP_PROBABILITY = 80;
const MIGHT_BE_DISRUPTED_PRECIP_MM = 2;
const MIGHT_BE_DISRUPTED_PRECIP_PROBABILITY = 40;

export function parseWeatherForecastPayload(data: WeatherForecastPayload): WeatherDayForecast[] {
  return data.days ?? [];
}

export function groupWeatherByDate(days: WeatherDayForecast[]): WeatherByDate {
  return days.reduce<WeatherByDate>((acc, day) => {
    acc[day.date] = day;
    return acc;
  }, {});
}

export function getWeatherDisruptionBand(day: WeatherDayForecast): WeatherDisruptionBand {
  if (
    day.precipitationSumMm >= DEFINITELY_DISRUPTED_PRECIP_MM ||
    day.precipitationProbabilityMax >= DEFINITELY_DISRUPTED_PRECIP_PROBABILITY
  ) {
    return 'definitely_disrupted';
  }
  if (
    day.precipitationSumMm >= MIGHT_BE_DISRUPTED_PRECIP_MM ||
    day.precipitationProbabilityMax >= MIGHT_BE_DISRUPTED_PRECIP_PROBABILITY
  ) {
    return 'might_be_disrupted';
  }
  return 'ok';
}

async function fetchWeatherForecast(
  fromDate: string,
  toDate: string,
): Promise<WeatherDayForecast[]> {
  const url = `/weather-forecast?from=${fromDate}&to=${toDate}`;
  const res = await fetch(url);
  if (!res.ok) {
    // Match calendar behavior: when the Deno sidecar endpoint is unavailable
    // (e.g. local frontend-only dev), fail open with empty weather data.
    if (res.status === 404) return [];
    throw new Error(`Weather forecast fetch failed: ${res.status}`);
  }
  const text = await res.text();
  let data: WeatherForecastPayload;
  try {
    data = JSON.parse(text) as WeatherForecastPayload;
  } catch {
    console.error('Weather forecast: non-JSON response received:', text.slice(0, 500));
    throw new Error('Weather forecast response was not valid JSON');
  }
  return parseWeatherForecastPayload(data);
}

/** staleTime for future/current weather: 30 minutes */
const FUTURE_WEATHER_STALE_TIME_MS = 1000 * 60 * 30;
/** gcTime for past weather: 24 hours */
const PAST_WEATHER_GC_TIME_MS = 1000 * 60 * 60 * 24;
/** gcTime for future/current weather: 1 hour */
const FUTURE_WEATHER_GC_TIME_MS = 1000 * 60 * 60;

export function useWeatherForecast(fromDate: Date, toDate: Date) {
  const fromStr = formatDate(fromDate);
  const toStr = formatDate(toDate);
  const todayStr = formatDate(new Date());
  const isPast = toStr < todayStr;

  const query = useQuery({
    queryKey: ['weather-forecast', fromStr, toStr],
    queryFn: () => fetchWeatherForecast(fromStr, toStr),
    staleTime: isPast ? Infinity : FUTURE_WEATHER_STALE_TIME_MS,
    gcTime: isPast ? PAST_WEATHER_GC_TIME_MS : FUTURE_WEATHER_GC_TIME_MS,
    retry: 1,
  });

  const byDate: WeatherByDate = query.data ? groupWeatherByDate(query.data) : {};
  return { ...query, byDate };
}

export function useRefetchWeatherForecast(fromDate: Date, toDate: Date) {
  const qc = useQueryClient();
  const fromStr = formatDate(fromDate);
  const toStr = formatDate(toDate);
  return () => {
    qc.invalidateQueries({ queryKey: ['weather-forecast', fromStr, toStr] });
  };
}
