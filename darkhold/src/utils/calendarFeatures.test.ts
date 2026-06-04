import { describe, expect, it } from 'vitest';
import {
  buildCalendarFeatureDay,
  calendarAppointmentFeatureKey,
  calendarAppointmentLength,
  describeCalendarAppointmentFeature,
  extractCalendarTokens,
  parseCalendarAppointmentFeatureKey,
} from './calendarFeatures';

describe('calendarFeatures', () => {
  it('extracts normalized calendar tokens and ignores stop words', () => {
    expect(extractCalendarTokens('Dinner with Bob at School pickup')).toEqual([
      'bob',
      'pickup',
      'school',
    ]);
  });

  it('builds and parses appointment feature keys', () => {
    const featureKey = calendarAppointmentFeatureKey('Bob', 'long');
    expect(featureKey).toBe('bob|long');
    expect(parseCalendarAppointmentFeatureKey(featureKey)).toEqual({
      token: 'bob',
      length: 'long',
    });
    expect(describeCalendarAppointmentFeature(featureKey)).toBe(
      '"bob" appears in a long appointment',
    );
  });

  it('classifies appointment length buckets', () => {
    expect(
      calendarAppointmentLength({
        allDay: false,
        start: '2026-07-22T10:00:00Z',
        end: '2026-07-22T11:00:00Z',
      }),
    ).toBe('short');
    expect(
      calendarAppointmentLength({
        allDay: false,
        start: '2026-07-22T10:00:00Z',
        end: '2026-07-22T12:30:00Z',
      }),
    ).toBe('medium');
    expect(
      calendarAppointmentLength({
        allDay: false,
        start: '2026-07-22T10:00:00Z',
        end: '2026-07-22T15:30:00Z',
      }),
    ).toBe('long');
    expect(
      calendarAppointmentLength({
        allDay: true,
        start: '2026-07-22',
      }),
    ).toBe('full-day');
  });

  it('builds calendar feature days from appointments and bank holidays', () => {
    expect(
      buildCalendarFeatureDay([
        {
          name: 'Dinner with Bob',
          description: 'School pickup before leaving',
          start: '2026-07-22T16:00:00Z',
          end: '2026-07-22T19:30:00Z',
          allDay: false,
          category: 'appointment',
        },
        {
          name: 'Weekly Bob catchup',
          start: '2026-07-22T08:00:00Z',
          end: '2026-07-22T08:30:00Z',
          allDay: false,
          category: 'appointment',
          recurring: true,
        },
        {
          name: 'Spring bank holiday',
          start: '2026-07-22',
          allDay: true,
          category: 'bank-holiday',
        },
      ]),
    ).toEqual({
      bankHoliday: true,
      appointmentFeatures: ['bob|long', 'leaving|long', 'pickup|long', 'school|long'],
    });
  });
});
