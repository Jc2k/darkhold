import { useQuery } from '@tanstack/react-query';
import {
  isMealAssistantPrecalculation,
  type MealAssistantPrecalculation,
} from '../utils/mealAssistantPrecalculation';
import {
  buildMealAssistantDebugStats,
  getMealAssistantDebugSchemaStatus,
  type MealAssistantDebugStats,
} from '../utils/mealAssistantDebugStats';
import { ONE_DAY, ONE_WEEK } from '../utils/cacheConfig';

export const MEAL_ASSISTANT_DEBUG_QUERY_KEY = ['meal-assistant-debug'] as const;
export const MEAL_ASSISTANT_STATUS_QUERY_KEY = ['meal-assistant-status'] as const;

export interface MealAssistantNightlyStatus {
  status: 'success' | 'error' | 'skipped';
  updatedAt: string;
  lastSuccessAt?: string;
  message: string;
  detail?: string;
  error?: string;
  stack?: string;
}

export interface MealAssistantDebugData {
  precalculation: MealAssistantPrecalculation | null;
  stats: MealAssistantDebugStats | null;
  schemaStatus: Pick<
    MealAssistantDebugStats,
    'expectedSchemaVersion' | 'actualSchemaVersion' | 'isCurrentSchema'
  >;
  hasPrecalculationFile: boolean;
  isReadablePrecalculation: boolean;
  generatedAt?: string;
}

function generatedAtOf(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const generatedAt = (payload as { generatedAt?: unknown }).generatedAt;
  return typeof generatedAt === 'string' ? generatedAt : undefined;
}

function isMealAssistantNightlyStatus(value: unknown): value is MealAssistantNightlyStatus {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    (record.status === 'success' || record.status === 'error' || record.status === 'skipped') &&
    typeof record.updatedAt === 'string' &&
    typeof record.message === 'string'
  );
}

export async function fetchMealAssistantDebugData(): Promise<MealAssistantDebugData> {
  const res = await fetch('/meal-assistant-precalculation.json', {
    headers: { Accept: 'application/json' },
  });

  if (res.status === 404) {
    return {
      precalculation: null,
      stats: null,
      schemaStatus: getMealAssistantDebugSchemaStatus(null),
      hasPrecalculationFile: false,
      isReadablePrecalculation: false,
    };
  }

  if (!res.ok) throw new Error(`Precalculation fetch failed ${res.status}`);

  const payload: unknown = await res.json();
  const schemaStatus = getMealAssistantDebugSchemaStatus(payload);
  if (!isMealAssistantPrecalculation(payload)) {
    return {
      precalculation: null,
      stats: null,
      schemaStatus,
      hasPrecalculationFile: true,
      isReadablePrecalculation: false,
      ...(generatedAtOf(payload) ? { generatedAt: generatedAtOf(payload) } : {}),
    };
  }

  return {
    precalculation: payload,
    stats: buildMealAssistantDebugStats(payload),
    schemaStatus,
    hasPrecalculationFile: true,
    isReadablePrecalculation: true,
    generatedAt: payload.generatedAt,
  };
}

export async function fetchMealAssistantNightlyStatus(): Promise<MealAssistantNightlyStatus | null> {
  const res = await fetch('/meal-assistant-status.json', {
    headers: { Accept: 'application/json' },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Meal assistant status fetch failed ${res.status}`);
  const payload: unknown = await res.json();
  return isMealAssistantNightlyStatus(payload) ? payload : null;
}

export function useMealAssistantDebug() {
  return useQuery({
    queryKey: MEAL_ASSISTANT_DEBUG_QUERY_KEY,
    queryFn: fetchMealAssistantDebugData,
    staleTime: ONE_DAY,
    gcTime: ONE_WEEK,
  });
}

export function useMealAssistantNightlyStatus() {
  return useQuery({
    queryKey: MEAL_ASSISTANT_STATUS_QUERY_KEY,
    queryFn: fetchMealAssistantNightlyStatus,
    staleTime: 5 * 60 * 1000,
    gcTime: ONE_WEEK,
  });
}
