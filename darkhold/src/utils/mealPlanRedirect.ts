import { formatDate, getMealPlanWeekStartSaturday, parseLocalDate } from './dateUtils';
import { queryOptions, type QueryClient } from '@tanstack/react-query';

type ApiGetLike = <T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined | null>,
) => Promise<T>;

interface RedirectShoppingListEntry {
  id: number;
  recipe_mealplan?:
    | number
    | {
        id?: number | null;
      }
    | null;
  list_recipe_data?: {
    mealplan?: number | null;
    meal_plan_data?: {
      id?: number | null;
      from_date?: string | null;
    } | null;
  } | null;
}

interface RedirectMealPlanEntry {
  from_date: string;
}

interface PaginatedResults<T> {
  results: T[];
  next?: string | null;
}

export const MEAL_PLAN_REDIRECT_WEEK_QUERY_KEY = ['meal-plan', 'redirect-week-path'] as const;
export const MEAL_PLAN_REDIRECT_WEEK_BROADCAST_KEY = 'meal-plan-redirect-week-path';
export const MEAL_PLAN_REDIRECT_WEEK_STALE_TIME = 60_000;

function getRecipeMealPlanId(entry: RedirectShoppingListEntry): number | null {
  if (typeof entry.recipe_mealplan === 'number') return entry.recipe_mealplan;
  if (entry.recipe_mealplan && typeof entry.recipe_mealplan.id === 'number') {
    return entry.recipe_mealplan.id;
  }
  if (typeof entry.list_recipe_data?.mealplan === 'number') {
    return entry.list_recipe_data.mealplan;
  }
  if (typeof entry.list_recipe_data?.meal_plan_data?.id === 'number') {
    return entry.list_recipe_data.meal_plan_data.id;
  }
  return null;
}

function getFromDateFromEntry(entry: RedirectShoppingListEntry): string | null {
  return entry.list_recipe_data?.meal_plan_data?.from_date ?? null;
}

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
    let page = 1;
    let latestMealPlanId: number | null = null;
    let directFromDate: string | null = null;
    while (latestMealPlanId == null && directFromDate == null) {
      const shoppingList = await apiGet<PaginatedResults<RedirectShoppingListEntry>>(
        '/shopping-list-entry/',
        {
          ordering: '-created_at',
          page_size: 100,
          page,
        },
      );

      const latestWithMealPlan = shoppingList.results.find(
        (entry) => getFromDateFromEntry(entry) != null || getRecipeMealPlanId(entry) != null,
      );
      if (latestWithMealPlan) {
        directFromDate = getFromDateFromEntry(latestWithMealPlan);
        if (directFromDate == null) {
          latestMealPlanId = getRecipeMealPlanId(latestWithMealPlan);
        }
        break;
      }

      if (!shoppingList.next) break;
      page += 1;
    }

    if (directFromDate != null) {
      return getMealPlanWeekPathFromDateString(directFromDate) ?? fallback;
    }
    if (latestMealPlanId == null) return fallback;

    const mealPlan = await apiGet<RedirectMealPlanEntry>(`/meal-plan/${latestMealPlanId}/`);
    return getMealPlanWeekPathFromDateString(mealPlan.from_date) ?? fallback;
  } catch {
    return fallback;
  }
}

export function getMealPlanRedirectWeekQueryOptions(apiGet: ApiGetLike) {
  return queryOptions({
    queryKey: MEAL_PLAN_REDIRECT_WEEK_QUERY_KEY,
    queryFn: () => getLockedMealPlanWeekPath(apiGet),
    staleTime: MEAL_PLAN_REDIRECT_WEEK_STALE_TIME,
    retry: false,
  });
}

type RedirectWeekQueryClient = Pick<QueryClient, 'invalidateQueries' | 'fetchQuery'>;

export function invalidateAndRefreshMealPlanRedirectWeek(
  queryClient: RedirectWeekQueryClient,
  apiGet: ApiGetLike,
): Promise<string> {
  queryClient.invalidateQueries({ queryKey: MEAL_PLAN_REDIRECT_WEEK_QUERY_KEY });
  return queryClient.fetchQuery(getMealPlanRedirectWeekQueryOptions(apiGet));
}
