import type { MealPlan, CookLog } from '../api/tandoor-types';
import type { RolloverShoppingEntry } from './shoppingRollover';

/** A meal that has genuinely passed; don't backfill arbitrary historic plans on first install. */
export function duePlannedMeals(
  plans: MealPlan[],
  today: string,
  activatedFromDate: string,
): MealPlan[] {
  return plans
    .filter((plan) => {
      const start = plan.from_date?.slice(0, 10);
      const end = plan.to_date?.slice(0, 10) || start;
      return Boolean(start && start >= activatedFromDate && end && end < today);
    })
    .sort((a, b) => a.from_date.localeCompare(b.from_date) || a.id - b.id);
}

/** Match the existing historic backfill's duplicate rule: recipe + calendar day. */
export function plannedCookLogKey(recipeId: number, date: string): string {
  return date.slice(0, 10) + ':' + recipeId;
}

export function existingCookLogKeys(logs: CookLog[]): Set<string> {
  return new Set(logs.map((log) =>
    plannedCookLogKey(typeof log.recipe === 'number' ? log.recipe : log.recipe.id, log.created_at),
  ));
}

/** Backfill timestamp convention: planned meal time if configured, otherwise noon. */
export function automaticCookLogTimestamp(plan: MealPlan): string {
  const day = plan.from_date.slice(0, 10);
  const mealType = typeof plan.meal_type === 'object' ? plan.meal_type : null;
  const time = mealType?.time || '12:00:00';
  return day + 'T' + (/^\d\d:\d\d$/.test(time) ? time + ':00' : time);
}

export function reservationMealId(entry: RolloverShoppingEntry): number | null {
  return entry.list_recipe_data?.meal_plan_data?.id
    ?? entry.list_recipe_data?.mealplan
    ?? null;
}

export interface AutoInventoryBatch {
  id: number;
  food: { id: number } | number | null;
  unit: { id: number } | number | null;
  amount: number | string;
  expires?: string | null;
}

export interface PantryDeduction {
  batchId: number;
  before: number;
  after: number;
  applied: boolean;
}

const EPSILON = 0.000001;
export function sameQuantity(a: number, b: number): boolean {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < EPSILON;
}
function decimal(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
function id(value: { id: number } | number | null | undefined): number | null {
  return typeof value === 'number' ? value : (value?.id ?? null);
}

/**
 * Reserve an exact quantity from compatible batches, oldest expiry first.
 * Never silently convert units, leave negative stock, or assume a missing amount.
 * The returned before/after plan must be journalled BEFORE any remote PATCH.
 */
export function planAutomaticPantryDeductions(
  entry: RolloverShoppingEntry,
  batches: AutoInventoryBatch[],
  mealDate: string,
): PantryDeduction[] {
  const amount = Number(entry.amount);
  const foodId = id(entry.food);
  if (!foodId || entry.amount == null || !Number.isFinite(amount) || amount <= 0) {
    throw new Error('Pantry reservation has no valid food and positive quantity.');
  }
  const unitId = id(entry.unit);
  const candidates = batches
    .filter((batch) =>
      id(batch.food) === foodId &&
      id(batch.unit) === unitId &&
      Number.isFinite(Number(batch.amount)) &&
      Number(batch.amount) > 0 &&
      (!batch.expires || batch.expires.slice(0, 10) >= mealDate),
    )
    .sort((a, b) =>
      (a.expires ?? '9999-12-31').localeCompare(b.expires ?? '9999-12-31') || a.id - b.id,
    );
  const total = candidates.reduce((sum, batch) => sum + Number(batch.amount), 0);
  if (total + EPSILON < amount) {
    throw new Error('Insufficient compatible pantry stock for the planned quantity.');
  }
  let remaining = amount;
  const movements: PantryDeduction[] = [];
  for (const batch of candidates) {
    if (remaining <= EPSILON) break;
    const before = decimal(Number(batch.amount));
    const used = Math.min(before, remaining);
    movements.push({ batchId: batch.id, before, after: decimal(before - used), applied: false });
    remaining = decimal(remaining - used);
  }
  return movements;
}

/**
 * A PATCH can succeed even when its response is lost. On retry compare the
 * persisted before/after values with the actual stock: never deduct twice.
 * An unexpected value may be a concurrent edit, and needs human review.
 */
export function pantryDeductionRetry(
  actualAmount: number | string,
  movement: PantryDeduction,
): 'already-applied' | 'safe-to-apply' | 'conflict' {
  const actual = Number(actualAmount);
  if (sameQuantity(actual, movement.after)) return 'already-applied';
  if (sameQuantity(actual, movement.before)) return 'safe-to-apply';
  return 'conflict';
}

/** UK-local date arithmetic independent of DST or the server's system zone. */
export function previousCalendarDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day));
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}
