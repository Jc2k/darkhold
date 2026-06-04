import { describe, expect, it } from 'vitest';
import type { MealPlan, Recipe } from '../api/tandoor-types';
import {
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
      produceFoodNames: ['Courgette', ''],
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
    expect(result.schemaVersion).toBe(2);
    expect(result.recipes['1']).toMatchObject({ id: 1, name: 'Chilli con carne' });
    expect(result.recipes['1']).not.toHaveProperty('food_properties');
    expect(result.recipeHistory['1']).toMatchObject({ totalPlanCount: 4 });
    expect(result.recipeHistory['1'].dayCounts[5]).toBe(4);
    expect(result.recipeInsights['1'].days['5']).toMatchObject({ count: 4, total: 4 });
    expect(result.recipeInsights['1'].weekday).toMatchObject({ count: 4, total: 4 });
    expect(result.recipeInsights['1'].seasons.winter).toMatchObject({ count: 4, total: 4 });
    expect(result.recipeInsights['1'].nutrition).toMatchObject({
      proteinG: 13,
      caloriesKcal: 550,
      score: 8,
    });
    expect(result.recipeInsights['2'].produce).toEqual(['courgette']);
    expect(result.relationships.produce.courgette).toEqual([2]);
    expect(result.relationships.keywords.courgette).toEqual([2]);
    expect(result.recipeFeatures['2']).toMatchObject({
      keywords: ['courgette'],
      produce: ['courgette'],
      nutritionScore: -18,
      stepCount: 2,
      ingredientLineCount: 4,
      distinctFoodCount: 3,
      complexityScore: 17,
    });
    expect(result.recipeInsights['2'].nutrition).toMatchObject({
      proteinG: 6,
      caloriesKcal: 650,
      score: -18,
    });
    expect(isMealAssistantPrecalculation(result)).toBe(true);
  });

  it('maps calendar months to meal assistant seasons', () => {
    expect(getMealAssistantSeason(new Date('2026-01-01T00:00:00'))).toBe('winter');
    expect(getMealAssistantSeason(new Date('2026-04-01T00:00:00'))).toBe('spring');
    expect(getMealAssistantSeason(new Date('2026-07-01T00:00:00'))).toBe('summer');
    expect(getMealAssistantSeason(new Date('2026-10-01T00:00:00'))).toBe('autumn');
  });

  it('rejects unknown payload shapes', () => {
    expect(isMealAssistantPrecalculation({ schemaVersion: 999 })).toBe(false);
    expect(isMealAssistantPrecalculation(null)).toBe(false);
  });
});
