import type { MealPlan, Recipe } from '../api/tandoor-types';
import type {
  CalendarEventsByDate,
  CalendarEvent,
  CalendarEventCategory,
} from '../hooks/useCalendarEvents';
import type { WeatherByDate, WeatherDayForecast } from '../hooks/useWeatherForecast';
import { formatDate, parseLocalDate } from './dateUtils';

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
const GOOD_WEATHER_MIN_TEMP_C = 20;
const GOOD_WEATHER_MAX_PRECIP_PROBABILITY = 20;
const GOOD_WEATHER_MAX_PRECIP_MM = 0.5;
const RECENT_WINDOW_DAYS = 14;
const REGULAR_WINDOW_DAYS = 42;
const TAKEAWAY_LOOKBACK_DAYS = 21;
const DEFAULT_EVENT_CATEGORY: CalendarEventCategory = 'appointment';
const MIN_ACCEPTABLE_RATING = 1;
const MIN_REGULAR_RECIPE_COUNT = 2;
const SAME_CATEGORY_PENALTY_THRESHOLD = 2;
const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;

const CATEGORY_ROLE_TAGS = {
  pasta: ['pasta'],
  rice: ['rice'],
  noodles: ['noodles', 'noodle'],
  'soy-free': ['soy-free', 'soy free'],
} as const;

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

export interface MealAssistantSlotPlan {
  date: string;
  role: MealAssistantRole;
  roleLabel: string;
  roleFlavourDetail?: string;
  selected: MealAssistantCandidateAnalysis;
  alternatives: MealAssistantCandidateAnalysis[];
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
  recentAddedRecipeIds?: Iterable<number>;
  calendarEventsByDate?: CalendarEventsByDate;
  weatherByDate?: WeatherByDate;
  publicHolidayDates?: string[];
  dinnerTime?: string | null;
  specialDates?: Array<{
    date: string;
    reason: string;
  }>;
}

interface ScoringContext {
  date: string;
  role: MealAssistantRole;
  upSoonRecipeIds: Set<number>;
  recentAddedRecipeIds: Set<number>;
  regularRecipeIds: Set<number>;
  recipeDayCounts: Map<number, Map<number, number>>;
  recipeSeasonCounts: Map<number, Map<string, number>>;
  weekTagCounts: Map<string, number>;
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

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
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
    if (event.allDay) return true;
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
  return (
    weather.tempMaxC >= GOOD_WEATHER_MIN_TEMP_C &&
    weather.precipitationProbabilityMax <= GOOD_WEATHER_MAX_PRECIP_PROBABILITY &&
    weather.precipitationSumMm <= GOOD_WEATHER_MAX_PRECIP_MM
  );
}

function getSeasonKey(date: Date): string {
  const month = date.getMonth() + 1;
  if (month === 12 || month <= 2) return 'winter';
  if (month <= 5) return 'spring';
  if (month <= 8) return 'summer';
  return 'autumn';
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

function buildHistoricalDayCounts(entries: MealPlan[]): Map<number, Map<number, number>> {
  const counts = new Map<number, Map<number, number>>();
  for (const entry of entries) {
    const recipeId = recipeIdOf(entry);
    const mealDate = parseMealDate(entry);
    if (!recipeId || !mealDate) continue;
    const byDay = counts.get(recipeId) ?? new Map<number, number>();
    byDay.set(mealDate.getDay(), (byDay.get(mealDate.getDay()) ?? 0) + 1);
    counts.set(recipeId, byDay);
  }
  return counts;
}

function buildHistoricalSeasonCounts(entries: MealPlan[]): Map<number, Map<string, number>> {
  const counts = new Map<number, Map<string, number>>();
  for (const entry of entries) {
    const recipeId = recipeIdOf(entry);
    const mealDate = parseMealDate(entry);
    if (!recipeId || !mealDate) continue;
    const season = getSeasonKey(mealDate);
    const bySeason = counts.get(recipeId) ?? new Map<string, number>();
    bySeason.set(season, (bySeason.get(season) ?? 0) + 1);
    counts.set(recipeId, bySeason);
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

function toTitleCase(value: string): string {
  return value
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
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
      if (event.allDay) return true;
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
    if (specialDateReasonsByDate.has(date)) {
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

function recipePassesBaseFilters(
  recipe: Recipe,
  keywordNameById: Record<number, string>,
  recentRecipeIds: Set<number>,
  planType: 'dinner' | 'lunch',
): boolean {
  if (recipe.rating != null && recipe.rating <= MIN_ACCEPTABLE_RATING) return false;
  if (!recipe.image) return false;
  if (recentRecipeIds.has(recipe.id)) return false;
  if (planType === 'lunch') {
    return recipeHasKeywordFragment(recipe, ['lunch'], keywordNameById);
  }
  return !recipeHasFragment(recipe, UNSUITABLE_DINNER_TAG_FRAGMENTS, keywordNameById);
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

  if (context.recentAddedRecipeIds.has(recipe.id)) {
    components.push({
      key: 'recently-added',
      label: 'Recently added',
      score: 6,
      detail: 'Still fresh enough to be worth trying soon.',
    });
  }

  const dayCount = context.recipeDayCounts.get(recipe.id)?.get(dateDay) ?? 0;
  if (dayCount > 0) {
    components.push({
      key: 'day-fit',
      label: 'Fits the day',
      score: Math.min(12, dayCount * 4),
      detail: `Seen ${dayCount} time${dayCount === 1 ? '' : 's'} on this weekday before.`,
    });
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
    const seasonCount = context.recipeSeasonCounts.get(recipe.id)?.get(season) ?? 0;
    if (seasonCount > 0) {
      components.push({
        key: 'season-history',
        label: 'Seasonal history',
        score: Math.min(8, seasonCount * 2),
        detail: `Often cooked in this season (${seasonCount} historical match${seasonCount === 1 ? '' : 'es'}).`,
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

export function buildMealAssistantPlan(input: MealAssistantInput): MealAssistantPlan {
  const planType = input.planType ?? 'dinner';
  const keywordNameById = input.keywordNameById ?? {};
  const upSoonRecipeIds = new Set(input.upSoonRecipeIds ?? []);
  const recentAddedRecipeIds = new Set(input.recentAddedRecipeIds ?? []);
  const calendarEventsByDate = input.calendarEventsByDate ?? {};
  const weatherByDate = input.weatherByDate ?? {};
  const publicHolidayDates = new Set(input.publicHolidayDates ?? []);
  const specialDateReasonsByDate = new Map(
    (input.specialDates ?? [])
      .map((entry) => [entry.date.trim(), entry.reason.trim()] as const)
      .filter(
        ([date, reason]) => date.length > 0 && reason.length > 0 && parseLocalDate(date) !== null,
      ),
  );
  for (const date of getCalendarEventDatesByCategory(calendarEventsByDate, 'bank-holiday')) {
    publicHolidayDates.add(date);
  }

  const recentWindowStart = addDays(input.weekStart, -RECENT_WINDOW_DAYS);
  const recentWindowEnd = addDays(input.weekEnd, RECENT_WINDOW_DAYS);
  const recentCounts = countRecipesWithinWindow(
    input.historicalMeals,
    recentWindowStart,
    recentWindowEnd,
  );
  const recentRecipeIds = new Set(recentCounts.keys());

  const regularWindowStart = addDays(input.weekStart, -REGULAR_WINDOW_DAYS);
  const regularWindowEnd = addDays(input.weekStart, -1);
  const recentRegularCounts = countRecipesWithinWindow(
    input.historicalMeals,
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

  const historicalPastMeals = input.historicalMeals.filter((entry) => {
    const mealDate = parseMealDate(entry);
    return mealDate ? mealDate.getTime() < input.weekStart.getTime() : false;
  });

  const baseRecipes = input.recipes.filter((recipe) =>
    recipePassesBaseFilters(recipe, keywordNameById, recentRecipeIds, planType),
  );
  const recentTakeawayMeals = countRecipesWithinWindow(
    input.historicalMeals,
    addDays(input.weekEnd, -TAKEAWAY_LOOKBACK_DAYS),
    input.weekEnd,
  );
  const shouldSuggestTakeaway =
    planType === 'dinner' &&
    baseRecipes.some((recipe) => isTakeawayRecipe(recipe, keywordNameById)) &&
    ![...recentTakeawayMeals.keys()].some((recipeId) => {
      const recipe = input.recipes.find((candidate) => candidate.id === recipeId);
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

  const recipeDayCounts = buildHistoricalDayCounts(historicalPastMeals);
  const recipeSeasonCounts = buildHistoricalSeasonCounts(historicalPastMeals);
  let weekTagCounts = buildWeekTagCounts(input.existingWeekMeals, keywordNameById);
  const usedRecipeIds = new Set(
    input.existingWeekMeals
      .map((entry) => recipeIdOf(entry))
      .filter((value): value is number => value != null),
  );

  const slots: MealAssistantSlotPlan[] = [];
  const issues: string[] = [];

  for (const slot of slotRoles) {
    const exactCandidates = baseRecipes.filter(
      (recipe) =>
        !usedRecipeIds.has(recipe.id) && recipeMatchesRole(recipe, slot.role, keywordNameById),
    );
    const shouldSilentlyFallbackToGeneralDinner =
      slot.role in CATEGORY_ROLE_TAGS && exactCandidates.length === 0;
    const effectiveRole = shouldSilentlyFallbackToGeneralDinner ? 'general-dinner' : slot.role;
    const fallbackCandidates =
      exactCandidates.length > 0
        ? exactCandidates
        : baseRecipes.filter((recipe) => !usedRecipeIds.has(recipe.id));

    if (fallbackCandidates.length === 0) {
      issues.push(`No eligible recipes were available for ${slot.date}.`);
      continue;
    }

    const scoredCandidates = sortCandidates(
      fallbackCandidates.map((recipe) =>
        scoreRecipe(recipe, keywordNameById, {
          date: slot.date,
          role: effectiveRole,
          upSoonRecipeIds,
          recentAddedRecipeIds,
          regularRecipeIds,
          recipeDayCounts,
          recipeSeasonCounts,
          weekTagCounts,
        }),
      ),
    );

    const selected = scoredCandidates[0];
    if (exactCandidates.length === 0 && !shouldSilentlyFallbackToGeneralDinner) {
      selected.warnings = [
        ...selected.warnings,
        `No ${roleLabel(slot.role).toLowerCase()} recipes matched, so this slot fell back to the broader ${planType} pool.`,
      ];
    }

    slots.push({
      date: slot.date,
      role: effectiveRole,
      roleLabel: roleLabel(effectiveRole),
      roleFlavourDetail: buildRoleFlavourDetail(
        slot.date,
        effectiveRole,
        calendarEventsByDate[slot.date] ?? [],
        weatherByDate[slot.date],
        publicHolidayDates,
        input.dinnerTime,
        specialDateReasonsByDate.get(slot.date),
      ),
      selected,
      alternatives: scoredCandidates.slice(1, 6),
    });

    usedRecipeIds.add(selected.recipe.id);
    weekTagCounts = updateWeekTagCounts(weekTagCounts, selected.recipe, keywordNameById);
  }

  return { slots, issues };
}
