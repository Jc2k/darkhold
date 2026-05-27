import { formatDate, getMealPlanWeekStartSaturday, parseLocalDate } from './dateUtils';

type ApiGetLike = <T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined | null>,
) => Promise<T>;

interface RedirectShoppingListEntry {
  id: number;
  recipe_mealplan?: number | null;
}

interface RedirectMealPlanEntry {
  from_date: string;
}

interface PaginatedResults<T> {
  results: T[];
}

export const MEAL_PLAN_REDIRECT_WEEK_QUERY_KEY = ['meal-plan', 'redirect-week-path'] as const;
export const MEAL_PLAN_REDIRECT_WEEK_BROADCAST_KEY = 'meal-plan-redirect-week-path';

export function getCurrentMealPlanWeekPath(now: Date = new Date()): string {
  return `/meal-plan/${formatDate(getMealPlanWeekStartSaturday(now))}`;
}

export function getMealPlanWeekPathFromDateString(fromDate: string): string | null {
  const rawDate = fromDate.includes('T') ? fromDate.split('T')[0] : fromDate;
  const mealPlanDate = parseLocalDate(rawDate);
  if (!mealPlanDate) return null;
  return `/meal-plan/${formatDate(getMealPlanWeekStartSaturday(mealPlanDate))}`;
}

export async function getLockedMealPlanWeekPath(
  apiGet: ApiGetLike,
  now: Date = new Date(),
): Promise<string> {
  const fallback = getCurrentMealPlanWeekPath(now);

  try {
    const shoppingList = await apiGet<PaginatedResults<RedirectShoppingListEntry>>(
      '/shopping-list-entry/',
      {
        ordering: '-created_at',
        page_size: 100,
      },
    );

    const latestWithMealPlan = shoppingList.results.find((entry) => entry.recipe_mealplan != null);
    if (!latestWithMealPlan) return fallback;

    const mealPlan = await apiGet<RedirectMealPlanEntry>(
      `/meal-plan/${latestWithMealPlan.recipe_mealplan}/`,
    );
    return getMealPlanWeekPathFromDateString(mealPlan.from_date) ?? fallback;
  } catch {
    return fallback;
  }
}
