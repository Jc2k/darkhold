import type { MealAssistantRecipeHistory } from './mealAssistantPrecalculation';

export const WEEKDAY_SIGNAL_ALPHA = 0.05;
export const MIN_WEEKDAY_SIGNAL_TOTAL = 5;

const DEFAULT_DAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export interface WeekdayRecipeSignalDay {
  dayIndex: number;
  label: string;
  count: number;
  share: number;
}

export interface WeekdayRecipeSignal {
  total: number;
  days: WeekdayRecipeSignalDay[];
  expectedShare: number;
  observedShare: number;
  pValue: number;
}

export interface WeekdayRecipeSignalOptions {
  alpha?: number;
  minTotal?: number;
  dayLabels?: readonly string[];
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

export function binomialUpperTail(trials: number, successes: number, probability: number): number {
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

export function getWeekdayRecipeSignal(
  history: Pick<MealAssistantRecipeHistory, 'dayCounts' | 'totalPlanCount'> | undefined,
  options: WeekdayRecipeSignalOptions = {},
): WeekdayRecipeSignal | undefined {
  const minTotal = options.minTotal ?? MIN_WEEKDAY_SIGNAL_TOTAL;
  if (!history || history.totalPlanCount < minTotal) return undefined;

  const dayLabels = options.dayLabels ?? DEFAULT_DAY_LABELS;
  const rankedDays = history.dayCounts
    .map((count, dayIndex) => ({ dayIndex, count }))
    .sort((left, right) => right.count - left.count || left.dayIndex - right.dayIndex);
  const topOneCount = rankedDays[0]?.count ?? 0;
  const topTwoCount = topOneCount + (rankedDays[1]?.count ?? 0);
  const dayCount = history.dayCounts.length;
  const oneDayPValue = Math.min(
    1,
    binomialUpperTail(history.totalPlanCount, topOneCount, 1 / dayCount) * dayCount,
  );
  const twoDayCombinations = (dayCount * (dayCount - 1)) / 2;
  const twoDayPValue = Math.min(
    1,
    binomialUpperTail(history.totalPlanCount, topTwoCount, 2 / dayCount) * twoDayCombinations,
  );
  const useTwoDays = twoDayPValue < oneDayPValue && (rankedDays[1]?.count ?? 0) > 0;
  const pValue = useTwoDays ? twoDayPValue : oneDayPValue;
  if (pValue > (options.alpha ?? WEEKDAY_SIGNAL_ALPHA)) return undefined;

  const selectedDays = rankedDays.slice(0, useTwoDays ? 2 : 1);
  const observedCount = selectedDays.reduce((total, day) => total + day.count, 0);
  return {
    total: history.totalPlanCount,
    days: selectedDays.map(({ dayIndex, count }) => ({
      dayIndex,
      label: dayLabels[dayIndex] ?? `Day ${dayIndex}`,
      count,
      share: count / history.totalPlanCount,
    })),
    expectedShare: selectedDays.length / dayCount,
    observedShare: observedCount / history.totalPlanCount,
    pValue,
  };
}
