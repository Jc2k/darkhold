import { describeCalendarAppointmentFeature } from './calendarFeatures';
import {
  MEAL_ASSISTANT_PRECALCULATION_SCHEMA_VERSION,
  mealAssistantDayNumberToDate,
  type MealAssistantPrecalculation,
  type MealAssistantTrend,
} from './mealAssistantPrecalculation';
import { weatherTagLabel } from './weatherFeatures';
import { getWeekdayRecipeSignal } from './weekdayRecipeSignals';

export interface MealAssistantDebugTopRecipe {
  recipeId: number;
  name: string;
  count: number;
  share: number;
}

export interface MealAssistantDebugGroup {
  label: string;
  total: number;
  recipes: MealAssistantDebugTopRecipe[];
}

export interface MealAssistantDebugMealTypeOption {
  id: number;
  label: string;
  planCount: number;
}

export interface MealAssistantDebugWeekdaySignalDay {
  label: string;
  count: number;
  share: number;
}

export interface MealAssistantDebugWeekdayRecipeSignal {
  recipeId: number;
  name: string;
  total: number;
  days: MealAssistantDebugWeekdaySignalDay[];
  expectedShare: number;
  pValue: number;
}

export interface MealAssistantDebugSignificantSignalRecipe {
  recipeId: number;
  name: string;
  count: number;
  total: number;
  share: number;
  score: number;
}

export interface MealAssistantDebugSignificantSignal {
  label: string;
  total: number;
  recipeCount: number;
  topRecipe?: MealAssistantDebugSignificantSignalRecipe;
}

export interface MealAssistantDebugSignificantSignalCategory {
  label: string;
  signals: MealAssistantDebugSignificantSignal[];
}

export interface MealAssistantDebugStats {
  expectedSchemaVersion: number;
  actualSchemaVersion?: number;
  isCurrentSchema: boolean;
  generatedAt?: string;
  recipeCount: number;
  plannedMealCount: number;
  activeRecipeCount: number;
  selectedMealTypeId?: number;
  mealTypes: MealAssistantDebugMealTypeOption[];
  weekdayMeals: MealAssistantDebugGroup;
  weekendMeals: MealAssistantDebugGroup;
  weekdays: MealAssistantDebugGroup[];
  recipeWeekdaySignals: MealAssistantDebugWeekdayRecipeSignal[];
  months: MealAssistantDebugGroup[];
  seasons: MealAssistantDebugGroup[];
  weather: MealAssistantDebugGroup[];
  calendar: MealAssistantDebugGroup[];
  clusters: MealAssistantDebugGroup[];
  significantSignalCategories: MealAssistantDebugSignificantSignalCategory[];
}

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_LABELS = [
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
const SEASON_LABELS = ['Winter', 'Spring', 'Summer', 'Autumn'];
const TOP_RECIPE_LIMIT = 5;
const TOP_GROUP_LIMIT = 8;
const WEEKDAY_SIGNAL_LIMIT = 10;

type MutableGroup = Omit<MealAssistantDebugGroup, 'recipes'> & {
  recipeCounts: Map<number, number>;
};

function createGroup(label: string): MutableGroup {
  return { label, total: 0, recipeCounts: new Map() };
}

function addToGroup(group: MutableGroup, recipeId: number, count = 1): void {
  group.total += count;
  group.recipeCounts.set(recipeId, (group.recipeCounts.get(recipeId) ?? 0) + count);
}

function finalizeGroup(
  group: MutableGroup,
  precalculation: MealAssistantPrecalculation,
  limit = TOP_RECIPE_LIMIT,
): MealAssistantDebugGroup {
  const recipes = [...group.recipeCounts.entries()]
    .map(([recipeId, count]) => ({
      recipeId,
      name: precalculation.recipes[String(recipeId)]?.name ?? `Recipe ${recipeId}`,
      count,
      share: group.total > 0 ? count / group.total : 0,
    }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
    .slice(0, limit);

  return { label: group.label, total: group.total, recipes };
}

function topGroups(
  groups: MealAssistantDebugGroup[],
  limit = TOP_GROUP_LIMIT,
): MealAssistantDebugGroup[] {
  return groups
    .filter((group) => group.total > 0)
    .sort((left, right) => right.total - left.total || left.label.localeCompare(right.label))
    .slice(0, limit);
}

function buildWeekdayRecipeSignals(
  precalculation: MealAssistantPrecalculation,
  selectedRecipeHistory: MealAssistantPrecalculation['recipeHistory'],
): MealAssistantDebugWeekdayRecipeSignal[] {
  return Object.entries(selectedRecipeHistory)
    .flatMap(([recipeIdKey, history]): MealAssistantDebugWeekdayRecipeSignal[] => {
      const recipeId = Number.parseInt(recipeIdKey, 10);
      if (!Number.isFinite(recipeId)) return [];

      const signal = getWeekdayRecipeSignal(history, { dayLabels: DAY_LABELS });
      if (!signal) return [];

      return [
        {
          recipeId,
          name: precalculation.recipes[String(recipeId)]?.name ?? `Recipe ${recipeId}`,
          total: signal.total,
          days: signal.days.map(({ label, count, share }) => ({ label, count, share })),
          expectedShare: signal.expectedShare,
          pValue: signal.pValue,
        },
      ];
    })
    .sort(
      (left, right) =>
        left.pValue - right.pValue ||
        right.days.reduce((total, day) => total + day.count, 0) / right.total -
          left.days.reduce((total, day) => total + day.count, 0) / left.total ||
        left.name.localeCompare(right.name),
    )
    .slice(0, WEEKDAY_SIGNAL_LIMIT);
}

type InsightRecordName = 'days' | 'months' | 'seasons' | 'weather' | 'calendar';

type MutableSignificantSignal = Omit<
  MealAssistantDebugSignificantSignal,
  'recipeCount' | 'topRecipe'
> & {
  recipes: MealAssistantDebugSignificantSignalRecipe[];
};

function isTrend(value: unknown): value is MealAssistantTrend {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Partial<MealAssistantTrend>;
  return (
    typeof record.count === 'number' &&
    typeof record.total === 'number' &&
    typeof record.share === 'number' &&
    typeof record.score === 'number'
  );
}

function buildSignificantSignalCategory(
  label: string,
  precalculation: MealAssistantPrecalculation,
  selectedRecipeHistory: MealAssistantPrecalculation['recipeHistory'],
  recordName: InsightRecordName,
  labelForKey: (key: string) => string,
): MealAssistantDebugSignificantSignalCategory {
  const signals = new Map<string, MutableSignificantSignal>();

  for (const [recipeIdKey, insight] of Object.entries(precalculation.recipeInsights)) {
    if (!selectedRecipeHistory[recipeIdKey]) continue;
    const recipeId = Number.parseInt(recipeIdKey, 10);
    if (!Number.isFinite(recipeId)) continue;

    for (const [key, trend] of Object.entries(insight[recordName])) {
      if (!isTrend(trend)) continue;
      const signal = signals.get(key) ?? { label: labelForKey(key), total: 0, recipes: [] };
      const recipeSignal = {
        recipeId,
        name: precalculation.recipes[recipeIdKey]?.name ?? `Recipe ${recipeId}`,
        count: trend.count,
        total: trend.total,
        share: trend.share,
        score: trend.score,
      };
      signal.total += trend.count;
      signal.recipes.push(recipeSignal);
      signals.set(key, signal);
    }
  }

  return {
    label,
    signals: [...signals.values()]
      .map((signal) => ({
        label: signal.label,
        total: signal.total,
        recipeCount: signal.recipes.length,
        topRecipe: signal.recipes.sort(
          (left, right) =>
            right.score - left.score ||
            right.count - left.count ||
            right.share - left.share ||
            left.name.localeCompare(right.name),
        )[0],
      }))
      .sort(
        (left, right) =>
          right.recipeCount - left.recipeCount ||
          right.total - left.total ||
          left.label.localeCompare(right.label),
      )
      .slice(0, TOP_GROUP_LIMIT),
  };
}

function schemaVersionOf(payload: unknown): number | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const version = (payload as { schemaVersion?: unknown }).schemaVersion;
  return typeof version === 'number' ? version : undefined;
}

export function getMealAssistantDebugSchemaStatus(
  payload: unknown,
): Pick<
  MealAssistantDebugStats,
  'expectedSchemaVersion' | 'actualSchemaVersion' | 'isCurrentSchema'
> {
  const actualSchemaVersion = schemaVersionOf(payload);
  return {
    expectedSchemaVersion: MEAL_ASSISTANT_PRECALCULATION_SCHEMA_VERSION,
    ...(actualSchemaVersion === undefined ? {} : { actualSchemaVersion }),
    isCurrentSchema: actualSchemaVersion === MEAL_ASSISTANT_PRECALCULATION_SCHEMA_VERSION,
  };
}

function mealTypeLabel(id: number, name: string | undefined): string {
  return name?.trim() || `Meal type ${id}`;
}

export function buildMealAssistantDebugStats(
  precalculation: MealAssistantPrecalculation,
  selectedMealTypeId?: number,
): MealAssistantDebugStats {
  const weekdays = DAY_LABELS.map(createGroup);
  const months = MONTH_LABELS.map(createGroup);
  const seasons = SEASON_LABELS.map(createGroup);
  const weekdayMeals = createGroup('Weekday meals');
  const weekendMeals = createGroup('Weekend meals');
  const weatherGroups = new Map<string, MutableGroup>();
  const calendarGroups = new Map<string, MutableGroup>();
  const clusterGroups = new Map<string, MutableGroup>();
  const selectedRecipeHistory =
    selectedMealTypeId == null
      ? precalculation.recipeHistory
      : (precalculation.recipeHistoryByMealType[String(selectedMealTypeId)] ?? {});

  for (const [recipeIdKey, history] of Object.entries(selectedRecipeHistory)) {
    const recipeId = Number.parseInt(recipeIdKey, 10);
    if (!Number.isFinite(recipeId)) continue;

    history.dayCounts.forEach((count, dayIndex) => {
      if (count <= 0) return;
      addToGroup(weekdays[dayIndex], recipeId, count);
      addToGroup(dayIndex === 0 || dayIndex === 6 ? weekendMeals : weekdayMeals, recipeId, count);
    });
    history.seasonCounts.forEach((count, seasonIndex) => {
      if (count > 0) addToGroup(seasons[seasonIndex], recipeId, count);
    });
    for (const dayNumber of history.dates) {
      const month = new Date(`${mealAssistantDayNumberToDate(dayNumber)}T00:00:00Z`).getUTCMonth();
      addToGroup(months[month], recipeId);
    }
  }

  for (const [weatherKey, recipeIds] of Object.entries(precalculation.relationships.weather)) {
    const group = createGroup(weatherTagLabel(weatherKey));
    for (const recipeId of recipeIds) {
      const selectedHistory = selectedRecipeHistory[String(recipeId)];
      if (selectedMealTypeId != null && !selectedHistory) continue;
      const count =
        selectedMealTypeId == null
          ? (precalculation.recipeInsights[String(recipeId)]?.weather[weatherKey]?.count ?? 1)
          : (selectedHistory?.totalPlanCount ?? 1);
      addToGroup(group, recipeId, count);
    }
    weatherGroups.set(weatherKey, group);
  }

  for (const [calendarKey, recipeIds] of Object.entries(precalculation.relationships.calendar)) {
    const group = createGroup(describeCalendarAppointmentFeature(calendarKey));
    for (const recipeId of recipeIds) {
      const selectedHistory = selectedRecipeHistory[String(recipeId)];
      if (selectedMealTypeId != null && !selectedHistory) continue;
      const count =
        selectedMealTypeId == null
          ? (precalculation.recipeInsights[String(recipeId)]?.calendar[calendarKey]?.count ?? 1)
          : (selectedHistory?.totalPlanCount ?? 1);
      addToGroup(group, recipeId, count);
    }
    calendarGroups.set(calendarKey, group);
  }

  for (const cluster of Object.values(precalculation.recipeClusters)) {
    const group = createGroup(cluster.label);
    for (const recipeId of cluster.recipeIds) {
      const count = selectedRecipeHistory[String(recipeId)]?.totalPlanCount ?? 0;
      if (selectedMealTypeId != null && count === 0) continue;
      addToGroup(group, recipeId, count > 0 ? count : 1);
    }
    clusterGroups.set(cluster.id, group);
  }

  const plannedMealCount = Object.values(selectedRecipeHistory).reduce(
    (total, history) => total + history.totalPlanCount,
    0,
  );
  const activeRecipeCount = Object.values(selectedRecipeHistory).filter(
    (history) => history.totalPlanCount > 0,
  ).length;
  const mealTypes = precalculation.mealTypes.map((mealType) => ({
    id: mealType.id,
    label: mealTypeLabel(mealType.id, mealType.name),
    planCount: mealType.planCount,
  }));

  return {
    ...getMealAssistantDebugSchemaStatus(precalculation),
    generatedAt: precalculation.generatedAt,
    recipeCount: Object.keys(precalculation.recipes).length,
    plannedMealCount,
    activeRecipeCount,
    ...(selectedMealTypeId == null ? {} : { selectedMealTypeId }),
    mealTypes,
    weekdayMeals: finalizeGroup(weekdayMeals, precalculation),
    weekendMeals: finalizeGroup(weekendMeals, precalculation),
    weekdays: weekdays.map((group) => finalizeGroup(group, precalculation)),
    recipeWeekdaySignals: buildWeekdayRecipeSignals(precalculation, selectedRecipeHistory),
    months: months.map((group) => finalizeGroup(group, precalculation)),
    seasons: seasons.map((group) => finalizeGroup(group, precalculation)),
    weather: topGroups(
      [...weatherGroups.values()].map((group) => finalizeGroup(group, precalculation)),
    ),
    calendar: topGroups(
      [...calendarGroups.values()].map((group) => finalizeGroup(group, precalculation)),
    ),
    clusters: topGroups(
      [...clusterGroups.values()].map((group) => finalizeGroup(group, precalculation)),
    ),
    significantSignalCategories: [
      buildSignificantSignalCategory(
        'Weekday',
        precalculation,
        selectedRecipeHistory,
        'days',
        (key) => DAY_LABELS[Number.parseInt(key, 10)] ?? key,
      ),
      buildSignificantSignalCategory(
        'Month',
        precalculation,
        selectedRecipeHistory,
        'months',
        (key) => MONTH_LABELS[Number.parseInt(key, 10) - 1] ?? key,
      ),
      buildSignificantSignalCategory(
        'Season',
        precalculation,
        selectedRecipeHistory,
        'seasons',
        (key) => key.charAt(0).toUpperCase() + key.slice(1),
      ),
      buildSignificantSignalCategory(
        'Weather',
        precalculation,
        selectedRecipeHistory,
        'weather',
        weatherTagLabel,
      ),
      buildSignificantSignalCategory(
        'Calendar',
        precalculation,
        selectedRecipeHistory,
        'calendar',
        describeCalendarAppointmentFeature,
      ),
    ],
  };
}
