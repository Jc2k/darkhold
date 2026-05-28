import { queryOptions } from '@tanstack/react-query';
import { apiGet } from '../api/client';
import type { Food, PaginatedResponse, SupermarketCategory } from '../api/tandoor-types';

export interface ShoppingListEntry {
  id: number;
  amount?: number | null;
  unit?: { id: number; name: string } | null;
  unit_name?: string | null;
  food: Food | null;
  checked: boolean;
  ingredient_note?: string | null;
  recipe_mealplan?: {
    recipe_name: string;
    from_date?: string | null;
    meal_type?: {
      id?: number;
      name?: string | null;
      order?: number | null;
      time?: string | null;
    } | null;
  } | null;
  list_recipe_data?: { recipe_data: { name: string } } | null;
  list_recipe?: number | null;
  supermarket_category?: SupermarketCategory | null;
}

export async function fetchAllShoppingListEntries(): Promise<ShoppingListEntry[]> {
  const all: ShoppingListEntry[] = [];
  let page = 1;
  let hasNext = true;

  while (hasNext) {
    const data = await apiGet<PaginatedResponse<ShoppingListEntry>>('/shopping-list-entry/', {
      page_size: 100,
      page,
    });
    all.push(...data.results);
    hasNext = !!data.next;
    page += 1;
  }

  return all;
}

export function getShoppingListEntriesQueryOptions() {
  return queryOptions({
    queryKey: ['shopping-list'],
    queryFn: fetchAllShoppingListEntries,
  });
}
