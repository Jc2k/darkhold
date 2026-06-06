import { useQuery } from '@tanstack/react-query';
import {
  isMealAssistantPrecalculation,
  type MealAssistantPrecalculation,
} from '../utils/mealAssistantPrecalculation';
import { ONE_DAY, ONE_WEEK } from '../utils/cacheConfig';
import { getRecipePlanningSignals } from '../utils/planningSignals';

export const MEAL_ASSISTANT_PRECALCULATION_QUERY_KEY = ['meal-assistant-precalculation'] as const;

export async function fetchMealAssistantPrecalculation(): Promise<MealAssistantPrecalculation | null> {
  const res = await fetch('/meal-assistant-precalculation.json', {
    headers: { Accept: 'application/json' },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Precalculation fetch failed ${res.status}`);
  const payload: unknown = await res.json();
  return isMealAssistantPrecalculation(payload) ? payload : null;
}

export function useMealAssistantPrecalculation() {
  return useQuery({
    queryKey: MEAL_ASSISTANT_PRECALCULATION_QUERY_KEY,
    queryFn: fetchMealAssistantPrecalculation,
    staleTime: ONE_DAY,
    gcTime: ONE_WEEK,
  });
}

export function useRecipeStats(recipeId: string | undefined) {
  return useQuery({
    queryKey: MEAL_ASSISTANT_PRECALCULATION_QUERY_KEY,
    queryFn: fetchMealAssistantPrecalculation,
    staleTime: ONE_DAY,
    gcTime: ONE_WEEK,
    select: (precalculation) => {
      if (!precalculation || !recipeId) return null;
      return {
        generatedAt: precalculation.generatedAt,
        recipe: precalculation.recipes[recipeId],
        features: precalculation.recipeFeatures[recipeId],
        history: precalculation.recipeHistory[recipeId],
        insights: precalculation.recipeInsights[recipeId],
        planningSignals: getRecipePlanningSignals(precalculation.recipeInsights[recipeId]),
        similarities: precalculation.recipeSimilarities[recipeId] ?? [],
        cluster: precalculation.recipeClusterMemberships[recipeId],
        clusterDetail:
          precalculation.recipeClusters[
            precalculation.recipeClusterMemberships[recipeId]?.clusterId ?? ''
          ],
        recipesById: precalculation.recipes,
      };
    },
  });
}
