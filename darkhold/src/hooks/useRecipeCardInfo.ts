import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';
import type { CookLog, PaginatedResponse, Recipe } from '../api/tandoor-types';

export interface RecipeCardInfo {
  recipe: Recipe;
  lastCookedAt: string | null;
}

export async function fetchRecipeCardInfo(recipeId: number): Promise<RecipeCardInfo> {
  const recipe = await apiGet<Recipe>(`/recipe/${recipeId}/`);
  let lastCookedAt: string | null = null;

  if (localStorage.getItem('tandoor_token')) {
    try {
      const cookLogs = await apiGet<PaginatedResponse<CookLog>>('/cook-log/', {
        recipe: recipeId,
        ordering: '-created_at',
        page_size: 1,
      });
      lastCookedAt = cookLogs.results[0]?.created_at ?? null;
    } catch {
      // Recipe decision information remains useful when cook-log access is unavailable.
    }
  }

  return { recipe, lastCookedAt };
}

export function useRecipeCardInfo(recipeId: number, enabled: boolean) {
  return useQuery({
    queryKey: ['recipe-card-info', recipeId],
    queryFn: () => fetchRecipeCardInfo(recipeId),
    enabled,
    staleTime: 1000 * 60 * 15,
  });
}
