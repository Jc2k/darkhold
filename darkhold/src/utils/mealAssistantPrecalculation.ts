import type { FoodProperty, MealPlan, Recipe } from '../api/tandoor-types.d.ts';

export const MEAL_ASSISTANT_PRECALCULATION_SCHEMA_VERSION = 1;

export type MealAssistantSeason = 'winter' | 'spring' | 'summer' | 'autumn';

export interface MealAssistantMealHistoryEntry {
  recipeId: number;
  date: string;
  day: number;
  weekend: boolean;
  season: MealAssistantSeason;
}

export interface MealAssistantTrend {
  score: number;
  count: number;
  total: number;
  share: number;
}

export interface MealAssistantNutritionSignal {
  proteinG?: number;
  caloriesKcal?: number;
  score: number;
}

export interface MealAssistantRecipeInsight {
  totalCookCount: number;
  weekdayCookCount: number;
  weekendCookCount: number;
  weekend?: MealAssistantTrend;
  weekday?: MealAssistantTrend;
  days: Partial<Record<string, MealAssistantTrend>>;
  seasons: Partial<Record<MealAssistantSeason, MealAssistantTrend>>;
  produce: string[];
  nutrition?: MealAssistantNutritionSignal;
}

export interface MealAssistantPrecalculation {
  schemaVersion: typeof MEAL_ASSISTANT_PRECALCULATION_SCHEMA_VERSION;
  generatedAt: string;
  recipes: Recipe[];
  keywordNameById: Record<number, string>;
  produceFoodNames: string[];
  produceRecipeIds: Record<string, number[]>;
  mealHistory: MealAssistantMealHistoryEntry[];
  recipeInsights: Record<string, MealAssistantRecipeInsight>;
}

const MIN_DOMINANT_DAY_TOTAL = 3;
const MIN_DOMINANT_DAY_COUNT = 2;
const MIN_DOMINANT_DAY_SHARE = 0.4;
const MIN_WEEKEND_TOTAL = 4;
const MIN_WEEKEND_SHARE = 0.65;
const MIN_SEASON_TOTAL = 3;
const MIN_SEASON_COUNT = 2;
const MIN_SEASON_SHARE = 0.45;
const LOW_PROTEIN_THRESHOLD_G = 8;
const HIGH_PROTEIN_THRESHOLD_G = 12;
const HIGH_CALORIE_THRESHOLD_KCAL = 600;

export function getMealAssistantSeason(date: Date): MealAssistantSeason {
  const month = date.getMonth() + 1;
  if (month === 12 || month <= 2) return 'winter';
  if (month <= 5) return 'spring';
  if (month <= 8) return 'summer';
  return 'autumn';
}

function recipeIdOf(entry: MealPlan): number | null {
  if (typeof entry.recipe === 'number') return entry.recipe;
  return entry.recipe?.id ?? null;
}

function parseMealDate(value: string): Date | null {
  const datePart = value.includes('T') ? value.split('T')[0] : value;
  const parsed = new Date(`${datePart}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function roundShare(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function trend(count: number, total: number, maxScore: number): MealAssistantTrend {
  const share = total > 0 ? count / total : 0;
  return {
    count,
    total,
    share: roundShare(share),
    score: Math.max(1, Math.round(maxScore * share)),
  };
}

function buildMealHistory(entries: MealPlan[]): MealAssistantMealHistoryEntry[] {
  return entries.flatMap((entry): MealAssistantMealHistoryEntry[] => {
    const recipeId = recipeIdOf(entry);
    const mealDate = parseMealDate(entry.from_date);
    if (!recipeId || !mealDate) return [];
    const day = mealDate.getDay();
    return [
      {
        recipeId,
        date: entry.from_date.includes('T') ? entry.from_date.split('T')[0] : entry.from_date,
        day,
        weekend: day === 0 || day === 6,
        season: getMealAssistantSeason(mealDate),
      },
    ];
  });
}

function createEmptyInsight(): MealAssistantRecipeInsight {
  return {
    totalCookCount: 0,
    weekdayCookCount: 0,
    weekendCookCount: 0,
    days: {},
    seasons: {},
    produce: [],
  };
}

function perServingPropertyValue(property: FoodProperty, servings?: number | null): number {
  const per = servings && servings > 0 ? servings : 1;
  return Math.round(property.total_value / per);
}

function getPropertyValue(
  recipe: Recipe,
  pattern: RegExp,
  legacyValue?: number | null,
): number | undefined {
  if (recipe.food_properties && Object.keys(recipe.food_properties).length > 0) {
    const property = Object.values(recipe.food_properties).find((candidate) =>
      pattern.test(candidate.name),
    );
    return property ? perServingPropertyValue(property, recipe.servings) : undefined;
  }
  return legacyValue == null ? undefined : Math.round(legacyValue);
}

function getNutritionSignal(recipe: Recipe): MealAssistantNutritionSignal | undefined {
  const protein = getPropertyValue(recipe, /protein/i, recipe.nutrition?.proteins);
  const calories = getPropertyValue(recipe, /calor|energy/i, recipe.nutrition?.calories);
  const components = [
    protein == null
      ? 0
      : protein < LOW_PROTEIN_THRESHOLD_G
        ? -8
        : protein > HIGH_PROTEIN_THRESHOLD_G
          ? 8
          : 0,
    calories == null ? 0 : calories > HIGH_CALORIE_THRESHOLD_KCAL ? -10 : 0,
  ];
  const score = components.reduce((total, value) => total + value, 0);
  if (protein == null && calories == null) return undefined;
  return {
    ...(protein == null ? {} : { proteinG: protein }),
    ...(calories == null ? {} : { caloriesKcal: calories }),
    score,
  };
}

function normalizedText(value: string): string {
  return value.trim().toLowerCase();
}

function recipeHasProduce(
  recipe: Recipe,
  produceName: string,
  keywordNameById: Record<number, string>,
): boolean {
  const needle = normalizedText(produceName);
  if (!needle) return false;
  if (normalizedText(recipe.name).includes(needle)) return true;
  const keywordNames = Array.isArray(recipe.keywords)
    ? recipe.keywords.flatMap((keyword) => {
        if (typeof keyword === 'object' && keyword !== null && !Array.isArray(keyword)) {
          if (typeof keyword.name === 'string') return [keyword.name];
          return typeof keyword.id === 'number' && keywordNameById[keyword.id]
            ? [keywordNameById[keyword.id]]
            : [];
        }
        return keywordNameById[keyword as number] ? [keywordNameById[keyword as number]] : [];
      })
    : [];
  return keywordNames.some((keyword) => normalizedText(keyword).includes(needle));
}

export function buildMealAssistantPrecalculation(input: {
  recipes: Recipe[];
  keywordNameById: Record<number, string>;
  mealPlans: MealPlan[];
  produceFoodNames?: readonly string[];
  generatedAt?: string;
}): MealAssistantPrecalculation {
  const produceFoodNames = [
    ...new Set((input.produceFoodNames ?? []).map(normalizedText).filter(Boolean)),
  ].sort();
  const mealHistory = buildMealHistory(input.mealPlans).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const recipeInsights: Record<string, MealAssistantRecipeInsight> = {};

  for (const recipe of input.recipes) {
    recipeInsights[String(recipe.id)] = createEmptyInsight();
  }

  for (const entry of mealHistory) {
    const insight = recipeInsights[String(entry.recipeId)] ?? createEmptyInsight();
    insight.totalCookCount += 1;
    if (entry.weekend) insight.weekendCookCount += 1;
    else insight.weekdayCookCount += 1;
    recipeInsights[String(entry.recipeId)] = insight;
  }

  for (const [recipeId, insight] of Object.entries(recipeInsights)) {
    const history = mealHistory.filter((entry) => String(entry.recipeId) === recipeId);
    const dayCounts = new Map<number, number>();
    const seasonCounts = new Map<MealAssistantSeason, number>();
    for (const entry of history) {
      dayCounts.set(entry.day, (dayCounts.get(entry.day) ?? 0) + 1);
      seasonCounts.set(entry.season, (seasonCounts.get(entry.season) ?? 0) + 1);
    }

    for (const [day, count] of dayCounts) {
      const share = insight.totalCookCount > 0 ? count / insight.totalCookCount : 0;
      if (
        insight.totalCookCount >= MIN_DOMINANT_DAY_TOTAL &&
        count >= MIN_DOMINANT_DAY_COUNT &&
        share >= MIN_DOMINANT_DAY_SHARE
      ) {
        insight.days[String(day)] = trend(count, insight.totalCookCount, 12);
      }
    }

    if (insight.totalCookCount >= MIN_WEEKEND_TOTAL) {
      const weekendShare = insight.weekendCookCount / insight.totalCookCount;
      const weekdayShare = insight.weekdayCookCount / insight.totalCookCount;
      if (weekendShare >= MIN_WEEKEND_SHARE) {
        insight.weekend = trend(insight.weekendCookCount, insight.totalCookCount, 8);
      } else if (weekdayShare >= MIN_WEEKEND_SHARE) {
        insight.weekday = trend(insight.weekdayCookCount, insight.totalCookCount, 8);
      }
    }

    for (const [season, count] of seasonCounts) {
      const share = insight.totalCookCount > 0 ? count / insight.totalCookCount : 0;
      if (
        insight.totalCookCount >= MIN_SEASON_TOTAL &&
        count >= MIN_SEASON_COUNT &&
        share >= MIN_SEASON_SHARE
      ) {
        insight.seasons[season] = trend(count, insight.totalCookCount, 8);
      }
    }
  }

  const produceRecipeIds = Object.fromEntries(
    produceFoodNames.map((name) => [name, [] as number[]]),
  );
  for (const recipe of input.recipes) {
    const produce = produceFoodNames.filter((name) =>
      recipeHasProduce(recipe, name, input.keywordNameById),
    );
    recipeInsights[String(recipe.id)].produce = produce;
    for (const name of produce) produceRecipeIds[name].push(recipe.id);

    const nutrition = getNutritionSignal(recipe);
    if (nutrition) recipeInsights[String(recipe.id)].nutrition = nutrition;
  }

  for (const recipeIds of Object.values(produceRecipeIds)) {
    recipeIds.sort((a, b) => a - b);
  }

  return {
    schemaVersion: MEAL_ASSISTANT_PRECALCULATION_SCHEMA_VERSION,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    recipes: input.recipes,
    keywordNameById: input.keywordNameById,
    produceFoodNames,
    produceRecipeIds,
    mealHistory,
    recipeInsights,
  };
}

export function isMealAssistantPrecalculation(
  value: unknown,
): value is MealAssistantPrecalculation {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Partial<MealAssistantPrecalculation>;
  return (
    record.schemaVersion === MEAL_ASSISTANT_PRECALCULATION_SCHEMA_VERSION &&
    Array.isArray(record.recipes) &&
    typeof record.keywordNameById === 'object' &&
    record.keywordNameById !== null &&
    Array.isArray(record.produceFoodNames) &&
    typeof record.produceRecipeIds === 'object' &&
    record.produceRecipeIds !== null &&
    Array.isArray(record.mealHistory) &&
    typeof record.recipeInsights === 'object' &&
    record.recipeInsights !== null
  );
}
