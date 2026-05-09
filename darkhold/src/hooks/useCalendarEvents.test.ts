import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  groupEventsByLocalDate,
  formatEventTimeRange,
  parseCalendarEventsPayload,
} from './useCalendarEvents';
import type { CalendarEvent } from './useCalendarEvents';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('groupEventsByLocalDate', () => {
  it('groups timed events by local date', () => {
    const events: CalendarEvent[] = [
      {
        name: 'Morning call',
        start: '2025-05-07T09:00:00.000Z',
        end: '2025-05-07T10:00:00.000Z',
        allDay: false,
      },
      { name: 'Afternoon meeting', start: '2025-05-07T14:00:00.000Z', allDay: false },
      { name: 'Next day event', start: '2025-05-08T09:00:00.000Z', allDay: false },
    ];
    const grouped = groupEventsByLocalDate(events);
    // The exact date depends on the local timezone, but each event should appear in exactly one date bucket
    const allDates = Object.keys(grouped);
    expect(allDates.length).toBeGreaterThanOrEqual(1);
    const totalEvents = Object.values(grouped).reduce((sum, arr) => sum + arr.length, 0);
    expect(totalEvents).toBe(3);
  });

  it('groups all-day events by their start date string', () => {
    const events: CalendarEvent[] = [
      { name: 'Birthday', start: '2025-05-07', allDay: true },
      { name: 'Holiday', start: '2025-05-08', allDay: true },
      { name: 'Conference', start: '2025-05-07', allDay: true },
    ];
    const grouped = groupEventsByLocalDate(events);
    expect(grouped['2025-05-07']).toHaveLength(2);
    expect(grouped['2025-05-08']).toHaveLength(1);
  });

  it('returns empty object for empty input', () => {
    expect(groupEventsByLocalDate([])).toEqual({});
  });
});

describe('formatEventTimeRange', () => {
  it('returns null for all-day events', () => {
    const event: CalendarEvent = { name: 'Birthday', start: '2025-05-07', allDay: true };
    expect(formatEventTimeRange(event)).toBeNull();
  });

  it('returns time range string for timed events with start and end', () => {
    const event: CalendarEvent = {
      name: 'Meeting',
      start: '2025-05-07T10:00:00.000Z',
      end: '2025-05-07T11:00:00.000Z',
      allDay: false,
    };
    const result = formatEventTimeRange(event);
    expect(result).not.toBeNull();
    // Should contain a dash/separator between two times
    expect(result).toMatch(/–/);
  });

  it('returns single time string for timed events with no end', () => {
    const event: CalendarEvent = {
      name: 'Reminder',
      start: '2025-05-07T10:00:00.000Z',
      allDay: false,
    };
    const result = formatEventTimeRange(event);
    expect(result).not.toBeNull();
    expect(result).not.toMatch(/–/);
  });
});

describe('parseCalendarEventsPayload', () => {
  it('returns empty array when payload is empty', () => {
    expect(parseCalendarEventsPayload({})).toEqual([]);
  });

  it('returns events when no feed errors are present', () => {
    const events: CalendarEvent[] = [
      { name: 'Meeting', start: '2025-05-07T10:00:00.000Z', allDay: false },
    ];
    expect(parseCalendarEventsPayload({ events })).toEqual(events);
  });

  it('throws descriptive error when feed errors are present', () => {
    expect(() =>
      parseCalendarEventsPayload({
        events: [],
        errors: [{ feed: 'Family', message: 'CalDAV REPORT failed: HTTP 401' }],
      }),
    ).toThrow('Calendar feed errors: Family: CalDAV REPORT failed: HTTP 401');
  });

  it('throws when both events and errors are present', () => {
    expect(() =>
      parseCalendarEventsPayload({
        events: [{ name: 'Ignored event', start: '2025-05-07T10:00:00.000Z', allDay: false }],
        errors: [{ feed: 'Work', message: 'timeout' }],
      }),
    ).toThrow('Calendar feed errors: Work: timeout');
  });
});
