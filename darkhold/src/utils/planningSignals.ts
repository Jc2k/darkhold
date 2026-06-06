import { describeCalendarAppointmentFeature } from './calendarFeatures';
import type {
  MealAssistantRecipeInsight,
  MealAssistantSeason,
  MealAssistantTrend,
} from './mealAssistantPrecalculation';
import {
  weatherPlanningSignalCategoryForTag,
  weatherTagLabel,
  type WeatherPlanningSignalCategory,
} from './weatherFeatures';

export type MealAssistantWeatherPlanningSignalCategory = WeatherPlanningSignalCategory;

export type MealAssistantPlanningSignalCategory =
  | 'month'
  | 'season'
  | 'temperature'
  | 'rainfall'
  | 'daylight'
  | 'calendar';

export interface MealAssistantPlanningSignal {
  key: string;
  category: MealAssistantPlanningSignalCategory;
  label: string;
  count: number;
  total: number;
  share: number;
  score: number;
}

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

const CATEGORY_ORDER: Record<MealAssistantPlanningSignalCategory, number> = {
  month: 0,
  season: 1,
  temperature: 2,
  rainfall: 3,
  daylight: 4,
  calendar: 5,
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

function seasonLabel(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function monthLabel(value: string): string {
  const month = Number.parseInt(value, 10);
  return MONTH_LABELS[month - 1] ?? value;
}

function signalFromTrend(
  category: MealAssistantPlanningSignalCategory,
  key: string,
  label: string,
  trend: MealAssistantTrend,
): MealAssistantPlanningSignal {
  return {
    key: `${category}:${key}`,
    category,
    label,
    count: trend.count,
    total: trend.total,
    share: trend.share,
    score: trend.score,
  };
}

function sortPlanningSignals(
  signals: MealAssistantPlanningSignal[],
): MealAssistantPlanningSignal[] {
  return signals.sort(
    (left, right) =>
      right.score - left.score ||
      right.share - left.share ||
      right.count - left.count ||
      CATEGORY_ORDER[left.category] - CATEGORY_ORDER[right.category] ||
      left.label.localeCompare(right.label),
  );
}

export function getRecipePlanningSignals(
  insight: MealAssistantRecipeInsight | undefined,
): MealAssistantPlanningSignal[] {
  if (!insight) return [];

  return sortPlanningSignals([
    ...Object.entries(insight.months).flatMap(([key, trend]) =>
      isTrend(trend) ? [signalFromTrend('month', key, monthLabel(key), trend)] : [],
    ),
    ...Object.entries(insight.seasons).flatMap(([key, trend]) =>
      isTrend(trend) ? [signalFromTrend('season', key, seasonLabel(key), trend)] : [],
    ),
    ...Object.entries(insight.weather).flatMap(([key, trend]) => {
      const category = weatherPlanningSignalCategoryForTag(key);
      return category && isTrend(trend)
        ? [signalFromTrend(category, key, weatherTagLabel(key), trend)]
        : [];
    }),
    ...Object.entries(insight.calendar).flatMap(([key, trend]) =>
      isTrend(trend)
        ? [signalFromTrend('calendar', key, describeCalendarAppointmentFeature(key), trend)]
        : [],
    ),
  ]);
}

export function getMatchingRecipePlanningSignals({
  insight,
  month,
  season,
  weatherTags = [],
  calendarFeatures = [],
}: {
  insight: MealAssistantRecipeInsight | undefined;
  month?: number;
  season?: MealAssistantSeason;
  weatherTags?: readonly string[];
  calendarFeatures?: readonly string[];
}): MealAssistantPlanningSignal[] {
  if (!insight) return [];

  const signals: MealAssistantPlanningSignal[] = [];
  if (month != null) {
    const key = String(month);
    const trend = insight.months[key];
    if (isTrend(trend)) signals.push(signalFromTrend('month', key, monthLabel(key), trend));
  }
  if (season) {
    const trend = insight.seasons[season];
    if (isTrend(trend)) signals.push(signalFromTrend('season', season, seasonLabel(season), trend));
  }
  for (const tag of weatherTags) {
    const trend = insight.weather[tag];
    const category = weatherPlanningSignalCategoryForTag(tag);
    if (category && isTrend(trend)) {
      signals.push(signalFromTrend(category, tag, weatherTagLabel(tag), trend));
    }
  }
  for (const feature of calendarFeatures) {
    const trend = insight.calendar[feature];
    if (isTrend(trend)) {
      signals.push(
        signalFromTrend('calendar', feature, describeCalendarAppointmentFeature(feature), trend),
      );
    }
  }

  return sortPlanningSignals(signals);
}
