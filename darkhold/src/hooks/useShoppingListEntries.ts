import { queryOptions } from '@tanstack/react-query';
import { apiGet } from '../api/client';
import type {
  Food,
  PaginatedResponse,
  ShoppingList,
  SupermarketCategory,
} from '../api/tandoor-types';

export interface ShoppingListEntry {
  id: number;
  amount?: number | null;
  unit?: { id: number; name: string } | null;
  unit_name?: string | null;
  food: Food | null;
  checked: boolean;
  created_by?: { username: string } | null;
  ingredient_note?: string | null;
  list_recipe_data?: {
    recipe?: number | null;
    recipe_data: {
      name: string;
      ingredients?: Array<{
        food?: Food | number | null;
      }>;
      steps?: Array<{
        order?: number | null;
        ingredients?: Array<{
          food?: Food | number | null;
        }>;
      }>;
    };
    meal_plan_data?: {
      from_date?: string | null;
    } | null;
  } | null;
  list_recipe?: number | null;
  supermarket_category?: SupermarketCategory | null;
  shopping_lists?: ShoppingList[];
}

export async function fetchAllShoppingListEntries(): Promise<ShoppingListEntry[]> {
  const all: ShoppingListEntry[] = [];
  let page = 1;
  let hasNext = true;

  while (hasNext) {
    const data = await apiGet<PaginatedResponse<ShoppingListEntry>>('/shopping-list-entry/', {
      ordering: '-created_at',
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
