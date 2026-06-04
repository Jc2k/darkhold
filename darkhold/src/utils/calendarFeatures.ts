export type CalendarFeatureEventCategory = 'appointment' | 'bank-holiday' | 'context';

export interface CalendarFeatureEventLike {
  name: string;
  description?: string;
  start: string;
  end?: string;
  allDay: boolean;
  category?: CalendarFeatureEventCategory;
  recurring?: boolean;
}

export type CalendarAppointmentLength = 'short' | 'medium' | 'long' | 'full-day';

export interface CalendarFeatureDay {
  bankHoliday: boolean;
  appointmentFeatures: string[];
}

const DEFAULT_EVENT_CATEGORY: CalendarFeatureEventCategory = 'appointment';
const SHORT_APPOINTMENT_MAX_MINUTES = 90;
const MEDIUM_APPOINTMENT_MAX_MINUTES = 180;
const TOKEN_MIN_LENGTH = 3;
const CALENDAR_TOKEN_STOP_WORDS = new Set([
  'all',
  'and',
  'after',
  'appointment',
  'are',
  'at',
  'before',
  'calendar',
  'call',
  'day',
  'dinner',
  'for',
  'first',
  'from',
  'have',
  'home',
  'into',
  'meeting',
  'our',
  'out',
  'over',
  'the',
  'this',
  'visit',
  'with',
  'work',
]);

function normalizedText(value: string): string {
  return value.trim().toLowerCase();
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set([...values].map(normalizedText).filter(Boolean))].sort();
}

function appointmentDurationMinutes(
  event: Pick<CalendarFeatureEventLike, 'allDay' | 'start' | 'end'>,
): number {
  if (event.allDay) return 24 * 60;
  const start = new Date(event.start);
  if (Number.isNaN(start.getTime())) return 60;
  const fallbackEnd = new Date(start.getTime() + 60 * 60 * 1000);
  const end = event.end ? new Date(event.end) : fallbackEnd;
  if (Number.isNaN(end.getTime())) return 60;
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / (60 * 1000)));
}

export function calendarAppointmentLength(
  event: Pick<CalendarFeatureEventLike, 'allDay' | 'start' | 'end'>,
): CalendarAppointmentLength {
  if (event.allDay) return 'full-day';
  const durationMinutes = appointmentDurationMinutes(event);
  if (durationMinutes <= SHORT_APPOINTMENT_MAX_MINUTES) return 'short';
  if (durationMinutes <= MEDIUM_APPOINTMENT_MAX_MINUTES) return 'medium';
  return 'long';
}

export function extractCalendarTokens(value: string): string[] {
  return uniqueSorted(
    value.match(/[a-z0-9]+(?:['’-][a-z0-9]+)*/gi)?.filter((token) => {
      const normalized = normalizedText(token);
      return normalized.length >= TOKEN_MIN_LENGTH && !CALENDAR_TOKEN_STOP_WORDS.has(normalized);
    }) ?? [],
  );
}

export function calendarAppointmentFeatureKey(
  token: string,
  length: CalendarAppointmentLength,
): string {
  return `${normalizedText(token)}|${length}`;
}

export function parseCalendarAppointmentFeatureKey(
  featureKey: string,
): { token: string; length: CalendarAppointmentLength } | null {
  const [token, length] = featureKey.split('|');
  if (!token || !length) return null;
  if (length !== 'short' && length !== 'medium' && length !== 'long' && length !== 'full-day') {
    return null;
  }
  return { token, length };
}

export function describeCalendarAppointmentFeature(featureKey: string): string {
  const parsed = parseCalendarAppointmentFeatureKey(featureKey);
  if (!parsed) return featureKey;
  if (parsed.length === 'full-day') return `"${parsed.token}" appears on an all-day event`;
  return `"${parsed.token}" appears in a ${parsed.length} appointment`;
}

export function buildCalendarFeatureDay(
  events: readonly CalendarFeatureEventLike[],
): CalendarFeatureDay {
  const appointmentFeatures = uniqueSorted(
    events.flatMap((event) => {
      const category = event.category ?? DEFAULT_EVENT_CATEGORY;
      if (category !== DEFAULT_EVENT_CATEGORY || event.recurring) return [];
      const length = calendarAppointmentLength(event);
      return uniqueSorted([event.name, event.description ?? ''].flatMap(extractCalendarTokens)).map(
        (token) => calendarAppointmentFeatureKey(token, length),
      );
    }),
  );

  return {
    bankHoliday: events.some((event) => event.category === 'bank-holiday'),
    appointmentFeatures,
  };
}
