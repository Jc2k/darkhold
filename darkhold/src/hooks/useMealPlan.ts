import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPatch, apiDelete } from '../api/client';
import type { MealPlan, PaginatedResponse } from '../api/tandoor-types';
import { broadcastInvalidation } from './useInvalidationSocket';

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

export function useMealPlan(fromDate: Date, toDate: Date) {
  return useQuery({
    queryKey: ['meal-plan', formatDate(fromDate), formatDate(toDate)],
    queryFn: () =>
      apiGet<PaginatedResponse<MealPlan>>('/meal-plan/', {
        from_date: formatDate(fromDate),
        to_date: formatDate(toDate),
      }),
  });
}

export function useDeleteMealPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/meal-plan/${id}/`),
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
      apiPatch<MealPlan>(`/meal-plan/${id}/`, data),
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meal-plan'] });
      qc.invalidateQueries({ queryKey: ['shopping-list'] });
      broadcastInvalidation('meal-plan');
      broadcastInvalidation('shopping-list');
    },
  });
}
