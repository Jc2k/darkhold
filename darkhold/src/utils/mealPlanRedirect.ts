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

export function getCurrentMealPlanWeekPath(now: Date = new Date()): string {
  return `/meal-plan/${formatDate(getMealPlanWeekStartSaturday(now))}`;
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
    if (!latestWithMealPlan?.recipe_mealplan) return fallback;

    const mealPlan = await apiGet<RedirectMealPlanEntry>(
      `/meal-plan/${latestWithMealPlan.recipe_mealplan}/`,
    );
    const mealPlanDate = parseLocalDate(mealPlan.from_date.split('T')[0]);
    if (!mealPlanDate) return fallback;

    return `/meal-plan/${formatDate(getMealPlanWeekStartSaturday(mealPlanDate))}`;
  } catch {
    return fallback;
  }
}
