import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPatch, apiDelete } from '../api/client';
import type { MealPlan, PaginatedResponse } from '../api/tandoor-types';
import { invalidateCacheQueries } from './useCacheInvalidation';
import type { UpSoonData } from './useUpSoon';
import { formatDate, isMealPlanDateInPast } from '../utils/dateUtils';
import { MEAL_PLAN_GC_TIME, MEAL_PLAN_STALE_TIME } from '../utils/cacheConfig';
import { removeMealPlanFromCaches, updateMealPlanCaches } from '../utils/mealPlanCache';
import {
  getMealPlanWeekPathFromDateString,
  invalidateAndRefreshMealPlanRedirectWeek,
  MEAL_PLAN_REDIRECT_WEEK_BROADCAST_KEY,
  MEAL_PLAN_REDIRECT_WEEK_QUERY_KEY,
} from '../utils/mealPlanRedirect';

export const MEAL_PLAN_ITEM_QUERY_PARAMS = {
  from_date: '1900-01-01',
  to_date: '2100-01-01',
} as const;

export function useMealPlan(fromDate: Date, toDate: Date) {
  return useQuery({
    queryKey: ['meal-plan', formatDate(fromDate), formatDate(toDate)],
    queryFn: () =>
      apiGet<PaginatedResponse<MealPlan>>('/meal-plan/', {
        from_date: formatDate(fromDate),
        to_date: formatDate(toDate),
      }),
    staleTime: MEAL_PLAN_STALE_TIME,
    gcTime: MEAL_PLAN_GC_TIME,
    refetchOnMount: 'always',
  });
}

export function useDeleteMealPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/meal-plan/${id}/`, MEAL_PLAN_ITEM_QUERY_PARAMS),
    onSuccess: (_result, id) => {
      removeMealPlanFromCaches(qc, id);
      invalidateCacheQueries(
        qc,
        'meal-plan',
        'shopping-list',
        MEAL_PLAN_REDIRECT_WEEK_BROADCAST_KEY,
      );
      void invalidateAndRefreshMealPlanRedirectWeek(qc, apiGet);
    },
  });
}

export function useUpdateMealPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<MealPlan> }) =>
      apiPatch<MealPlan>(`/meal-plan/${id}/`, data, MEAL_PLAN_ITEM_QUERY_PARAMS),
    onSuccess: (result) => {
      updateMealPlanCaches(qc, result);
      invalidateCacheQueries(
        qc,
        'meal-plan',
        'shopping-list',
        MEAL_PLAN_REDIRECT_WEEK_BROADCAST_KEY,
      );
      void invalidateAndRefreshMealPlanRedirectWeek(qc, apiGet);
    },
  });
}

export function useCreateMealPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<MealPlan>) =>
      apiPost<MealPlan>('/meal-plan/', {
        ...data,
        ...(data.addshopping === undefined
          ? {}
          : { addshopping: data.addshopping && !isMealPlanDateInPast(data.from_date ?? '') }),
      }),
    onSuccess: async (result, variables) => {
      updateMealPlanCaches(qc, result);
      const redirectWeekPath = getMealPlanWeekPathFromDateString(result.from_date);
      if (redirectWeekPath) {
        qc.setQueryData(MEAL_PLAN_REDIRECT_WEEK_QUERY_KEY, redirectWeekPath);
      }
      invalidateCacheQueries(
        qc,
        'meal-plan',
        'shopping-list',
        MEAL_PLAN_REDIRECT_WEEK_BROADCAST_KEY,
      );
      void invalidateAndRefreshMealPlanRedirectWeek(qc, apiGet);

      // Remove from Up Soon if this recipe is in the list
      const recipeId =
        typeof variables.recipe === 'object'
          ? (variables.recipe as { id?: number } | null)?.id
          : (variables.recipe as unknown as number | undefined);
      if (recipeId) {
        const upSoonData = qc.getQueryData<UpSoonData | null>(['up-soon']);
        const entry = upSoonData?.entries.find((e) => e.recipeId === recipeId);
        if (entry) {
          try {
            await apiDelete(`/recipe-book-entry/${entry.entryId}/`);
            qc.setQueryData<UpSoonData | null>(['up-soon'], (current) =>
              current
                ? {
                    ...current,
                    entries: current.entries.filter((candidate) => candidate !== entry),
                  }
                : current,
            );
            invalidateCacheQueries(qc, 'up-soon');
          } catch {
            // Non-fatal: up-soon removal failed, but the meal plan was added successfully
          }
        }
      }
    },
  });
}
