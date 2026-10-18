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

export function pantryReservation(entry: RolloverShoppingEntry): boolean {
  return entry.shopping_lists?.some((list) => list.name === 'Use from Pantry') ?? false;
}

export function isLinkedToToday(entry: RolloverShoppingEntry, today: string): boolean {
  const plan = entry.list_recipe_data?.meal_plan_data;
  const from = plan?.from_date?.slice(0, 10);
  const until = plan?.to_date?.slice(0, 10) ?? from;
  return !!from && !!until && from <= today && today <= until;
}

/**
 * Only roll over after the shopping list contains an actual meal-plan entry
 * covering the current day. Never remove current-week entries, unresolved
 * pantry allocations, unbought manual requests or unbought replacements.
 *
 * Checked items (already bought) and older planned-meal entries are historical
 * shopping requirements and can be removed once the next cycle is underway.
 */
export function planShoppingRollover(
  entries: RolloverShoppingEntry[],
  today: string,
): { cycle: string; ready: boolean; ids: number[] } {
  const cycle = shoppingCycleStart(today);
  const ready = entries.some((entry) => isLinkedToToday(entry, today));
  if (!ready) return { cycle, ready: false, ids: [] };

  const ids = entries.filter((entry) => {
    if (pantryReservation(entry) || isLinkedToToday(entry, today)) return false;
    const from = entry.list_recipe_data?.meal_plan_data?.from_date?.slice(0, 10);
    // Old planned meals belong to the previous shop, even if left unchecked.
    if (from && from < cycle) return true;
    // Bought requests may safely leave the shopping list once the new week starts.
    // Do not delete a checked item belonging to a current/future planned meal.
    if (entry.checked && !from) return true;
    return false;
  }).map((entry) => entry.id);

  return { cycle, ready: true, ids };
}
