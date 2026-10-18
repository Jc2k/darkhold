import { describe, expect, it } from 'vitest';
import type { ShoppingListEntry } from './useShoppingListEntries';
import {
  isReservedForPantry,
  reservationMealPlanId,
  usablePantryBatches,
  type PantryInventoryEntry,
} from './usePantryReservations';

const food = { id: 10, name: 'Pesto' };

function shoppingEntry(fields: Partial<ShoppingListEntry> = {}): ShoppingListEntry {
  return { id: 7, food, checked: false, ...fields };
}

function stock(fields: Partial<PantryInventoryEntry> = {}): PantryInventoryEntry {
  return {
    id: 22,
    food,
    amount: '2',
    unit: null,
    expires: '2026-11-01',
    inventory_location: { id: 5, name: 'Cupboard' },
    ...fields,
  };
}

describe('pantry reservation state', () => {
  it('detects the named Tandoor shopping-list label', () => {
    expect(isReservedForPantry(shoppingEntry())).toBe(false);
    expect(isReservedForPantry(shoppingEntry({
      shopping_lists: [{ id: 3, name: 'Use from Pantry' }],
    }))).toBe(true);
  });

  it('follows the linked meal plan rather than just recipe or date', () => {
    expect(reservationMealPlanId(shoppingEntry())).toBeNull();
    expect(reservationMealPlanId(shoppingEntry({
      list_recipe_data: {
        recipe_data: { name: 'Curry' },
        meal_plan_data: { id: 123, from_date: '2026-10-18' },
      },
    }))).toBe(123);
  });
});

describe('usablePantryBatches', () => {
  it('excludes expired, empty, and unrelated batches', () => {
    const batches = [
      stock({ id: 1, expires: '2026-10-17' }),
      stock({ id: 2, amount: 0 }),
      stock({ id: 3, food: { id: 42, name: 'Mustard' } }),
      stock({ id: 4, expires: '2026-10-18' }),
      stock({ id: 5, expires: null }),
    ];

    expect(usablePantryBatches(batches, 10, '2026-10-18').map((batch) => batch.id)).toEqual([4, 5]);
  });

  it('uses earliest expiry first without merging physical batches', () => {
    const batches = [
      stock({ id: 1, expires: '2026-12-20' }),
      stock({ id: 2, expires: null }),
      stock({ id: 3, expires: '2026-10-20' }),
    ];

    expect(usablePantryBatches(batches, 10, '2026-10-18').map((batch) => batch.id)).toEqual([3, 1, 2]);
  });
});
