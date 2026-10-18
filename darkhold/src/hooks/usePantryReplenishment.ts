import { apiPost } from '../api/client';
import type { ShoppingList, Food, RecipeUnit } from '../api/tandoor-types';
import { fetchAllShoppingListEntries } from './useShoppingListEntries';
import type { ShoppingListEntry } from './useShoppingListEntries';
import { isReservedForPantry } from './usePantryReservations';

/** Kept separate from the meal's ingredient so it remains visible at the next shop. */
export const PANTRY_REPLENISHMENT_LIST = 'Pantry Replenishment';

export function isPantryReplenishment(entry: ShoppingListEntry): boolean {
  return entry.shopping_lists?.some((list) => list.name === PANTRY_REPLENISHMENT_LIST) ?? false;
}

export function matchesUnboughtRequest(
  entry: ShoppingListEntry,
  foodId: number,
  unitId: number | null,
): boolean {
  return (
    !entry.checked &&
    !isReservedForPantry(entry) &&
    entry.food?.id === foodId &&
    (entry.unit?.id ?? null) === unitId
  );
}

/**
 * A requested replacement is a separate normal shopping-list item, tagged to
 * explain why it is on the list. Do not add a duplicate if stock was already
 * requested (including when a previous POST succeeded but its response was lost).
 *
 * This helper is for optional replenishment during manual cook confirmation.
 * The overnight meal-plan automation instead reclassifies the existing reserved
 * shopping entry after its stock deduction, without creating a duplicate.
 */
export async function requestPantryReplenishment(
  food: Food,
  unit: RecipeUnit | null,
  amount: number,
): Promise<ShoppingListEntry | null> {
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const current = await fetchAllShoppingListEntries();
  if (current.some((entry) => matchesUnboughtRequest(entry, food.id, unit?.id ?? null))) {
    return null;
  }

  const list = await apiPost<ShoppingList>('/shopping-list/', {
    name: PANTRY_REPLENISHMENT_LIST,
  });

  return apiPost<ShoppingListEntry>('/shopping-list-entry/', {
    food: { id: food.id, name: food.name },
    unit,
    amount,
    checked: false,
    shopping_lists: [list],
  });
}
