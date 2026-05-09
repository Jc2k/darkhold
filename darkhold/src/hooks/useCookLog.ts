import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '../api/client';
import type { CookLog, MealType, PaginatedResponse } from '../api/tandoor-types';

/** Normalised cook-log state: YYYY-MM-DD → array of cooked recipe IDs. */
export type CookedByDate = Record<string, number[]>;

/** Returns true if the given recipe has a cook log entry on the given date. */
export function isCookedOnDate(
  cookedByDate: CookedByDate | undefined,
  recipeId: number,
  dateStr: string,
): boolean {
  return cookedByDate?.[dateStr]?.includes(recipeId) ?? false;
}

/**
 * Builds the ISO 8601 timestamp to use when posting a cook log entry.
 * - For today: uses the current date/time.
 * - For a past date: uses the meal-type's configured time (if available) or noon.
 */
export function buildCookLogTimestamp(mealPlanDate: string, mealType?: MealType | null): string {
  const today = new Date().toISOString().split('T')[0];
  if (mealPlanDate === today) {
    return new Date().toISOString();
  }
  const time = mealType?.time;
  if (time) {
    // time is HH:MM or HH:MM:SS
    return `${mealPlanDate}T${time.length === 5 ? `${time}:00` : time}`;
  }
  return `${mealPlanDate}T12:00:00`;
}

/**
 * Fetches cook logs for a date range and returns them normalised as
 * { 'YYYY-MM-DD': [recipeId, ...] }.
 *
 * Only runs when the user has a personal API token.
 * Cache: 30 min stale, 2 h gc — moderately aggressive as per design intent.
 */
export function useCookLog(fromDate: string, toDate: string) {
  return useQuery({
    queryKey: ['cook-log', fromDate, toDate],
    enabled: Boolean(localStorage.getItem('tandoor_token')),
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60 * 2,
    queryFn: async (): Promise<CookedByDate> => {
      const all: CookLog[] = [];
      let page = 1;
      let hasNext = true;
      while (hasNext) {
        const data = await apiGet<PaginatedResponse<CookLog>>('/cook-log/', {
          created_at_gte: `${fromDate}T00:00:00`,
          created_at_lte: `${toDate}T23:59:59`,
          page_size: 100,
          page,
        });
        all.push(...data.results);
        hasNext = !!data.next;
        page++;
      }

      const byDate: CookedByDate = {};
      for (const log of all) {
        const date = log.created_at.split('T')[0];
        const recipeId = typeof log.recipe === 'object' ? log.recipe.id : (log.recipe as number);
        if (!byDate[date]) byDate[date] = [];
        if (!byDate[date].includes(recipeId)) byDate[date].push(recipeId);
      }
      return byDate;
    },
  });
}

/** Posts a new cook log entry and optimistically updates the local cache. */
export function useCreateCookLog() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      recipe: number;
      rating?: number | null;
      comment?: string | null;
      created_at: string;
    }) => apiPost<CookLog>('/cook-log/', data),

    onMutate: (variables) => {
      // Optimistically update every cached cook-log range that is loaded.
      const dateStr = variables.created_at.split('T')[0];
      qc.setQueriesData<CookedByDate>({ queryKey: ['cook-log'] }, (old) => {
        if (old === undefined) return old;
        const existing = old[dateStr] ?? [];
        if (existing.includes(variables.recipe)) return old;
        return { ...old, [dateStr]: [...existing, variables.recipe] };
      });
    },

    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cook-log'] });
    },
  });
}
