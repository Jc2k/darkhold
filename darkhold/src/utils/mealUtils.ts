import type { Recipe, Keyword, MealType } from '../api/tandoor-types';

function isValidKeyword(k: Keyword | number): k is Keyword {
  return typeof k === 'object' && k !== null && typeof (k as Keyword).name === 'string';
}

function parseMealTypeTimeToMinutes(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const [hoursRaw, minutesRaw] = value.split(':');
  if (minutesRaw === undefined) return undefined;
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return undefined;
  return hours * 60 + minutes;
}

function pickFallbackMealTypeId(mealTypes: MealType[]): number | undefined {
  if (mealTypes.length === 0) return undefined;
  if (mealTypes.length === 1) return mealTypes[0].id;

  const nonBreakfastMealTypes = mealTypes.filter(
    (mealType) => !mealType.name.toLowerCase().includes('breakfast'),
  );
  const candidates = nonBreakfastMealTypes.length > 0 ? nonBreakfastMealTypes : mealTypes;

  const withTimes = candidates
    .map((mealType, index) => ({
      id: mealType.id,
      timeMinutes: parseMealTypeTimeToMinutes(mealType.time),
      order: mealType.order ?? Number.NEGATIVE_INFINITY,
      index,
    }))
    .filter((candidate) => candidate.timeMinutes !== undefined);
  if (withTimes.length > 0) {
    return withTimes.reduce((best, candidate) => {
      if (
        (candidate.timeMinutes ?? Number.NEGATIVE_INFINITY) >
        (best.timeMinutes ?? Number.NEGATIVE_INFINITY)
      )
        return candidate;
      if (candidate.timeMinutes === best.timeMinutes && candidate.order > best.order)
        return candidate;
      if (
        candidate.timeMinutes === best.timeMinutes &&
        candidate.order === best.order &&
        candidate.index > best.index
      )
        return candidate;
      return best;
    }).id;
  }

  const withOrder = candidates
    .map((mealType, index) => ({ id: mealType.id, order: mealType.order, index }))
    .filter((candidate) => candidate.order !== undefined);
  if (withOrder.length > 0) {
    return withOrder.reduce((best, candidate) => {
      if ((candidate.order ?? Number.NEGATIVE_INFINITY) > (best.order ?? Number.NEGATIVE_INFINITY))
        return candidate;
      if (candidate.order === best.order && candidate.index > best.index) return candidate;
      return best;
    }).id;
  }

  return candidates[candidates.length - 1]?.id;
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
        if (typeof k !== 'number') return [];
        const keywordName = keywordNameById[k];
        return typeof keywordName === 'string' ? [keywordName.toLowerCase()] : [];
      })
    : [];

  const find = (name: string) => mealTypes.find((mt) => mt.name.toLowerCase().includes(name));

  if (keywords.some((k) => k.includes('breakfast'))) return find('breakfast')?.id;
  if (keywords.some((k) => k.includes('lunch'))) return find('lunch')?.id;
  if (keywords.some((k) => k.includes('dessert') || k.includes('snack')))
    return find('snack')?.id ?? find('dessert')?.id;
  return find('dinner')?.id ?? pickFallbackMealTypeId(mealTypes);
}
