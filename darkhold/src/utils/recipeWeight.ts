import type { RecipeIngredient, UnitConversion } from '../api/tandoor-types';

/**
 * Hardcoded map from unit name (lowercase, trimmed) to grams.
 * Weight units are exact; volume units assume water density (1 ml = 1 g).
 */
export const UNIT_NAME_TO_GRAMS: Record<string, number> = {
  // Weight
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  kilogram: 1000,
  kilograms: 1000,
  oz: 28.3495,
  ounce: 28.3495,
  ounces: 28.3495,
  lb: 453.592,
  lbs: 453.592,
  pound: 453.592,
  pounds: 453.592,
  // Volume (water density: 1 ml = 1 g)
  ml: 1,
  millilitre: 1,
  milliliter: 1,
  millilitres: 1,
  milliliters: 1,
  l: 1000,
  litre: 1000,
  liter: 1000,
  litres: 1000,
  liters: 1000,
  tsp: 4.92892,
  teaspoon: 4.92892,
  teaspoons: 4.92892,
  tbsp: 14.7868,
  tablespoon: 14.7868,
  tablespoons: 14.7868,
  'fl oz': 29.5735,
  'fluid ounce': 29.5735,
  'fluid ounces': 29.5735,
  cup: 236.588,
  cups: 236.588,
  pint: 473.176,
  pints: 473.176,
};

/** Returns grams-per-unit from the hardcoded table, or null if unknown. */
export function approximateUnitToGrams(unitName: string): number | null {
  return UNIT_NAME_TO_GRAMS[unitName.trim().toLowerCase()] ?? null;
}

const GRAM_NAMES = new Set(['g', 'gram', 'grams']);

function isGramUnit(name: string): boolean {
  return GRAM_NAMES.has(name.trim().toLowerCase());
}

/**
 * Resolves how many grams one unit of `unitId` equals, using Tandoor's
 * unit-conversion records.  Returns null if no direct path is found.
 */
export function resolveUnitToGrams(
  unitId: number,
  conversions: UnitConversion[],
): number | null {
  for (const conv of conversions) {
    if (conv.base_amount <= 0 || conv.converted_amount <= 0) continue;

    // base_unit is our unit and converted_unit is grams
    if (conv.base_unit.id === unitId && isGramUnit(conv.converted_unit.name)) {
      return conv.converted_amount / conv.base_amount;
    }

    // converted_unit is our unit and base_unit is grams
    if (conv.converted_unit.id === unitId && isGramUnit(conv.base_unit.name)) {
      return conv.base_amount / conv.converted_amount;
    }
  }
  return null;
}

export interface IngredientWeightResult {
  grams: number;
  approximate: boolean;
}

/**
 * Estimates the weight in grams of a single ingredient.
 * - First tries Tandoor unit-conversion records (exact).
 * - Falls back to the hardcoded UNIT_NAME_TO_GRAMS table (approximate).
 * Returns null when no conversion is possible.
 */
export function estimateIngredientWeightG(
  ing: RecipeIngredient,
  conversions: UnitConversion[],
): IngredientWeightResult | null {
  if (ing.is_header) return null;
  const amount = ing.amount;
  if (amount == null || amount === 0) return null;

  const unit = ing.unit && typeof ing.unit === 'object' ? ing.unit : null;

  // Ingredient has no unit — assume grams (common for weighed ingredients)
  if (!unit) {
    return { grams: amount, approximate: true };
  }

  // Unit is already grams
  if (isGramUnit(unit.name)) {
    return { grams: amount, approximate: false };
  }

  // Try exact Tandoor conversion
  const exactGramsPerUnit = resolveUnitToGrams(unit.id, conversions);
  if (exactGramsPerUnit !== null) {
    return { grams: amount * exactGramsPerUnit, approximate: false };
  }

  // Fall back to hardcoded approximation
  const approxGramsPerUnit = approximateUnitToGrams(unit.name);
  if (approxGramsPerUnit !== null) {
    return { grams: amount * approxGramsPerUnit, approximate: true };
  }

  return null;
}

export interface TotalWeightResult {
  weightG: number;
  isApproximate: boolean;
  unconvertedCount: number;
}

/**
 * Sums the estimated weight of all convertible ingredients.
 * Returns null when no ingredient could be converted at all.
 */
export function estimateTotalWeightG(
  ingredients: RecipeIngredient[],
  conversions: UnitConversion[],
): TotalWeightResult | null {
  let weightG = 0;
  let isApproximate = false;
  let convertedCount = 0;
  let unconvertedCount = 0;

  for (const ing of ingredients) {
    const result = estimateIngredientWeightG(ing, conversions);
    if (result === null) {
      if (!ing.is_header) unconvertedCount++;
    } else {
      weightG += result.grams;
      if (result.approximate) isApproximate = true;
      convertedCount++;
    }
  }

  if (convertedCount === 0) return null;
  return { weightG, isApproximate, unconvertedCount };
}
