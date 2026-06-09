import type {
  CookLog,
  Food,
  Keyword,
  MealPlan,
  Recipe,
  RecipeIngredient,
} from '../api/tandoor-types.d.ts';
import { describeCalendarAppointmentFeature, type CalendarFeatureDay } from './calendarFeatures.ts';
import { weatherTagLabel, type WeatherFeatures } from './weatherFeatures.ts';

export interface YearInFoodWeatherDay {
  date: string;
  tempMaxC: number;
}

export interface YearInFoodTopItem {
  name: string;
  count?: number;
  grams?: number;
  share?: number;
}

export interface YearInFoodDateHighlight {
  date: string;
  recipeName: string;
  value: number;
  label: string;
}

export interface YearInFoodRecipeHighlight {
  recipeName: string;
  value: number;
  label: string;
  detail?: string;
}

export interface YearInFoodSummary {
  year: number;
  generatedAt: string;
  dateRange: { from: string; to: string };
  scope: string;
  mealCount: number;
  totalHouseholdServings: number;
  averageHouseholdServingsPerDinner: number;
  uniqueRecipeCount: number;
  uniqueIngredientCount: number;
  /** Household total grams, scaled by meal-plan servings versus recipe servings. */
  topProduceByGrams: YearInFoodTopItem[];
  /** Per-person grams for one serving, useful when a household-sized total would be less relatable. */
  topProduceByPersonGrams: YearInFoodTopItem[];
  produceGramCoverageMealCount: number;
  mostFrequentIngredients: YearInFoodTopItem[];
  nutrition: {
    mealsWithCalories: number;
    mealsWithProtein: number;
    mealsWithFibre: number;
    averageCaloriesPerPortion?: number;
    averageProteinGPerPortion?: number;
    averageFibreGPerPortion?: number;
    highestProteinDay?: YearInFoodDateHighlight;
    highestFibreMonth?: YearInFoodRecipeHighlight;
  };
  repeats: {
    mostRepeatedMeals: YearInFoodRecipeHighlight[];
    longestReturnGap?: YearInFoodRecipeHighlight;
    newRecipesRepeated: YearInFoodRecipeHighlight[];
  };
  ratings: {
    highestRatedRecipes: YearInFoodRecipeHighlight[];
    mostImprovedRecipe?: YearInFoodRecipeHighlight;
  };
  cuisine: {
    source: string;
    topDinnerKeywords: YearInFoodTopItem[];
    weekdayPersonalities: YearInFoodRecipeHighlight[];
    longestCuisineStreak?: YearInFoodRecipeHighlight;
  };
  streaks: {
    ingredientStreaks: YearInFoodRecipeHighlight[];
  };
  takeaway: {
    count: number;
    previousYearCount?: number;
    deltaFromPreviousYear?: number;
    favouriteWeekday?: YearInFoodRecipeHighlight;
    longestNoTakeawayStreakDays?: number;
  };
  cookingEffort: {
    totalMinutes: number;
    assumedDefaultMinutesCount: number;
    takeawayExcludedCount: number;
  };
  records: {
    mostProduceInOneMeal?: YearInFoodDateHighlight;
    mostIngredientsInOneMeal?: YearInFoodDateHighlight;
    newRecipesTried: number;
  };
  weather?: {
    hottestDinnerDay?: YearInFoodDateHighlight & { tempMaxC: number };
    topDinnerWeatherSignals?: YearInFoodTopItem[];
  };
  calendar: {
    bankHolidayDinnerCount: number;
    topAppointmentSignals: YearInFoodTopItem[];
  };
  limitations: string[];
}

export interface BuildYearInFoodSummaryInput {
  year: number;
  mealPlans: MealPlan[];
  recipes: Recipe[];
  cookLogs?: CookLog[];
  keywords?: Keyword[];
  produceCategoryName?: string;
  produceFoods?: Array<Pick<Food, 'id' | 'name'>>;
  weatherDays?: YearInFoodWeatherDay[];
  weatherFeaturesByDate?: Record<string, WeatherFeatures>;
  calendarFeaturesByDate?: Record<string, CalendarFeatureDay>;
  toDate?: string;
  now?: Date;
}

interface MealInstance {
  date: string;
  recipe: Recipe;
  plan: MealPlan;
  recipeServings: number;
  householdServings: number;
  householdScale: number;
}

interface IngredientAmount {
  name: string;
  foodId?: number;
  grams?: number;
}

const TAKEAWAY_RECIPE_NAME = 'takeaway';
const DINNER_KEYWORD_NAME = 'dinner';
const DEFAULT_COOKING_TIME_MINUTES = 60;
const TOP_COUNT = 5;
const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function normalize(value: string | undefined | null): string {
  return (value ?? '').trim().toLowerCase();
}

function dateOnly(value: string): string {
  return value.split('T')[0];
}

function dayMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function daysBetween(left: string, right: string): number {
  return Math.round((dayMs(right) - dayMs(left)) / (24 * 60 * 60 * 1000));
}

function isDateInYear(value: string, year: number): boolean {
  return dateOnly(value).startsWith(`${year}-`);
}

function recipeId(value: Recipe | number): number | null {
  return typeof value === 'number' ? value : (value?.id ?? null);
}

function foodFromIngredient(ingredient: RecipeIngredient): Food | null {
  return typeof ingredient.food === 'object' && ingredient.food !== null ? ingredient.food : null;
}

function foodIdFromIngredient(ingredient: RecipeIngredient): number | undefined {
  if (typeof ingredient.food === 'number') return ingredient.food;
  return ingredient.food?.id;
}

function mealTypeName(plan: MealPlan): string {
  return typeof plan.meal_type === 'object' && plan.meal_type !== null ? plan.meal_type.name : '';
}

function positiveNumber(value: number | undefined | null): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function recipeServingCount(recipe: Recipe): number {
  return positiveNumber(recipe.servings) ?? 1;
}

function mealPlanHouseholdServings(plan: MealPlan, recipe: Recipe): number {
  return positiveNumber(plan.servings) ?? recipeServingCount(recipe);
}

function mealPlanHouseholdScale(plan: MealPlan, recipe: Recipe): number {
  return mealPlanHouseholdServings(plan, recipe) / recipeServingCount(recipe);
}

function keywordName(keyword: Keyword | number): string | null {
  return typeof keyword === 'object' && keyword !== null ? keyword.name : null;
}

function keywordParentId(keyword: Keyword): number | null {
  const record = keyword as unknown as Record<string, unknown>;
  const parent = record.parent ?? record.filter;
  if (typeof parent === 'number') return parent;
  if (typeof parent === 'object' && parent !== null) {
    const id = (parent as Record<string, unknown>).id;
    return typeof id === 'number' ? id : null;
  }
  return null;
}

function isTakeaway(recipe: Recipe): boolean {
  return normalize(recipe.name) === TAKEAWAY_RECIPE_NAME;
}

function gramsForIngredient(ingredient: RecipeIngredient): number | undefined {
  if (typeof ingredient.amount !== 'number' || !Number.isFinite(ingredient.amount))
    return undefined;
  const unitName = normalize(ingredient.unit?.name);
  const unitPlural = normalize(ingredient.unit?.plural);
  if (unitName === 'g' || unitName === 'gram' || unitName === 'grams' || unitPlural === 'grams') {
    return ingredient.amount;
  }
  if (
    unitName === 'kg' ||
    unitName === 'kilogram' ||
    unitName === 'kilograms' ||
    unitPlural === 'kilograms'
  ) {
    return ingredient.amount * 1000;
  }
  return undefined;
}

function ingredientsForRecipe(recipe: Recipe): IngredientAmount[] {
  return (recipe.steps ?? [])
    .flatMap((step) => step.ingredients ?? [])
    .filter((ingredient) => !ingredient.is_header && ingredient.food !== null)
    .map((ingredient) => ({
      name: foodFromIngredient(ingredient)?.name ?? ingredient.note ?? 'Unknown ingredient',
      foodId: foodIdFromIngredient(ingredient),
      grams: gramsForIngredient(ingredient),
    }))
    .filter((ingredient) => normalize(ingredient.name));
}

function nutritionValue(recipe: Recipe, candidates: string[]): number | undefined {
  const foodProperties = Object.values(recipe.food_properties ?? {});
  const property = foodProperties.find((item) => {
    const name = normalize(item.name);
    return candidates.some((candidate) => name.includes(candidate));
  });
  if (property && Number.isFinite(property.total_value)) return property.total_value;
  const legacy = recipe.nutrition;
  if (!legacy) return undefined;
  if (candidates.includes('calorie') && typeof legacy.calories === 'number') return legacy.calories;
  if (candidates.includes('protein') && typeof legacy.proteins === 'number') return legacy.proteins;
  if (candidates.includes('fibre') && typeof legacy.fibres === 'number') return legacy.fibres;
  if (candidates.includes('fiber') && typeof legacy.fibres === 'number') return legacy.fibres;
  return undefined;
}

function perPortion(recipe: Recipe, value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  return value / recipeServingCount(recipe);
}

function addCount(map: Map<string, number>, key: string, amount = 1): void {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function topItems(
  map: Map<string, number>,
  total?: number,
  count = TOP_COUNT,
): YearInFoodTopItem[] {
  return [...map.entries()]
    .map(([name, value]) => ({ name, count: value, share: total ? value / total : undefined }))
    .sort(
      (left, right) =>
        (right.count ?? 0) - (left.count ?? 0) || left.name.localeCompare(right.name),
    )
    .slice(0, count);
}

function topGramItems(map: Map<string, number>, count = TOP_COUNT): YearInFoodTopItem[] {
  return [...map.entries()]
    .map(([name, grams]) => ({ name, grams: Math.round(grams) }))
    .sort(
      (left, right) =>
        (right.grams ?? 0) - (left.grams ?? 0) || left.name.localeCompare(right.name),
    )
    .slice(0, count);
}

function recipeKeywords(recipe: Recipe): string[] {
  return (recipe.keywords ?? []).flatMap((keyword) => {
    const name = keywordName(keyword);
    return name ? [name] : [];
  });
}

function dinnerChildKeywordNames(keywords: Keyword[]): Set<string> {
  const dinner = keywords.find((keyword) => normalize(keyword.name) === DINNER_KEYWORD_NAME);
  if (!dinner) return new Set();
  return new Set(
    keywords
      .filter((keyword) => keywordParentId(keyword) === dinner.id)
      .map((keyword) => normalize(keyword.name))
      .filter(Boolean),
  );
}

function sortedMeals(meals: MealInstance[]): MealInstance[] {
  return [...meals].sort(
    (left, right) =>
      left.date.localeCompare(right.date) || left.recipe.name.localeCompare(right.recipe.name),
  );
}

function longestStreakByDay(valuesByDate: Map<string, Set<string>>): YearInFoodRecipeHighlight[] {
  const sortedDates = [...valuesByDate.keys()].sort();
  const allValues = new Set<string>();
  for (const values of valuesByDate.values()) for (const value of values) allValues.add(value);

  return [...allValues]
    .map((value) => {
      let best = 0;
      let current = 0;
      let previousDate: string | null = null;
      for (const date of sortedDates) {
        const hasValue = valuesByDate.get(date)?.has(value) ?? false;
        const consecutive = previousDate ? daysBetween(previousDate, date) === 1 : false;
        current = hasValue ? (consecutive ? current + 1 : 1) : 0;
        best = Math.max(best, current);
        previousDate = date;
      }
      return { recipeName: value, value: best, label: `${best} day streak` };
    })
    .filter((item) => item.value >= 3)
    .sort(
      (left, right) => right.value - left.value || left.recipeName.localeCompare(right.recipeName),
    )
    .slice(0, TOP_COUNT);
}

function longestNoTakeawayStreak(meals: MealInstance[]): number | undefined {
  const dates = [...new Set(meals.map((meal) => meal.date))].sort();
  if (dates.length === 0) return undefined;
  const takeawayDates = new Set(
    meals.filter((meal) => isTakeaway(meal.recipe)).map((meal) => meal.date),
  );
  let best = 0;
  let current = 0;
  for (const date of dates) {
    if (takeawayDates.has(date)) {
      current = 0;
    } else {
      current += 1;
      best = Math.max(best, current);
    }
  }
  return best;
}

function cookLogRecipeId(log: CookLog): number | null {
  return typeof log.recipe === 'number' ? log.recipe : (log.recipe?.id ?? null);
}

function buildRatingHighlights(
  cookLogs: CookLog[],
  recipesById: Map<number, Recipe>,
  year: number,
) {
  const logsInYear = cookLogs
    .filter((log) => isDateInYear(log.created_at, year) && typeof log.rating === 'number')
    .sort((left, right) => left.created_at.localeCompare(right.created_at));
  const averageByRecipe = new Map<number, { total: number; count: number }>();
  for (const log of logsInYear) {
    const id = cookLogRecipeId(log);
    if (id === null || typeof log.rating !== 'number') continue;
    const current = averageByRecipe.get(id) ?? { total: 0, count: 0 };
    current.total += log.rating;
    current.count += 1;
    averageByRecipe.set(id, current);
  }
  const highestRatedRecipes = [...averageByRecipe.entries()]
    .map(([id, item]) => ({
      recipeName: recipesById.get(id)?.name ?? `Recipe ${id}`,
      value: Number((item.total / item.count).toFixed(1)),
      label: `${item.count} rated cook${item.count === 1 ? '' : 's'}`,
    }))
    .sort(
      (left, right) => right.value - left.value || left.recipeName.localeCompare(right.recipeName),
    )
    .slice(0, TOP_COUNT);

  const byRecipe = new Map<number, CookLog[]>();
  for (const log of logsInYear) {
    const id = cookLogRecipeId(log);
    if (id !== null) byRecipe.set(id, [...(byRecipe.get(id) ?? []), log]);
  }
  const mostImprovedRecipe = [...byRecipe.entries()]
    .flatMap(([id, logs]) => {
      if (logs.length < 2) return [];
      const first = logs[0].rating;
      const last = logs[logs.length - 1].rating;
      if (typeof first !== 'number' || typeof last !== 'number' || last <= first) return [];
      return [
        {
          recipeName: recipesById.get(id)?.name ?? `Recipe ${id}`,
          value: Number((last - first).toFixed(1)),
          label: `up from ${first} to ${last}`,
        },
      ];
    })
    .sort(
      (left, right) => right.value - left.value || left.recipeName.localeCompare(right.recipeName),
    )[0];

  return { highestRatedRecipes, mostImprovedRecipe };
}

export function validateYearInFoodYear(year: number, now = new Date()): string | null {
  if (!Number.isInteger(year)) return 'Year must be a whole number.';
  const currentYear = now.getFullYear();
  if (year > currentYear) return 'Year cannot be in the future.';
  if (year < 1970) return 'Year is too far in the past.';
  return null;
}

export function buildYearInFoodSummary({
  year,
  mealPlans,
  recipes,
  cookLogs = [],
  keywords = [],
  produceCategoryName,
  produceFoods = [],
  weatherDays = [],
  weatherFeaturesByDate = {},
  calendarFeaturesByDate = {},
  toDate = `${year}-12-31`,
  now = new Date(),
}: BuildYearInFoodSummaryInput): YearInFoodSummary {
  const recipesById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const meals = sortedMeals(
    mealPlans.flatMap((plan): MealInstance[] => {
      if (!isDateInYear(plan.from_date, year)) return [];
      if (normalize(mealTypeName(plan)) !== DINNER_KEYWORD_NAME) return [];
      const id = recipeId(plan.recipe);
      const recipe = id === null ? null : recipesById.get(id);
      if (!recipe) return [];
      return [
        {
          date: dateOnly(plan.from_date),
          recipe,
          plan,
          recipeServings: recipeServingCount(recipe),
          householdServings: mealPlanHouseholdServings(plan, recipe),
          householdScale: mealPlanHouseholdScale(plan, recipe),
        },
      ];
    }),
  );

  const recipeCounts = new Map<string, number>();
  const recipeDates = new Map<number, string[]>();
  const ingredientCounts = new Map<string, number>();
  const produceGrams = new Map<string, number>();
  const producePersonGrams = new Map<string, number>();
  const ingredientValuesByDate = new Map<string, Set<string>>();
  const keywordValuesByDate = new Map<string, Set<string>>();
  const weekdayKeywordCounts = new Map<string, Map<string, number>>();
  const dinnerChildKeywords = dinnerChildKeywordNames(keywords);
  const produceFoodIds = new Set(produceFoods.map((food) => food.id));
  const produceFoodNames = new Set(produceFoods.map((food) => normalize(food.name)));
  const hasProduceWhitelist = produceFoodIds.size > 0 || produceFoodNames.size > 0;
  let caloriesTotal = 0;
  let caloriesCount = 0;
  let proteinTotal = 0;
  let proteinCount = 0;
  let fibreTotal = 0;
  let fibreCount = 0;
  let bestProteinDay: YearInFoodDateHighlight | undefined;
  const fibreByMonth = new Map<number, { total: number; count: number }>();
  let produceCoverageMealCount = 0;
  let totalHouseholdServings = 0;
  let totalCookingMinutes = 0;
  let assumedDefaultMinutesCount = 0;
  let takeawayExcludedCount = 0;
  let mostProduceInOneMeal: YearInFoodDateHighlight | undefined;
  let mostIngredientsInOneMeal: YearInFoodDateHighlight | undefined;

  for (const meal of meals) {
    addCount(recipeCounts, meal.recipe.name);
    totalHouseholdServings += meal.householdServings;
    const dates = recipeDates.get(meal.recipe.id) ?? [];
    dates.push(meal.date);
    recipeDates.set(meal.recipe.id, dates);

    const ingredients = ingredientsForRecipe(meal.recipe);
    const ingredientNames = new Set(ingredients.map((ingredient) => ingredient.name));
    ingredientValuesByDate.set(
      meal.date,
      new Set([...(ingredientValuesByDate.get(meal.date) ?? []), ...ingredientNames]),
    );
    for (const name of ingredientNames) addCount(ingredientCounts, name);

    const produceIngredients = ingredients.filter((ingredient) => {
      if (ingredient.grams === undefined) return false;
      if (!hasProduceWhitelist) return true;
      return (
        (ingredient.foodId !== undefined && produceFoodIds.has(ingredient.foodId)) ||
        produceFoodNames.has(normalize(ingredient.name))
      );
    });
    if (produceIngredients.length > 0) produceCoverageMealCount += 1;
    let produceCountForMeal = 0;
    for (const ingredient of produceIngredients) {
      const grams = ingredient.grams;
      if (grams === undefined) continue;
      addCount(produceGrams, ingredient.name, grams * meal.householdScale);
      addCount(producePersonGrams, ingredient.name, grams / meal.recipeServings);
      produceCountForMeal += 1;
    }
    if (!mostProduceInOneMeal || produceCountForMeal > mostProduceInOneMeal.value) {
      mostProduceInOneMeal = {
        date: meal.date,
        recipeName: meal.recipe.name,
        value: produceCountForMeal,
        label: 'produce ingredients with gram amounts',
      };
    }
    if (!mostIngredientsInOneMeal || ingredientNames.size > mostIngredientsInOneMeal.value) {
      mostIngredientsInOneMeal = {
        date: meal.date,
        recipeName: meal.recipe.name,
        value: ingredientNames.size,
        label: 'distinct ingredients',
      };
    }

    const calories = perPortion(meal.recipe, nutritionValue(meal.recipe, ['calorie', 'energy']));
    if (calories !== undefined) {
      caloriesTotal += calories;
      caloriesCount += 1;
    }
    const protein = perPortion(meal.recipe, nutritionValue(meal.recipe, ['protein']));
    if (protein !== undefined) {
      proteinTotal += protein;
      proteinCount += 1;
      if (!bestProteinDay || protein > bestProteinDay.value) {
        bestProteinDay = {
          date: meal.date,
          recipeName: meal.recipe.name,
          value: Math.round(protein),
          label: 'g protein per portion',
        };
      }
    }
    const fibre = perPortion(meal.recipe, nutritionValue(meal.recipe, ['fibre', 'fiber']));
    if (fibre !== undefined) {
      fibreTotal += fibre;
      fibreCount += 1;
      const month = new Date(`${meal.date}T00:00:00Z`).getUTCMonth();
      const current = fibreByMonth.get(month) ?? { total: 0, count: 0 };
      current.total += fibre;
      current.count += 1;
      fibreByMonth.set(month, current);
    }

    if (isTakeaway(meal.recipe)) {
      takeawayExcludedCount += 1;
    } else {
      const minutes =
        meal.recipe.cooking_time && meal.recipe.cooking_time > 0
          ? meal.recipe.cooking_time
          : DEFAULT_COOKING_TIME_MINUTES;
      if (!meal.recipe.cooking_time || meal.recipe.cooking_time <= 0)
        assumedDefaultMinutesCount += 1;
      totalCookingMinutes += minutes;
    }

    const keywordNames = recipeKeywords(meal.recipe).filter((name) => {
      if (dinnerChildKeywords.size === 0) return normalize(name) !== DINNER_KEYWORD_NAME;
      return dinnerChildKeywords.has(normalize(name));
    });
    keywordValuesByDate.set(
      meal.date,
      new Set([...(keywordValuesByDate.get(meal.date) ?? []), ...keywordNames]),
    );
    const weekday = WEEKDAY_NAMES[new Date(`${meal.date}T00:00:00Z`).getUTCDay()];
    const weekdayCounts = weekdayKeywordCounts.get(weekday) ?? new Map<string, number>();
    for (const name of keywordNames) addCount(weekdayCounts, name);
    weekdayKeywordCounts.set(weekday, weekdayCounts);
  }

  const previousYearTakeawayCount = mealPlans.filter((plan) => {
    if (!isDateInYear(plan.from_date, year - 1)) return false;
    if (normalize(mealTypeName(plan)) !== DINNER_KEYWORD_NAME) return false;
    const id = recipeId(plan.recipe);
    const recipe = id === null ? null : recipesById.get(id);
    return recipe ? isTakeaway(recipe) : false;
  }).length;

  const takeawayMeals = meals.filter((meal) => isTakeaway(meal.recipe));
  const takeawayWeekdays = new Map<string, number>();
  for (const meal of takeawayMeals) {
    addCount(takeawayWeekdays, WEEKDAY_NAMES[new Date(`${meal.date}T00:00:00Z`).getUTCDay()]);
  }

  const recipeHistoryAll = new Map<number, string[]>();
  for (const plan of mealPlans) {
    const id = recipeId(plan.recipe);
    if (id === null) continue;
    const dates = recipeHistoryAll.get(id) ?? [];
    dates.push(dateOnly(plan.from_date));
    recipeHistoryAll.set(id, dates);
  }

  const longestReturnGap = [...recipeDates.entries()]
    .flatMap(([id, dates]) => {
      const allDates = [...(recipeHistoryAll.get(id) ?? [])].sort();
      let bestGap = 0;
      for (const date of dates) {
        const earlierDates = allDates.filter((candidate) => candidate < date);
        const previous = earlierDates[earlierDates.length - 1];
        if (previous) bestGap = Math.max(bestGap, daysBetween(previous, date));
      }
      if (bestGap <= 0) return [];
      return [
        {
          recipeName: recipesById.get(id)?.name ?? `Recipe ${id}`,
          value: bestGap,
          label: 'days since previous dinner',
        },
      ];
    })
    .sort((left, right) => right.value - left.value)[0];

  const newRecipesRepeated = [...recipeDates.entries()]
    .flatMap(([id, dates]) => {
      const recipe = recipesById.get(id);
      if (!recipe?.created_at || !isDateInYear(recipe.created_at, year) || dates.length < 2)
        return [];
      return [
        { recipeName: recipe.name, value: dates.length, label: 'dinners since it was created' },
      ];
    })
    .sort(
      (left, right) => right.value - left.value || left.recipeName.localeCompare(right.recipeName),
    )
    .slice(0, TOP_COUNT);

  const highestFibreMonth = [...fibreByMonth.entries()]
    .map(([month, item]) => ({
      recipeName: MONTH_NAMES[month],
      value: Number((item.total / item.count).toFixed(1)),
      label: 'g fibre per portion on average',
    }))
    .sort((left, right) => right.value - left.value)[0];

  const keywordCounts = new Map<string, number>();
  for (const values of keywordValuesByDate.values())
    for (const value of values) addCount(keywordCounts, value);

  const weekdayPersonalities = [...weekdayKeywordCounts.entries()].flatMap(([weekday, counts]) => {
    const top = topItems(counts, undefined, 1)[0];
    if (!top?.count) return [];
    return [{ recipeName: weekday, value: top.count, label: `${top.name} dinners` }];
  });

  const weatherTagCounts = new Map<string, number>();
  const calendarFeatureCounts = new Map<string, number>();
  let bankHolidayDinnerCount = 0;
  for (const date of new Set(meals.map((meal) => meal.date))) {
    for (const tag of weatherFeaturesByDate[date]?.tags ?? []) addCount(weatherTagCounts, tag);
    const calendarDay = calendarFeaturesByDate[date];
    if (calendarDay?.bankHoliday) bankHolidayDinnerCount += 1;
    for (const feature of calendarDay?.appointmentFeatures ?? []) {
      addCount(calendarFeatureCounts, feature);
    }
  }

  const weatherByDate = new Map(weatherDays.map((day) => [day.date, day]));
  const hottestDinnerDay = meals
    .flatMap((meal) => {
      const weather = weatherByDate.get(meal.date);
      if (!weather) return [];
      return [
        {
          date: meal.date,
          recipeName: meal.recipe.name,
          value: Math.round(weather.tempMaxC),
          tempMaxC: weather.tempMaxC,
          label: '°C high',
        },
      ];
    })
    .sort((left, right) => right.tempMaxC - left.tempMaxC)[0];

  const { highestRatedRecipes, mostImprovedRecipe } = buildRatingHighlights(
    cookLogs,
    recipesById,
    year,
  );
  const limitations = [
    'Only meal-plan entries whose meal type is named “dinner” are included.',
    'Household produce gram totals are scaled by meal-plan servings divided by recipe servings; per-person produce uses one recipe serving.',
    'Produce-by-grams only includes ingredients recorded directly in grams or kilograms.',
    'Nutrition is always per person (one recipe serving) using Tandoor food properties where available, falling back to legacy recipe nutrition fields.',
  ];
  if (!produceCategoryName)
    limitations.push(
      'No produce category name was configured, so produce facts use gram-measured ingredients rather than a category whitelist.',
    );
  else if (!hasProduceWhitelist)
    limitations.push(
      `No foods were found in the configured “${produceCategoryName}” produce category, so produce facts use gram-measured ingredients rather than a category whitelist.`,
    );
  if (weatherDays.length === 0 && weatherTagCounts.size === 0)
    limitations.push(
      'Weather facts are omitted because no cached weather data was available for the selected year.',
    );
  else if (weatherDays.length === 0)
    limitations.push(
      'Weather facts use cached weather bands rather than exact temperatures, so hottest-day temperature cards may be unavailable.',
    );

  return {
    year,
    generatedAt: now.toISOString(),
    dateRange: { from: `${year}-01-01`, to: toDate },
    scope: 'Dinner meal-plan entries only; breakfast and lunch are intentionally excluded.',
    mealCount: meals.length,
    totalHouseholdServings: Number(totalHouseholdServings.toFixed(1)),
    averageHouseholdServingsPerDinner: meals.length
      ? Number((totalHouseholdServings / meals.length).toFixed(1))
      : 0,
    uniqueRecipeCount: new Set(meals.map((meal) => meal.recipe.id)).size,
    uniqueIngredientCount: ingredientCounts.size,
    topProduceByGrams: topGramItems(produceGrams),
    topProduceByPersonGrams: topGramItems(producePersonGrams),
    produceGramCoverageMealCount: produceCoverageMealCount,
    mostFrequentIngredients: topItems(ingredientCounts, meals.length),
    nutrition: {
      mealsWithCalories: caloriesCount,
      mealsWithProtein: proteinCount,
      mealsWithFibre: fibreCount,
      averageCaloriesPerPortion: caloriesCount
        ? Math.round(caloriesTotal / caloriesCount)
        : undefined,
      averageProteinGPerPortion: proteinCount
        ? Number((proteinTotal / proteinCount).toFixed(1))
        : undefined,
      averageFibreGPerPortion: fibreCount
        ? Number((fibreTotal / fibreCount).toFixed(1))
        : undefined,
      highestProteinDay: bestProteinDay,
      highestFibreMonth,
    },
    repeats: {
      mostRepeatedMeals: topItems(recipeCounts, meals.length).map((item) => ({
        recipeName: item.name,
        value: item.count ?? 0,
        label: `${Math.round((item.share ?? 0) * 100)}% of dinners`,
      })),
      longestReturnGap,
      newRecipesRepeated,
    },
    ratings: { highestRatedRecipes, mostImprovedRecipe },
    cuisine: {
      source:
        dinnerChildKeywords.size > 0
          ? 'children of the dinner keyword'
          : 'recipe keywords excluding dinner',
      topDinnerKeywords: topItems(keywordCounts, meals.length),
      weekdayPersonalities,
      longestCuisineStreak: longestStreakByDay(keywordValuesByDate)[0],
    },
    streaks: { ingredientStreaks: longestStreakByDay(ingredientValuesByDate) },
    takeaway: {
      count: takeawayMeals.length,
      previousYearCount: previousYearTakeawayCount,
      deltaFromPreviousYear: takeawayMeals.length - previousYearTakeawayCount,
      favouriteWeekday: topItems(takeawayWeekdays, takeawayMeals.length, 1).map((item) => ({
        recipeName: item.name,
        value: item.count ?? 0,
        label: 'takeaway dinners',
      }))[0],
      longestNoTakeawayStreakDays: longestNoTakeawayStreak(meals),
    },
    cookingEffort: {
      totalMinutes: totalCookingMinutes,
      assumedDefaultMinutesCount,
      takeawayExcludedCount,
    },
    records: {
      mostProduceInOneMeal,
      mostIngredientsInOneMeal,
      newRecipesTried: recipes.filter(
        (recipe) => recipe.created_at && isDateInYear(recipe.created_at, year),
      ).length,
    },
    weather:
      hottestDinnerDay || weatherTagCounts.size > 0
        ? {
            ...(hottestDinnerDay ? { hottestDinnerDay } : {}),
            topDinnerWeatherSignals: topItems(weatherTagCounts, meals.length).map((item) => ({
              ...item,
              name: weatherTagLabel(item.name),
            })),
          }
        : undefined,
    calendar: {
      bankHolidayDinnerCount,
      topAppointmentSignals: topItems(calendarFeatureCounts, meals.length).map((item) => ({
        ...item,
        name: describeCalendarAppointmentFeature(item.name),
      })),
    },
    limitations,
  };
}
