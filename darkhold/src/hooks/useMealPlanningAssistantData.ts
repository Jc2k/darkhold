import { queryOptions } from '@tanstack/react-query';
import { apiGet } from '../api/client';
import type { Keyword, MealPlan, PaginatedResponse, Recipe } from '../api/tandoor-types';
import { fetchUpSoonData } from './useUpSoon';
import { formatDate } from '../utils/dateUtils';
import {
  isMealAssistantPrecalculation,
  mealAssistantPrecalculationMealPlans,
  mealAssistantPrecalculationRecipes,
  type MealAssistantPrecalculation,
} from '../utils/mealAssistantPrecalculation';

const MEAL_PLANNING_ASSISTANT_STALE_TIME_MS = 1000 * 60 * 30;
const MEAL_PLANNING_ASSISTANT_GC_TIME_MS = 1000 * 60 * 60;

export interface MealPlanningAssistantData {
  recipes: Recipe[];
  keywordNameById: Record<number, string>;
  historicalMeals: MealPlan[];
  upSoonRecipeIds: number[];
  produceFoodNames: string[];
  precalculation?: MealAssistantPrecalculation;
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

async function fetchMealAssistantPrecalculation(): Promise<MealAssistantPrecalculation | null> {
  const res = await fetch('/meal-assistant-precalculation.json', {
    headers: { Accept: 'application/json' },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Precalculation fetch failed ${res.status}`);
  const payload: unknown = await res.json();
  return isMealAssistantPrecalculation(payload) ? payload : null;
}

async function fetchKeywordNameById(): Promise<Record<number, string>> {
  const keywords = await fetchAllPages<Keyword>('/keyword/');
  return keywords.reduce<Record<number, string>>((acc, keyword) => {
    acc[keyword.id] = keyword.name;
    return acc;
  }, {});
}

export async function fetchMealPlanningAssistantData(
  _weekStart: Date,
  _weekEnd: Date,
  _produceCategoryName?: string,
): Promise<MealPlanningAssistantData> {
  const [precalculation, upSoonData] = await Promise.all([
    fetchMealAssistantPrecalculation().catch(() => null),
    fetchUpSoonData(),
  ]);

  if (precalculation) {
    return {
      recipes: mealAssistantPrecalculationRecipes(precalculation),
      keywordNameById: precalculation.keywordNameById,
      historicalMeals: mealAssistantPrecalculationMealPlans(precalculation),
      upSoonRecipeIds: upSoonData?.entries.map((entry) => entry.recipeId) ?? [],
      produceFoodNames: Object.keys(precalculation.relationships.produce),
      precalculation,
    };
  }

  const [recipes, keywordNameById] = await Promise.all([
    fetchAllPages<Recipe>('/recipe/'),
    fetchKeywordNameById(),
  ]);

  return {
    recipes,
    keywordNameById,
    historicalMeals: [],
    upSoonRecipeIds: upSoonData?.entries.map((entry) => entry.recipeId) ?? [],
    produceFoodNames: [],
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
