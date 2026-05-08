import { describe, it, expect } from 'vitest';
import {
  formatDate,
  formatMonthYear,
  getMealPlanWeekStartSaturday,
  getWeekStartingSaturday,
  parseLocalDate,
} from './dateUtils';

describe('formatDate', () => {
  it('formats a date using local date components, not UTC', () => {
    // A date set to midnight local time — toISOString() would shift this back a day
    // for any timezone east of UTC.
    const d = new Date(2024, 0, 15); // Jan 15 2024, midnight local
    expect(formatDate(d)).toBe('2024-01-15');
  });

  it('pads month and day with leading zeros', () => {
    const d = new Date(2024, 2, 5); // Mar 5 2024
    expect(formatDate(d)).toBe('2024-03-05');
  });

  it('handles end of year', () => {
    const d = new Date(2023, 11, 31); // Dec 31 2023
    expect(formatDate(d)).toBe('2023-12-31');
  });

  it('handles start of year', () => {
    const d = new Date(2024, 0, 1); // Jan 1 2024
    expect(formatDate(d)).toBe('2024-01-01');
  });
});

describe('formatMonthYear', () => {
  it('formats a date as long month name and year', () => {
    const d = new Date(2024, 0, 15); // Jan 15 2024
    expect(formatMonthYear(d)).toMatch(/January\s+2024/);
  });

  it('formats December correctly', () => {
    const d = new Date(2023, 11, 1); // Dec 1 2023
    expect(formatMonthYear(d)).toMatch(/December\s+2023/);
  });

  it('formats a mid-year month correctly', () => {
    const d = new Date(2025, 5, 20); // Jun 20 2025
    expect(formatMonthYear(d)).toMatch(/June\s+2025/);
  });
});

describe('getWeekStartingSaturday', () => {
  it('returns 7 days', () => {
    const days = getWeekStartingSaturday(0);
    expect(days).toHaveLength(7);
  });

  it('first day is a Saturday', () => {
    const days = getWeekStartingSaturday(0);
    // 6 = Saturday
    expect(days[0].getDay()).toBe(6);
  });

  it('days are consecutive', () => {
    const days = getWeekStartingSaturday(0);
    for (let i = 1; i < days.length; i++) {
      const diffMs = days[i].getTime() - days[i - 1].getTime();
      expect(diffMs).toBe(24 * 60 * 60 * 1000);
    }
  });

  it('offset of 1 starts 7 days after offset 0', () => {
    const week0 = getWeekStartingSaturday(0);
    const week1 = getWeekStartingSaturday(1);
    const diffMs = week1[0].getTime() - week0[0].getTime();
    expect(diffMs).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('offset of -1 starts 7 days before offset 0', () => {
    const week0 = getWeekStartingSaturday(0);
    const weekMinus1 = getWeekStartingSaturday(-1);
    const diffMs = week0[0].getTime() - weekMinus1[0].getTime();
    expect(diffMs).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('all days have time set to midnight local', () => {
    const days = getWeekStartingSaturday(0);
    for (const d of days) {
      expect(d.getHours()).toBe(0);
      expect(d.getMinutes()).toBe(0);
      expect(d.getSeconds()).toBe(0);
      expect(d.getMilliseconds()).toBe(0);
    }
  });
});

describe('parseLocalDate', () => {
  it('parses a valid YYYY-MM-DD date', () => {
    const parsed = parseLocalDate('2026-05-09');
    expect(parsed).not.toBeNull();
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(4);
    expect(parsed?.getDate()).toBe(9);
  });

  it('rejects malformed values', () => {
    expect(parseLocalDate('2026/05/09')).toBeNull();
    expect(parseLocalDate('2026-5-9')).toBeNull();
  });

  it('rejects impossible dates', () => {
    expect(parseLocalDate('2026-02-30')).toBeNull();
  });
});

describe('getMealPlanWeekStartSaturday', () => {
  it('returns the same date when already Saturday', () => {
    const saturday = new Date(2026, 4, 9);
    expect(formatDate(getMealPlanWeekStartSaturday(saturday))).toBe('2026-05-09');
  });

  it('returns previous Saturday for a mid-week date', () => {
    const wednesday = new Date(2026, 4, 13);
    expect(formatDate(getMealPlanWeekStartSaturday(wednesday))).toBe('2026-05-09');
  });
});
