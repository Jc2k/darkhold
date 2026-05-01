import type { Recipe, Keyword, MealType } from '../api/tandoor-types';

function isValidKeyword(k: Keyword | number): k is Keyword {
  return typeof k === 'object' && k !== null && typeof (k as Keyword).name === 'string';
}

export function deriveMealType(recipe: Recipe, mealTypes: MealType[]): number | undefined {
  const keywords = Array.isArray(recipe.keywords)
    ? recipe.keywords.filter(isValidKeyword).map((k) => k.name.toLowerCase())
    : [];

  const find = (name: string) => mealTypes.find((mt) => mt.name.toLowerCase().includes(name));

  if (keywords.some((k) => k.includes('breakfast'))) return find('breakfast')?.id;
  if (keywords.some((k) => k.includes('lunch'))) return find('lunch')?.id;
  if (keywords.some((k) => k.includes('dessert') || k.includes('snack'))) return find('snack')?.id ?? find('dessert')?.id;
  return find('dinner')?.id ?? mealTypes[0]?.id;
}
