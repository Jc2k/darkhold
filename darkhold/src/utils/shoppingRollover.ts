/** One shopping cycle follows DarkHold's existing Saturday–Friday meal-plan weeks.
 * This helper is used by the 4 a.m. server task, not by the shopping UI.
 */
export interface RolloverShoppingEntry {
  id: number;
  checked: boolean;
  shopping_lists?: Array<{ name: string }>;
  list_recipe_data?: {
    meal_plan_data?: {
      from_date?: string | null;
      to_date?: string | null;
    } | null;
  } | null;
}

export interface LocalRolloverClock {
  date: string;
  hour: number;
}

export function ukRolloverClock(now: Date): LocalRolloverClock {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const field = (type: string): string => parts.find((part) => part.type === type)?.value ?? '';
  return { date: `${field('year')}-${field('month')}-${field('day')}`, hour: Number(field('hour')) };
}

export function shoppingCycleStart(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day));
  const daysSinceSaturday = (value.getUTCDay() + 1) % 7;
  value.setUTCDate(value.getUTCDate() - daysSinceSaturday);
  return value.toISOString().slice(0, 10);
}

export function isLinkedToToday(entry: RolloverShoppingEntry, today: string): boolean {
  const plan = entry.list_recipe_data?.meal_plan_data;
  const from = plan?.from_date?.slice(0, 10);
  const until = plan?.to_date?.slice(0, 10) ?? from;
  return !!from && !!until && from <= today && today <= until;
}

/**
 * A meal-plan shopping entry covering today indicates that this shopping cycle
 * has arrived. Empty the shopping list rather than retaining entries tied to
 * the new plan. This deletes shopping-list entries only; meal plans remain.
 *
 * Pantry reservations currently stored on shopping entries are also removed.
 * To reconcile those after the weekly clear, reservation state will need a
 * separate durable store rather than relying on shopping-list membership.
 */
export function planShoppingRollover(
  entries: RolloverShoppingEntry[],
  today: string,
): { cycle: string; ready: boolean; ids: number[] } {
  const cycle = shoppingCycleStart(today);
  const ready = entries.some((entry) => isLinkedToToday(entry, today));
  return { cycle, ready, ids: ready ? entries.map((entry) => entry.id) : [] };
}
