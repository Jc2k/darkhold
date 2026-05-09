import type { Recipe, Keyword, MealType } from '../api/tandoor-types';

function isValidKeyword(k: Keyword | number): k is Keyword {
  return typeof k === 'object' && k !== null && typeof (k as Keyword).name === 'string';
}

/**
 * Derives the appropriate meal type from a recipe's keywords.
 *
 * Rules: lunch keyword → lunch, breakfast keyword → breakfast,
 * snack/dessert keyword → snack/dessert, otherwise → dinner.
 *
 * ⚠️ DO NOT expose meal type selection in any add-to-plan modal UI.
 * Meal type must always be set automatically via this function — never shown
 * as a form field or dropdown for the user to pick. Showing it adds friction
 * and is FORBIDDEN in all pop-up modals.
 */
export function deriveMealType(
  recipe: Pick<Recipe, 'keywords'>,
  mealTypes: MealType[],
  keywordNameById: Record<number, string> = {},
): number | undefined {
  const keywords = Array.isArray(recipe.keywords)
    ? recipe.keywords.flatMap((k) => {
      if (isValidKeyword(k)) return [k.name.toLowerCase()];
      const keywordName = keywordNameById[k];
      return typeof keywordName === 'string' ? [keywordName.toLowerCase()] : [];
    })
    : [];

  const find = (name: string) => mealTypes.find((mt) => mt.name.toLowerCase().includes(name));

  if (keywords.some((k) => k.includes('breakfast'))) return find('breakfast')?.id;
  if (keywords.some((k) => k.includes('lunch'))) return find('lunch')?.id;
  if (keywords.some((k) => k.includes('dessert') || k.includes('snack'))) return find('snack')?.id ?? find('dessert')?.id;
  return find('dinner')?.id ?? mealTypes[0]?.id;
}
