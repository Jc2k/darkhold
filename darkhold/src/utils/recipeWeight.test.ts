import { describe, it, expect } from 'vitest';
import type { RecipeIngredient, UnitConversion } from '../api/tandoor-types';
import {
  approximateUnitToGrams,
  resolveUnitToGrams,
  estimateIngredientWeightG,
  estimateTotalWeightG,
} from './recipeWeight';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConversion(
  baseUnitId: number,
  baseUnitName: string,
  baseAmount: number,
  convertedUnitId: number,
  convertedUnitName: string,
  convertedAmount: number,
  foodId?: number,
): UnitConversion {
  return {
    id: baseUnitId * 1000 + convertedUnitId,
    base_amount: baseAmount,
    base_unit: { id: baseUnitId, name: baseUnitName },
    converted_amount: convertedAmount,
    converted_unit: { id: convertedUnitId, name: convertedUnitName },
    food: foodId != null ? { id: foodId, name: `food-${foodId}` } : null,
  };
}

function makeIngredient(
  amount: number | null,
  unitId: number,
  unitName: string,
  foodId?: number,
  isHeader = false,
): RecipeIngredient {
  return {
    id: 1,
    amount,
    unit: { id: unitId, name: unitName },
    food: foodId != null ? { id: foodId, name: `food-${foodId}` } : null,
    is_header: isHeader,
  };
}

// ---------------------------------------------------------------------------
// approximateUnitToGrams
// ---------------------------------------------------------------------------

describe('approximateUnitToGrams', () => {
  it('returns correct grams for weight units', () => {
    expect(approximateUnitToGrams('g')).toBe(1);
    expect(approximateUnitToGrams('kg')).toBe(1000);
    expect(approximateUnitToGrams('oz')).toBeCloseTo(28.3495);
    expect(approximateUnitToGrams('lb')).toBeCloseTo(453.592);
  });

  it('returns correct grams for volume units (water density)', () => {
    expect(approximateUnitToGrams('ml')).toBe(1);
    expect(approximateUnitToGrams('l')).toBe(1000);
    expect(approximateUnitToGrams('tsp')).toBeCloseTo(4.92892);
    expect(approximateUnitToGrams('tbsp')).toBeCloseTo(14.7868);
    expect(approximateUnitToGrams('cup')).toBeCloseTo(236.588);
    expect(approximateUnitToGrams('pint')).toBeCloseTo(473.176);
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(approximateUnitToGrams('G')).toBe(1);
    expect(approximateUnitToGrams('  KG  ')).toBe(1000);
    expect(approximateUnitToGrams('Cup')).toBeCloseTo(236.588);
  });

  it('returns null for unknown units', () => {
    expect(approximateUnitToGrams('handful')).toBeNull();
    expect(approximateUnitToGrams('pinch')).toBeNull();
    expect(approximateUnitToGrams('')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveUnitToGrams
// ---------------------------------------------------------------------------

describe('resolveUnitToGrams', () => {
  const cupUnitId = 10;
  const gramUnitId = 1;

  it('resolves when base_unit is the target and converted_unit is grams', () => {
    // 1 cup flour → 120 g
    const conv = makeConversion(cupUnitId, 'cup', 1, gramUnitId, 'g', 120);
    expect(resolveUnitToGrams(cupUnitId, [conv])).toBeCloseTo(120);
  });

  it('resolves when converted_unit is the target and base_unit is grams', () => {
    // 120 g → 1 cup (reverse direction)
    const conv = makeConversion(gramUnitId, 'g', 120, cupUnitId, 'cup', 1);
    expect(resolveUnitToGrams(cupUnitId, [conv])).toBeCloseTo(120);
  });

  it('handles "gram" and "grams" as gram unit names', () => {
    const conv1 = makeConversion(cupUnitId, 'cup', 1, gramUnitId, 'gram', 120);
    expect(resolveUnitToGrams(cupUnitId, [conv1])).toBeCloseTo(120);

    const conv2 = makeConversion(cupUnitId, 'cup', 1, gramUnitId, 'grams', 240);
    expect(resolveUnitToGrams(cupUnitId, [conv2])).toBeCloseTo(240);
  });

  it('prefers food-specific conversion over generic when foodId is provided', () => {
    const generic = makeConversion(cupUnitId, 'cup', 1, gramUnitId, 'g', 240); // water
    const foodSpecific = makeConversion(cupUnitId, 'cup', 1, gramUnitId, 'g', 120, 42); // flour
    expect(resolveUnitToGrams(cupUnitId, [generic, foodSpecific], 42)).toBeCloseTo(120);
  });

  it('falls back to generic conversion when no food-specific match exists', () => {
    const generic = makeConversion(cupUnitId, 'cup', 1, gramUnitId, 'g', 240);
    const otherFood = makeConversion(cupUnitId, 'cup', 1, gramUnitId, 'g', 180, 99);
    expect(resolveUnitToGrams(cupUnitId, [generic, otherFood], 42)).toBeCloseTo(240);
  });

  it('ignores conversions with non-positive amounts', () => {
    const badConv = makeConversion(cupUnitId, 'cup', 0, gramUnitId, 'g', 120);
    expect(resolveUnitToGrams(cupUnitId, [badConv])).toBeNull();
  });

  it('returns null when no matching conversion exists', () => {
    expect(resolveUnitToGrams(cupUnitId, [])).toBeNull();
  });

  it('returns null when conversion does not involve grams', () => {
    // cup → ml only, no gram path
    const conv = makeConversion(cupUnitId, 'cup', 1, 20, 'ml', 240);
    expect(resolveUnitToGrams(cupUnitId, [conv])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// estimateIngredientWeightG
// ---------------------------------------------------------------------------

describe('estimateIngredientWeightG', () => {
  it('returns grams directly when unit is already g', () => {
    const ing = makeIngredient(250, 1, 'g');
    expect(estimateIngredientWeightG(ing, [])).toEqual({ grams: 250, approximate: false });
  });

  it('returns grams directly when unit is "gram" or "Grams"', () => {
    expect(estimateIngredientWeightG(makeIngredient(100, 1, 'gram'), [])?.grams).toBe(100);
    expect(estimateIngredientWeightG(makeIngredient(200, 1, 'Grams'), [])?.grams).toBe(200);
  });

  it('returns null for header ingredients', () => {
    const header: RecipeIngredient = { id: 1, amount: 0, unit: null, food: null, is_header: true };
    expect(estimateIngredientWeightG(header, [])).toBeNull();
  });

  it('returns null when amount is null', () => {
    const ing = makeIngredient(null, 10, 'cup');
    expect(estimateIngredientWeightG(ing, [])).toBeNull();
  });

  it('returns null when amount is 0', () => {
    const ing = makeIngredient(0, 10, 'cup');
    expect(estimateIngredientWeightG(ing, [])).toBeNull();
  });

  it('returns null when unit is absent', () => {
    const ing: RecipeIngredient = { id: 1, amount: 2, unit: null, food: null };
    expect(estimateIngredientWeightG(ing, [])).toBeNull();
  });

  it('uses exact Tandoor conversion and marks as not approximate', () => {
    const cupUnitId = 10;
    const conv = makeConversion(cupUnitId, 'cup', 1, 1, 'g', 120, 42); // flour
    const ing = makeIngredient(2, cupUnitId, 'cup', 42);
    const result = estimateIngredientWeightG(ing, [conv]);
    expect(result).toEqual({ grams: 240, approximate: false });
  });

  it('falls back to hardcoded approximation and marks as approximate', () => {
    const ing = makeIngredient(2, 10, 'cup'); // no conversions
    const result = estimateIngredientWeightG(ing, []);
    expect(result?.grams).toBeCloseTo(2 * 236.588);
    expect(result?.approximate).toBe(true);
  });

  it('prefers food-specific Tandoor conversion over generic', () => {
    const cupUnitId = 10;
    const generic = makeConversion(cupUnitId, 'cup', 1, 1, 'g', 240); // water density
    const foodSpecific = makeConversion(cupUnitId, 'cup', 1, 1, 'g', 120, 42); // flour
    const ing = makeIngredient(1, cupUnitId, 'cup', 42);
    expect(estimateIngredientWeightG(ing, [generic, foodSpecific])?.grams).toBeCloseTo(120);
  });

  it('returns null when no conversion is possible', () => {
    const ing = makeIngredient(3, 99, 'handful');
    expect(estimateIngredientWeightG(ing, [])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// estimateTotalWeightG
// ---------------------------------------------------------------------------

describe('estimateTotalWeightG', () => {
  it('sums weights of all convertible ingredients', () => {
    const ings: RecipeIngredient[] = [makeIngredient(200, 1, 'g'), makeIngredient(100, 1, 'g')];
    const result = estimateTotalWeightG(ings, []);
    expect(result?.weightG).toBe(300);
    expect(result?.isApproximate).toBe(false);
    expect(result?.unconvertedCount).toBe(0);
  });

  it('returns null when no ingredient could be converted', () => {
    const ings: RecipeIngredient[] = [
      makeIngredient(3, 99, 'handful'),
      makeIngredient(1, 88, 'pinch'),
    ];
    expect(estimateTotalWeightG(ings, [])).toBeNull();
  });

  it('sets isApproximate when any ingredient used the hardcoded table', () => {
    const ings: RecipeIngredient[] = [
      makeIngredient(200, 1, 'g'), // exact
      makeIngredient(1, 10, 'cup'), // approximate fallback
    ];
    const result = estimateTotalWeightG(ings, []);
    expect(result?.isApproximate).toBe(true);
  });

  it('counts unconverted ingredients but still returns a result', () => {
    const ings: RecipeIngredient[] = [
      makeIngredient(100, 1, 'g'),
      makeIngredient(2, 99, 'handful'), // unconvertible
    ];
    const result = estimateTotalWeightG(ings, []);
    expect(result?.weightG).toBe(100);
    expect(result?.unconvertedCount).toBe(1);
  });

  it('does not count header ingredients as unconverted', () => {
    const header: RecipeIngredient = { id: 99, amount: 0, unit: null, food: null, is_header: true };
    const ings: RecipeIngredient[] = [header, makeIngredient(50, 1, 'g')];
    const result = estimateTotalWeightG(ings, []);
    expect(result?.unconvertedCount).toBe(0);
    expect(result?.weightG).toBe(50);
  });

  it('returns null for an empty ingredient list', () => {
    expect(estimateTotalWeightG([], [])).toBeNull();
  });

  it('uses Tandoor conversions when provided', () => {
    const cupUnitId = 10;
    const conv = makeConversion(cupUnitId, 'cup', 1, 1, 'g', 120, 42); // 1 cup flour = 120 g
    const ings: RecipeIngredient[] = [makeIngredient(2, cupUnitId, 'cup', 42)];
    const result = estimateTotalWeightG(ings, [conv]);
    expect(result?.weightG).toBeCloseTo(240);
    expect(result?.isApproximate).toBe(false);
  });
});
