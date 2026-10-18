import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPost } from '../api/client';
import type { Food, PaginatedResponse, RecipeUnit } from '../api/tandoor-types';
import { invalidateCacheQueries } from './useCacheInvalidation';
import type { PantryInventoryEntry } from './usePantryReservations';

export interface PantryHousehold {
  id: number;
  name: string;
}

export interface PantryLocation {
  id: number;
  name: string;
  is_freezer: boolean;
  household: PantryHousehold;
}

async function fetchEveryPage<T>(path: string): Promise<T[]> {
  const values: T[] = [];
  let page = 1;
  while (true) {
    const response = await apiGet<PaginatedResponse<T>>(path, { page_size: 100, page });
    values.push(...response.results);
    if (!response.next) return values;
    page++;
  }
}

export function usePantryLocations() {
  return useQuery({
    queryKey: ['pantry-locations'],
    queryFn: () => fetchEveryPage<PantryLocation>('/inventory-location/'),
    staleTime: 5 * 60_000,
  });
}

export function usePantryHouseholds() {
  return useQuery({
    queryKey: ['pantry-households'],
    queryFn: () => fetchEveryPage<PantryHousehold>('/household/'),
    staleTime: 10 * 60_000,
  });
}

export function useCreatePantryLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: { name: string; household: PantryHousehold; is_freezer: boolean }) =>
      apiPost<PantryLocation>('/inventory-location/', values),
    onSuccess: (created) => {
      queryClient.setQueryData<PantryLocation[]>(['pantry-locations'], (existing) =>
        existing ? [...existing, created] : [created],
      );
      invalidateCacheQueries(queryClient, 'pantry-locations');
    },
  });
}

export function usePantryUnits() {
  return useQuery({
    queryKey: ['pantry-units'],
    queryFn: () => fetchEveryPage<RecipeUnit>('/unit/'),
    staleTime: 10 * 60_000,
  });
}

export interface PantryEntryDraft {
  food: { id?: number; name: string };
  location: PantryLocation;
  amount: number;
  unit: RecipeUnit | null;
  expires: string | null;
  subLocation: string;
  note: string;
}

/** An existing food is reused by id; a custom name is created once in Tandoor. */
export async function createPantryEntry(draft: PantryEntryDraft): Promise<PantryInventoryEntry> {
  const name = draft.food.name.trim();
  if (!name) throw new Error('Select or enter an ingredient.');
  if (!Number.isFinite(draft.amount) || draft.amount <= 0) {
    throw new Error('Enter an amount greater than zero.');
  }
  if (!draft.location?.id) throw new Error('Choose a storage location.');
  if (draft.expires && !/^\d{4}-\d{2}-\d{2}$/.test(draft.expires)) {
    throw new Error('Enter a valid expiry date.');
  }

  const food: Food | { id: number; name: string } = draft.food.id
    ? { id: draft.food.id, name }
    : await apiPost<Food>('/food/', { name });

  return apiPost<PantryInventoryEntry>('/inventory-entry/', {
    food,
    inventory_location: draft.location,
    amount: draft.amount,
    unit: draft.unit,
    expires: draft.expires,
    sub_location: draft.subLocation || null,
    note: draft.note || null,
  });
}

export function useCreatePantryEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createPantryEntry,
    onSuccess: (created) => {
      queryClient.setQueryData<PantryInventoryEntry[]>(['pantry-inventory'], (existing) =>
        existing ? [...existing, created] : existing,
      );
      invalidateCacheQueries(queryClient, 'pantry-inventory');
    },
  });
}

export function useUpdatePantryEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: number; updates: { expires?: string | null; amount?: number } }) =>
      apiPatch<PantryInventoryEntry>(`/inventory-entry/${id}/`, updates),
    onSuccess: (updated) => {
      queryClient.setQueryData<PantryInventoryEntry[]>(['pantry-inventory'], (existing) =>
        existing?.map((entry) => (entry.id === updated.id ? updated : entry)),
      );
      invalidateCacheQueries(queryClient, 'pantry-inventory');
    },
  });
}

/** Expired batches remain visible for reconciliation, but excluded from usable stock. */
export function pantryExpiryStatus(
  expires: string | null,
  today: string,
  windowDays = 30,
): 'expired' | 'soon' | 'later' | 'unknown' {
  if (!expires) return 'unknown';
  if (expires < today) return 'expired';
  const days = Math.round(
    (Date.parse(`${expires}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );
  return days <= windowDays ? 'soon' : 'later';
}
