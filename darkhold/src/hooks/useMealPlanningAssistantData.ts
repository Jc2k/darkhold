import { queryOptions } from '@tanstack/react-query';
import { apiGet } from '../api/client';
import type { Keyword, MealPlan, PaginatedResponse, Recipe } from '../api/tandoor-types';
import { fetchUpSoonData } from './useUpSoon';
import { formatDate } from '../utils/dateUtils';

export interface MealPlanningAssistantData {
  recipes: Recipe[];
  keywordNameById: Record<number, string>;
  historicalMeals: MealPlan[];
  upSoonRecipeIds: number[];
  recentAddedRecipeIds: number[];
}

async function fetchAllPages<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined | null>,
): Promise<T[]> {
  const all: T[] = [];
  let page = 1;
  let hasNext = true;

  while (hasNext) {
    const data = await apiGet<PaginatedResponse<T>>(path, {
      ...params,
      page_size: 100,
      page,
    });
    all.push(...data.results);
    hasNext = !!data.next;
    page += 1;
  }

  return all;
}

async function fetchKeywordNameById(): Promise<Record<number, string>> {
  const keywords = await fetchAllPages<Keyword>('/keyword/');
  return keywords.reduce<Record<number, string>>((acc, keyword) => {
    acc[keyword.id] = keyword.name;
    return acc;
  }, {});
}

export async function fetchMealPlanningAssistantData(
  weekStart: Date,
  weekEnd: Date,
): Promise<MealPlanningAssistantData> {
  const historyStart = new Date(weekStart);
  historyStart.setDate(historyStart.getDate() - 365);

  const historyEnd = new Date(weekEnd);
  historyEnd.setDate(historyEnd.getDate() + 14);

  const [recipes, keywordNameById, historicalMeals, upSoonData, recentRecipes] = await Promise.all([
    fetchAllPages<Recipe>('/recipe/'),
    fetchKeywordNameById(),
    fetchAllPages<MealPlan>('/meal-plan/', {
      from_date: formatDate(historyStart),
      to_date: formatDate(historyEnd),
    }),
    fetchUpSoonData(),
    fetchAllPages<Recipe>('/recipe/', { new: true, sort_order: '-id' }),
  ]);

  return {
    recipes,
    keywordNameById,
    historicalMeals,
    upSoonRecipeIds: upSoonData?.entries.map((entry) => entry.recipeId) ?? [],
    recentAddedRecipeIds: recentRecipes.map((recipe) => recipe.id),
  };
}

export function getMealPlanningAssistantDataQueryOptions(weekStart: Date, weekEnd: Date) {
  return queryOptions({
    queryKey: ['meal-plan-assistant', formatDate(weekStart), formatDate(weekEnd)],
    queryFn: () => fetchMealPlanningAssistantData(weekStart, weekEnd),
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60,
  });
}
