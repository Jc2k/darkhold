import { apiDelete, apiGet, apiPost } from './client';
import type { CookLog, Food, MealPlan, MealType, PaginatedResponse, Recipe } from './tandoor-types';
import type { ShoppingListEntry } from '../hooks/useShoppingListEntries';
import { buildCookLogTimestamp } from '../hooks/useCookLog';

const PAGE_SIZE = 100;
const HISTORIC_CUTOFF_DAYS = 7;

export interface ScanProgress {
  completed: number;
  total: number;
  label: string;
}

export interface UserSpace {
  user: { is_superuser?: boolean };
}

export interface OrphanedIngredientScan {
  foods: Food[];
  limitation: string;
}

export interface HistoricCookLogCandidate {
  mealPlanId: number;
  recipeId: number;
  recipeName: string;
  recipeImage?: string | null;
  mealPlanDate: string;
  mealType?: MealType | null;
}

export interface RecipeCreationDateCandidate {
  recipeId: number;
  recipeName: string;
  recipeImage?: string | null;
  currentCreatedAt: string;
  proposedCreatedAt: string;
}

async function fetchAllPages<T>(
  path: string,
  params: Record<string, string | number> = {},
  onProgress?: (progress: ScanProgress) => void,
  label = 'Collecting records',
): Promise<T[]> {
  const all: T[] = [];
  let page = 1;
  let total = 0;

  do {
    const data = await apiGet<PaginatedResponse<T>>(path, {
      ...params,
      page_size: PAGE_SIZE,
      page,
    });
    total = data.count;
    all.push(...data.results);
    onProgress?.({ completed: Math.min(all.length, total), total, label });
    page += 1;
    if (!data.next) break;
  } while (true);

  return all;
}

function recipeId(value: Recipe | number): number {
  return typeof value === 'object' ? value.id : value;
}

function foodId(value: Food | number | null | undefined): number | undefined {
  if (value == null) return undefined;
  return typeof value === 'object' ? value.id : value;
}

function dateOnly(value: string): string {
  return value.split('T')[0];
}

function cutoffDate(now = new Date()): string {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - HISTORIC_CUTOFF_DAYS);
  return cutoff.toISOString().split('T')[0];
}

export async function fetchIsSuperuser(): Promise<boolean> {
  const spaces = await apiGet<UserSpace[]>('/user-space/all_personal/');
  return spaces[0]?.user.is_superuser === true;
}

export async function scanOrphanedIngredients(
  onProgress?: (progress: ScanProgress) => void,
): Promise<OrphanedIngredientScan> {
  const foods = await fetchAllPages<Food>('/food/', {}, onProgress, 'Collecting ingredients');
  const shoppingEntries = await fetchAllPages<ShoppingListEntry>(
    '/shopping-list-entry/',
    {},
    onProgress,
    'Collecting active and recent shopping-list entries',
  );
  const usedFoodIds = new Set<number>();

  for (const entry of shoppingEntries) {
    const id = foodId(entry.food);
    if (id !== undefined) usedFoodIds.add(id);
  }

  const recipes = await fetchAllPages<Recipe>('/recipe/', {}, onProgress, 'Collecting recipes');
  for (let index = 0; index < recipes.length; index += 1) {
    const recipe = await apiGet<Recipe>(`/recipe/${recipes[index].id}/`);
    for (const step of recipe.steps ?? []) {
      for (const ingredient of step.ingredients ?? []) {
        const id = foodId(ingredient.food);
        if (id !== undefined) usedFoodIds.add(id);
      }
    }
    onProgress?.({
      completed: index + 1,
      total: recipes.length,
      label: 'Inspecting recipe ingredients',
    });
  }

  return {
    foods: foods
      .filter((food) => !usedFoodIds.has(food.id))
      .sort((a, b) => a.name.localeCompare(b.name)),
    limitation:
      'Tandoor exposes active and recently completed shopping-list entries only. Older completed entries are not available through its REST API; deletion remains protected by the server if an older relation must be retained.',
  };
}

export async function deleteFoods(
  ids: number[],
  onProgress?: (progress: ScanProgress) => void,
): Promise<void> {
  for (let index = 0; index < ids.length; index += 1) {
    await apiDelete(`/food/${ids[index]}/`);
    onProgress?.({ completed: index + 1, total: ids.length, label: 'Deleting ingredients' });
  }
}

export async function scanHistoricCookLogs(
  onProgress?: (progress: ScanProgress) => void,
  now = new Date(),
): Promise<HistoricCookLogCandidate[]> {
  const cutoff = cutoffDate(now);
  const [mealPlans, cookLogs] = await Promise.all([
    fetchAllPages<MealPlan>(
      '/meal-plan/',
      { from_date: '1900-01-01', to_date: cutoff },
      onProgress,
      'Collecting historic meal plans',
    ),
    fetchAllPages<CookLog>('/cook-log/', {}, onProgress, 'Collecting cook logs'),
  ]);
  const existing = new Set(
    cookLogs.map((log) => `${dateOnly(log.created_at)}:${recipeId(log.recipe)}`),
  );

  return mealPlans
    .filter((mealPlan) => {
      const key = `${dateOnly(mealPlan.from_date)}:${recipeId(mealPlan.recipe)}`;
      if (existing.has(key)) return false;
      existing.add(key);
      return true;
    })
    .map((mealPlan) => {
      const recipe = typeof mealPlan.recipe === 'object' ? mealPlan.recipe : undefined;
      return {
        mealPlanId: mealPlan.id,
        recipeId: recipeId(mealPlan.recipe),
        recipeName: recipe?.name ?? `Recipe #${recipeId(mealPlan.recipe)}`,
        recipeImage: recipe?.image,
        mealPlanDate: dateOnly(mealPlan.from_date),
        mealType: typeof mealPlan.meal_type === 'object' ? mealPlan.meal_type : undefined,
      };
    })
    .sort((a, b) => a.mealPlanDate.localeCompare(b.mealPlanDate));
}

export async function createHistoricCookLogs(
  candidates: HistoricCookLogCandidate[],
  onProgress?: (progress: ScanProgress) => void,
): Promise<void> {
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    await apiPost<CookLog>('/cook-log/', {
      recipe: candidate.recipeId,
      rating: 3,
      comment: null,
      created_at: buildCookLogTimestamp(candidate.mealPlanDate, candidate.mealType),
    });
    onProgress?.({ completed: index + 1, total: candidates.length, label: 'Creating cook logs' });
  }
}

export async function scanRecipeCreationDates(
  onProgress?: (progress: ScanProgress) => void,
): Promise<RecipeCreationDateCandidate[]> {
  const [recipes, cookLogs] = await Promise.all([
    fetchAllPages<Recipe>('/recipe/', {}, onProgress, 'Collecting recipes'),
    fetchAllPages<CookLog>('/cook-log/', {}, onProgress, 'Collecting cook logs'),
  ]);
  const earliestByRecipe = new Map<number, string>();
  for (const log of cookLogs) {
    const id = recipeId(log.recipe);
    const previous = earliestByRecipe.get(id);
    if (!previous || log.created_at < previous) earliestByRecipe.set(id, log.created_at);
  }

  return recipes
    .flatMap((recipe): RecipeCreationDateCandidate[] => {
      const earliest = earliestByRecipe.get(recipe.id);
      if (!earliest || !recipe.created_at || earliest >= recipe.created_at) return [];
      return [
        {
          recipeId: recipe.id,
          recipeName: recipe.name,
          recipeImage: recipe.image,
          currentCreatedAt: recipe.created_at,
          proposedCreatedAt: earliest,
        },
      ];
    })
    .sort((a, b) => a.proposedCreatedAt.localeCompare(b.proposedCreatedAt));
}
