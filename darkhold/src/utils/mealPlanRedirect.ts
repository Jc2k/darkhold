import { formatDate, getMealPlanWeekStartSaturday, parseLocalDate } from './dateUtils';
import { queryOptions, type QueryClient } from '@tanstack/react-query';

type ApiGetLike = <T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined | null>,
) => Promise<T>;

interface RedirectShoppingListEntry {
  id: number;
  list_recipe_data?: {
    meal_plan_data?: {
      from_date?: string | null;
    } | null;
  } | null;
}

interface PaginatedResults<T> {
  results: T[];
  next?: string | null;
}

export const MEAL_PLAN_REDIRECT_WEEK_QUERY_KEY = ['meal-plan', 'redirect-week-path'] as const;
export const MEAL_PLAN_REDIRECT_WEEK_BROADCAST_KEY = 'meal-plan-redirect-week-path';
export const MEAL_PLAN_REDIRECT_WEEK_STALE_TIME = 60_000;

function getFromDateFromEntry(entry: RedirectShoppingListEntry): string | null {
  return entry.list_recipe_data?.meal_plan_data?.from_date ?? null;
}

export function getCurrentMealPlanWeekPath(now: Date = new Date()): string {
  return `/meal-plan/${formatDate(getMealPlanWeekStartSaturday(now))}`;
}

export function getMealPlanWeekStartFromShoppingListEntries(
  entries: RedirectShoppingListEntry[],
  now: Date = new Date(),
): Date | null {
  if (entries.length === 0) return null;

  const latestMealPlanDate = entries
    .map(getFromDateFromEntry)
    .find((fromDate): fromDate is string => fromDate !== null);
  if (!latestMealPlanDate) return getMealPlanWeekStartSaturday(now);

  const rawDate = latestMealPlanDate.includes('T')
    ? latestMealPlanDate.split('T')[0]
    : latestMealPlanDate;
  const parsedDate = parseLocalDate(rawDate);
  return getMealPlanWeekStartSaturday(parsedDate ?? now);
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
    while (true) {
      const shoppingList = await apiGet<PaginatedResults<RedirectShoppingListEntry>>(
        '/shopping-list-entry/',
        {
          ordering: '-created_at',
          page_size: 100,
          page,
        },
      );

      const latestWithMealPlan = shoppingList.results.find(
        (entry) => getFromDateFromEntry(entry) != null,
      );
      if (latestWithMealPlan) {
        const weekStart = getMealPlanWeekStartFromShoppingListEntries([latestWithMealPlan], now);
        return weekStart ? `/meal-plan/${formatDate(weekStart)}` : fallback;
      }

      if (!shoppingList.next) break;
      page += 1;
    }

    return fallback;
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
