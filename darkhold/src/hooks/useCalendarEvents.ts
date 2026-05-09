import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDate } from '../utils/dateUtils';

export interface CalendarEvent {
  name: string;
  /** ISO 8601 UTC timestamp for timed events, or YYYY-MM-DD for all-day events */
  start: string;
  /** ISO 8601 UTC timestamp for timed events, or YYYY-MM-DD for all-day events */
  end?: string;
  allDay: boolean;
}

export interface CalendarFeedError {
  feed: string;
  message: string;
}

interface CalendarEventsPayload {
  events?: CalendarEvent[];
  errors?: CalendarFeedError[];
}

export function parseCalendarEventsPayload(data: CalendarEventsPayload): CalendarEvent[] {
  const errors = data.errors ?? [];
  if (errors.length > 0) {
    const details = errors.map((e) => `${e.feed}: ${e.message}`).join(' | ');
    throw new Error(`Calendar feed errors: ${details}`);
  }
  return data.events ?? [];
}

/** Calendar events grouped by local date (YYYY-MM-DD in the browser's timezone). */
export type CalendarEventsByDate = Record<string, CalendarEvent[]>;

/**
 * Format a timed event's start/end as a human-readable time range in the
 * browser's local timezone (e.g. "10:00 – 11:00" or "10:00").
 */
export function formatEventTimeRange(event: CalendarEvent): string | null {
  if (event.allDay) return null;
  try {
    const startDate = new Date(event.start);
    const startStr = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (!event.end) return startStr;
    const endDate = new Date(event.end);
    const endStr = endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${startStr} – ${endStr}`;
  } catch {
    return null;
  }
}

/**
 * Determine the local date (YYYY-MM-DD) an event belongs to.
 * For timed events, this is the date of the start time in the browser's timezone.
 * For all-day events, it is the start date string directly.
 */
function eventLocalDate(event: CalendarEvent): string {
  if (event.allDay) {
    return event.start; // already YYYY-MM-DD
  }
  try {
    const d = new Date(event.start);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch {
    return event.start.split('T')[0];
  }
}

/** Group events by their local date. */
export function groupEventsByLocalDate(events: CalendarEvent[]): CalendarEventsByDate {
  const result: CalendarEventsByDate = {};
  for (const event of events) {
    const date = eventLocalDate(event);
    if (!result[date]) result[date] = [];
    result[date].push(event);
  }
  return result;
}

async function fetchCalendarEvents(fromDate: string, toDate: string): Promise<CalendarEvent[]> {
  const url = `/calendar-events?from=${fromDate}&to=${toDate}`;
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) {
      // Endpoint not available (e.g. dev mode without the Deno server)
      return [];
    }
    throw new Error(`Calendar events fetch failed: ${res.status}`);
  }
  const data = (await res.json()) as CalendarEventsPayload;
  return parseCalendarEventsPayload(data);
}

/** staleTime for future/current events: 15 minutes */
const FUTURE_EVENTS_STALE_TIME_MS = 1000 * 60 * 15;
/** gcTime for past events: 24 hours (they rarely change) */
const PAST_EVENTS_GC_TIME_MS = 1000 * 60 * 60 * 24;
/** gcTime for future/current events: 1 hour */
const FUTURE_EVENTS_GC_TIME_MS = 1000 * 60 * 60;

/**
 * Fetch and cache iCal calendar events for a date range.
 *
 * Caching strategy:
 * - Past weeks (toDate < today): staleTime=Infinity — historical events are
 *   unlikely to change and we don't care if they do.
 * - Present/future weeks: staleTime=15 min — moderate freshness, React Query
 *   will revalidate in the background when the window regains focus.
 */
export function useCalendarEvents(fromDate: Date, toDate: Date) {
  const fromStr = formatDate(fromDate);
  const toStr = formatDate(toDate);
  const todayStr = formatDate(new Date());

  const isPast = toStr < todayStr;
  const staleTime = isPast ? Infinity : FUTURE_EVENTS_STALE_TIME_MS;

  const query = useQuery({
    queryKey: ['calendar-events', fromStr, toStr],
    queryFn: () => fetchCalendarEvents(fromStr, toStr),
    staleTime,
    gcTime: isPast ? PAST_EVENTS_GC_TIME_MS : FUTURE_EVENTS_GC_TIME_MS,
    // Silently return empty data on error — calendar feeds are non-critical
    retry: 1,
  });

  const byDate: CalendarEventsByDate = query.data ? groupEventsByLocalDate(query.data) : {};

  return { ...query, byDate };
}

/** Return a function that forces a background refetch of the current week's calendar events. */
export function useRefetchCalendarEvents(fromDate: Date, toDate: Date) {
  const qc = useQueryClient();
  const fromStr = formatDate(fromDate);
  const toStr = formatDate(toDate);
  return () => {
    qc.invalidateQueries({ queryKey: ['calendar-events', fromStr, toStr] });
  };
}
