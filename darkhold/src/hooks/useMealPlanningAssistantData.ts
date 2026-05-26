import { queryOptions } from '@tanstack/react-query';
import { apiGet } from '../api/client';
import type {
  Food,
  Keyword,
  MealPlan,
  PaginatedResponse,
  Recipe,
  SupermarketCategory,
} from '../api/tandoor-types';
import { fetchUpSoonData } from './useUpSoon';
import { formatDate } from '../utils/dateUtils';

const HISTORY_LOOKBACK_DAYS = 365;
const HISTORY_LOOKAHEAD_DAYS = 14;
const MEAL_PLANNING_ASSISTANT_STALE_TIME_MS = 1000 * 60 * 30;
const MEAL_PLANNING_ASSISTANT_GC_TIME_MS = 1000 * 60 * 60;

export interface MealPlanningAssistantData {
  recipes: Recipe[];
  keywordNameById: Record<number, string>;
  historicalMeals: MealPlan[];
  upSoonRecipeIds: number[];
  recentAddedRecipeIds: number[];
  produceFoodNames: string[];
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

export async function fetchProduceFoodNames(categoryName: string): Promise<string[]> {
  const normalizedCategoryName = categoryName.trim().toLowerCase();
  if (!normalizedCategoryName) return [];

  const categories = await fetchAllPages<SupermarketCategory>('/supermarket-category/');
  const category = categories.find(
    (cat) => cat.name.trim().toLowerCase() === normalizedCategoryName,
  );
  if (!category) return [];

  const foods = await fetchAllPages<Food>('/food/', { supermarket_category: category.id });
  return foods.map((food) => food.name.trim().toLowerCase()).filter(Boolean);
}

export async function fetchMealPlanningAssistantData(
  weekStart: Date,
  weekEnd: Date,
  produceCategoryName?: string,
): Promise<MealPlanningAssistantData> {
  const historyStart = new Date(weekStart);
  historyStart.setDate(historyStart.getDate() - HISTORY_LOOKBACK_DAYS);

  const historyEnd = new Date(weekEnd);
  historyEnd.setDate(historyEnd.getDate() + HISTORY_LOOKAHEAD_DAYS);

  const [recipes, keywordNameById, historicalMeals, upSoonData, recentRecipes, produceFoodNames] =
    await Promise.all([
      fetchAllPages<Recipe>('/recipe/'),
      fetchKeywordNameById(),
      fetchAllPages<MealPlan>('/meal-plan/', {
        from_date: formatDate(historyStart),
        to_date: formatDate(historyEnd),
      }),
      fetchUpSoonData(),
      fetchAllPages<Recipe>('/recipe/', { new: true, sort_order: '-id' }),
      produceCategoryName ? fetchProduceFoodNames(produceCategoryName) : Promise.resolve([]),
    ]);

  return {
    recipes,
    keywordNameById,
    historicalMeals,
    upSoonRecipeIds: upSoonData?.entries.map((entry) => entry.recipeId) ?? [],
    recentAddedRecipeIds: recentRecipes.map((recipe) => recipe.id),
    produceFoodNames,
  };
}

export function getMealPlanningAssistantDataQueryOptions(
  weekStart: Date,
  weekEnd: Date,
  produceCategoryName?: string,
) {
  return queryOptions({
    queryKey: [
      'meal-plan-assistant',
      formatDate(weekStart),
      formatDate(weekEnd),
      produceCategoryName ?? '',
    ],
    queryFn: () => fetchMealPlanningAssistantData(weekStart, weekEnd, produceCategoryName),
    staleTime: MEAL_PLANNING_ASSISTANT_STALE_TIME_MS,
    gcTime: MEAL_PLANNING_ASSISTANT_GC_TIME_MS,
  });
}
