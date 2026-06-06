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
  weather: { 'hot-day': { count: 3, total: 6, share: 0.5, score: 4 } },
  calendar: { 'appointment:doctor': { count: 2, total: 6, share: 0.333, score: 3 } },
  produce: [],
};

describe('planningSignals', () => {
  it('lists recipe planning signals in deterministic score order', () => {
    expect(getRecipePlanningSignals(insight).map((signal) => signal.label)).toEqual([
      'Winter',
      'December',
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
        weatherTags: ['dry-day', 'hot-day'],
        calendarFeatures: ['appointment:doctor'],
      }).map((signal) => signal.key),
    ).toEqual(['season:winter', 'month:12', 'weather:hot-day', 'calendar:appointment:doctor']);
  });
});
