import type { FoodProperty, NutritionInformation, Recipe } from '../api/tandoor-types';

export type NutritionFactTone = 'success' | 'warning' | 'danger' | 'secondary';

export interface RecipeNutritionFact {
  key: string;
  label: string;
  value: number;
  unit: string;
  tone: NutritionFactTone;
}

function nutrientTone(name: string, value: number): NutritionFactTone {
  if (/calor|energy/i.test(name)) {
    if (value >= 400 && value <= 500) return 'success';
    if (value >= 300 && value <= 600) return 'warning';
    return 'danger';
  }
  if (/protein/i.test(name)) {
    if (value >= 15) return 'success';
    if (value >= 10) return 'warning';
    return 'danger';
  }
  return 'secondary';
}

function fact(key: string, label: string, value: number, unit: string): RecipeNutritionFact {
  return { key, label, value: Math.round(value), unit, tone: nutrientTone(label, value) };
}

function factsFromFoodProperties(
  foodProperties: Record<string, FoodProperty>,
  servings?: number | null,
): RecipeNutritionFact[] {
  const per = servings && servings > 0 ? servings : 1;
  return Object.values(foodProperties)
    .filter((property) => property.total_value > 0)
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
    .map((property) =>
      fact(String(property.id), property.name, property.total_value / per, property.unit ?? ''),
    );
}

function factsFromLegacyNutrition(nutrition: NutritionInformation): RecipeNutritionFact[] {
  return [
    nutrition.calories != null ? fact('calories', 'Calories', nutrition.calories, 'kcal') : null,
    nutrition.proteins != null ? fact('protein', 'Protein', nutrition.proteins, 'g') : null,
    nutrition.carbohydrates != null
      ? fact('carbs', 'Carbohydrates', nutrition.carbohydrates, 'g')
      : null,
    nutrition.fats != null ? fact('fat', 'Fat', nutrition.fats, 'g') : null,
    nutrition.fibres != null ? fact('fibre', 'Fibre', nutrition.fibres, 'g') : null,
  ].filter((item): item is RecipeNutritionFact => item != null && item.value > 0);
}

export function getRecipeNutritionFacts(recipe: Recipe): RecipeNutritionFact[] {
  if (recipe.food_properties && Object.keys(recipe.food_properties).length > 0) {
    return factsFromFoodProperties(recipe.food_properties, recipe.servings);
  }
  return recipe.nutrition ? factsFromLegacyNutrition(recipe.nutrition) : [];
}
