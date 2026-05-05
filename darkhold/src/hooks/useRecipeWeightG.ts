import { useQueries } from '@tanstack/react-query';
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
  // Collect unique unit IDs from real (non-header, non-zero) ingredients
  const unitIds = [
    ...new Set(
      ingredients
        .filter((ing) => !ing.is_header && ing.amount != null && ing.amount !== 0 && ing.unit && typeof ing.unit === 'object')
        .map((ing) => (ing.unit as { id: number }).id),
    ),
  ];

  const queryResults = useQueries({
    queries: unitIds.map((unitId) => ({
      queryKey: ['unit-conversion', unitId],
      queryFn: () =>
        apiGet<PaginatedResponse<UnitConversion>>('/unit-conversion/', {
          base_unit: unitId,
          page_size: 100,
        }),
      staleTime: (query: { state: { data?: PaginatedResponse<UnitConversion> } }) => {
        const data = query.state.data;
        return data && data.results && data.results.length > 0 ? Infinity : ONE_HOUR;
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
