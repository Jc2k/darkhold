import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiDelete } from '../api/client';
import type { RecipeBook, RecipeBookEntry, Recipe, User, PaginatedResponse } from '../api/tandoor-types';
import { broadcastInvalidation } from './useInvalidationSocket';

export const UP_SOON_BOOK_NAME = 'Up Soon';

export interface UpSoonEntry {
  entryId: number;
  recipeId: number;
  recipe: Recipe;
}

export interface UpSoonData {
  bookId: number;
  entries: UpSoonEntry[];
}

async function fetchAllBooks(): Promise<RecipeBook[]> {
  const all: RecipeBook[] = [];
  let page = 1;
  let hasNext = true;
  while (hasNext) {
    const data = await apiGet<PaginatedResponse<RecipeBook>>('/recipe-book/', { page_size: 100, page });
    all.push(...data.results);
    hasNext = !!data.next;
    page++;
  }
  return all;
}

async function fetchAllEntriesForBook(bookId: number): Promise<RecipeBookEntry[]> {
  const all: RecipeBookEntry[] = [];
  let page = 1;
  let hasNext = true;
  while (hasNext) {
    const data = await apiGet<PaginatedResponse<RecipeBookEntry>>('/recipe-book-entry/', {
      book: bookId,
      page_size: 100,
      page,
    });
    all.push(...data.results);
    hasNext = !!data.next;
    page++;
  }
  return all;
}

export async function fetchUpSoonData(): Promise<UpSoonData | null> {
  const books = await fetchAllBooks();
  const book = books.find((b) => b.name === UP_SOON_BOOK_NAME);
  if (!book) return null;
  const entries = await fetchAllEntriesForBook(book.id);

  const validEntries = entries.filter((e) => e.recipe != null);

  // The Tandoor API may return `recipe` as a plain ID rather than a full object.
  // Fetch the full recipe for any such entries so the shelf can display them.
  const enrichedEntries = await Promise.all(
    validEntries.map(async (e) => {
      const recipe: Recipe =
        typeof e.recipe === 'number'
          ? await apiGet<Recipe>(`/recipe/${e.recipe}/`)
          : (e.recipe as Recipe);
      return { entryId: e.id, recipeId: recipe.id, recipe };
    }),
  );

  return {
    bookId: book.id,
    entries: enrichedEntries,
  };
}

/** Shared query hook — multiple components can call this and get the same cached data. */
export function useUpSoonData() {
  return useQuery({
    queryKey: ['up-soon'],
    queryFn: fetchUpSoonData,
  });
}

/** Creates the "Up Soon" book shared with all household members. */
export async function createUpSoonBook(): Promise<RecipeBook> {
  const users = await apiGet<User[]>('/user/');
  const shared = users.map((u) => u.id);
  return apiPost<RecipeBook>('/recipe-book/', { name: UP_SOON_BOOK_NAME, shared });
}

/** Adds a recipe to the "Up Soon" book, creating the book if it doesn't exist yet. */
export function useAddToUpSoon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (recipeId: number) => {
      // Get or create the "Up Soon" book
      let bookId: number | null = qc.getQueryData<UpSoonData | null>(['up-soon'])?.bookId ?? null;
      if (!bookId) {
        const book = await createUpSoonBook();
        bookId = book.id;
      }
      return apiPost<RecipeBookEntry>('/recipe-book-entry/', { book: bookId, recipe: recipeId });
    },
    onMutate: async (recipeId) => {
      await qc.cancelQueries({ queryKey: ['up-soon'] });
      const previous = qc.getQueryData<UpSoonData | null>(['up-soon']);
      if (previous) {
        qc.setQueryData<UpSoonData | null>(['up-soon'], {
          ...previous,
          entries: [
            ...previous.entries,
            { entryId: -1, recipeId, recipe: { id: recipeId, name: '', created_by: 0 } },
          ],
        });
      }
      return { previous };
    },
    onError: (_err, _recipeId, context) => {
      if (context?.previous !== undefined) {
        qc.setQueryData(['up-soon'], context.previous);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['up-soon'] });
      broadcastInvalidation('up-soon');
    },
  });
}

/** Removes a recipe from the "Up Soon" book. */
export function useRemoveFromUpSoon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (recipeId: number) => {
      const data = qc.getQueryData<UpSoonData | null>(['up-soon']);
      const entry = data?.entries.find((e) => e.recipeId === recipeId);
      if (!entry) throw new Error('Cannot remove recipe: not found in Up Soon book');
      await apiDelete(`/recipe-book-entry/${entry.entryId}/`);
    },
    onMutate: async (recipeId) => {
      await qc.cancelQueries({ queryKey: ['up-soon'] });
      const previous = qc.getQueryData<UpSoonData | null>(['up-soon']);
      if (previous) {
        qc.setQueryData<UpSoonData | null>(['up-soon'], {
          ...previous,
          entries: previous.entries.filter((e) => e.recipeId !== recipeId),
        });
      }
      return { previous };
    },
    onError: (_err, _recipeId, context) => {
      if (context?.previous !== undefined) {
        qc.setQueryData(['up-soon'], context.previous);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['up-soon'] });
      broadcastInvalidation('up-soon');
    },
  });
}

/**
 * Convenience hook for a specific recipe — returns its up-soon status and
 * pre-bound add/remove actions.
 */
export function useUpSoonForRecipe(recipeId: number) {
  const { data, isLoading } = useUpSoonData();
  const addMutation = useAddToUpSoon();
  const removeMutation = useRemoveFromUpSoon();

  const isInUpSoon = useMemo(
    () => data?.entries.some((e) => e.recipeId === recipeId) ?? false,
    [data, recipeId],
  );

  return {
    isLoading,
    isInUpSoon,
    isPending: addMutation.isPending || removeMutation.isPending,
    toggle: () => {
      if (isInUpSoon) {
        removeMutation.mutate(recipeId);
      } else {
        addMutation.mutate(recipeId);
      }
    },
  };
}
