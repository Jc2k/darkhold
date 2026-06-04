import type { CalendarFeatureDay } from './calendarFeatures.ts';

export const CALENDAR_FEATURE_CACHE_SCHEMA_VERSION = 1;

export interface CalendarFeatureCacheRange {
  fromDate: string;
  toDate: string;
}

export interface CalendarFeatureCache {
  schemaVersion: typeof CALENDAR_FEATURE_CACHE_SCHEMA_VERSION;
  generatedAt: string;
  dates: Record<string, CalendarFeatureDay>;
}

export interface CalendarFeatureCacheDay extends CalendarFeatureDay {
  date: string;
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

function sortedEntries(
  dates: Record<string, CalendarFeatureDay>,
): Array<[string, CalendarFeatureDay]> {
  return Object.entries(dates).sort(([left], [right]) => left.localeCompare(right));
}

export function createEmptyCalendarFeatureCache(
  generatedAt = new Date().toISOString(),
): CalendarFeatureCache {
  return {
    schemaVersion: CALENDAR_FEATURE_CACHE_SCHEMA_VERSION,
    generatedAt,
    dates: {},
  };
}

export function isCalendarFeatureCache(value: unknown): value is CalendarFeatureCache {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Partial<CalendarFeatureCache>;
  return (
    record.schemaVersion === CALENDAR_FEATURE_CACHE_SCHEMA_VERSION &&
    typeof record.generatedAt === 'string' &&
    typeof record.dates === 'object' &&
    record.dates !== null &&
    Object.values(record.dates).every(
      (day) =>
        typeof day === 'object' &&
        day !== null &&
        typeof (day as CalendarFeatureDay).bankHoliday === 'boolean' &&
        Array.isArray((day as CalendarFeatureDay).appointmentFeatures) &&
        (day as CalendarFeatureDay).appointmentFeatures.every((feature) => typeof feature === 'string'),
    )
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

export function coalesceDateRanges(dates: Iterable<string>): CalendarFeatureCacheRange[] {
  const normalizedDates = normalizeCacheDates(dates, new Date('9999-12-31T00:00:00Z'));
  if (normalizedDates.length === 0) return [];
  const ranges: CalendarFeatureCacheRange[] = [];
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

export function getMissingCalendarFeatureDates(
  cache: CalendarFeatureCache,
  requiredDates: Iterable<string>,
  today = new Date(),
): string[] {
  return normalizeCacheDates(requiredDates, today).filter((date) => !(date in cache.dates));
}

export async function extendCalendarFeatureCache(
  cache: CalendarFeatureCache,
  requiredDates: Iterable<string>,
  fetchRange: (fromDate: string, toDate: string) => Promise<CalendarFeatureCacheDay[]>,
  generatedAt = new Date().toISOString(),
  today = new Date(),
): Promise<CalendarFeatureCache> {
  const missingDates = getMissingCalendarFeatureDates(cache, requiredDates, today);
  if (missingDates.length === 0) return cache;

  const nextDates = { ...cache.dates };
  const missingDateSet = new Set(missingDates);
  const ranges = coalesceDateRanges(missingDates);
  let addedDateCount = 0;

  for (const range of ranges) {
    const days = await fetchRange(range.fromDate, range.toDate);
    for (const day of days) {
      if (!missingDateSet.has(day.date)) continue;
      if (day.date in nextDates) continue;
      nextDates[day.date] = {
        bankHoliday: day.bankHoliday,
        appointmentFeatures: [...new Set(day.appointmentFeatures)].sort(),
      };
      addedDateCount += 1;
    }
  }

  if (addedDateCount === 0) return cache;

  return {
    schemaVersion: CALENDAR_FEATURE_CACHE_SCHEMA_VERSION,
    generatedAt,
    dates: Object.fromEntries(sortedEntries(nextDates)),
  };
}
