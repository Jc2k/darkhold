import { describe, expect, it } from 'vitest';
import { buildYearInFoodSummary, validateYearInFoodYear } from './yearInFood';
import type { CookLog, Keyword, MealPlan, Recipe } from '../api/tandoor-types.d.ts';

const dinner = { id: 1, name: 'Dinner' };
const lunch = { id: 2, name: 'Lunch' };
const grams = { id: 1, name: 'g', plural: 'grams' };

const recipes: Recipe[] = [
  {
    id: 10,
    name: 'Mushroom Risotto',
    created_by: 1,
    created_at: '2024-01-03T09:00:00Z',
    servings: 2,
    cooking_time: 45,
    rating: 4,
    keywords: [
      { id: 101, name: 'dinner' },
      { id: 102, name: 'Italian' },
    ],
    food_properties: {
      calories: {
        id: 1,
        name: 'Calories',
        total_value: 1200,
        missing_value: false,
        food_values: {},
      },
      protein: {
        id: 2,
        name: 'Protein',
        total_value: 44,
        missing_value: false,
        food_values: {},
      },
      fibre: {
        id: 3,
        name: 'Fibre',
        total_value: 18,
        missing_value: false,
        food_values: {},
      },
    },
    steps: [
      {
        id: 1,
        instruction: 'Cook.',
        order: 1,
        ingredients: [
          { id: 1, amount: 200, unit: grams, food: { id: 1, name: 'Mushroom' } },
          { id: 2, amount: 20, unit: grams, food: { id: 2, name: 'Garlic' } },
        ],
      },
    ],
  },
  {
    id: 11,
    name: 'Garlic Pasta',
    created_by: 1,
    created_at: '2023-01-03T09:00:00Z',
    servings: 1,
    cooking_time: 0,
    keywords: [
      { id: 101, name: 'dinner' },
      { id: 102, name: 'Italian' },
    ],
    nutrition: { calories: 700, proteins: 30, fibres: 8 },
    steps: [
      {
        id: 2,
        instruction: 'Cook.',
        order: 1,
        ingredients: [
          { id: 3, amount: 30, unit: grams, food: { id: 2, name: 'Garlic' } },
          { id: 4, amount: 250, unit: grams, food: { id: 3, name: 'Pasta' } },
        ],
      },
    ],
  },
  {
    id: 12,
    name: 'Takeaway',
    created_by: 1,
    keywords: [{ id: 101, name: 'dinner' }],
    steps: [],
  },
];

const mealPlans: MealPlan[] = [
  { id: 1, recipe: 10, meal_type: dinner, from_date: '2024-01-01', servings: 4 },
  { id: 2, recipe: 10, meal_type: dinner, from_date: '2024-01-02', servings: 1 },
  { id: 3, recipe: 11, meal_type: dinner, from_date: '2024-01-03', servings: 3 },
  { id: 4, recipe: 12, meal_type: dinner, from_date: '2024-01-04' },
  { id: 5, recipe: 11, meal_type: lunch, from_date: '2024-01-05' },
  { id: 6, recipe: 12, meal_type: dinner, from_date: '2023-01-04' },
  { id: 7, recipe: 10, meal_type: dinner, from_date: '2022-01-01' },
];

const cookLogs: CookLog[] = [
  { id: 1, recipe: 10, rating: 3, created_at: '2024-01-01T18:00:00Z' },
  { id: 2, recipe: 10, rating: 5, created_at: '2024-01-02T18:00:00Z' },
  { id: 3, recipe: 11, rating: 4, created_at: '2024-01-03T18:00:00Z' },
];

const keywords: Keyword[] = [
  { id: 101, name: 'dinner' },
  { id: 102, name: 'Italian', parent: 101 } as Keyword,
];

describe('validateYearInFoodYear', () => {
  it('rejects future years', () => {
    expect(validateYearInFoodYear(2025, new Date('2024-06-01T00:00:00Z'))).toBe(
      'Year cannot be in the future.',
    );
  });

  it('accepts current and previous years', () => {
    expect(validateYearInFoodYear(2024, new Date('2024-06-01T00:00:00Z'))).toBeNull();
    expect(validateYearInFoodYear(2023, new Date('2024-06-01T00:00:00Z'))).toBeNull();
  });
});

describe('buildYearInFoodSummary', () => {
  it('summarises only dinner meal plans for the requested year', () => {
    const summary = buildYearInFoodSummary({
      year: 2024,
      mealPlans,
      recipes,
      cookLogs,
      keywords,
      weatherDays: [
        { date: '2024-01-01', tempMaxC: 12 },
        { date: '2024-01-03', tempMaxC: 31 },
      ],
      weatherFeaturesByDate: {
        '2024-01-01': {
          temperatureBand: 'cool',
          precipitationBand: 'dry',
          daylightHours: 8,
          daylightBand: 'short',
          outdoorSuitability: 'poor',
          tags: ['cool-day', 'dry-day'],
        },
        '2024-01-03': {
          temperatureBand: 'hot',
          precipitationBand: 'dry',
          daylightHours: 8,
          daylightBand: 'short',
          outdoorSuitability: 'good',
          tags: ['hot-day', 'dry-day'],
        },
      },
      calendarFeaturesByDate: {
        '2024-01-03': { bankHoliday: false, appointmentFeatures: ['gym|short'] },
        '2024-01-04': { bankHoliday: true, appointmentFeatures: [] },
      },
      now: new Date('2024-12-31T23:00:00Z'),
    });

    expect(summary.mealCount).toBe(4);
    expect(summary.uniqueRecipeCount).toBe(3);
    expect(summary.totalHouseholdServings).toBe(9);
    expect(summary.averageHouseholdServingsPerDinner).toBe(2.3);
    expect(summary.repeats.mostRepeatedMeals[0]).toMatchObject({
      recipeName: 'Mushroom Risotto',
      value: 2,
    });
    expect(summary.mostFrequentIngredients[0]).toMatchObject({ name: 'Garlic', count: 3 });
    expect(summary.topProduceByGrams[0]).toMatchObject({ name: 'Pasta', grams: 750 });
    expect(summary.topProduceByPersonGrams[0]).toMatchObject({ name: 'Pasta', grams: 250 });
    expect(summary.nutrition.averageCaloriesPerPortion).toBe(633);
    expect(summary.nutrition.averageProteinGPerPortion).toBe(24.7);
    expect(summary.takeaway).toMatchObject({
      count: 1,
      previousYearCount: 1,
      deltaFromPreviousYear: 0,
    });
    expect(summary.cookingEffort).toMatchObject({
      totalMinutes: 150,
      assumedDefaultMinutesCount: 1,
      takeawayExcludedCount: 1,
    });
    expect(summary.cuisine.topDinnerKeywords[0]).toMatchObject({ name: 'Italian', count: 3 });
    expect(summary.weather?.hottestDinnerDay).toMatchObject({
      date: '2024-01-03',
      recipeName: 'Garlic Pasta',
      value: 31,
    });
    expect(summary.weather?.topDinnerWeatherSignals?.[0]).toMatchObject({
      name: 'dry day',
      count: 2,
    });
    expect(summary.calendar).toMatchObject({ bankHolidayDinnerCount: 1 });
    expect(summary.calendar.topAppointmentSignals[0]).toMatchObject({
      name: '"gym" appears in a short appointment',
      count: 1,
    });
  });
});
