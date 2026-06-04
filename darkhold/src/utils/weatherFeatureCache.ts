import type { WeatherFeatureDay, WeatherFeatures } from './weatherFeatures.ts';
import { deriveWeatherFeatures } from './weatherFeatures.ts';

export const WEATHER_FEATURE_CACHE_SCHEMA_VERSION = 1;

export interface WeatherFeatureCacheRange {
  fromDate: string;
  toDate: string;
}

export interface WeatherFeatureCache {
  schemaVersion: typeof WEATHER_FEATURE_CACHE_SCHEMA_VERSION;
  generatedAt: string;
  dates: Record<string, WeatherFeatures>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeDateString(value: string): string | null {
  const date = value.includes('T') ? value.split('T')[0] : value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : date;
}

function addDays(date: string, offset: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  return new Date(parsed.getTime() + offset * DAY_MS).toISOString().slice(0, 10);
}

function sortedEntries(dates: Record<string, WeatherFeatures>): Array<[string, WeatherFeatures]> {
  return Object.entries(dates).sort(([left], [right]) => left.localeCompare(right));
}

function getHttpStatusFromError(error: unknown): number | null {
  if (typeof error === 'object' && error !== null) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === 'number' && Number.isInteger(status) && status >= 400 && status <= 599)
      return status;
  }
  if (error instanceof Error) {
    const match = error.message.match(/\bHTTP\s+(\d{3})\b/);
    if (!match) return null;
    const status = Number(match[1]);
    if (Number.isInteger(status) && status >= 400 && status <= 599) return status;
  }
  return null;
}

export function createEmptyWeatherFeatureCache(
  generatedAt = new Date().toISOString(),
): WeatherFeatureCache {
  return {
    schemaVersion: WEATHER_FEATURE_CACHE_SCHEMA_VERSION,
    generatedAt,
    dates: {},
  };
}

export function isWeatherFeatureCache(value: unknown): value is WeatherFeatureCache {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Partial<WeatherFeatureCache>;
  return (
    record.schemaVersion === WEATHER_FEATURE_CACHE_SCHEMA_VERSION &&
    typeof record.generatedAt === 'string' &&
    typeof record.dates === 'object' &&
    record.dates !== null
  );
}

export function normalizeCacheDates(dates: Iterable<string>, today = new Date()): string[] {
  const todayStr = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  )
    .toISOString()
    .slice(0, 10);
  return [...new Set([...dates].map(normalizeDateString).filter((date): date is string => !!date))]
    .filter((date) => date <= todayStr)
    .sort((left, right) => left.localeCompare(right));
}

export function coalesceDateRanges(dates: Iterable<string>): WeatherFeatureCacheRange[] {
  const normalizedDates = normalizeCacheDates(dates, new Date('9999-12-31T00:00:00Z'));
  if (normalizedDates.length === 0) return [];
  const ranges: WeatherFeatureCacheRange[] = [];
  let rangeStart = normalizedDates[0];
  let rangeEnd = normalizedDates[0];
  for (const date of normalizedDates.slice(1)) {
    if (date === addDays(rangeEnd, 1)) {
      rangeEnd = date;
      continue;
    }
    ranges.push({ fromDate: rangeStart, toDate: rangeEnd });
    rangeStart = date;
    rangeEnd = date;
  }
  ranges.push({ fromDate: rangeStart, toDate: rangeEnd });
  return ranges;
}

export function getMissingWeatherFeatureDates(
  cache: WeatherFeatureCache,
  requiredDates: Iterable<string>,
  today = new Date(),
): string[] {
  return normalizeCacheDates(requiredDates, today).filter((date) => !(date in cache.dates));
}

export async function extendWeatherFeatureCache(
  cache: WeatherFeatureCache,
  requiredDates: Iterable<string>,
  fetchRange: (fromDate: string, toDate: string) => Promise<WeatherFeatureDay[]>,
  generatedAt = new Date().toISOString(),
  today = new Date(),
): Promise<WeatherFeatureCache> {
  const missingDates = getMissingWeatherFeatureDates(cache, requiredDates, today);
  if (missingDates.length === 0) return cache;

  const nextDates = { ...cache.dates };
  const missingDateSet = new Set(missingDates);
  const ranges = coalesceDateRanges(missingDates);
  let addedDateCount = 0;
  for (const range of ranges) {
    let days: WeatherFeatureDay[];
    try {
      days = await fetchRange(range.fromDate, range.toDate);
    } catch (error) {
      if (getHttpStatusFromError(error) !== null) break;
      throw error;
    }
    for (const day of days) {
      if (!missingDateSet.has(day.date)) continue;
      if (day.date in nextDates) continue;
      nextDates[day.date] = deriveWeatherFeatures(day);
      addedDateCount += 1;
    }
  }

  if (addedDateCount === 0) return cache;

  return {
    schemaVersion: WEATHER_FEATURE_CACHE_SCHEMA_VERSION,
    generatedAt,
    dates: Object.fromEntries(sortedEntries(nextDates)),
  };
}
