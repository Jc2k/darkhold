import { describe, expect, it } from 'vitest';
import type { MealPlan, Recipe } from '../api/tandoor-types';
import {
  MEAL_ASSISTANT_PRECALCULATION_SCHEMA_VERSION,
  buildMealAssistantPrecalculation,
  getMealAssistantSeason,
  isMealAssistantPrecalculation,
} from './mealAssistantPrecalculation';

function recipe(id: number, name: string, overrides: Partial<Recipe> = {}): Recipe {
  return {
    id,
    name,
    created_by: 1,
    image: '/recipe.jpg',
    keywords: [],
    ...overrides,
  };
}

function mealPlan(id: number, recipeId: number, fromDate: string): MealPlan {
  return {
    id,
    recipe: recipeId,
    meal_type: 3,
    from_date: fromDate,
  };
}

describe('mealAssistantPrecalculation', () => {
  it('builds historical weekday, weekend, season, produce, and nutrition signals', () => {
    const result = buildMealAssistantPrecalculation({
      generatedAt: '2026-06-03T00:00:00.000Z',
      keywordNameById: { 10: 'Courgette' },
      weatherByDate: {
        '2026-01-02': {
          temperatureBand: 'cold',
          precipitationBand: 'showery',
          daylightHours: 8,
          daylightBand: 'short',
          outdoorSuitability: 'poor',
          tags: ['cold-day', 'showery-day', 'short-daylight', 'outdoor-poor'],
        },
        '2026-01-09': {
          temperatureBand: 'cold',
          precipitationBand: 'showery',
          daylightHours: 8,
          daylightBand: 'short',
          outdoorSuitability: 'poor',
          tags: ['cold-day', 'showery-day', 'short-daylight', 'outdoor-poor'],
        },
        '2026-01-16': {
          temperatureBand: 'cold',
          precipitationBand: 'showery',
          daylightHours: 8.1,
          daylightBand: 'short',
          outdoorSuitability: 'poor',
          tags: ['cold-day', 'showery-day', 'short-daylight', 'outdoor-poor'],
        },
        '2026-01-23': {
          temperatureBand: 'cold',
          precipitationBand: 'showery',
          daylightHours: 8.2,
          daylightBand: 'short',
          outdoorSuitability: 'poor',
          tags: ['cold-day', 'showery-day', 'short-daylight', 'outdoor-poor'],
        },
        '2026-07-04': {
          temperatureBand: 'hot',
          precipitationBand: 'dry',
          daylightHours: 16,
          daylightBand: 'long',
          outdoorSuitability: 'good',
          tags: ['hot-day', 'dry-day', 'long-daylight', 'outdoor-good'],
        },
        '2026-07-11': {
          temperatureBand: 'hot',
          precipitationBand: 'dry',
          daylightHours: 16,
          daylightBand: 'long',
          outdoorSuitability: 'good',
          tags: ['hot-day', 'dry-day', 'long-daylight', 'outdoor-good'],
        },
      },
      produceFoods: [
        { id: 100, name: 'Courgette' },
        { id: 999, name: '' },
      ],
      recipes: [
        recipe(1, 'Chilli con carne', {
          servings: 2,
          nutrition: { proteins: 13, calories: 550 },
        }),
        recipe(2, 'Courgette pasta', {
          keywords: [10],
          servings: 2,
          steps: [
            {
              id: 1,
              instruction: 'Prep',
              order: 1,
              ingredients: [
                { id: 1, food: 100 },
                { id: 2, food: 101 },
                { id: 3, food: 100 },
                { id: 4, food: null, is_header: true },
              ],
            },
            { id: 2, instruction: 'Cook', order: 2, ingredients: [{ id: 5, food: 102 }] },
          ],
          food_properties: {
            calories: {
              id: 1,
              name: 'Calories',
              total_value: 1300,
              unit: 'kcal',
              missing_value: false,
              food_values: {},
            },
            protein: {
              id: 2,
              name: 'Protein',
              total_value: 12,
              unit: 'g',
              missing_value: false,
              food_values: {},
            },
          },
        }),
      ],
      mealPlans: [
        mealPlan(1, 1, '2026-01-02'),
        mealPlan(2, 1, '2026-01-09'),
        mealPlan(3, 1, '2026-01-16'),
        mealPlan(4, 1, '2026-01-23'),
        mealPlan(5, 2, '2026-07-04'),
        mealPlan(6, 2, '2026-07-11'),
      ],
    });

    expect(result.generatedAt).toBe('2026-06-03T00:00:00.000Z');
    expect(result.schemaVersion).toBe(MEAL_ASSISTANT_PRECALCULATION_SCHEMA_VERSION);
    expect(result.recipes['1']).toMatchObject({ id: 1, name: 'Chilli con carne' });
    expect(result.recipes['1']).not.toHaveProperty('food_properties');
    expect(result.recipeHistory['1']).toMatchObject({
      totalPlanCount: 4,
      firstPlannedDate: 20455,
      lastPlannedDate: 20476,
      averageDaysBetweenPlans: 7,
      medianDaysBetweenPlans: 7,
    });
    expect(result.recipeHistory['2']).toMatchObject({
      totalPlanCount: 2,
      firstPlannedDate: 20638,
      lastPlannedDate: 20645,
      averageDaysBetweenPlans: 7,
      medianDaysBetweenPlans: 7,
    });
    expect(result.recipeHistory['1'].dayCounts[5]).toBe(4);
    expect(result.recipeInsights['1'].days['5']).toMatchObject({ count: 4, total: 4 });
    expect(result.recipeInsights['1'].weekday).toMatchObject({ count: 4, total: 4 });
    expect(result.recipeInsights['1'].seasons.winter).toMatchObject({ count: 4, total: 4 });
    expect(result.recipeInsights['1'].weather['cold-day']).toMatchObject({ count: 4, total: 4 });
    expect(result.recipeInsights['1'].nutrition).toMatchObject({
      proteinG: 13,
      caloriesKcal: 550,
      score: 8,
    });
    expect(result.recipeInsights['2'].produce).toEqual(['courgette']);
    expect(result.relationships.produce.courgette).toEqual([2]);
    expect(result.relationships.keywords.courgette).toEqual([2]);
    expect(result.relationships.weather['cold-day']).toEqual([1]);
    expect(result.recipeFeatures['2']).toMatchObject({
      keywords: ['courgette'],
      produce: ['courgette'],
      nutritionScore: -18,
      stepCount: 2,
      ingredientLineCount: 4,
      distinctFoodCount: 3,
      complexityScore: 17,
      complexityBucket: 'moderate',
      ingredientFoodIds: [100, 101, 102],
      ingredientFoodNames: [],
      servings: 2,
      nutritionCompleteness: {
        source: 'food_properties',
        complete: true,
        propertyCount: 2,
        missingPropertyCount: 0,
      },
    });
    expect(result.recipeFeatures['1'].weatherTags).toEqual([
      'cold-day',
      'outdoor-poor',
      'short-daylight',
      'showery-day',
    ]);
    expect(result.recipeInsights['2'].nutrition).toMatchObject({
      proteinG: 6,
      caloriesKcal: 650,
      score: -18,
    });
    expect(result.recipeSimilarities['1']).toEqual([]);
    expect(result.recipeClusterMemberships['1']).toMatchObject({
      clusterId: 'cluster-1',
      size: 1,
    });
    expect(isMealAssistantPrecalculation(result)).toBe(true);
  });

  it('treats historical bank holidays as weekend days and stores calendar features', () => {
    const result = buildMealAssistantPrecalculation({
      generatedAt: '2026-06-03T00:00:00.000Z',
      keywordNameById: {},
      recipes: [recipe(1, 'Family Traybake'), recipe(2, 'Plain Pasta')],
      mealPlans: [mealPlan(1, 1, '2026-05-25'), mealPlan(2, 1, '2026-06-01')],
      calendarByDate: {
        '2026-05-25': {
          bankHoliday: true,
          appointmentFeatures: ['bob|long', 'school|long'],
        },
        '2026-06-01': {
          bankHoliday: false,
          appointmentFeatures: ['bob|long'],
        },
      },
    });

    expect(result.recipeInsights['1'].weekendCookCount).toBe(1);
    expect(result.recipeInsights['1'].weekdayCookCount).toBe(1);
    expect(result.recipeInsights['1'].calendar['bob|long']).toMatchObject({ count: 2, total: 2 });
    expect(result.recipeFeatures['1'].calendarFeatures).toEqual(['bob|long', 'school|long']);
    expect(result.relationships.calendar['bob|long']).toEqual([1]);
  });

  it('stores deterministic recipe similarities and cluster metadata', () => {
    const result = buildMealAssistantPrecalculation({
      generatedAt: '2026-06-03T00:00:00.000Z',
      keywordNameById: {},
      recipes: [
        recipe(1, 'Tomato Pasta', {
          keywords: [{ id: 1, name: 'Pasta' }],
          steps: [
            {
              id: 1,
              instruction: 'Cook',
              order: 1,
              ingredients: [
                { id: 1, food: { id: 10, name: 'Tomato' } },
                { id: 2, food: { id: 11, name: 'Basil' } },
              ],
            },
          ],
        }),
        recipe(2, 'Creamy Tomato Pasta', {
          keywords: [{ id: 1, name: 'Pasta' }],
          steps: [
            {
              id: 1,
              instruction: 'Cook',
              order: 1,
              ingredients: [
                { id: 1, food: { id: 10, name: 'Tomato' } },
                { id: 2, food: { id: 12, name: 'Cream' } },
              ],
            },
          ],
        }),
        recipe(3, 'Creamy Basil Pasta', {
          keywords: [{ id: 1, name: 'Pasta' }],
          steps: [
            {
              id: 1,
              instruction: 'Cook',
              order: 1,
              ingredients: [
                { id: 1, food: { id: 11, name: 'Basil' } },
                { id: 2, food: { id: 12, name: 'Cream' } },
              ],
            },
          ],
        }),
        recipe(4, 'Chicken Rice Bowl', {
          keywords: [{ id: 2, name: 'Rice' }],
          steps: [
            {
              id: 1,
              instruction: 'Cook',
              order: 1,
              ingredients: [
                { id: 1, food: { id: 20, name: 'Chicken' } },
                { id: 2, food: { id: 21, name: 'Rice' } },
              ],
            },
          ],
        }),
      ],
      mealPlans: [],
    });

    expect(result.recipeSimilarities['1'][0]).toMatchObject({
      recipeId: 2,
      sharedTerms: expect.arrayContaining(['pasta', 'tomato']),
    });
    expect(result.recipeClusters['cluster-1']).toEqual({
      id: 'cluster-1',
      label: 'pasta · basil · cream',
      labelTerms: ['pasta', 'basil', 'cream'],
      recipeIds: [1, 2, 3],
      size: 3,
    });
    expect(result.recipeClusterMemberships['3']).toMatchObject({
      clusterId: 'cluster-1',
      label: 'pasta · basil · cream',
      size: 3,
    });
    expect(result.recipeClusterMemberships['4']).toMatchObject({
      clusterId: 'cluster-4',
      label: 'rice · chicken',
      size: 1,
    });
  });

  it('stores Tandoor timing and serving features without changing scoring inputs', () => {
    const result = buildMealAssistantPrecalculation({
      generatedAt: '2026-06-03T00:00:00.000Z',
      keywordNameById: {},
      produceFoodNames: [],
      recipes: [
        recipe(1, 'Slow curry', {
          cooking_time: 45,
          waiting_time: 15,
          servings: 4,
          steps: [
            {
              id: 1,
              instruction: 'Cook',
              order: 1,
              ingredients: [
                { id: 1, food: { id: 4, name: 'Chicken' } },
                { id: 2, food: { id: 2, name: 'Yoghurt' } },
              ],
            },
          ],
        }),
      ],
      mealPlans: [],
    });

    expect(result.recipeFeatures['1']).toMatchObject({
      cookingTimeMinutes: 45,
      waitingTimeMinutes: 15,
      totalTimeMinutes: 60,
      servings: 4,
      ingredientFoodIds: [2, 4],
      ingredientFoodNames: ['chicken', 'yoghurt'],
      stepCount: 1,
      ingredientLineCount: 2,
      distinctFoodCount: 2,
      complexityScore: 9,
      complexityBucket: 'simple',
    });
  });

  it('omits unavailable optional v3 fields while preserving empty safe defaults', () => {
    const result = buildMealAssistantPrecalculation({
      generatedAt: '2026-06-03T00:00:00.000Z',
      keywordNameById: {},
      recipes: [recipe(1, 'Bare recipe', { image: undefined })],
      mealPlans: [],
    });

    expect(result.recipeFeatures['1']).toMatchObject({
      ingredientFoodIds: [],
      ingredientFoodNames: [],
      stepCount: 0,
      ingredientLineCount: 0,
      distinctFoodCount: 0,
      complexityScore: 0,
      complexityBucket: 'simple',
    });
    expect(result.recipeFeatures['1']).not.toHaveProperty('cookingTimeMinutes');
    expect(result.recipeFeatures['1']).not.toHaveProperty('waitingTimeMinutes');
    expect(result.recipeFeatures['1']).not.toHaveProperty('totalTimeMinutes');
    expect(result.recipeFeatures['1']).not.toHaveProperty('servings');
    expect(result.recipeFeatures['1']).not.toHaveProperty('nutritionScore');
    expect(result.recipeFeatures['1']).not.toHaveProperty('nutritionCompleteness');
  });

  it('excludes ingredient headers from ingredient counts and food identity features', () => {
    const result = buildMealAssistantPrecalculation({
      generatedAt: '2026-06-03T00:00:00.000Z',
      keywordNameById: {},
      recipes: [
        recipe(1, 'Header recipe', {
          steps: [
            {
              id: 1,
              instruction: 'Prep',
              order: 1,
              ingredients: [
                { id: 1, food: null, note: 'For the sauce', is_header: true },
                { id: 2, food: { id: 7, name: 'Tomato' } },
              ],
            },
          ],
        }),
      ],
      mealPlans: [],
    });

    expect(result.recipeFeatures['1']).toMatchObject({
      ingredientLineCount: 1,
      distinctFoodCount: 1,
      ingredientFoodIds: [7],
      ingredientFoodNames: ['tomato'],
      complexityScore: 6,
      complexityBucket: 'simple',
    });
  });

  it('captures numeric food ids and object food ids with names', () => {
    const result = buildMealAssistantPrecalculation({
      generatedAt: '2026-06-03T00:00:00.000Z',
      keywordNameById: {},
      recipes: [
        recipe(1, 'Mixed food ids', {
          steps: [
            {
              id: 1,
              instruction: 'Prep',
              order: 1,
              ingredients: [
                { id: 1, food: 10 },
                { id: 2, food: { id: 5, name: 'Paneer' } },
                { id: 3, food: { id: 10, name: 'Duplicate numeric id with name' } },
                { id: 4, food: { id: 8, name: 'Bell Pepper' } },
              ],
            },
          ],
        }),
      ],
      mealPlans: [],
    });

    expect(result.recipeFeatures['1']).toMatchObject({
      ingredientLineCount: 4,
      distinctFoodCount: 3,
      ingredientFoodIds: [5, 8, 10],
      ingredientFoodNames: ['bell pepper', 'duplicate numeric id with name', 'paneer'],
      complexityBucket: 'moderate',
    });
  });

  it('detects produce via ingredient food ids and falls back to ingredient names when ids are unavailable', () => {
    const result = buildMealAssistantPrecalculation({
      generatedAt: '2026-06-03T00:00:00.000Z',
      keywordNameById: {},
      produceFoods: [
        { id: 10, name: 'aubergine' },
        { id: 20, name: 'pepper' },
        { id: 30, name: 'carrot' },
      ],
      produceFoodNames: ['carrot'],
      recipes: [
        recipe(1, 'Id and name produce matching', {
          keywords: [{ id: 999, name: 'Aubergine' }],
          steps: [
            {
              id: 1,
              instruction: 'Prep',
              order: 1,
              ingredients: [
                { id: 1, food: { id: 10, name: 'Eggplant' } },
                { id: 2, food: 20 },
                { id: 3, food: null, note: 'For garnish', is_header: true },
                { id: 4, food: { id: 40, name: 'Carrot' } },
              ],
            },
          ],
        }),
      ],
      mealPlans: [],
    });

    expect(result.recipeInsights['1'].produce).toEqual(['aubergine', 'carrot', 'pepper']);
    expect(result.recipeFeatures['1'].produce).toEqual(['aubergine', 'carrot', 'pepper']);
    expect(result.relationships.produce.aubergine).toEqual([1]);
    expect(result.relationships.produce.pepper).toEqual([1]);
    expect(result.relationships.produce.carrot).toEqual([1]);
  });

  it('marks food property nutrition completeness when values are present or missing', () => {
    const result = buildMealAssistantPrecalculation({
      generatedAt: '2026-06-03T00:00:00.000Z',
      keywordNameById: {},
      recipes: [
        recipe(1, 'Complete nutrition', {
          food_properties: {
            calories: {
              id: 1,
              name: 'Calories',
              total_value: 400,
              unit: 'kcal',
              missing_value: false,
              food_values: {},
            },
            protein: {
              id: 2,
              name: 'Protein',
              total_value: 20,
              unit: 'g',
              missing_value: false,
              food_values: {},
            },
          },
        }),
        recipe(2, 'Incomplete nutrition', {
          food_properties: {
            calories: {
              id: 1,
              name: 'Calories',
              total_value: 400,
              unit: 'kcal',
              missing_value: true,
              food_values: {},
            },
            protein: {
              id: 2,
              name: 'Protein',
              total_value: 20,
              unit: 'g',
              missing_value: false,
              food_values: {},
            },
          },
        }),
      ],
      mealPlans: [],
    });

    expect(result.recipeFeatures['1'].nutritionCompleteness).toEqual({
      source: 'food_properties',
      complete: true,
      propertyCount: 2,
      missingPropertyCount: 0,
    });
    expect(result.recipeFeatures['2'].nutritionCompleteness).toEqual({
      source: 'food_properties',
      complete: false,
      propertyCount: 2,
      missingPropertyCount: 1,
    });
  });

  it('marks legacy nutrition completeness and omits it when a recipe has no nutrition', () => {
    const result = buildMealAssistantPrecalculation({
      generatedAt: '2026-06-03T00:00:00.000Z',
      keywordNameById: {},
      recipes: [
        recipe(1, 'Legacy complete', {
          nutrition: { calories: 400, proteins: 20, carbohydrates: 30, fats: 10, fibres: 5 },
        }),
        recipe(2, 'Legacy partial', {
          nutrition: { calories: 400, proteins: 20 },
        }),
        recipe(3, 'No nutrition'),
      ],
      mealPlans: [],
    });

    expect(result.recipeFeatures['1'].nutritionCompleteness).toEqual({
      source: 'legacy',
      complete: true,
      propertyCount: 5,
      missingPropertyCount: 0,
    });
    expect(result.recipeFeatures['2'].nutritionCompleteness).toEqual({
      source: 'legacy',
      complete: false,
      propertyCount: 2,
      missingPropertyCount: 3,
    });
    expect(result.recipeFeatures['3']).not.toHaveProperty('nutritionCompleteness');
  });

  it('maps calendar months to meal assistant seasons', () => {
    expect(getMealAssistantSeason(new Date('2026-01-01T00:00:00'))).toBe('winter');
    expect(getMealAssistantSeason(new Date('2026-04-01T00:00:00'))).toBe('spring');
    expect(getMealAssistantSeason(new Date('2026-07-01T00:00:00'))).toBe('summer');
    expect(getMealAssistantSeason(new Date('2026-10-01T00:00:00'))).toBe('autumn');
  });

  it('segments recipe history by meal type', () => {
    const result = buildMealAssistantPrecalculation({
      keywordNameById: {},
      recipes: [recipe(1, 'Porridge'), recipe(2, 'Curry')],
      mealPlans: [
        {
          ...mealPlan(1, 1, '2026-01-05'),
          meal_type: { id: 1, name: 'Breakfast' },
        },
        {
          ...mealPlan(2, 2, '2026-01-05'),
          meal_type: { id: 3, name: 'Dinner' },
        },
        {
          ...mealPlan(3, 2, '2026-01-12'),
          meal_type: { id: 3, name: 'Dinner' },
        },
      ],
    });

    expect(result.mealTypes).toEqual([
      { id: 1, name: 'Breakfast', planCount: 1 },
      { id: 3, name: 'Dinner', planCount: 2 },
    ]);
    expect(result.recipeHistoryByMealType['1']['1']).toMatchObject({ totalPlanCount: 1 });
    expect(result.recipeHistoryByMealType['3']['2']).toMatchObject({
      totalPlanCount: 2,
      averageDaysBetweenPlans: 7,
    });
    expect(result.recipeHistoryByMealType['3']['1']).toBeUndefined();
  });

  it('rejects unknown payload shapes', () => {
    expect(
      isMealAssistantPrecalculation({
        ...buildMealAssistantPrecalculation({ recipes: [], keywordNameById: {}, mealPlans: [] }),
        schemaVersion: 2,
      }),
    ).toBe(false);
    expect(
      isMealAssistantPrecalculation({
        ...buildMealAssistantPrecalculation({ recipes: [], keywordNameById: {}, mealPlans: [] }),
        recipeFeatures: {
          '1': {
            keywords: [],
            produce: [],
            stepCount: 0,
            ingredientLineCount: 0,
            distinctFoodCount: 0,
            complexityScore: 0,
          },
        },
      }),
    ).toBe(false);
    expect(isMealAssistantPrecalculation({ schemaVersion: 999 })).toBe(false);
    expect(isMealAssistantPrecalculation(null)).toBe(false);
  });
});
