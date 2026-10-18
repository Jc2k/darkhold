import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPost } from '../api/client';
import type { Food, PaginatedResponse, RecipeUnit, ShoppingList } from '../api/tandoor-types';
import type { ShoppingListEntry } from './useShoppingListEntries';
import { useShoppingListEntries } from './useShoppingListEntries';
import { invalidateCacheQueries } from './useCacheInvalidation';

export const PANTRY_RESERVATION_LIST = 'Use from Pantry';

export interface PantryInventoryEntry {
  id: number;
  food: Food | null;
  amount: number | string;
  unit: RecipeUnit | null;
  expires: string | null;
  inventory_location: { id: number; name: string; is_freezer?: boolean };
  note?: string | null;
}

/** Tandoor returns positive-stock entries by default; fetch every page. */
export async function fetchPantryInventory(): Promise<PantryInventoryEntry[]> {
  const items: PantryInventoryEntry[] = [];
  let page = 1;
  while (true) {
    const result = await apiGet<PaginatedResponse<PantryInventoryEntry>>('/inventory-entry/', {
      page_size: 100,
      page,
    });
    items.push(...result.results);
    if (!result.next) return items;
    page++;
  }
}

export function usePantryInventory() {
  return useQuery({
    queryKey: ['pantry-inventory'],
    queryFn: fetchPantryInventory,
    staleTime: 60_000,
    refetchOnMount: 'always',
  });
}

export function isReservedForPantry(entry: ShoppingListEntry): boolean {
  return entry.shopping_lists?.some((list) => list.name === PANTRY_RESERVATION_LIST) ?? false;
}

export function reservationMealPlanId(entry: ShoppingListEntry): number | null {
  return entry.list_recipe_data?.meal_plan_data?.id ?? entry.list_recipe_data?.mealplan ?? null;
}

export function usePantryReservations() {
  const query = useShoppingListEntries();
  return {
    ...query,
    reservations: (query.data ?? []).filter(
      (entry) => !entry.checked && isReservedForPantry(entry) && reservationMealPlanId(entry) != null,
    ),
  };
}

/** A soft reservation is a Tandoor shopping-list membership, never a stock deduction. */
export function useSetPantryReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ entries, reserved }: { entries: ShoppingListEntry[]; reserved: boolean }) => {
      const list = reserved
        ? await apiPost<ShoppingList>('/shopping-list/', { name: PANTRY_RESERVATION_LIST })
        : null;
      await Promise.all(
        entries.map((entry) => {
          const otherLists = (entry.shopping_lists ?? []).filter(
            (item) => item.name !== PANTRY_RESERVATION_LIST,
          );
          return apiPatch<ShoppingListEntry>(`/shopping-list-entry/${entry.id}/`, {
            shopping_lists: list ? [...otherLists, list] : otherLists,
          });
        }),
      );
      return { entries, reserved, list };
    },
    onSuccess: ({ entries, reserved, list }) => {
      const ids = new Set(entries.map((entry) => entry.id));
      qc.setQueryData<ShoppingListEntry[]>(['shopping-list'], (current) =>
        current?.map((entry) => {
          if (!ids.has(entry.id)) return entry;
          const others = (entry.shopping_lists ?? []).filter(
            (item) => item.name !== PANTRY_RESERVATION_LIST,
          );
          return { ...entry, shopping_lists: reserved && list ? [...others, list] : others };
        }),
      );
      invalidateCacheQueries(qc, 'shopping-list');
    },
  });
}

/** Check individual batches, not just aggregate food presence. No implicit unit conversions. */
export function usablePantryBatches(
  entries: PantryInventoryEntry[],
  foodId: number,
  today: string,
): PantryInventoryEntry[] {
  return entries
    .filter(
      (entry) =>
        entry.food?.id === foodId &&
        Number(entry.amount) > 0 &&
        (entry.expires == null || entry.expires >= today),
    )
    .sort((a, b) => (a.expires ?? '9999-12-31').localeCompare(b.expires ?? '9999-12-31'));
}
