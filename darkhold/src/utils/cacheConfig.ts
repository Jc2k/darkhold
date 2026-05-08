export const ALL_RECIPES_STALE_TIME = 1000 * 60 * 60 * 24;
export const ALL_RECIPES_GC_TIME = 1000 * 60 * 60 * 24 * 7;
export const ONE_HOUR = 1000 * 60 * 60;
export const ONE_DAY = 1000 * 60 * 60 * 24;
export const ONE_WEEK = ONE_DAY * 7;
export const TWO_WEEKS = ONE_WEEK * 2;

export const MEAL_PLAN_STALE_TIME = 1000 * 60 * 5;
export const MEAL_PLAN_GC_TIME = TWO_WEEKS;

export const RECIPES_STALE_TIME = 1000 * 60 * 30;
export const RECIPES_GC_TIME = ONE_WEEK;

export const KEYWORDS_STALE_TIME = ONE_DAY;
export const KEYWORDS_GC_TIME = TWO_WEEKS;

export const BOOKS_STALE_TIME = ONE_HOUR;
export const BOOKS_GC_TIME = ONE_WEEK;

export const APP_CONFIG_STALE_TIME = ONE_HOUR;
export const APP_CONFIG_GC_TIME = ONE_WEEK;

export const PERSISTED_QUERY_MAX_AGE = ONE_WEEK;

const PERSISTED_QUERY_ROOTS = new Set([
  'all-recipes',
  'meal-plan',
  'recipe',
  'recipes',
  'keywords',
  'book',
  'books',
  'book-entries',
  'app-config',
]);

export function shouldPersistQueryKey(queryKey: readonly unknown[]): boolean {
  const root = queryKey[0];
  if (typeof root !== 'string') return false;
  if (!PERSISTED_QUERY_ROOTS.has(root)) return false;
  if (root === 'meal-plan' && queryKey[1] === 'regulars') return false;
  return true;
}
