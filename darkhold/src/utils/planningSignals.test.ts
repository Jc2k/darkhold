import { describe, expect, it } from 'vitest';
import type { MealAssistantRecipeInsight } from './mealAssistantPrecalculation';
import { getMatchingRecipePlanningSignals, getRecipePlanningSignals } from './planningSignals';

const insight: MealAssistantRecipeInsight = {
  totalCookCount: 6,
  weekdayCookCount: 4,
  weekendCookCount: 2,
  days: {},
  months: { '12': { count: 4, total: 6, share: 0.667, score: 5 } },
  seasons: { winter: { count: 5, total: 6, share: 0.833, score: 7 } },
  weather: {
    'hot-day': { count: 3, total: 6, share: 0.5, score: 4 },
    'dry-day': { count: 4, total: 6, share: 0.667, score: 5 },
    'long-daylight': { count: 5, total: 6, share: 0.833, score: 6 },
  },
  calendar: { 'appointment:doctor': { count: 2, total: 6, share: 0.333, score: 3 } },
  produce: [],
};

describe('planningSignals', () => {
  it('lists recipe planning signals in deterministic score order', () => {
    expect(getRecipePlanningSignals(insight).map((signal) => signal.label)).toEqual([
      'Winter',
      'long daylight',
      'December',
      'dry day',
      'hot day',
      'appointment:doctor',
    ]);
  });

  it('returns only signals matching the requested day context', () => {
    expect(
      getMatchingRecipePlanningSignals({
        insight,
        month: 12,
        season: 'winter',
        weatherTags: ['dry-day', 'hot-day', 'long-daylight'],
        calendarFeatures: ['appointment:doctor'],
      }).map((signal) => signal.key),
    ).toEqual([
      'season:winter',
      'daylight:long-daylight',
      'month:12',
      'rainfall:dry-day',
      'temperature:hot-day',
      'calendar:appointment:doctor',
    ]);
  });

  it('keeps temperature, rainfall, and day length in separate signal categories', () => {
    expect(
      getMatchingRecipePlanningSignals({
        insight,
        weatherTags: ['dry-day', 'hot-day', 'long-daylight'],
      }).map((signal) => [signal.category, signal.key]),
    ).toEqual([
      ['daylight', 'daylight:long-daylight'],
      ['rainfall', 'rainfall:dry-day'],
      ['temperature', 'temperature:hot-day'],
    ]);
  });
});
