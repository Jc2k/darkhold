import type { FoodProperty, MealPlan, Recipe, RecipeIngredient } from '../api/tandoor-types.d.ts';

export const MEAL_ASSISTANT_PRECALCULATION_SCHEMA_VERSION = 2;

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

export interface MealAssistantRecipeSummary {
  id: number;
  name: string;
  image?: string | null;
  servings?: number;
  rating?: number | null;
  createdAt?: string;
}

export interface MealAssistantRecipeFeatures {
  keywords: string[];
  produce: string[];
  stepCount: number;
  ingredientLineCount: number;
  distinctFoodCount: number;
  complexityScore: number;
  nutritionScore?: number;
}

export interface MealAssistantRecipeHistory {
  dates: number[];
  dayCounts: [number, number, number, number, number, number, number];
  seasonCounts: [number, number, number, number];
  totalPlanCount: number;
  lastPlannedDate?: number;
}

export interface MealAssistantRelationships {
  keywords: Record<string, number[]>;
  produce: Record<string, number[]>;
  flags: Record<string, number[]>;
}

export interface MealAssistantPrecalculation {
  schemaVersion: typeof MEAL_ASSISTANT_PRECALCULATION_SCHEMA_VERSION;
  generatedAt: string;
  keywordNameById: Record<number, string>;
  recipes: Record<string, MealAssistantRecipeSummary>;
  recipeFeatures: Record<string, MealAssistantRecipeFeatures>;
  relationships: MealAssistantRelationships;
  recipeHistory: Record<string, MealAssistantRecipeHistory>;
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
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SEASON_INDEX: Record<MealAssistantSeason, number> = {
  winter: 0,
  spring: 1,
  summer: 2,
  autumn: 3,
};

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

function dateStringToDayNumber(value: string): number | null {
  const datePart = value.includes('T') ? value.split('T')[0] : value;
  const parts = datePart.split('-').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) return null;
  return Math.floor(Date.UTC(parts[0], parts[1] - 1, parts[2]) / MS_PER_DAY);
}

export function mealAssistantDayNumberToDate(dayNumber: number): string {
  return new Date(dayNumber * MS_PER_DAY).toISOString().slice(0, 10);
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

function createEmptyHistory(): MealAssistantRecipeHistory {
  return {
    dates: [],
    dayCounts: [0, 0, 0, 0, 0, 0, 0],
    seasonCounts: [0, 0, 0, 0],
    totalPlanCount: 0,
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

function compactSortedValues(values: Iterable<string>): string[] {
  return [...new Set([...values].map(normalizedText).filter(Boolean))].sort();
}

function recipeKeywordNames(recipe: Recipe, keywordNameById: Record<number, string>): string[] {
  if (!Array.isArray(recipe.keywords)) return [];
  return recipe.keywords.flatMap((keyword) => {
    if (typeof keyword === 'object' && keyword !== null && !Array.isArray(keyword)) {
      if (typeof keyword.name === 'string') return [keyword.name];
      return typeof keyword.id === 'number' && keywordNameById[keyword.id]
        ? [keywordNameById[keyword.id]]
        : [];
    }
    return keywordNameById[keyword as number] ? [keywordNameById[keyword as number]] : [];
  });
}

function recipeHasProduce(
  recipe: Recipe,
  produceName: string,
  keywordNameById: Record<number, string>,
): boolean {
  const needle = normalizedText(produceName);
  if (!needle) return false;
  if (normalizedText(recipe.name).includes(needle)) return true;
  const keywordNames = recipeKeywordNames(recipe, keywordNameById);
  return keywordNames.some((keyword) => normalizedText(keyword).includes(needle));
}

function ingredientFoodId(ingredient: RecipeIngredient): number | null {
  if (typeof ingredient.food === 'number') return ingredient.food;
  return ingredient.food?.id ?? null;
}

function recipeIngredientStats(recipe: Recipe): {
  stepCount: number;
  ingredientLineCount: number;
  distinctFoodCount: number;
} {
  const steps = recipe.steps ?? [];
  const ingredients = steps.flatMap((step) => step.ingredients ?? []);
  const ingredientLineCount = ingredients.filter((ingredient) => !ingredient.is_header).length;
  const distinctFoodIds = new Set(
    ingredients
      .filter((ingredient) => !ingredient.is_header)
      .map(ingredientFoodId)
      .filter((id): id is number => id != null),
  );
  return {
    stepCount: steps.length,
    ingredientLineCount,
    distinctFoodCount: distinctFoodIds.size,
  };
}

function complexityScore(stats: {
  stepCount: number;
  ingredientLineCount: number;
  distinctFoodCount: number;
}): number {
  return stats.stepCount * 3 + stats.ingredientLineCount * 2 + stats.distinctFoodCount;
}

function addRelationship(
  relationships: Record<string, number[]>,
  key: string,
  recipeId: number,
): void {
  const normalized = normalizedText(key);
  if (!normalized) return;
  relationships[normalized] = relationships[normalized] ?? [];
  relationships[normalized].push(recipeId);
}

function sortRelationshipIds(relationships: Record<string, number[]>): void {
  for (const recipeIds of Object.values(relationships)) {
    recipeIds.sort((a, b) => a - b);
  }
}

export function buildMealAssistantPrecalculation(input: {
  recipes: Recipe[];
  keywordNameById: Record<number, string>;
  mealPlans: MealPlan[];
  produceFoodNames?: readonly string[];
  generatedAt?: string;
}): MealAssistantPrecalculation {
  const produceFoodNames = compactSortedValues(input.produceFoodNames ?? []);
  const mealHistory = buildMealHistory(input.mealPlans).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const recipes: Record<string, MealAssistantRecipeSummary> = {};
  const recipeFeatures: Record<string, MealAssistantRecipeFeatures> = {};
  const recipeHistory: Record<string, MealAssistantRecipeHistory> = {};
  const recipeInsights: Record<string, MealAssistantRecipeInsight> = {};
  const relationships: MealAssistantRelationships = {
    keywords: {},
    produce: Object.fromEntries(produceFoodNames.map((name) => [name, [] as number[]])),
    flags: {},
  };

  for (const recipe of input.recipes) {
    const summary: MealAssistantRecipeSummary = {
      id: recipe.id,
      name: recipe.name,
      ...(recipe.image === undefined ? {} : { image: recipe.image }),
      ...(recipe.servings === undefined ? {} : { servings: recipe.servings }),
      ...(recipe.rating === undefined ? {} : { rating: recipe.rating }),
      ...(recipe.created_at === undefined ? {} : { createdAt: recipe.created_at }),
    };
    recipes[String(recipe.id)] = summary;
    recipeInsights[String(recipe.id)] = createEmptyInsight();
    recipeHistory[String(recipe.id)] = createEmptyHistory();

    for (const keyword of compactSortedValues(recipeKeywordNames(recipe, input.keywordNameById))) {
      addRelationship(relationships.keywords, keyword, recipe.id);
    }
  }

  for (const entry of mealHistory) {
    const insight = recipeInsights[String(entry.recipeId)] ?? createEmptyInsight();
    insight.totalCookCount += 1;
    if (entry.weekend) insight.weekendCookCount += 1;
    else insight.weekdayCookCount += 1;
    recipeInsights[String(entry.recipeId)] = insight;

    const history = recipeHistory[String(entry.recipeId)] ?? createEmptyHistory();
    const dayNumber = dateStringToDayNumber(entry.date);
    if (dayNumber != null) {
      history.dates.push(dayNumber);
      history.lastPlannedDate = Math.max(history.lastPlannedDate ?? dayNumber, dayNumber);
    }
    history.dayCounts[entry.day] += 1;
    history.seasonCounts[SEASON_INDEX[entry.season]] += 1;
    history.totalPlanCount += 1;
    recipeHistory[String(entry.recipeId)] = history;
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

  for (const recipe of input.recipes) {
    const keywordNames = compactSortedValues(recipeKeywordNames(recipe, input.keywordNameById));
    const produce = produceFoodNames.filter((name) =>
      recipeHasProduce(recipe, name, input.keywordNameById),
    );
    const stats = recipeIngredientStats(recipe);
    const nutrition = getNutritionSignal(recipe);

    recipeInsights[String(recipe.id)].produce = produce;
    if (nutrition) recipeInsights[String(recipe.id)].nutrition = nutrition;
    for (const name of produce) addRelationship(relationships.produce, name, recipe.id);

    recipeFeatures[String(recipe.id)] = {
      keywords: keywordNames,
      produce,
      stepCount: stats.stepCount,
      ingredientLineCount: stats.ingredientLineCount,
      distinctFoodCount: stats.distinctFoodCount,
      complexityScore: complexityScore(stats),
      ...(nutrition ? { nutritionScore: nutrition.score } : {}),
    };

    if (recipe.image) addRelationship(relationships.flags, 'has-image', recipe.id);
    if (recipe.rating != null && recipe.rating <= 1) {
      addRelationship(relationships.flags, 'low-rated', recipe.id);
    }
  }

  sortRelationshipIds(relationships.keywords);
  sortRelationshipIds(relationships.produce);
  sortRelationshipIds(relationships.flags);
  for (const history of Object.values(recipeHistory)) {
    history.dates.sort((a, b) => a - b);
  }

  return {
    schemaVersion: MEAL_ASSISTANT_PRECALCULATION_SCHEMA_VERSION,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    keywordNameById: input.keywordNameById,
    recipes,
    recipeFeatures,
    relationships,
    recipeHistory,
    recipeInsights,
  };
}

export function mealAssistantPrecalculationRecipeToRecipe(
  summary: MealAssistantRecipeSummary,
  precalculation: MealAssistantPrecalculation,
): Recipe {
  const features = precalculation.recipeFeatures[String(summary.id)];
  return {
    id: summary.id,
    name: summary.name,
    created_by: 0,
    image: summary.image,
    servings: summary.servings,
    rating: summary.rating,
    created_at: summary.createdAt,
    keywords: (features?.keywords ?? []).map((name, index) => ({ id: index + 1, name })),
  };
}

export function mealAssistantPrecalculationRecipes(
  precalculation: MealAssistantPrecalculation | undefined,
): Recipe[] {
  if (!precalculation) return [];
  return Object.values(precalculation.recipes).map((summary) =>
    mealAssistantPrecalculationRecipeToRecipe(summary, precalculation),
  );
}

export function mealAssistantPrecalculationMealPlans(
  precalculation: MealAssistantPrecalculation,
): MealPlan[] {
  let id = 1;
  return Object.entries(precalculation.recipeHistory).flatMap(([recipeId, history]) =>
    history.dates.map((dayNumber) => ({
      id: id++,
      recipe: Number.parseInt(recipeId, 10),
      meal_type: 0,
      from_date: mealAssistantDayNumberToDate(dayNumber),
    })),
  );
}

export function isMealAssistantPrecalculation(
  value: unknown,
): value is MealAssistantPrecalculation {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Partial<MealAssistantPrecalculation>;
  return (
    record.schemaVersion === MEAL_ASSISTANT_PRECALCULATION_SCHEMA_VERSION &&
    typeof record.keywordNameById === 'object' &&
    record.keywordNameById !== null &&
    typeof record.recipes === 'object' &&
    record.recipes !== null &&
    typeof record.recipeFeatures === 'object' &&
    record.recipeFeatures !== null &&
    typeof record.relationships === 'object' &&
    record.relationships !== null &&
    typeof record.recipeHistory === 'object' &&
    record.recipeHistory !== null &&
    typeof record.recipeInsights === 'object' &&
    record.recipeInsights !== null
  );
}
