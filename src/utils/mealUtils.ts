import type { Recipe, Keyword, MealType } from '../api/tandoor-types';

export function deriveMealType(recipe: Recipe, mealTypes: MealType[]): number | undefined {
  const keywords = Array.isArray(recipe.keywords)
    ? recipe.keywords.filter((k): k is Keyword => typeof k === 'object').map((k) => k.name.toLowerCase())
    : [];

  const find = (name: string) => mealTypes.find((mt) => mt.name.toLowerCase().includes(name));

  if (keywords.some((k) => k.includes('breakfast'))) return find('breakfast')?.id;
  if (keywords.some((k) => k.includes('lunch'))) return find('lunch')?.id;
  if (keywords.some((k) => k.includes('dessert') || k.includes('snack'))) return find('snack')?.id ?? find('dessert')?.id;
  return find('dinner')?.id ?? mealTypes[0]?.id;
}
