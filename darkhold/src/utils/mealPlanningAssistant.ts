import type { MealPlan, Recipe } from '../api/tandoor-types';
import type {
  CalendarEventsByDate,
  CalendarEvent,
  CalendarEventCategory,
} from '../hooks/useCalendarEvents';
import type { WeatherByDate, WeatherDayForecast } from '../hooks/useWeatherForecast';
import { formatDate, parseLocalDate } from './dateUtils';
import { mealAssistantDayNumberToDate } from './mealAssistantPrecalculation';
import type {
  MealAssistantPrecalculation,
  MealAssistantRecipeHistory,
  MealAssistantRecipeInsight,
  MealAssistantRecipeSummary,
} from './mealAssistantPrecalculation';
import { buildCalendarFeatureDay, describeCalendarAppointmentFeature } from './calendarFeatures';
import { deriveWeatherFeatures, weatherTagLabel } from './weatherFeatures';
import { RECENTLY_ADDED_DAYS } from './recentRecipes';

export const UNSUITABLE_DINNER_TAG_FRAGMENTS = [
  'drink',
  'drinks',
  'lunch',
  'breakfast',
  'baking',
  'dessert',
  'snack',
];
const DEFAULT_DINNER_TIME_MINUTES = 18 * 60;
const DINNER_WINDOW_MINUTES = 90;
const LONG_EVENT_THRESHOLD_MINUTES = 120;
const RECENT_WINDOW_DAYS = 14;
const REGULAR_WINDOW_DAYS = 42;
const TAKEAWAY_LOOKBACK_DAYS = 21;
const DEFAULT_EVENT_CATEGORY: CalendarEventCategory = 'appointment';
const MIN_ACCEPTABLE_RATING = 1;
const MIN_REGULAR_RECIPE_COUNT = 2;
const SAME_CATEGORY_PENALTY_THRESHOLD = 2;
const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;
const DUE_AGAIN_MAX_SCORE = 12;
const DUE_AGAIN_MIN_SCORE = 2;
const DUE_AGAIN_SCORE_PER_CADENCE = 8;

const CATEGORY_ROLE_TAGS = {
  pasta: ['pasta'],
  rice: ['rice'],
  noodles: ['noodles', 'noodle'],
  'soy-free': ['soy-free', 'soy free'],
} as const;

const PRODUCE_FREE_OCCURRENCES_PER_WEEK = 1;
const PRODUCE_REPEAT_PENALTY_BASE = 10;
const SAME_CLUSTER_PENALTY_BASE = 12;
const SIMILAR_ALTERNATIVE_BONUS_SCALE = 20;
const BEAM_WIDTH = 5;

const GENERAL_DINNER_ROLE_LABEL = 'General dinner';

export type MealAssistantRole =
  | 'special-day'
  | 'busy-day'
  | 'good-weather'
  | 'takeaway'
  | 'general-lunch'
  | keyof typeof CATEGORY_ROLE_TAGS
  | 'general-dinner';

export interface MealAssistantScoreComponent {
  key: string;
  label: string;
  score: number;
  detail: string;
}

export interface MealAssistantCandidateAnalysis {
  recipe: Recipe;
  role: MealAssistantRole;
  score: number;
  components: MealAssistantScoreComponent[];
  warnings: string[];
}

export interface MealAssistantCandidateExclusion {
  recipe: Recipe;
  reason: string;
  detail: string;
}

export interface MealAssistantSlotPlan {
  date: string;
  role: MealAssistantRole;
  roleLabel: string;
  roleFlavourDetail?: string;
  selected: MealAssistantCandidateAnalysis;
  alternatives: MealAssistantCandidateAnalysis[];
  hardExclusions?: MealAssistantCandidateExclusion[];
}

export interface MealAssistantPlan {
  slots: MealAssistantSlotPlan[];
  issues: string[];
}

export interface MealAssistantInput {
  weekStart: Date;
  weekEnd: Date;
  emptyDinnerDates: string[];
  planType?: 'dinner' | 'lunch';
  existingWeekMeals: MealPlan[];
  historicalMeals: MealPlan[];
  recipes: Recipe[];
  keywordNameById?: Record<number, string>;
  upSoonRecipeIds?: Iterable<number>;
  calendarEventsByDate?: CalendarEventsByDate;
  weatherByDate?: WeatherByDate;
  publicHolidayDates?: string[];
  dinnerTime?: string | null;
  specialDates?: Array<{
    date: string;
    reason: string;
  }>;
  produceFoodNames?: readonly string[];
  precalculation?: MealAssistantPrecalculation;
}

interface ScoringContext {
  date: string;
  role: MealAssistantRole;
  upSoonRecipeIds: Set<number>;
  regularRecipeIds: Set<number>;
  recipeHistoryById: Map<number, MealAssistantRecipeHistory>;
  weekTagCounts: Map<string, number>;
  weekClusterCounts: Map<string, number>;
  weekProduceCounts: Map<string, number>;
  produceFoodNames: readonly string[];
  precalculation?: MealAssistantPrecalculation;
  weatherTags?: string[];
  calendarFeatures?: string[];
}

interface SlotRole {
  date: string;
  role: MealAssistantRole;
}

function recipeIdOf(entry: MealPlan): number | null {
  if (typeof entry.recipe === 'number') return entry.recipe;
  return entry.recipe?.id ?? null;
}

function normalizeKeyword(value: string): string {
  return value.trim().toLowerCase();
}

export function getRecipeKeywordNames(
  recipe: Pick<Recipe, 'keywords'>,
  keywordNameById: Record<number, string> = {},
): string[] {
  if (!Array.isArray(recipe.keywords)) return [];
  return recipe.keywords.flatMap((keyword) => {
    if (typeof keyword === 'object' && keyword !== null && !Array.isArray(keyword)) {
      if (typeof keyword.name === 'string') return [keyword.name];
      const resolved = typeof keyword.id === 'number' ? keywordNameById[keyword.id] : undefined;
      return resolved ? [resolved] : [];
    }
    const resolved = keywordNameById[keyword as number];
    return resolved ? [resolved] : [];
  });
}

function recipeKeywordSet(recipe: Recipe, keywordNameById: Record<number, string>): Set<string> {
  return new Set(getRecipeKeywordNames(recipe, keywordNameById).map(normalizeKeyword));
}

function recipeNameIncludesFragment(recipe: Recipe, fragments: readonly string[]): boolean {
  const normalizedName = normalizeKeyword(recipe.name);
  return fragments.some((fragment) => normalizedName.includes(normalizeKeyword(fragment)));
}

function recipeHasKeywordFragment(
  recipe: Recipe,
  fragments: readonly string[],
  keywordNameById: Record<number, string>,
): boolean {
  const keywords = getRecipeKeywordNames(recipe, keywordNameById).map(normalizeKeyword);
  return fragments.some((fragment) => {
    const normalized = normalizeKeyword(fragment);
    return keywords.some((keyword) => keyword.includes(normalized));
  });
}

function recipeHasFragment(
  recipe: Recipe,
  fragments: readonly string[],
  keywordNameById: Record<number, string>,
): boolean {
  return (
    recipeNameIncludesFragment(recipe, fragments) ||
    recipeHasKeywordFragment(recipe, fragments, keywordNameById)
  );
}

function recipeMatchesCategoryRole(
  recipe: Recipe,
  role: keyof typeof CATEGORY_ROLE_TAGS,
  keywordNameById: Record<number, string>,
): boolean {
  return recipeHasFragment(recipe, CATEGORY_ROLE_TAGS[role], keywordNameById);
}

function isCategoryRole(role: MealAssistantRole): role is keyof typeof CATEGORY_ROLE_TAGS {
  return role in CATEGORY_ROLE_TAGS;
}

function parseMealDate(entry: Pick<MealPlan, 'from_date'>): Date | null {
  const value = entry.from_date.includes('T') ? entry.from_date.split('T')[0] : entry.from_date;
  return parseLocalDate(value);
}

function parseMealDayNumber(entry: Pick<MealPlan, 'from_date'>): number | null {
  const value = entry.from_date.includes('T') ? entry.from_date.split('T')[0] : entry.from_date;
  const [year, month, day] = value.split('-').map((part) => Number.parseInt(part, 10));
  if (![year, month, day].every((part) => Number.isFinite(part))) return null;
  return Math.floor(Date.UTC(year, month - 1, day) / (24 * 60 * 60 * 1000));
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toMonthDayKey(date: Date): string {
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseMonthDayKey(value: string): string | null {
  const parsed = parseLocalDate(value);
  if (!parsed) return null;
  return toMonthDayKey(parsed);
}

function getSpecialDateReasonForDate(
  date: string,
  specialDateReasonsByMonthDay: ReadonlyMap<string, string>,
): string | undefined {
  const monthDayKey = parseMonthDayKey(date);
  return monthDayKey ? specialDateReasonsByMonthDay.get(monthDayKey) : undefined;
}

function parseTimeToMinutes(value: string | null | undefined): number {
  if (!value) return DEFAULT_DINNER_TIME_MINUTES;
  const [hoursRaw, minutesRaw] = value.split(':');
  if (minutesRaw === undefined) return DEFAULT_DINNER_TIME_MINUTES;
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return DEFAULT_DINNER_TIME_MINUTES;
  return hours * 60 + minutes;
}

function timedEventRangeInMinutes(event: CalendarEvent): { start: number; end: number } | null {
  if (event.allDay) return null;
  const start = new Date(event.start);
  if (Number.isNaN(start.getTime())) return null;
  const end = event.end ? new Date(event.end) : new Date(start.getTime() + 60 * 60 * 1000);
  if (Number.isNaN(end.getTime())) return null;
  return {
    start: start.getHours() * 60 + start.getMinutes(),
    end: end.getHours() * 60 + end.getMinutes(),
  };
}

export function isBusyDinnerDay(
  events: CalendarEvent[],
  dinnerTime: string | null | undefined,
): boolean {
  const appointmentEvents = events.filter(
    (event) => (event.category ?? DEFAULT_EVENT_CATEGORY) === DEFAULT_EVENT_CATEGORY,
  );
  if (appointmentEvents.length === 0) return false;
  const dinnerMinutes = parseTimeToMinutes(dinnerTime);
  const dinnerWindowStart = dinnerMinutes - DINNER_WINDOW_MINUTES;
  const dinnerWindowEnd = dinnerMinutes + DINNER_WINDOW_MINUTES;

  return appointmentEvents.some((event) => {
    const range = timedEventRangeInMinutes(event);
    if (!range) return false;
    const duration = Math.max(0, range.end - range.start);
    if (duration >= LONG_EVENT_THRESHOLD_MINUTES) return true;
    return range.start < dinnerWindowEnd && range.end > dinnerWindowStart;
  });
}

export function getCalendarEventDatesByCategory(
  calendarEventsByDate: CalendarEventsByDate,
  category: CalendarEventCategory,
): Set<string> {
  const dates = new Set<string>();
  for (const [date, events] of Object.entries(calendarEventsByDate)) {
    if (events.some((event) => event.category === category)) {
      dates.add(date);
    }
  }
  return dates;
}

export function isGoodWeatherDay(
  date: string,
  weather: WeatherDayForecast | undefined,
  publicHolidayDates: Set<string>,
): boolean {
  if (!weather) return false;
  const parsed = parseLocalDate(date);
  if (!parsed) return false;
  const isWeekend = parsed.getDay() === 0 || parsed.getDay() === 6;
  const isPublicHoliday = publicHolidayDates.has(date);
  if (!isWeekend && !isPublicHoliday) return false;
  const features = deriveWeatherFeatures(weather);
  return features.outdoorSuitability === 'good';
}

function getSeasonKey(date: Date): string {
  const month = date.getMonth() + 1;
  if (month === 12 || month <= 2) return 'winter';
  if (month <= 5) return 'spring';
  if (month <= 8) return 'summer';
  return 'autumn';
}

function getPrecalculatedRecipeInsight(
  precalculation: MealAssistantPrecalculation | undefined,
  recipeId: number,
): MealAssistantRecipeInsight | undefined {
  return precalculation?.recipeInsights[String(recipeId)];
}

function getPrecalculatedRecipeClusterMembership(
  precalculation: MealAssistantPrecalculation | undefined,
  recipeId: number,
) {
  return precalculation?.recipeClusterMemberships[String(recipeId)];
}

function getPrecalculatedSimilarRecipes(
  precalculation: MealAssistantPrecalculation | undefined,
  recipeId: number,
) {
  return precalculation?.recipeSimilarities[String(recipeId)] ?? [];
}

function getPrecalculatedProduceTags(
  recipe: Recipe,
  precalculation: MealAssistantPrecalculation | undefined,
): string[] | undefined {
  const features = precalculation?.recipeFeatures[String(recipe.id)];
  if (features) return features.produce;
  const insight = getPrecalculatedRecipeInsight(precalculation, recipe.id);
  return insight?.produce;
}

function compactSummaryToRecipe(
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

function precalculationRecipes(precalculation: MealAssistantPrecalculation | undefined): Recipe[] {
  if (!precalculation) return [];
  return Object.values(precalculation.recipes).map((summary) =>
    compactSummaryToRecipe(summary, precalculation),
  );
}

function mealHistoryToMealPlans(precalculation: MealAssistantPrecalculation): MealPlan[] {
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

function buildRecipeHistoryById(entries: MealPlan[]): Map<number, MealAssistantRecipeHistory> {
  const dayNumbersByRecipe = new Map<number, number[]>();
  for (const entry of entries) {
    const recipeId = recipeIdOf(entry);
    if (!recipeId) continue;
    const dayNumber = parseMealDayNumber(entry);
    if (dayNumber == null) continue;
    const dayNumbers = dayNumbersByRecipe.get(recipeId) ?? [];
    dayNumbers.push(dayNumber);
    dayNumbersByRecipe.set(recipeId, dayNumbers);
  }

  const historyByRecipeId = new Map<number, MealAssistantRecipeHistory>();
  for (const [recipeId, dayNumbers] of dayNumbersByRecipe.entries()) {
    const sortedDayNumbers = dayNumbers.slice().sort((left, right) => left - right);
    const dayCounts: MealAssistantRecipeHistory['dayCounts'] = [0, 0, 0, 0, 0, 0, 0];
    const seasonCounts: MealAssistantRecipeHistory['seasonCounts'] = [0, 0, 0, 0];
    for (const dayNumber of sortedDayNumbers) {
      const date = parseLocalDate(mealAssistantDayNumberToDate(dayNumber));
      if (!date) continue;
      dayCounts[date.getDay()] += 1;
      const month = date.getMonth() + 1;
      const seasonIndex = month === 12 || month <= 2 ? 0 : month <= 5 ? 1 : month <= 8 ? 2 : 3;
      seasonCounts[seasonIndex] += 1;
    }
    const dayDiffs: number[] = [];
    for (let index = 1; index < sortedDayNumbers.length; index += 1) {
      dayDiffs.push(sortedDayNumbers[index] - sortedDayNumbers[index - 1]);
    }
    const averageDaysBetweenPlans =
      dayDiffs.length > 0
        ? Math.round(
            (dayDiffs.reduce((total, value) => total + value, 0) / dayDiffs.length) * 100,
          ) / 100
        : undefined;
    const sortedDiffs = dayDiffs.slice().sort((left, right) => left - right);
    const medianDaysBetweenPlans =
      sortedDiffs.length === 0
        ? undefined
        : sortedDiffs.length % 2 === 0
          ? (sortedDiffs[sortedDiffs.length / 2 - 1] + sortedDiffs[sortedDiffs.length / 2]) / 2
          : sortedDiffs[Math.floor(sortedDiffs.length / 2)];
    historyByRecipeId.set(recipeId, {
      dates: sortedDayNumbers,
      dayCounts,
      seasonCounts,
      totalPlanCount: sortedDayNumbers.length,
      firstPlannedDate: sortedDayNumbers[0],
      lastPlannedDate: sortedDayNumbers[sortedDayNumbers.length - 1],
      averageDaysBetweenPlans,
      medianDaysBetweenPlans:
        medianDaysBetweenPlans == null ? undefined : Math.round(medianDaysBetweenPlans * 100) / 100,
    });
  }
  return historyByRecipeId;
}

function getRecipeHistoryForScoring(
  recipeId: number,
  context: ScoringContext,
): MealAssistantRecipeHistory | undefined {
  return (
    context.precalculation?.recipeHistory[String(recipeId)] ??
    context.recipeHistoryById.get(recipeId)
  );
}

function countRecipesWithinWindow(
  entries: MealPlan[],
  fromDate: Date,
  toDate: Date,
): Map<number, number> {
  const counts = new Map<number, number>();
  const fromMs = fromDate.getTime();
  const toMs = toDate.getTime();
  for (const entry of entries) {
    const recipeId = recipeIdOf(entry);
    const mealDate = parseMealDate(entry);
    if (!recipeId || !mealDate) continue;
    const mealTime = mealDate.getTime();
    if (mealTime < fromMs || mealTime > toMs) continue;
    counts.set(recipeId, (counts.get(recipeId) ?? 0) + 1);
  }
  return counts;
}

function buildWeekTagCounts(
  entries: MealPlan[],
  keywordNameById: Record<number, string>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    if (typeof entry.recipe !== 'object' || !entry.recipe) continue;
    for (const trackedTag of Object.keys(CATEGORY_ROLE_TAGS)) {
      if (
        !recipeMatchesCategoryRole(
          entry.recipe,
          trackedTag as keyof typeof CATEGORY_ROLE_TAGS,
          keywordNameById,
        )
      )
        continue;
      counts.set(trackedTag, (counts.get(trackedTag) ?? 0) + 1);
    }
  }
  return counts;
}

export function getRecipeProduceTags(
  recipe: Recipe,
  keywordNameById: Record<number, string>,
  produceFoodNames: readonly string[],
): string[] {
  return produceFoodNames.filter((foodName) =>
    recipeHasFragment(recipe, [foodName], keywordNameById),
  );
}

function getRecipeProduceTagsForScoring(
  recipe: Recipe,
  keywordNameById: Record<number, string>,
  produceFoodNames: readonly string[],
  precalculation?: MealAssistantPrecalculation,
): string[] {
  return (
    getPrecalculatedProduceTags(recipe, precalculation) ??
    getRecipeProduceTags(recipe, keywordNameById, produceFoodNames)
  );
}

function buildWeekProduceCounts(
  entries: MealPlan[],
  keywordNameById: Record<number, string>,
  produceFoodNames: readonly string[],
  precalculation?: MealAssistantPrecalculation,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    if (typeof entry.recipe !== 'object' || !entry.recipe) continue;
    for (const produce of getRecipeProduceTagsForScoring(
      entry.recipe,
      keywordNameById,
      produceFoodNames,
      precalculation,
    )) {
      counts.set(produce, (counts.get(produce) ?? 0) + 1);
    }
  }
  return counts;
}

function buildWeekClusterCounts(
  entries: MealPlan[],
  precalculation: MealAssistantPrecalculation | undefined,
): Map<string, number> {
  const counts = new Map<string, number>();
  if (!precalculation) return counts;
  for (const entry of entries) {
    const recipeId = recipeIdOf(entry);
    if (!recipeId) continue;
    const membership = getPrecalculatedRecipeClusterMembership(precalculation, recipeId);
    if (!membership) continue;
    counts.set(membership.clusterId, (counts.get(membership.clusterId) ?? 0) + 1);
  }
  return counts;
}

function updateWeekProduceCounts(
  counts: Map<string, number>,
  recipe: Recipe,
  keywordNameById: Record<number, string>,
  produceFoodNames: readonly string[],
  precalculation?: MealAssistantPrecalculation,
): Map<string, number> {
  const next = new Map(counts);
  for (const produce of getRecipeProduceTagsForScoring(
    recipe,
    keywordNameById,
    produceFoodNames,
    precalculation,
  )) {
    next.set(produce, (next.get(produce) ?? 0) + 1);
  }
  return next;
}

function updateWeekClusterCounts(
  counts: Map<string, number>,
  recipe: Recipe,
  precalculation: MealAssistantPrecalculation | undefined,
): Map<string, number> {
  const membership = getPrecalculatedRecipeClusterMembership(precalculation, recipe.id);
  if (!membership) return counts;
  const next = new Map(counts);
  next.set(membership.clusterId, (next.get(membership.clusterId) ?? 0) + 1);
  return next;
}

function toTitleCase(value: string): string {
  return value
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatSharedTerms(values: readonly string[]): string {
  return values.map((value) => toTitleCase(value)).join(', ');
}

function createSeed(value: string): number {
  // FNV-1a 32-bit hash keeps role assignment deterministic for a given week,
  // which avoids unstable plans and still lets us "shuffle" without Math.random().
  let hash = FNV_OFFSET_BASIS;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

function shuffleDeterministically<T>(values: T[], seedValue: string): T[] {
  const shuffled = values.slice();
  let seed = createSeed(seedValue);
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    seed = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    const nextIndex = Math.abs(seed) % (index + 1);
    [shuffled[index], shuffled[nextIndex]] = [shuffled[nextIndex], shuffled[index]];
  }
  return shuffled;
}

function roleLabel(role: MealAssistantRole): string {
  if (role === 'special-day') return 'Special day';
  if (role === 'busy-day') return 'Busy day';
  if (role === 'good-weather') return 'Good weather day';
  if (role === 'takeaway') return 'Takeaway night';
  if (role === 'general-lunch') return 'General lunch';
  if (role === 'general-dinner') return GENERAL_DINNER_ROLE_LABEL;
  return toTitleCase(role);
}

function buildRoleFlavourDetail(
  date: string,
  role: MealAssistantRole,
  events: CalendarEvent[],
  weather: WeatherDayForecast | undefined,
  publicHolidayDates: Set<string>,
  dinnerTime: string | null | undefined,
  specialDateReason: string | undefined,
): string {
  if (role === 'special-day') {
    if (specialDateReason) return `Picked a special meal for ${specialDateReason}.`;
    return 'Picked a special meal for this special day.';
  }

  if (role === 'busy-day') {
    const appointmentEvents = events.filter(
      (event) => (event.category ?? DEFAULT_EVENT_CATEGORY) === DEFAULT_EVENT_CATEGORY,
    );
    const dinnerMinutes = parseTimeToMinutes(dinnerTime);
    const dinnerWindowStart = dinnerMinutes - DINNER_WINDOW_MINUTES;
    const dinnerWindowEnd = dinnerMinutes + DINNER_WINDOW_MINUTES;
    const triggeringEvents = appointmentEvents.filter((event) => {
      const range = timedEventRangeInMinutes(event);
      if (!range) return false;
      const duration = Math.max(0, range.end - range.start);
      if (duration >= LONG_EVENT_THRESHOLD_MINUTES) return true;
      return range.start < dinnerWindowEnd && range.end > dinnerWindowStart;
    });
    const allNames = [...new Set(triggeringEvents.map((e) => e.name).filter(Boolean))];
    const names = allNames.slice(0, 2);
    const remainder = allNames.length - names.length;
    if (names.length === 1 && remainder === 0) return `Busy because of: ${names[0]}.`;
    if (names.length > 1 && remainder === 0) return `Busy because of: ${names.join(' and ')}.`;
    if (names.length > 0 && remainder > 0)
      return `Busy because of: ${names.join(', ')} and ${remainder} more.`;
    return 'Appointments make this a busy evening.';
  }

  if (role === 'good-weather') {
    const isPublicHoliday = publicHolidayDates.has(date);
    const parsed = parseLocalDate(date);
    let dayType: string;
    if (isPublicHoliday) {
      const bankHolidayName = events.find((e) => e.category === 'bank-holiday')?.name;
      dayType = bankHolidayName ?? 'bank holiday';
    } else if (parsed?.getDay() === 0) {
      dayType = 'Sunday';
    } else {
      dayType = 'Saturday';
    }
    const tempStr = weather ? `${Math.round(weather.tempMaxC)}°` : 'pleasant';
    return `Good weather on a ${dayType} – ${tempStr} and low chance of rain.`;
  }

  if (role === 'takeaway') {
    return `Takeaway hasn't come up in the last ${TAKEAWAY_LOOKBACK_DAYS} days.`;
  }

  if (isCategoryRole(role)) {
    return `Try to have at least one ${role} dish this week.`;
  }

  if (role === 'general-lunch') {
    const isPublicHoliday = publicHolidayDates.has(date);
    if (isPublicHoliday) {
      const bankHolidayName = events.find((e) => e.category === 'bank-holiday')?.name;
      return bankHolidayName ? `It's ${bankHolidayName}.` : "It's a bank holiday.";
    }
    const parsed = parseLocalDate(date);
    const day = parsed?.getDay();
    if (day === 0 || day === 6) return "It's the weekend.";
    return '';
  }

  return '';
}

function buildSlotRoles(
  emptyDinnerDates: string[],
  planType: 'dinner' | 'lunch',
  calendarEventsByDate: CalendarEventsByDate,
  weatherByDate: WeatherByDate,
  publicHolidayDates: Set<string>,
  dinnerTime: string | null | undefined,
  shouldSuggestTakeaway: boolean,
  weekSeed: string,
  specialDateReasonsByDate: ReadonlyMap<string, string>,
): SlotRole[] {
  const rolesByDate = new Map<string, MealAssistantRole>();
  const remainingDates = emptyDinnerDates.slice();

  for (const date of emptyDinnerDates) {
    const monthDayKey = parseMonthDayKey(date);
    if (monthDayKey && specialDateReasonsByDate.has(monthDayKey)) {
      rolesByDate.set(date, 'special-day');
    }
  }

  if (planType === 'lunch') {
    return emptyDinnerDates
      .map((date) => ({ date, role: rolesByDate.get(date) ?? ('general-lunch' as const) }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  for (const date of emptyDinnerDates) {
    if (rolesByDate.has(date)) continue;
    const events = calendarEventsByDate[date] ?? [];
    if (isBusyDinnerDay(events, dinnerTime)) {
      rolesByDate.set(date, 'busy-day');
    }
  }

  for (const date of emptyDinnerDates) {
    if (rolesByDate.has(date)) continue;
    if (isGoodWeatherDay(date, weatherByDate[date], publicHolidayDates)) {
      rolesByDate.set(date, 'good-weather');
    }
  }

  if (shouldSuggestTakeaway) {
    const candidates = remainingDates.filter((date) => !rolesByDate.has(date));
    const selectedDate = shuffleDeterministically(candidates, `${weekSeed}:takeaway`)[0];
    if (selectedDate) {
      rolesByDate.set(selectedDate, 'takeaway');
    }
  }

  const categoryDates = shuffleDeterministically(
    remainingDates.filter((date) => !rolesByDate.has(date)),
    `${weekSeed}:categories`,
  );
  (Object.keys(CATEGORY_ROLE_TAGS) as Array<keyof typeof CATEGORY_ROLE_TAGS>).forEach(
    (role, index) => {
      const targetDate = categoryDates[index];
      if (targetDate) rolesByDate.set(targetDate, role);
    },
  );

  return emptyDinnerDates
    .map((date) => ({ date, role: rolesByDate.get(date) ?? 'general-dinner' }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function getBaseFilterExclusion(
  recipe: Recipe,
  keywordNameById: Record<number, string>,
  recentRecipeIds: Set<number>,
  planType: 'dinner' | 'lunch',
): MealAssistantCandidateExclusion | null {
  if (recipe.rating != null && recipe.rating <= MIN_ACCEPTABLE_RATING) {
    return {
      recipe,
      reason: 'Low rating',
      detail: `Filtered out because its rating is ${recipe.rating} star${recipe.rating === 1 ? '' : 's'}.`,
    };
  }
  if (!recipe.image) {
    return {
      recipe,
      reason: 'Missing image',
      detail: 'Filtered out because it does not have a recipe image yet.',
    };
  }
  if (recentRecipeIds.has(recipe.id)) {
    return {
      recipe,
      reason: 'Recently planned',
      detail: `Filtered out because it appeared in the last ${RECENT_WINDOW_DAYS} days.`,
    };
  }
  if (planType === 'lunch') {
    if (!recipeHasKeywordFragment(recipe, ['lunch'], keywordNameById)) {
      return {
        recipe,
        reason: 'Not a lunch recipe',
        detail: 'Filtered out because lunch planning only considers recipes tagged for lunch.',
      };
    }
    return null;
  }
  if (recipeHasFragment(recipe, UNSUITABLE_DINNER_TAG_FRAGMENTS, keywordNameById)) {
    return {
      recipe,
      reason: 'Unsuitable dinner tag',
      detail:
        'Filtered out because it looks like breakfast, lunch, a drink, baking, dessert, or a snack.',
    };
  }
  return null;
}

function recipePassesBaseFilters(
  recipe: Recipe,
  keywordNameById: Record<number, string>,
  recentRecipeIds: Set<number>,
  planType: 'dinner' | 'lunch',
): boolean {
  return getBaseFilterExclusion(recipe, keywordNameById, recentRecipeIds, planType) == null;
}

function recipeMatchesRole(
  recipe: Recipe,
  role: MealAssistantRole,
  keywordNameById: Record<number, string>,
): boolean {
  if (role === 'general-dinner' || role === 'general-lunch') return true;
  if (role === 'special-day') {
    return recipeHasFragment(recipe, ['special'], keywordNameById);
  }
  if (role === 'busy-day') {
    return (
      recipeHasFragment(recipe, ['busy', 'quick', 'quickies'], keywordNameById) ||
      isTakeawayRecipe(recipe, keywordNameById)
    );
  }
  if (role === 'good-weather') {
    return recipeHasFragment(recipe, ['outdoors'], keywordNameById);
  }
  if (role === 'takeaway') {
    return isTakeawayRecipe(recipe, keywordNameById);
  }
  return recipeMatchesCategoryRole(recipe, role, keywordNameById);
}

function isTakeawayRecipe(recipe: Recipe, keywordNameById: Record<number, string>): boolean {
  return recipeHasFragment(recipe, ['takeaway', 'placeholder'], keywordNameById);
}

function scoreRecipe(
  recipe: Recipe,
  keywordNameById: Record<number, string>,
  context: ScoringContext,
): MealAssistantCandidateAnalysis {
  const components: MealAssistantScoreComponent[] = [];
  const warnings: string[] = [];
  const parsedDate = parseLocalDate(context.date);
  const dateDay = parsedDate?.getDay() ?? 0;
  const season = parsedDate ? getSeasonKey(parsedDate) : '';
  const recipeKeywords = recipeKeywordSet(recipe, keywordNameById);

  if (context.role === 'special-day') {
    if (recipeHasFragment(recipe, ['special'], keywordNameById)) {
      components.push({
        key: 'role-fit',
        label: 'Special day pick',
        score: 20,
        detail: 'Tagged as a special recipe for a configured occasion.',
      });
    }
  } else if (context.role === 'busy-day') {
    const busyMatched = recipeHasFragment(recipe, ['busy', 'quick', 'quickies'], keywordNameById);
    const takeawayMatched = isTakeawayRecipe(recipe, keywordNameById);
    if (busyMatched || takeawayMatched) {
      components.push({
        key: 'role-fit',
        label: 'Fits the day',
        score: takeawayMatched && !busyMatched ? 12 : 16,
        detail:
          takeawayMatched && !busyMatched
            ? 'Useful quick fallback for a busy evening.'
            : 'Tagged for busy or quick dinners.',
      });
    }
  } else if (context.role === 'good-weather') {
    if (recipeHasFragment(recipe, ['outdoors'], keywordNameById)) {
      components.push({
        key: 'role-fit',
        label: 'Fits the day',
        score: 16,
        detail: 'Tagged for outdoor or warm-weather eating.',
      });
    }
  } else if (context.role === 'takeaway') {
    if (isTakeawayRecipe(recipe, keywordNameById)) {
      components.push({
        key: 'role-fit',
        label: 'Takeaway slot',
        score: 18,
        detail: `Takeaway has been out of rotation for roughly ${TAKEAWAY_LOOKBACK_DAYS} days.`,
      });
    }
  } else if (isCategoryRole(context.role)) {
    if (recipeMatchesCategoryRole(recipe, context.role, keywordNameById)) {
      components.push({
        key: 'role-fit',
        label: 'Flavour role match',
        score: 12,
        detail: `Matches the ${roleLabel(context.role).toLowerCase()} slot.`,
      });
    }
  }

  if (context.upSoonRecipeIds.has(recipe.id)) {
    components.push({
      key: 'up-soon',
      label: 'Up Soon shelf',
      score: 24,
      detail: 'Already marked as something to cook soon.',
    });
  }

  if (context.regularRecipeIds.has(recipe.id)) {
    components.push({
      key: 'regular',
      label: 'Regular',
      score: 16,
      detail: 'A reliable repeat that has shown up often in recent weeks.',
    });
  }

  if (recipe.created_at) {
    const rawCreated = recipe.created_at.includes('T')
      ? recipe.created_at.split('T')[0]
      : recipe.created_at;
    const createdDate = parseLocalDate(rawCreated);
    const slotDate = parseLocalDate(context.date);
    if (createdDate && slotDate) {
      const daysSinceAdded = Math.floor(
        (slotDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysSinceAdded >= 0 && daysSinceAdded <= RECENTLY_ADDED_DAYS) {
        components.push({
          key: 'recently-added',
          label: 'Recently added',
          score: 6,
          detail: 'Still fresh enough to be worth trying soon.',
        });
      }
    }
  }

  const insight = getPrecalculatedRecipeInsight(context.precalculation, recipe.id);
  const history = getRecipeHistoryForScoring(recipe.id, context);
  const slotDayNumber = parseMealDayNumber({ from_date: context.date });
  const cadenceDays = history?.medianDaysBetweenPlans ?? history?.averageDaysBetweenPlans;
  if (
    history &&
    slotDayNumber != null &&
    history.lastPlannedDate != null &&
    cadenceDays != null &&
    cadenceDays > 0
  ) {
    const daysSinceLastPlanned = slotDayNumber - history.lastPlannedDate;
    if (daysSinceLastPlanned > cadenceDays) {
      const overdueRatio = (daysSinceLastPlanned - cadenceDays) / cadenceDays;
      const dueScore = Math.min(
        DUE_AGAIN_MAX_SCORE,
        Math.max(
          DUE_AGAIN_MIN_SCORE,
          Math.round(DUE_AGAIN_MIN_SCORE + overdueRatio * DUE_AGAIN_SCORE_PER_CADENCE),
        ),
      );
      const cadenceLabel = history.medianDaysBetweenPlans != null ? 'median' : 'average';
      components.push({
        key: 'due-again',
        label: 'Due again',
        score: dueScore,
        detail: `Last planned ${daysSinceLastPlanned} days ago; typical ${cadenceLabel} gap is ${cadenceDays} days.`,
      });
    }
  }

  const dayTrend = insight?.days[String(dateDay)];
  if (dayTrend) {
    components.push({
      key: 'day-fit',
      label: 'Best weekday',
      score: dayTrend.score,
      detail: `Historically ${Math.round(dayTrend.share * 100)}% of cooks were on this weekday (${dayTrend.count}/${dayTrend.total}).`,
    });
  }

  if (parsedDate && insight) {
    const weekendTrend =
      parsedDate.getDay() === 0 || parsedDate.getDay() === 6 ? insight.weekend : insight.weekday;
    if (weekendTrend) {
      components.push({
        key: 'week-part-fit',
        label:
          parsedDate.getDay() === 0 || parsedDate.getDay() === 6 ? 'Weekend fit' : 'Weekday fit',
        score: weekendTrend.score,
        detail: `Historically ${Math.round(weekendTrend.share * 100)}% of cooks landed in this part of the week.`,
      });
    }
  }

  if (season) {
    const explicitSeasonMatch =
      recipeKeywords.has(season) ||
      (season === 'summer' && recipeKeywords.has('outdoors')) ||
      (season === 'winter' && recipeKeywords.has('christmas'));
    if (explicitSeasonMatch) {
      components.push({
        key: 'season-tag',
        label: 'Fits the season',
        score: 7,
        detail: 'Recipe tags line up with the current season.',
      });
    }
    const seasonTrend = insight?.seasons[season as keyof typeof insight.seasons];
    if (seasonTrend) {
      components.push({
        key: 'season-history',
        label: 'Seasonal history',
        score: seasonTrend.score,
        detail: `Historically ${Math.round(seasonTrend.share * 100)}% of cooks were in ${season} (${seasonTrend.count}/${seasonTrend.total}).`,
      });
    }
  }

  if (insight?.nutrition && insight.nutrition.score !== 0) {
    const nutrition = insight.nutrition;
    const details = [
      nutrition.proteinG == null ? null : `${nutrition.proteinG}g protein`,
      nutrition.caloriesKcal == null ? null : `${nutrition.caloriesKcal} kcal`,
    ].filter((value): value is string => value != null);
    components.push({
      key: 'nutrition-precalc',
      label: 'Nutrition balance',
      score: nutrition.score,
      detail:
        details.length > 0 ? details.join(' · ') : 'Nutrition signal from calculated recipe data.',
    });
  }

  if (context.weatherTags && context.weatherTags.length > 0 && insight) {
    const matchingWeatherTrends = context.weatherTags
      .flatMap((tag) => {
        const weatherTrend = insight.weather[tag];
        return weatherTrend ? [{ tag, trend: weatherTrend }] : [];
      })
      .sort(
        (left, right) => right.trend.score - left.trend.score || left.tag.localeCompare(right.tag),
      )
      .slice(0, 2);
    if (matchingWeatherTrends.length > 0) {
      components.push({
        key: 'weather-history',
        label: 'Weather fit',
        score: Math.min(
          14,
          matchingWeatherTrends.reduce((total, match) => total + match.trend.score, 0),
        ),
        detail: `Historically suits ${matchingWeatherTrends
          .map((match) => weatherTagLabel(match.tag))
          .join(' and ')}.`,
      });
    }
  }

  if (context.calendarFeatures && context.calendarFeatures.length > 0 && insight) {
    const matchingCalendarTrends = context.calendarFeatures
      .flatMap((featureKey) => {
        const calendarTrend = insight.calendar[featureKey];
        return calendarTrend ? [{ featureKey, trend: calendarTrend }] : [];
      })
      .sort(
        (left, right) =>
          right.trend.score - left.trend.score || left.featureKey.localeCompare(right.featureKey),
      )
      .slice(0, 2);
    if (matchingCalendarTrends.length > 0) {
      components.push({
        key: 'calendar-history',
        label: 'Calendar fit',
        score: Math.min(
          14,
          matchingCalendarTrends.reduce((total, match) => total + match.trend.score, 0),
        ),
        detail: `Historically common when ${matchingCalendarTrends
          .map((match) => describeCalendarAppointmentFeature(match.featureKey))
          .join(' and ')}.`,
      });
    }
  }

  for (const trackedTag of Object.keys(CATEGORY_ROLE_TAGS)) {
    if (!recipeKeywords.has(trackedTag)) continue;
    const existingCount = context.weekTagCounts.get(trackedTag) ?? 0;
    if (existingCount >= SAME_CATEGORY_PENALTY_THRESHOLD) {
      components.push({
        key: `imbalance-${trackedTag}`,
        label: 'Week imbalance',
        score: -(existingCount - 1) * 8,
        detail: `Would become the ${existingCount + 1}${ordinalSuffix(existingCount + 1)} ${trackedTag} meal this week.`,
      });
    }
  }

  for (const foodName of getRecipeProduceTagsForScoring(
    recipe,
    keywordNameById,
    context.produceFoodNames,
    context.precalculation,
  )) {
    const existingCount = context.weekProduceCounts.get(foodName) ?? 0;
    if (existingCount < PRODUCE_FREE_OCCURRENCES_PER_WEEK) continue;
    components.push({
      key: `produce-repeat-${foodName}`,
      label: 'Produce repetition',
      score: -existingCount * PRODUCE_REPEAT_PENALTY_BASE,
      detail: `Would be the ${existingCount + 1}${ordinalSuffix(existingCount + 1)} ${foodName} dish this week.`,
    });
  }

  const clusterMembership = getPrecalculatedRecipeClusterMembership(
    context.precalculation,
    recipe.id,
  );
  if (clusterMembership && clusterMembership.size > 1) {
    const existingCount = context.weekClusterCounts.get(clusterMembership.clusterId) ?? 0;
    if (existingCount > 0) {
      components.push({
        key: 'same-cluster-repeat',
        label: 'Cluster repetition',
        score: -existingCount * SAME_CLUSTER_PENALTY_BASE,
        detail: `Would be the ${existingCount + 1}${ordinalSuffix(existingCount + 1)} recipe this week from the ${clusterMembership.label} cluster.`,
      });
    }
  }

  const hasWeekPenalty = components.some(
    (component) =>
      component.score < 0 &&
      (component.key.startsWith('imbalance-') ||
        component.key.startsWith('produce-repeat-') ||
        component.key === 'same-cluster-repeat'),
  );
  const hasWeekBalanceContext =
    context.weekTagCounts.size > 0 ||
    context.weekProduceCounts.size > 0 ||
    context.weekClusterCounts.size > 0;
  if (hasWeekBalanceContext && !hasWeekPenalty) {
    components.push({
      key: 'week-balance-avoidance',
      label: 'Week balance',
      score: 0,
      detail:
        'Avoids repeating produce, flavour categories, or recipe clusters already planned this week.',
    });
  }

  if (components.length === 0) {
    components.push({
      key: 'eligible-neutral',
      label: 'Eligible fallback',
      score: 0,
      detail: 'Passed the hard filters and stayed available as a neutral fallback for this slot.',
    });
  }

  if (isTakeawayRecipe(recipe, keywordNameById)) {
    warnings.push('This is a placeholder recipe entry rather than a cookable recipe.');
  }

  const score = components.reduce((total, component) => total + component.score, 0);
  return { recipe, role: context.role, score, components, warnings };
}

function ordinalSuffix(value: number): string {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return 'th';
  const mod10 = value % 10;
  if (mod10 === 1) return 'st';
  if (mod10 === 2) return 'nd';
  if (mod10 === 3) return 'rd';
  return 'th';
}

function sortCandidates(
  candidates: MealAssistantCandidateAnalysis[],
): MealAssistantCandidateAnalysis[] {
  return candidates
    .slice()
    .sort(
      (left, right) =>
        right.score - left.score || left.recipe.name.localeCompare(right.recipe.name),
    );
}

function boostSimilarAlternatives(
  selected: MealAssistantCandidateAnalysis,
  candidates: MealAssistantCandidateAnalysis[],
  precalculation: MealAssistantPrecalculation | undefined,
): MealAssistantCandidateAnalysis[] {
  const similarityByRecipeId = new Map(
    getPrecalculatedSimilarRecipes(precalculation, selected.recipe.id).map((similarity) => [
      similarity.recipeId,
      similarity,
    ]),
  );
  return sortCandidates(
    candidates.map((candidate) => {
      const similarity = similarityByRecipeId.get(candidate.recipe.id);
      if (!similarity) return candidate;
      const bonus = Math.max(1, Math.round(similarity.score * SIMILAR_ALTERNATIVE_BONUS_SCALE));
      return {
        ...candidate,
        score: candidate.score + bonus,
        components: [
          ...candidate.components,
          {
            key: `similar-to-${selected.recipe.id}`,
            label: 'Close alternative',
            score: bonus,
            detail:
              similarity.sharedTerms.length > 0
                ? `A close alternative to ${selected.recipe.name} with overlap on ${formatSharedTerms(similarity.sharedTerms)}.`
                : `A close alternative to ${selected.recipe.name}.`,
          },
        ],
      };
    }),
  );
}

function updateWeekTagCounts(
  counts: Map<string, number>,
  recipe: Recipe,
  keywordNameById: Record<number, string>,
): Map<string, number> {
  const next = new Map(counts);
  for (const trackedTag of Object.keys(CATEGORY_ROLE_TAGS)) {
    if (
      !recipeMatchesCategoryRole(
        recipe,
        trackedTag as keyof typeof CATEGORY_ROLE_TAGS,
        keywordNameById,
      )
    )
      continue;
    next.set(trackedTag, (next.get(trackedTag) ?? 0) + 1);
  }
  return next;
}

export function swapMealAssistantSelection(
  slotPlan: MealAssistantSlotPlan,
  alternativeRecipeId: number,
): MealAssistantSlotPlan {
  const selectedAlternative = slotPlan.alternatives.find(
    (alternative) => alternative.recipe.id === alternativeRecipeId,
  );
  if (!selectedAlternative) return slotPlan;

  return {
    ...slotPlan,
    selected: selectedAlternative,
    alternatives: [
      slotPlan.selected,
      ...slotPlan.alternatives.filter(
        (alternative) => alternative.recipe.id !== alternativeRecipeId,
      ),
    ],
  };
}

interface BeamState {
  completedSlots: MealAssistantSlotPlan[];
  usedRecipeIds: Set<number>;
  weekTagCounts: Map<string, number>;
  weekClusterCounts: Map<string, number>;
  weekProduceCounts: Map<string, number>;
  cumulativeScore: number;
  issues: string[];
}

export function buildMealAssistantPlan(input: MealAssistantInput): MealAssistantPlan {
  const planType = input.planType ?? 'dinner';
  const precalculation = input.precalculation;
  const keywordNameById = input.keywordNameById ?? precalculation?.keywordNameById ?? {};
  const upSoonRecipeIds = new Set(input.upSoonRecipeIds ?? []);
  const calendarEventsByDate = input.calendarEventsByDate ?? {};
  const weatherByDate = input.weatherByDate ?? {};
  const publicHolidayDates = new Set(input.publicHolidayDates ?? []);
  const specialDateReasonsByDate = new Map<string, string>(
    (input.specialDates ?? []).flatMap((entry) => {
      const monthDayKey = parseMonthDayKey(entry.date.trim());
      const reason = entry.reason.trim();
      if (!monthDayKey || reason.length === 0) return [];
      return [[monthDayKey, reason] as const];
    }),
  );
  for (const date of getCalendarEventDatesByCategory(calendarEventsByDate, 'bank-holiday')) {
    publicHolidayDates.add(date);
  }

  const recentWindowStart = addDays(input.weekStart, -RECENT_WINDOW_DAYS);
  const recentWindowEnd = addDays(input.weekEnd, RECENT_WINDOW_DAYS);
  const historicalMeals =
    input.historicalMeals.length > 0
      ? input.historicalMeals
      : precalculation
        ? mealHistoryToMealPlans(precalculation)
        : [];

  const recentCounts = countRecipesWithinWindow(
    historicalMeals,
    recentWindowStart,
    recentWindowEnd,
  );
  const recentRecipeIds = new Set(recentCounts.keys());

  const regularWindowStart = addDays(input.weekStart, -REGULAR_WINDOW_DAYS);
  const regularWindowEnd = addDays(input.weekStart, -1);
  const recentRegularCounts = countRecipesWithinWindow(
    historicalMeals,
    regularWindowStart,
    regularWindowEnd,
  );
  const regularRecipeIds = new Set(
    [...recentRegularCounts.entries()]
      .filter(
        ([recipeId, count]) => count >= MIN_REGULAR_RECIPE_COUNT && !recentRecipeIds.has(recipeId),
      )
      .map(([recipeId]) => recipeId),
  );
  const recipeHistoryById = buildRecipeHistoryById(historicalMeals);

  const recipes = input.recipes.length > 0 ? input.recipes : precalculationRecipes(precalculation);
  const hardExclusions = recipes
    .map((recipe) => getBaseFilterExclusion(recipe, keywordNameById, recentRecipeIds, planType))
    .filter((exclusion): exclusion is MealAssistantCandidateExclusion => exclusion != null)
    .sort(
      (left, right) =>
        left.reason.localeCompare(right.reason) ||
        left.recipe.name.localeCompare(right.recipe.name),
    );
  const baseRecipes = recipes.filter((recipe) =>
    recipePassesBaseFilters(recipe, keywordNameById, recentRecipeIds, planType),
  );
  const recentTakeawayMeals = countRecipesWithinWindow(
    historicalMeals,
    addDays(input.weekEnd, -TAKEAWAY_LOOKBACK_DAYS),
    input.weekEnd,
  );
  const shouldSuggestTakeaway =
    planType === 'dinner' &&
    baseRecipes.some((recipe) => isTakeawayRecipe(recipe, keywordNameById)) &&
    ![...recentTakeawayMeals.keys()].some((recipeId) => {
      const recipe = recipes.find((candidate) => candidate.id === recipeId);
      return recipe ? isTakeawayRecipe(recipe, keywordNameById) : false;
    });

  const slotRoles = buildSlotRoles(
    input.emptyDinnerDates,
    planType,
    calendarEventsByDate,
    weatherByDate,
    publicHolidayDates,
    input.dinnerTime,
    shouldSuggestTakeaway,
    formatDate(input.weekStart),
    specialDateReasonsByDate,
  );

  const produceFoodNames =
    input.produceFoodNames ?? Object.keys(precalculation?.relationships.produce ?? {});

  let beam: BeamState[] = [
    {
      completedSlots: [],
      usedRecipeIds: new Set(
        input.existingWeekMeals
          .map((entry) => recipeIdOf(entry))
          .filter((value): value is number => value != null),
      ),
      weekTagCounts: buildWeekTagCounts(input.existingWeekMeals, keywordNameById),
      weekClusterCounts: buildWeekClusterCounts(input.existingWeekMeals, precalculation),
      weekProduceCounts: buildWeekProduceCounts(
        input.existingWeekMeals,
        keywordNameById,
        produceFoodNames,
        precalculation,
      ),
      cumulativeScore: 0,
      issues: [],
    },
  ];

  for (const slot of slotRoles) {
    const nextBeam: BeamState[] = [];

    for (const state of beam) {
      const exactCandidates = baseRecipes.filter(
        (recipe) =>
          !state.usedRecipeIds.has(recipe.id) &&
          recipeMatchesRole(recipe, slot.role, keywordNameById),
      );
      const categoryAlreadyPresent =
        isCategoryRole(slot.role) && (state.weekTagCounts.get(slot.role) ?? 0) >= 1;
      const shouldSilentlyFallbackToGeneralDinner =
        slot.role in CATEGORY_ROLE_TAGS && (exactCandidates.length === 0 || categoryAlreadyPresent);
      const effectiveRole = shouldSilentlyFallbackToGeneralDinner ? 'general-dinner' : slot.role;
      const fallbackCandidates =
        !shouldSilentlyFallbackToGeneralDinner && exactCandidates.length > 0
          ? exactCandidates
          : baseRecipes.filter((recipe) => !state.usedRecipeIds.has(recipe.id));

      if (fallbackCandidates.length === 0) {
        nextBeam.push({
          ...state,
          issues: [...state.issues, `No eligible recipes were available for ${slot.date}.`],
        });
        continue;
      }

      const slotCalendarFeatures = buildCalendarFeatureDay(
        calendarEventsByDate[slot.date] ?? [],
      ).appointmentFeatures;

      const scoredCandidates = sortCandidates(
        fallbackCandidates.map((recipe) =>
          scoreRecipe(recipe, keywordNameById, {
            date: slot.date,
            role: effectiveRole,
            upSoonRecipeIds,
            regularRecipeIds,
            recipeHistoryById,
            weekTagCounts: state.weekTagCounts,
            weekClusterCounts: state.weekClusterCounts,
            weekProduceCounts: state.weekProduceCounts,
            produceFoodNames,
            precalculation,
            weatherTags: weatherByDate[slot.date]
              ? deriveWeatherFeatures(weatherByDate[slot.date]).tags
              : [],
            calendarFeatures: slotCalendarFeatures,
          }),
        ),
      );

      const roleFlavourDetail = buildRoleFlavourDetail(
        slot.date,
        effectiveRole,
        calendarEventsByDate[slot.date] ?? [],
        weatherByDate[slot.date],
        publicHolidayDates,
        input.dinnerTime,
        getSpecialDateReasonForDate(slot.date, specialDateReasonsByDate),
      );

      for (const selected of scoredCandidates.slice(0, BEAM_WIDTH)) {
        const isNoMatch = exactCandidates.length === 0 && !shouldSilentlyFallbackToGeneralDinner;
        const selectedWithWarning = isNoMatch
          ? {
              ...selected,
              warnings: [
                ...selected.warnings,
                `No ${roleLabel(slot.role).toLowerCase()} recipes matched, so this slot fell back to the broader ${planType} pool.`,
              ],
            }
          : selected;

        const slotPlan: MealAssistantSlotPlan = {
          date: slot.date,
          role: effectiveRole,
          roleLabel: roleLabel(effectiveRole),
          roleFlavourDetail,
          selected: selectedWithWarning,
          alternatives: boostSimilarAlternatives(
            selectedWithWarning,
            scoredCandidates.filter((c) => c.recipe.id !== selectedWithWarning.recipe.id),
            precalculation,
          ).slice(0, 5),
          hardExclusions,
        };

        nextBeam.push({
          completedSlots: [...state.completedSlots, slotPlan],
          usedRecipeIds: new Set([...state.usedRecipeIds, selected.recipe.id]),
          weekTagCounts: updateWeekTagCounts(state.weekTagCounts, selected.recipe, keywordNameById),
          weekClusterCounts: updateWeekClusterCounts(
            state.weekClusterCounts,
            selected.recipe,
            precalculation,
          ),
          weekProduceCounts: updateWeekProduceCounts(
            state.weekProduceCounts,
            selected.recipe,
            keywordNameById,
            produceFoodNames,
            precalculation,
          ),
          cumulativeScore: state.cumulativeScore + selected.score,
          issues: state.issues,
        });
      }
    }

    // Prune beam to BEAM_WIDTH, sorted by cumulative score (deterministic tiebreaker: recipe ID sequence)
    nextBeam.sort((a, b) => {
      const scoreDiff = b.cumulativeScore - a.cumulativeScore;
      if (scoreDiff !== 0) return scoreDiff;
      for (let i = 0; i < Math.max(a.completedSlots.length, b.completedSlots.length); i++) {
        const aId = a.completedSlots[i]?.selected.recipe.id ?? 0;
        const bId = b.completedSlots[i]?.selected.recipe.id ?? 0;
        if (aId !== bId) return aId - bId;
      }
      return 0;
    });
    beam = nextBeam.slice(0, BEAM_WIDTH);
  }

  const bestState = beam[0];
  if (!bestState) return { slots: [], issues: [] };

  return { slots: bestState.completedSlots, issues: bestState.issues };
}
