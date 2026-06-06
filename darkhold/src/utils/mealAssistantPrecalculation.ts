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
} from './recipeSimilarity.ts';
import type { CalendarFeatureDay } from './calendarFeatures.ts';
import type { WeatherFeatures } from './weatherFeatures.ts';

export const MEAL_ASSISTANT_PRECALCULATION_SCHEMA_VERSION = 10;

export type MealAssistantSeason = 'winter' | 'spring' | 'summer' | 'autumn';

export interface MealAssistantMealHistoryEntry {
  recipeId: number;
  mealTypeId: number;
  mealTypeName?: string;
  date: string;
  day: number;
  weekend: boolean;
  month: number;
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
  months: Partial<Record<string, MealAssistantTrend>>;
  seasons: Partial<Record<MealAssistantSeason, MealAssistantTrend>>;
  weather: Record<string, MealAssistantTrend>;
  calendar: Record<string, MealAssistantTrend>;
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
  weatherTags?: string[];
  calendarFeatures?: string[];
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
  monthCounts: [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  seasonCounts: [number, number, number, number];
  totalPlanCount: number;
  calendarFeatureCounts?: Record<string, number>;
  firstPlannedDate?: number;
  lastPlannedDate?: number;
  averageDaysBetweenPlans?: number;
  medianDaysBetweenPlans?: number;
}

export interface MealAssistantRelationships {
  keywords: Record<string, number[]>;
  produce: Record<string, number[]>;
  weather: Record<string, number[]>;
  calendar: Record<string, number[]>;
  flags: Record<string, number[]>;
}

export interface MealAssistantMealTypeOption {
  id: number;
  name?: string;
  planCount: number;
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
  mealTypes: MealAssistantMealTypeOption[];
  recipeHistoryByMealType: Record<string, Record<string, MealAssistantRecipeHistory>>;
}

const MIN_DOMINANT_DAY_TOTAL = 3;
const MIN_DOMINANT_DAY_COUNT = 2;
const MIN_WEEKEND_TOTAL = 4;
const MIN_MONTH_TOTAL = 3;
const MIN_SEASON_TOTAL = 3;
const MIN_WEATHER_TOTAL = 3;
const MIN_CALENDAR_TOTAL = 2;
const RECIPE_SIGNAL_ALPHA = 0.05;
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
const WEATHER_SIGNAL_TAGS_BY_GROUP = {
  temperature: ['cold-day', 'cool-day', 'mild-day', 'warm-day', 'hot-day'],
  precipitation: ['dry-day', 'showery-day', 'wet-day'],
  daylight: ['short-daylight', 'medium-daylight', 'long-daylight'],
} as const;

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

function mealTypeIdOf(entry: MealPlan): number | null {
  if (typeof entry.meal_type === 'number') return entry.meal_type;
  return entry.meal_type?.id ?? null;
}

function mealTypeNameOf(entry: MealPlan): string | undefined {
  if (typeof entry.meal_type === 'object' && entry.meal_type !== null) return entry.meal_type.name;
  return undefined;
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

function logCombination(n: number, k: number): number {
  if (k < 0 || k > n) return Number.NEGATIVE_INFINITY;
  const effectiveK = Math.min(k, n - k);
  let result = 0;
  for (let index = 1; index <= effectiveK; index += 1) {
    result += Math.log(n - effectiveK + index) - Math.log(index);
  }
  return result;
}

function logSumExp(values: number[]): number {
  const max = Math.max(...values);
  if (!Number.isFinite(max)) return max;
  const sum = values.reduce((total, value) => total + Math.exp(value - max), 0);
  return max + Math.log(sum);
}

function binomialUpperTail(trials: number, successes: number, probability: number): number {
  if (successes <= 0) return 1;
  if (successes > trials) return 0;
  if (probability <= 0) return successes <= 0 ? 1 : 0;
  if (probability >= 1) return successes <= trials ? 1 : 0;

  const logProbability = Math.log(probability);
  const logInverseProbability = Math.log1p(-probability);
  const terms: number[] = [];
  for (let count = successes; count <= trials; count += 1) {
    terms.push(
      logCombination(trials, count) +
        count * logProbability +
        (trials - count) * logInverseProbability,
    );
  }
  return Math.min(1, Math.exp(logSumExp(terms)));
}

function combinationCount(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  let result = 1;
  for (let index = 1; index <= k; index += 1) {
    result = (result * (n - k + index)) / index;
  }
  return result;
}

function significantCategoryIndexes(
  counts: readonly number[],
  options: { minTotal: number; maxCategories?: number; alpha?: number },
): number[] {
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (total < options.minTotal || counts.length < 2) return [];

  const ranked = counts
    .map((count, index) => ({ count, index }))
    .sort((left, right) => right.count - left.count || left.index - right.index);
  const maxCategories = Math.min(options.maxCategories ?? 2, counts.length);
  let best: { indexes: number[]; pValue: number } | undefined;

  for (let selectedCount = 1; selectedCount <= maxCategories; selectedCount += 1) {
    const observedCount = ranked
      .slice(0, selectedCount)
      .reduce((sum, category) => sum + category.count, 0);
    if (observedCount === 0) continue;
    const pValue = Math.min(
      1,
      binomialUpperTail(total, observedCount, selectedCount / counts.length) *
        combinationCount(counts.length, selectedCount),
    );
    if (!best || pValue < best.pValue) {
      best = {
        indexes: ranked.slice(0, selectedCount).map((category) => category.index),
        pValue,
      };
    }
  }

  return best && best.pValue <= (options.alpha ?? RECIPE_SIGNAL_ALPHA) ? best.indexes : [];
}

function significantEntries<T extends string>(
  entries: readonly (readonly [T, number])[],
  options: { minTotal: number; maxCategories?: number; alpha?: number },
): T[] {
  const indexes = significantCategoryIndexes(
    entries.map(([, count]) => count),
    options,
  );
  return indexes.map((index) => entries[index][0]);
}

function monthKey(monthIndex: number): string {
  return String(monthIndex + 1);
}

function weatherGroupEntries(weather: WeatherFeatures): [string, string][] {
  return [
    ['temperature', `${weather.temperatureBand}-day`],
    ['precipitation', `${weather.precipitationBand}-day`],
    ['daylight', `${weather.daylightBand}-daylight`],
  ];
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

function buildMealHistory(
  entries: MealPlan[],
  publicHolidayDates: ReadonlySet<string> = new Set(),
): MealAssistantMealHistoryEntry[] {
  return entries.flatMap((entry): MealAssistantMealHistoryEntry[] => {
    const recipeId = recipeIdOf(entry);
    const mealTypeId = mealTypeIdOf(entry);
    const mealDate = parseMealDate(entry.from_date);
    if (!recipeId || mealTypeId == null || !mealDate) return [];
    const date = entry.from_date.includes('T') ? entry.from_date.split('T')[0] : entry.from_date;
    const day = mealDate.getDay();
    return [
      {
        recipeId,
        mealTypeId,
        ...(mealTypeNameOf(entry) ? { mealTypeName: mealTypeNameOf(entry) } : {}),
        date,
        day,
        weekend: day === 0 || day === 6 || publicHolidayDates.has(date),
        month: mealDate.getMonth(),
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
    months: {},
    seasons: {},
    weather: {},
    calendar: {},
    produce: [],
  };
}

function createEmptyHistory(): MealAssistantRecipeHistory {
  return {
    dates: [],
    dayCounts: [0, 0, 0, 0, 0, 0, 0],
    monthCounts: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    seasonCounts: [0, 0, 0, 0],
    totalPlanCount: 0,
    calendarFeatureCounts: {},
  };
}

function incrementRecordCount(record: Record<string, number>, key: string): void {
  record[key] = (record[key] ?? 0) + 1;
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

function recipeCategoryNames(recipe: Recipe): string[] {
  const categories = recipe.categories;
  if (!Array.isArray(categories)) return [];
  return compactSortedValues(
    categories.flatMap((category) => {
      if (typeof category === 'string') return [category];
      return typeof category?.name === 'string' ? [category.name] : [];
    }),
  );
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
      (features.weatherTags == null ||
        (Array.isArray(features.weatherTags) &&
          features.weatherTags.every((weatherTag) => typeof weatherTag === 'string'))) &&
      (features.calendarFeatures == null ||
        (Array.isArray(features.calendarFeatures) &&
          features.calendarFeatures.every(
            (calendarFeature) => typeof calendarFeature === 'string',
          ))) &&
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
  weatherByDate?: Record<string, WeatherFeatures>;
  calendarByDate?: Record<string, CalendarFeatureDay>;
  generatedAt?: string;
}): MealAssistantPrecalculation {
  const produceFoods = normalizedProduceFoods(input);
  const produceFoodNames = compactSortedValues(produceFoods.map((food) => food.name));
  const weatherByDate = input.weatherByDate ?? {};
  const calendarByDate = input.calendarByDate ?? {};
  const publicHolidayDates = new Set(
    Object.entries(calendarByDate)
      .filter(([, day]) => day.bankHoliday)
      .map(([date]) => date),
  );
  const mealHistory = buildMealHistory(input.mealPlans, publicHolidayDates).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const recipes: Record<string, MealAssistantRecipeSummary> = {};
  const recipeFeatures: Record<string, MealAssistantRecipeFeatures> = {};
  const recipeHistory: Record<string, MealAssistantRecipeHistory> = {};
  const recipeInsights: Record<string, MealAssistantRecipeInsight> = {};
  const recipeHistoryByMealType: Record<string, Record<string, MealAssistantRecipeHistory>> = {};
  const mealTypeNames = new Map<number, string>();
  const relationships: MealAssistantRelationships = {
    keywords: {},
    produce: Object.fromEntries(produceFoodNames.map((name) => [name, [] as number[]])),
    weather: {},
    calendar: {},
    flags: {},
  };
  const recipeWeatherCounts = new Map<string, Map<string, number>>();
  const recipeCalendarCounts = new Map<string, Map<string, number>>();

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
    history.monthCounts[entry.month] += 1;
    history.seasonCounts[SEASON_INDEX[entry.season]] += 1;
    history.totalPlanCount += 1;
    recipeHistory[String(entry.recipeId)] = history;

    if (entry.mealTypeName) mealTypeNames.set(entry.mealTypeId, entry.mealTypeName);
    const mealTypeKey = String(entry.mealTypeId);
    const mealTypeHistory = recipeHistoryByMealType[mealTypeKey] ?? {};
    const typedHistory = mealTypeHistory[String(entry.recipeId)] ?? createEmptyHistory();
    const typedDayNumber = dateStringToDayNumber(entry.date);
    if (typedDayNumber != null) {
      typedHistory.dates.push(typedDayNumber);
    }
    typedHistory.dayCounts[entry.day] += 1;
    typedHistory.monthCounts[entry.month] += 1;
    typedHistory.seasonCounts[SEASON_INDEX[entry.season]] += 1;
    typedHistory.totalPlanCount += 1;
    mealTypeHistory[String(entry.recipeId)] = typedHistory;
    recipeHistoryByMealType[mealTypeKey] = mealTypeHistory;

    const weather = weatherByDate[entry.date];
    if (weather) {
      const counts = recipeWeatherCounts.get(String(entry.recipeId)) ?? new Map<string, number>();
      for (const [group, tag] of weatherGroupEntries(weather)) {
        const key = `${group}:${tag}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      recipeWeatherCounts.set(String(entry.recipeId), counts);
    }

    const calendarDay = calendarByDate[entry.date];
    if (calendarDay) {
      const counts = recipeCalendarCounts.get(String(entry.recipeId)) ?? new Map<string, number>();
      const historyCalendarCounts = history.calendarFeatureCounts ?? {};
      const typedHistoryCalendarCounts = typedHistory.calendarFeatureCounts ?? {};
      for (const featureKey of calendarDay.appointmentFeatures) {
        counts.set(featureKey, (counts.get(featureKey) ?? 0) + 1);
        incrementRecordCount(historyCalendarCounts, featureKey);
        incrementRecordCount(typedHistoryCalendarCounts, featureKey);
      }
      history.calendarFeatureCounts = historyCalendarCounts;
      typedHistory.calendarFeatureCounts = typedHistoryCalendarCounts;
      recipeCalendarCounts.set(String(entry.recipeId), counts);
    }
  }

  for (const [recipeId, insight] of Object.entries(recipeInsights)) {
    const historyRecord = recipeHistory[recipeId];
    if (!historyRecord) continue;

    for (const day of significantCategoryIndexes(historyRecord.dayCounts, {
      minTotal: MIN_DOMINANT_DAY_TOTAL,
    })) {
      const count = historyRecord.dayCounts[day];
      if (count >= MIN_DOMINANT_DAY_COUNT) {
        insight.days[String(day)] = trend(count, historyRecord.totalPlanCount, 12);
      }
    }

    const [weekdayKey] = significantEntries(
      [
        ['weekday', insight.weekdayCookCount],
        ['weekend', insight.weekendCookCount],
      ] as const,
      { minTotal: MIN_WEEKEND_TOTAL, maxCategories: 1 },
    );
    if (weekdayKey === 'weekend') {
      insight.weekend = trend(insight.weekendCookCount, insight.totalCookCount, 8);
    } else if (weekdayKey === 'weekday') {
      insight.weekday = trend(insight.weekdayCookCount, insight.totalCookCount, 8);
    }

    for (const month of significantCategoryIndexes(historyRecord.monthCounts, {
      minTotal: MIN_MONTH_TOTAL,
    })) {
      insight.months[monthKey(month)] = trend(
        historyRecord.monthCounts[month],
        historyRecord.totalPlanCount,
        8,
      );
    }

    const seasonEntries = (['winter', 'spring', 'summer', 'autumn'] as const).map(
      (season) => [season, historyRecord.seasonCounts[SEASON_INDEX[season]]] as const,
    );
    for (const season of significantEntries(seasonEntries, { minTotal: MIN_SEASON_TOTAL })) {
      insight.seasons[season] = trend(
        historyRecord.seasonCounts[SEASON_INDEX[season]],
        historyRecord.totalPlanCount,
        8,
      );
    }

    const weatherCountsByGroup = new Map<string, Map<string, number>>();
    for (const [groupedTag, count] of recipeWeatherCounts.get(recipeId) ?? new Map()) {
      const separatorIndex = groupedTag.indexOf(':');
      if (separatorIndex < 0) continue;
      const group = groupedTag.slice(0, separatorIndex);
      const tag = groupedTag.slice(separatorIndex + 1);
      const counts = weatherCountsByGroup.get(group) ?? new Map<string, number>();
      counts.set(tag, count);
      weatherCountsByGroup.set(group, counts);
    }
    for (const [group, counts] of weatherCountsByGroup) {
      const knownTags =
        WEATHER_SIGNAL_TAGS_BY_GROUP[group as keyof typeof WEATHER_SIGNAL_TAGS_BY_GROUP];
      const entries = (knownTags ?? [...counts.keys()].sort()).map(
        (tag) => [tag, counts.get(tag) ?? 0] as const,
      );
      for (const weatherTag of significantEntries(entries, { minTotal: MIN_WEATHER_TOTAL })) {
        insight.weather[weatherTag] = trend(counts.get(weatherTag) ?? 0, insight.totalCookCount, 8);
      }
    }

    const rawCalendarEntries = [
      ...(recipeCalendarCounts.get(recipeId) ?? new Map()).entries(),
    ].sort(([left], [right]) => left.localeCompare(right));
    const calendarEntries =
      rawCalendarEntries.length === 1
        ? ([...rawCalendarEntries, ['__other-calendar-signal', 0]] as const)
        : rawCalendarEntries;
    for (const calendarFeature of significantEntries(calendarEntries, {
      minTotal: MIN_CALENDAR_TOTAL,
    })) {
      if (calendarFeature === '__other-calendar-signal') continue;
      const count = recipeCalendarCounts.get(recipeId)?.get(calendarFeature) ?? 0;
      insight.calendar[calendarFeature] = trend(count, insight.totalCookCount, 10);
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
    const weatherTags = compactSortedValues(Object.keys(recipeInsights[String(recipe.id)].weather));
    const calendarFeatures = compactSortedValues(
      recipeCalendarCounts.get(String(recipe.id))?.keys() ?? [],
    );
    for (const weatherTag of weatherTags)
      addRelationship(relationships.weather, weatherTag, recipe.id);
    for (const calendarFeature of calendarFeatures)
      addRelationship(relationships.calendar, calendarFeature, recipe.id);

    recipeFeatures[String(recipe.id)] = {
      keywords: keywordNames,
      produce,
      ...(categoryNames.length > 0 ? { categories: categoryNames } : {}),
      ...(weatherTags.length > 0 ? { weatherTags } : {}),
      ...(calendarFeatures.length > 0 ? { calendarFeatures } : {}),
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

  const { recipeSimilarities, recipeClusters, recipeClusterMemberships } =
    buildRecipeSimilarityIndex(
      input.recipes.map((recipe) => {
        const features = recipeFeatures[String(recipe.id)];
        return {
          id: recipe.id,
          name: recipe.name,
          keywords: features?.keywords ?? [],
          ingredientFoodIds: features?.ingredientFoodIds ?? [],
          ingredientFoodNames: features?.ingredientFoodNames ?? [],
          categories: features?.categories,
          weatherTags: features?.weatherTags,
          calendarFeatures: features?.calendarFeatures,
        };
      }),
    );

  sortRelationshipIds(relationships.keywords);
  sortRelationshipIds(relationships.produce);
  sortRelationshipIds(relationships.weather);
  sortRelationshipIds(relationships.calendar);
  sortRelationshipIds(relationships.flags);
  const finalizeHistory = (history: MealAssistantRecipeHistory) => {
    history.dates.sort((a, b) => a - b);
    if (history.dates.length === 0) return;
    history.firstPlannedDate = history.dates[0];
    history.lastPlannedDate = history.dates[history.dates.length - 1];
    if (history.dates.length < 2) return;
    const dayDiffs: number[] = [];
    for (let index = 1; index < history.dates.length; index += 1) {
      dayDiffs.push(history.dates[index] - history.dates[index - 1]);
    }
    const average = dayDiffs.reduce((total, value) => total + value, 0) / dayDiffs.length;
    history.averageDaysBetweenPlans = roundTo(average, 2);
    history.medianDaysBetweenPlans = roundTo(median(dayDiffs), 2);
  };
  for (const history of Object.values(recipeHistory)) finalizeHistory(history);
  for (const histories of Object.values(recipeHistoryByMealType)) {
    for (const history of Object.values(histories)) finalizeHistory(history);
  }
  const mealTypes = Object.entries(recipeHistoryByMealType)
    .map(([mealTypeId, histories]) => {
      const id = Number.parseInt(mealTypeId, 10);
      return {
        id,
        ...(mealTypeNames.get(id) ? { name: mealTypeNames.get(id) } : {}),
        planCount: Object.values(histories).reduce(
          (total, history) => total + history.totalPlanCount,
          0,
        ),
      };
    })
    .sort((left, right) => left.id - right.id);

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
    mealTypes,
    recipeHistoryByMealType,
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
    record.recipeInsights !== null &&
    Array.isArray(record.mealTypes) &&
    typeof record.recipeHistoryByMealType === 'object' &&
    record.recipeHistoryByMealType !== null
  );
}
