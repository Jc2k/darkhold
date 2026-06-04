import type {
  Food,
  FoodProperty,
  MealPlan,
  Recipe,
  RecipeIngredient,
} from '../api/tandoor-types.d.ts';
import {
  buildRecipeSimilarityIndex,
  type MealAssistantRecipeCluster,
  type MealAssistantRecipeClusterMembership,
  type MealAssistantSimilarRecipe,
} from './recipeSimilarity';

export const MEAL_ASSISTANT_PRECALCULATION_SCHEMA_VERSION = 4;

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

export type MealAssistantComplexityBucket = 'simple' | 'moderate' | 'complex';

export interface MealAssistantNutritionCompleteness {
  source: 'food_properties' | 'legacy';
  complete: boolean;
  propertyCount: number;
  missingPropertyCount: number;
}

export interface MealAssistantRecipeFeatures {
  keywords: string[];
  produce: string[];
  categories?: string[];
  stepCount: number;
  ingredientLineCount: number;
  distinctFoodCount: number;
  complexityScore: number;
  complexityBucket: MealAssistantComplexityBucket;
  ingredientFoodIds: number[];
  ingredientFoodNames: string[];
  cookingTimeMinutes?: number;
  waitingTimeMinutes?: number;
  totalTimeMinutes?: number;
  servings?: number;
  nutritionScore?: number;
  nutritionCompleteness?: MealAssistantNutritionCompleteness;
}

export interface MealAssistantRecipeHistory {
  dates: number[];
  dayCounts: [number, number, number, number, number, number, number];
  seasonCounts: [number, number, number, number];
  totalPlanCount: number;
  firstPlannedDate?: number;
  lastPlannedDate?: number;
  averageDaysBetweenPlans?: number;
  medianDaysBetweenPlans?: number;
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
  recipeSimilarities: Record<string, MealAssistantSimilarRecipe[]>;
  recipeClusters: Record<string, MealAssistantRecipeCluster>;
  recipeClusterMemberships: Record<string, MealAssistantRecipeClusterMembership>;
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

function roundTo(value: number, fractionDigits: number): number {
  const factor = 10 ** fractionDigits;
  return Math.round(value * factor) / factor;
}

function median(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  const sorted = numbers.slice().sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
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

    function recipeCategoryNames(recipe: Recipe): string[] {
      const categories = (recipe as Recipe & { categories?: unknown }).categories;
      if (!Array.isArray(categories)) return [];
      return compactSortedValues(
        categories.flatMap((category) => {
          if (typeof category === 'string') return [category];
          if (typeof category === 'object' && category !== null && 'name' in category) {
            const name = (category as { name?: unknown }).name;
            return typeof name === 'string' ? [name] : [];
          }
          return [];
        }),
      );
    }
    return keywordNameById[keyword as number] ? [keywordNameById[keyword as number]] : [];
  });
}

function ingredientFoodId(ingredient: RecipeIngredient): number | null {
  if (typeof ingredient.food === 'number') return ingredient.food;
  return ingredient.food?.id ?? null;
}

function ingredientFoodName(ingredient: RecipeIngredient): string | null {
  if (typeof ingredient.food === 'object' && ingredient.food !== null) return ingredient.food.name;
  return null;
}

function sortedNumbers(values: Iterable<number>): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

function optionalPositiveNumber(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function recipeTotalTimeMinutes(recipe: Recipe): number | undefined {
  const cookingTime = optionalPositiveNumber(recipe.cooking_time);
  const waitingTime = optionalPositiveNumber(recipe.waiting_time);
  if (cookingTime == null && waitingTime == null) return undefined;
  return (cookingTime ?? 0) + (waitingTime ?? 0);
}

function nutritionCompleteness(recipe: Recipe): MealAssistantNutritionCompleteness | undefined {
  if (recipe.food_properties && Object.keys(recipe.food_properties).length > 0) {
    const properties = Object.values(recipe.food_properties);
    const missingPropertyCount = properties.filter((property) => property.missing_value).length;
    return {
      source: 'food_properties',
      complete: missingPropertyCount === 0,
      propertyCount: properties.length,
      missingPropertyCount,
    };
  }

  if (!recipe.nutrition) return undefined;
  const nutritionValues = [
    recipe.nutrition.calories,
    recipe.nutrition.proteins,
    recipe.nutrition.carbohydrates,
    recipe.nutrition.fats,
    recipe.nutrition.fibres,
  ];
  const propertyCount = nutritionValues.filter((value) => value != null).length;
  if (propertyCount === 0) return undefined;
  return {
    source: 'legacy',
    complete: propertyCount === nutritionValues.length,
    propertyCount,
    missingPropertyCount: nutritionValues.length - propertyCount,
  };
}

function recipeIngredientStats(recipe: Recipe): {
  stepCount: number;
  ingredientLineCount: number;
  distinctFoodCount: number;
  ingredientFoodIds: number[];
  ingredientFoodNames: string[];
} {
  const steps = recipe.steps ?? [];
  const ingredients = steps.flatMap((step) => step.ingredients ?? []);
  const ingredientLines = ingredients.filter((ingredient) => !ingredient.is_header);
  const ingredientFoodIds = sortedNumbers(
    ingredientLines.map(ingredientFoodId).filter((id): id is number => id != null),
  );
  const ingredientFoodNames = compactSortedValues(
    ingredientLines.map(ingredientFoodName).filter((name): name is string => name != null),
  );
  return {
    stepCount: steps.length,
    ingredientLineCount: ingredientLines.length,
    distinctFoodCount: ingredientFoodIds.length,
    ingredientFoodIds,
    ingredientFoodNames,
  };
}

interface MealAssistantProduceFood {
  id?: number;
  name: string;
}

function normalizedProduceFoods(input: {
  produceFoods?: readonly Pick<Food, 'id' | 'name'>[];
  produceFoodNames?: readonly string[];
}): MealAssistantProduceFood[] {
  const byKey = new Map<string, MealAssistantProduceFood>();
  for (const produceFood of input.produceFoods ?? []) {
    const name = normalizedText(produceFood.name);
    if (!name) continue;
    const id = Number.isFinite(produceFood.id) ? produceFood.id : undefined;
    const key = id == null ? `name:${name}` : `id:${id}`;
    byKey.set(key, { ...(id == null ? {} : { id }), name });
  }
  for (const name of input.produceFoodNames ?? []) {
    const normalized = normalizedText(name);
    if (!normalized) continue;
    const key = `name:${normalized}`;
    byKey.set(key, { name: normalized });
  }
  return [...byKey.values()].sort(
    (left, right) => left.name.localeCompare(right.name) || (left.id ?? 0) - (right.id ?? 0),
  );
}

function recipeProduceMatches(
  stats: ReturnType<typeof recipeIngredientStats>,
  produceFoods: readonly MealAssistantProduceFood[],
): string[] {
  const ingredientIds = new Set(stats.ingredientFoodIds);
  const ingredientNames = new Set(stats.ingredientFoodNames);
  return compactSortedValues(
    produceFoods
      .filter((produceFood) =>
        produceFood.id == null
          ? ingredientNames.has(produceFood.name)
          : ingredientIds.has(produceFood.id) || ingredientNames.has(produceFood.name),
      )
      .map((produceFood) => produceFood.name),
  );
}

function complexityScore(stats: {
  stepCount: number;
  ingredientLineCount: number;
  distinctFoodCount: number;
}): number {
  return stats.stepCount * 3 + stats.ingredientLineCount * 2 + stats.distinctFoodCount;
}

function complexityBucket(score: number): MealAssistantComplexityBucket {
  if (score < 10) return 'simple';
  if (score < 20) return 'moderate';
  return 'complex';
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isMealAssistantComplexityBucket(value: unknown): value is MealAssistantComplexityBucket {
  return value === 'simple' || value === 'moderate' || value === 'complex';
}

function isMealAssistantRecipeFeaturesRecord(
  value: unknown,
): value is Record<string, MealAssistantRecipeFeatures> {
  if (!isRecord(value)) return false;
  return Object.values(value).every(
    (features) =>
      isRecord(features) &&
      isMealAssistantComplexityBucket(features.complexityBucket) &&
      (features.categories == null ||
        (Array.isArray(features.categories) &&
          features.categories.every((category) => typeof category === 'string'))) &&
      Array.isArray(features.ingredientFoodIds) &&
      Array.isArray(features.ingredientFoodNames),
  );
}

function isMealAssistantSimilarRecipesRecord(
  value: unknown,
): value is Record<string, MealAssistantSimilarRecipe[]> {
  if (!isRecord(value)) return false;
  return Object.values(value).every(
    (similarities) =>
      Array.isArray(similarities) &&
      similarities.every(
      (similarity) =>
        isRecord(similarity) &&
        typeof similarity.recipeId === 'number' &&
        typeof similarity.score === 'number' &&
        Array.isArray(similarity.sharedTerms) &&
        similarity.sharedTerms.every((term) => typeof term === 'string'),
      ),
  );
}

function isMealAssistantRecipeClustersRecord(
  value: unknown,
): value is Record<string, MealAssistantRecipeCluster> {
  if (!isRecord(value)) return false;
  return Object.values(value).every(
    (cluster) =>
      isRecord(cluster) &&
      typeof cluster.id === 'string' &&
      typeof cluster.label === 'string' &&
      typeof cluster.size === 'number' &&
      Array.isArray(cluster.labelTerms) &&
      cluster.labelTerms.every((term) => typeof term === 'string') &&
      Array.isArray(cluster.recipeIds) &&
      cluster.recipeIds.every((recipeId) => typeof recipeId === 'number'),
  );
}

function isMealAssistantRecipeClusterMembershipsRecord(
  value: unknown,
): value is Record<string, MealAssistantRecipeClusterMembership> {
  if (!isRecord(value)) return false;
  return Object.values(value).every(
    (membership) =>
      isRecord(membership) &&
      typeof membership.clusterId === 'string' &&
      typeof membership.label === 'string' &&
      typeof membership.size === 'number' &&
      Array.isArray(membership.labelTerms) &&
      membership.labelTerms.every((term) => typeof term === 'string'),
  );
}

export function buildMealAssistantPrecalculation(input: {
  recipes: Recipe[];
  keywordNameById: Record<number, string>;
  mealPlans: MealPlan[];
  produceFoods?: readonly Pick<Food, 'id' | 'name'>[];
  produceFoodNames?: readonly string[];
  generatedAt?: string;
}): MealAssistantPrecalculation {
  const produceFoods = normalizedProduceFoods(input);
  const produceFoodNames = compactSortedValues(produceFoods.map((food) => food.name));
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
    const categoryNames = recipeCategoryNames(recipe);
    const stats = recipeIngredientStats(recipe);
    const produce = recipeProduceMatches(stats, produceFoods);
    const nutrition = getNutritionSignal(recipe);
    const complexity = complexityScore(stats);
    const nutritionStatus = nutritionCompleteness(recipe);

    recipeInsights[String(recipe.id)].produce = produce;
    if (nutrition) recipeInsights[String(recipe.id)].nutrition = nutrition;
    for (const name of produce) addRelationship(relationships.produce, name, recipe.id);

    recipeFeatures[String(recipe.id)] = {
      keywords: keywordNames,
      produce,
      ...(categoryNames.length > 0 ? { categories: categoryNames } : {}),
      stepCount: stats.stepCount,
      ingredientLineCount: stats.ingredientLineCount,
      distinctFoodCount: stats.distinctFoodCount,
      complexityScore: complexity,
      complexityBucket: complexityBucket(complexity),
      ingredientFoodIds: stats.ingredientFoodIds,
      ingredientFoodNames: stats.ingredientFoodNames,
      ...(optionalPositiveNumber(recipe.cooking_time) == null
        ? {}
        : { cookingTimeMinutes: optionalPositiveNumber(recipe.cooking_time) }),
      ...(optionalPositiveNumber(recipe.waiting_time) == null
        ? {}
        : { waitingTimeMinutes: optionalPositiveNumber(recipe.waiting_time) }),
      ...(recipeTotalTimeMinutes(recipe) == null
        ? {}
        : { totalTimeMinutes: recipeTotalTimeMinutes(recipe) }),
      ...(recipe.servings === undefined ? {} : { servings: recipe.servings }),
      ...(nutrition ? { nutritionScore: nutrition.score } : {}),
      ...(nutritionStatus ? { nutritionCompleteness: nutritionStatus } : {}),
    };

    if (recipe.image) addRelationship(relationships.flags, 'has-image', recipe.id);
    if (recipe.rating != null && recipe.rating <= 1) {
      addRelationship(relationships.flags, 'low-rated', recipe.id);
    }
  }

  const { recipeSimilarities, recipeClusters, recipeClusterMemberships } = buildRecipeSimilarityIndex(
    input.recipes.map((recipe) => {
      const features = recipeFeatures[String(recipe.id)];
      return {
        id: recipe.id,
        name: recipe.name,
        keywords: features?.keywords ?? [],
        ingredientFoodIds: features?.ingredientFoodIds ?? [],
        ingredientFoodNames: features?.ingredientFoodNames ?? [],
        categories: features?.categories,
      };
    }),
  );

  sortRelationshipIds(relationships.keywords);
  sortRelationshipIds(relationships.produce);
  sortRelationshipIds(relationships.flags);
  for (const history of Object.values(recipeHistory)) {
    history.dates.sort((a, b) => a - b);
    if (history.dates.length === 0) continue;
    history.firstPlannedDate = history.dates[0];
    history.lastPlannedDate = history.dates[history.dates.length - 1];
    if (history.dates.length < 2) continue;
    const dayDiffs: number[] = [];
    for (let index = 1; index < history.dates.length; index += 1) {
      dayDiffs.push(history.dates[index] - history.dates[index - 1]);
    }
    const average = dayDiffs.reduce((total, value) => total + value, 0) / dayDiffs.length;
    history.averageDaysBetweenPlans = roundTo(average, 2);
    history.medianDaysBetweenPlans = roundTo(median(dayDiffs), 2);
  }

  return {
    schemaVersion: MEAL_ASSISTANT_PRECALCULATION_SCHEMA_VERSION,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    keywordNameById: input.keywordNameById,
    recipes,
    recipeFeatures,
    recipeSimilarities,
    recipeClusters,
    recipeClusterMemberships,
    relationships,
    recipeHistory,
    recipeInsights,
  };
}

export function isMealAssistantPrecalculation(
  value: unknown,
): value is MealAssistantPrecalculation {
  if (!isRecord(value)) return false;
  const record = value as Partial<MealAssistantPrecalculation>;
  return (
    record.schemaVersion === MEAL_ASSISTANT_PRECALCULATION_SCHEMA_VERSION &&
    typeof record.keywordNameById === 'object' &&
    record.keywordNameById !== null &&
    typeof record.recipes === 'object' &&
    record.recipes !== null &&
    isMealAssistantRecipeFeaturesRecord(record.recipeFeatures) &&
    isMealAssistantSimilarRecipesRecord(record.recipeSimilarities) &&
    isMealAssistantRecipeClustersRecord(record.recipeClusters) &&
    isMealAssistantRecipeClusterMembershipsRecord(record.recipeClusterMemberships) &&
    typeof record.relationships === 'object' &&
    record.relationships !== null &&
    typeof record.recipeHistory === 'object' &&
    record.recipeHistory !== null &&
    typeof record.recipeInsights === 'object' &&
    record.recipeInsights !== null
  );
}
