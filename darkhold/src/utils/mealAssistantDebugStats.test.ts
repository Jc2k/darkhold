import { describe, expect, it } from 'vitest';
import {
  buildMealAssistantDebugStats,
  getMealAssistantDebugSchemaStatus,
} from './mealAssistantDebugStats';
import {
  MEAL_ASSISTANT_PRECALCULATION_SCHEMA_VERSION,
  type MealAssistantPrecalculation,
} from './mealAssistantPrecalculation';

const precalculation: MealAssistantPrecalculation = {
  schemaVersion: MEAL_ASSISTANT_PRECALCULATION_SCHEMA_VERSION,
  generatedAt: '2026-01-02T03:04:05.000Z',
  keywordNameById: {},
  recipes: {
    '1': { id: 1, name: 'Pasta' },
    '2': { id: 2, name: 'Roast' },
    '3': { id: 3, name: 'Soup' },
    '4': { id: 4, name: 'Tacos' },
  },
  recipeFeatures: {
    '1': {
      keywords: [],
      produce: [],
      stepCount: 1,
      ingredientLineCount: 1,
      distinctFoodCount: 1,
      complexityScore: 5,
      complexityBucket: 'simple',
      ingredientFoodIds: [10],
      ingredientFoodNames: ['tomato'],
    },
    '2': {
      keywords: [],
      produce: [],
      stepCount: 1,
      ingredientLineCount: 1,
      distinctFoodCount: 1,
      complexityScore: 5,
      complexityBucket: 'simple',
      ingredientFoodIds: [20],
      ingredientFoodNames: ['beef'],
    },
    '3': {
      keywords: [],
      produce: [],
      stepCount: 1,
      ingredientLineCount: 1,
      distinctFoodCount: 1,
      complexityScore: 5,
      complexityBucket: 'simple',
      ingredientFoodIds: [30],
      ingredientFoodNames: ['carrot'],
    },
    '4': {
      keywords: [],
      produce: [],
      stepCount: 1,
      ingredientLineCount: 1,
      distinctFoodCount: 1,
      complexityScore: 5,
      complexityBucket: 'simple',
      ingredientFoodIds: [40],
      ingredientFoodNames: ['corn'],
    },
  },
  recipeSimilarities: {},
  recipeClusters: {
    comfort: {
      id: 'comfort',
      label: 'comfort food',
      labelTerms: ['comfort'],
      recipeIds: [1, 2],
      size: 2,
    },
  },
  recipeClusterMemberships: {
    '1': { clusterId: 'comfort', label: 'comfort food', labelTerms: ['comfort'], size: 2 },
    '2': { clusterId: 'comfort', label: 'comfort food', labelTerms: ['comfort'], size: 2 },
  },
  relationships: {
    keywords: {},
    produce: {},
    weather: { hot: [1], cold: [2] },
    calendar: { 'appointment:doctor': [1] },
    flags: {},
  },
  recipeHistory: {
    '1': {
      dates: [19359, 19366, 19390],
      dayCounts: [1, 0, 0, 0, 0, 2, 0],
      monthCounts: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      seasonCounts: [2, 1, 0, 0],
      totalPlanCount: 3,
    },
    '2': {
      dates: [19360, 19367],
      dayCounts: [0, 0, 0, 0, 0, 0, 2],
      monthCounts: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      seasonCounts: [2, 0, 0, 0],
      totalPlanCount: 2,
    },
    '3': {
      dates: [],
      dayCounts: [0, 0, 0, 0, 0, 0, 0],
      monthCounts: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      seasonCounts: [0, 0, 0, 0],
      totalPlanCount: 0,
    },
    '4': {
      dates: [19358, 19365, 19372, 19379, 19386, 19393, 19400],
      dayCounts: [0, 7, 0, 0, 0, 0, 0],
      monthCounts: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      seasonCounts: [7, 0, 0, 0],
      totalPlanCount: 7,
    },
  },
  mealTypes: [
    { id: 1, name: 'Breakfast', planCount: 1 },
    { id: 3, name: 'Dinner', planCount: 4 },
  ],
  recipeHistoryByMealType: {
    '1': {
      '3': {
        dates: [19359],
        dayCounts: [1, 0, 0, 0, 0, 0, 0],
        monthCounts: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        seasonCounts: [1, 0, 0, 0],
        totalPlanCount: 1,
      },
    },
    '3': {
      '1': {
        dates: [19366, 19390],
        dayCounts: [0, 0, 0, 0, 0, 2, 0],
        monthCounts: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        seasonCounts: [1, 1, 0, 0],
        totalPlanCount: 2,
      },
      '2': {
        dates: [19360, 19367],
        dayCounts: [0, 0, 0, 0, 0, 0, 2],
        monthCounts: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        seasonCounts: [2, 0, 0, 0],
        totalPlanCount: 2,
      },
    },
  },
  recipeInsights: {
    '1': {
      totalCookCount: 3,
      weekdayCookCount: 2,
      weekendCookCount: 1,
      days: {},
      months: {},
      seasons: {},
      weather: { hot: { count: 2, total: 3, share: 2 / 3, score: 5 } },
      calendar: { 'appointment:doctor': { count: 1, total: 3, share: 1 / 3, score: 4 } },
      produce: [],
    },
    '2': {
      totalCookCount: 2,
      weekdayCookCount: 0,
      weekendCookCount: 2,
      days: {},
      months: {},
      seasons: {},
      weather: { cold: { count: 2, total: 2, share: 1, score: 6 } },
      calendar: {},
      produce: [],
    },
    '3': {
      totalCookCount: 0,
      weekdayCookCount: 0,
      weekendCookCount: 0,
      days: {},
      months: {},
      seasons: {},
      weather: {},
      calendar: {},
      produce: [],
    },
    '4': {
      totalCookCount: 7,
      weekdayCookCount: 7,
      weekendCookCount: 0,
      days: {},
      months: {},
      seasons: {},
      weather: {},
      calendar: {},
      produce: [],
    },
  },
};

describe('meal assistant debug stats', () => {
  it('reports schema state for old payloads', () => {
    expect(getMealAssistantDebugSchemaStatus({ schemaVersion: 1 })).toEqual({
      expectedSchemaVersion: MEAL_ASSISTANT_PRECALCULATION_SCHEMA_VERSION,
      actualSchemaVersion: 1,
      isCurrentSchema: false,
    });
  });

  it('summarizes common recipes across calendar and signal buckets', () => {
    const stats = buildMealAssistantDebugStats(precalculation);

    expect(stats.generatedAt).toBe('2026-01-02T03:04:05.000Z');
    expect(stats.recipeCount).toBe(4);
    expect(stats.plannedMealCount).toBe(12);
    expect(stats.activeRecipeCount).toBe(3);
    expect(stats.weekdays.find((group) => group.label === 'Friday')?.recipes[0]).toMatchObject({
      recipeId: 1,
      name: 'Pasta',
      count: 2,
    });
    expect(stats.weekendMeals.recipes[0]).toMatchObject({ recipeId: 2, name: 'Roast', count: 2 });
    expect(stats.weather.map((group) => [group.label, group.total])).toEqual([
      ['cold', 2],
      ['hot', 2],
    ]);
    expect(stats.calendar[0]).toMatchObject({ label: 'appointment:doctor', total: 1 });
    expect(stats.clusters[0]).toMatchObject({ label: 'comfort food', total: 5 });
    expect(stats.recipeWeekdaySignals[0]).toMatchObject({
      recipeId: 4,
      name: 'Tacos',
      total: 7,
      days: [{ label: 'Monday', count: 7, share: 1 }],
      expectedShare: 1 / 7,
    });
    expect(stats.recipeWeekdaySignals[0]?.pValue).toBeLessThan(0.05);
  });

  it('segments common recipe history by selected meal type', () => {
    const stats = buildMealAssistantDebugStats(precalculation, 3);

    expect(stats.selectedMealTypeId).toBe(3);
    expect(stats.plannedMealCount).toBe(4);
    expect(stats.activeRecipeCount).toBe(2);
    expect(stats.mealTypes.map((mealType) => mealType.label)).toEqual(['Breakfast', 'Dinner']);
    expect(stats.weekendMeals.recipes[0]).toMatchObject({ recipeId: 2, name: 'Roast', count: 2 });
    expect(stats.weekdays.find((group) => group.label === 'Sunday')?.total).toBe(0);
    expect(stats.recipeWeekdaySignals).toEqual([]);
  });
});
