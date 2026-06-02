import { describe, expect, it } from 'vitest';
import type { FoodProperty, Recipe } from '../api/tandoor-types';
import { getRecipeNutritionFacts } from './recipeCardInfo';

function property(id: number, name: string, totalValue: number, unit = 'g'): FoodProperty {
  return { id, name, total_value: totalValue, unit, missing_value: false, food_values: {} };
}

const recipe = (overrides: Partial<Recipe>): Recipe => ({
  id: 1,
  name: 'Dinner',
  created_by: 1,
  ...overrides,
});

describe('getRecipeNutritionFacts', () => {
  it('uses per-serving calculated properties and applies calorie and protein target colours', () => {
    expect(
      getRecipeNutritionFacts(
        recipe({
          servings: 2,
          food_properties: {
            calories: property(1, 'Calories', 900, 'kcal'),
            protein: property(2, 'Protein', 30),
            fat: property(3, 'Fat', 20),
          },
        }),
      ),
    ).toEqual([
      { key: '1', label: 'Calories', value: 450, unit: 'kcal', tone: 'success' },
      { key: '2', label: 'Protein', value: 15, unit: 'g', tone: 'success' },
      { key: '3', label: 'Fat', value: 10, unit: 'g', tone: 'secondary' },
    ]);
  });

  it('marks protein below the green target as warning or danger', () => {
    expect(getRecipeNutritionFacts(recipe({ nutrition: { proteins: 10 } }))[0].tone).toBe(
      'warning',
    );
    expect(getRecipeNutritionFacts(recipe({ nutrition: { proteins: 5 } }))[0].tone).toBe('danger');
  });

  it('falls back to legacy nutrition when calculated properties are absent', () => {
    expect(getRecipeNutritionFacts(recipe({ nutrition: { calories: 250, proteins: 12 } }))).toEqual(
      [
        { key: 'calories', label: 'Calories', value: 250, unit: 'kcal', tone: 'danger' },
        { key: 'protein', label: 'Protein', value: 12, unit: 'g', tone: 'warning' },
      ],
    );
  });
});
