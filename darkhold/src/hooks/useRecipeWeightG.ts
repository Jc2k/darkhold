import { useQueries } from '@tanstack/react-query';
import type { Query } from '@tanstack/react-query';
import { apiGet } from '../api/client';
import type { RecipeIngredient, UnitConversion, PaginatedResponse } from '../api/tandoor-types';
import { ONE_HOUR } from '../utils/cacheConfig';
import { estimateTotalWeightG } from '../utils/recipeWeight';

export interface RecipeWeightResult {
  weightG: number | null;
  isApproximate: boolean;
  isLoading: boolean;
}

/**
 * Progressively estimates the total recipe weight in grams.
 *
 * - The first render uses cached data or the hardcoded unit-name table for an
 *   immediate approximation.
 * - One background query is fired per unique ingredient unit ID.  As each
 *   query resolves, the estimate is refined with Tandoor's exact conversions.
 * - Conversions are cached forever when results are found; cached for one hour
 *   when the endpoint returns an empty list.
 */
export function useRecipeWeightG(ingredients: RecipeIngredient[]): RecipeWeightResult {
  // Collect unique (unit_id, food_id) pairs from real (non-header, non-zero) ingredients.
  // Food-specific queries let Tandoor return density overrides for that food.
  const pairs = [
    ...new Map(
      ingredients
        .filter(
          (ing) =>
            !ing.is_header &&
            ing.amount != null &&
            ing.amount !== 0 &&
            ing.unit &&
            typeof ing.unit === 'object',
        )
        .map((ing) => {
          const unitId = (ing.unit as { id: number }).id;
          const foodId = ing.food
            ? typeof ing.food === 'object'
              ? ing.food.id
              : (ing.food as number)
            : null;
          return [`${unitId}:${foodId ?? ''}`, { unitId, foodId }] as const;
        }),
    ).values(),
  ];

  const queryResults = useQueries({
    queries: pairs.map(({ unitId, foodId }) => ({
      queryKey: ['unit-conversion', unitId, foodId ?? null],
      queryFn: () =>
        apiGet<PaginatedResponse<UnitConversion>>('/unit-conversion/', {
          base_unit: unitId,
          ...(foodId != null ? { food: foodId } : {}),
          page_size: 100,
        }),
      staleTime: (query: Query<PaginatedResponse<UnitConversion>>) => {
        const data = query.state.data;
        return (data?.results?.length ?? 0) > 0 ? Infinity : ONE_HOUR;
      },
      gcTime: Infinity,
    })),
  });

  const isLoading = queryResults.some((r) => r.isLoading);

  // Accumulate all conversions from settled queries
  const allConversions: UnitConversion[] = queryResults.flatMap((r) => r.data?.results ?? []);

  const totals = estimateTotalWeightG(ingredients, allConversions);

  return {
    weightG: totals?.weightG ?? null,
    isApproximate: totals?.isApproximate ?? false,
    isLoading,
  };
}
