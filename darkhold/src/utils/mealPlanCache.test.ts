import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { MealPlan, PaginatedResponse } from '../api/tandoor-types';
import { removeMealPlanFromCaches, updateMealPlanCaches } from './mealPlanCache';

function mealPlan(id: number, fromDate: string): MealPlan {
  return { id, from_date: fromDate, to_date: fromDate, servings: 1 } as MealPlan;
}

function cached(...entries: MealPlan[]): PaginatedResponse<MealPlan> {
  return { count: entries.length, next: null, previous: null, results: entries };
}

describe('updateMealPlanCaches', () => {
  it('adds accepted entries only to matching cached date ranges', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['meal-plan', '2026-05-23', '2026-05-29'], cached());
    queryClient.setQueryData(['meal-plan', '2026-05-30', '2026-06-05'], cached());

    const entry = mealPlan(7, '2026-05-25T12:00:00');
    updateMealPlanCaches(queryClient, entry);

    expect(queryClient.getQueryData(['meal-plan', '2026-05-23', '2026-05-29'])).toEqual(
      cached(entry),
    );
    expect(queryClient.getQueryData(['meal-plan', '2026-05-30', '2026-06-05'])).toEqual(cached());
  });

  it('moves accepted updates between cached date ranges', () => {
    const queryClient = new QueryClient();
    const original = mealPlan(7, '2026-05-25');
    const moved = mealPlan(7, '2026-05-31');
    queryClient.setQueryData(['meal-plan', '2026-05-23', '2026-05-29'], cached(original));
    queryClient.setQueryData(['meal-plan', '2026-05-30', '2026-06-05'], cached());

    updateMealPlanCaches(queryClient, moved);

    expect(queryClient.getQueryData(['meal-plan', '2026-05-23', '2026-05-29'])).toEqual(cached());
    expect(queryClient.getQueryData(['meal-plan', '2026-05-30', '2026-06-05'])).toEqual(
      cached(moved),
    );
  });

  it('does not overwrite non-range meal-plan caches', () => {
    const queryClient = new QueryClient();
    const redirectPath = '/meal-plan/2026-05-23';
    queryClient.setQueryData(['meal-plan', 'redirect-week-path'], redirectPath);

    updateMealPlanCaches(queryClient, mealPlan(7, '2026-05-25'));

    expect(queryClient.getQueryData(['meal-plan', 'redirect-week-path'])).toBe(redirectPath);
  });
});

describe('removeMealPlanFromCaches', () => {
  it('removes accepted deletions from every cached date range', () => {
    const queryClient = new QueryClient();
    const removed = mealPlan(7, '2026-05-25');
    const retained = mealPlan(8, '2026-05-26');
    queryClient.setQueryData(['meal-plan', '2026-05-23', '2026-05-29'], cached(removed, retained));

    removeMealPlanFromCaches(queryClient, removed.id);

    expect(queryClient.getQueryData(['meal-plan', '2026-05-23', '2026-05-29'])).toEqual(
      cached(retained),
    );
  });
});
