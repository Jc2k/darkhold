import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPatch, apiDelete } from '../api/client';
import type { MealPlan, PaginatedResponse } from '../api/tandoor-types';
import { broadcastInvalidation } from './useInvalidationSocket';
import type { UpSoonData } from './useUpSoon';
import { formatDate } from '../utils/dateUtils';
import { MEAL_PLAN_GC_TIME, MEAL_PLAN_STALE_TIME } from '../utils/cacheConfig';

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meal-plan'] });
      qc.invalidateQueries({ queryKey: ['shopping-list'] });
      broadcastInvalidation('meal-plan');
      broadcastInvalidation('shopping-list');
    },
  });
}

export function useUpdateMealPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<MealPlan> }) =>
      apiPatch<MealPlan>(`/meal-plan/${id}/`, data, MEAL_PLAN_ITEM_QUERY_PARAMS),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meal-plan'] });
      qc.invalidateQueries({ queryKey: ['shopping-list'] });
      broadcastInvalidation('meal-plan');
      broadcastInvalidation('shopping-list');
    },
  });
}

export function useCreateMealPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<MealPlan>) => apiPost<MealPlan>('/meal-plan/', data),
    onSuccess: async (_result, variables) => {
      qc.invalidateQueries({ queryKey: ['meal-plan'] });
      qc.invalidateQueries({ queryKey: ['shopping-list'] });
      broadcastInvalidation('meal-plan');
      broadcastInvalidation('shopping-list');

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
            qc.invalidateQueries({ queryKey: ['up-soon'] });
            broadcastInvalidation('up-soon');
          } catch {
            // Non-fatal: up-soon removal failed, but the meal plan was added successfully
          }
        }
      }
    },
  });
}
