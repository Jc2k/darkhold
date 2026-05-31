import type { QueryClient } from '@tanstack/react-query';
import type { MealPlan, PaginatedResponse } from '../api/tandoor-types';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type MealPlanQueryClient = Pick<QueryClient, 'getQueriesData' | 'setQueryData'>;

function getCachedRange(queryKey: readonly unknown[]): { fromDate: string; toDate: string } | null {
  if (
    queryKey.length !== 3 ||
    queryKey[0] !== 'meal-plan' ||
    typeof queryKey[1] !== 'string' ||
    typeof queryKey[2] !== 'string' ||
    !DATE_PATTERN.test(queryKey[1]) ||
    !DATE_PATTERN.test(queryKey[2])
  ) {
    return null;
  }

  return { fromDate: queryKey[1], toDate: queryKey[2] };
}

function getEntryDate(entry: MealPlan): string {
  return entry.from_date.split('T')[0];
}

/** Updates every cached meal-plan date range that should contain the accepted entry. */
export function updateMealPlanCaches(queryClient: MealPlanQueryClient, entry: MealPlan): void {
  const entryDate = getEntryDate(entry);

  for (const [queryKey, current] of queryClient.getQueriesData<PaginatedResponse<MealPlan>>({
    queryKey: ['meal-plan'],
  })) {
    if (!current) continue;
    const range = getCachedRange(queryKey);
    if (!range) continue;

    const existingIndex = current.results.findIndex((candidate) => candidate.id === entry.id);
    const belongsInRange = entryDate >= range.fromDate && entryDate <= range.toDate;

    if (!belongsInRange) {
      if (existingIndex === -1) continue;
      queryClient.setQueryData(queryKey, {
        ...current,
        count: Math.max(0, current.count - 1),
        results: current.results.filter((candidate) => candidate.id !== entry.id),
      });
      continue;
    }

    if (existingIndex === -1) {
      queryClient.setQueryData(queryKey, {
        ...current,
        count: current.count + 1,
        results: [...current.results, entry],
      });
      continue;
    }

    const results = current.results.slice();
    results[existingIndex] = entry;
    queryClient.setQueryData(queryKey, { ...current, results });
  }
}

/** Removes an accepted deletion from every cached meal-plan date range. */
export function removeMealPlanFromCaches(queryClient: MealPlanQueryClient, entryId: number): void {
  for (const [queryKey, current] of queryClient.getQueriesData<PaginatedResponse<MealPlan>>({
    queryKey: ['meal-plan'],
  })) {
    if (!current || !getCachedRange(queryKey)) continue;
    if (!current.results.some((candidate) => candidate.id === entryId)) continue;
    queryClient.setQueryData(queryKey, {
      ...current,
      count: Math.max(0, current.count - 1),
      results: current.results.filter((candidate) => candidate.id !== entryId),
    });
  }
}
