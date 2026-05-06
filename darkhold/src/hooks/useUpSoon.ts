import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiDelete } from '../api/client';
import type { RecipeBook, RecipeBookEntry, Recipe, PaginatedResponse } from '../api/tandoor-types';
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
  return {
    bookId: book.id,
    entries: entries
      .filter((e) => e.recipe != null)
      .map((e) => ({ entryId: e.id, recipeId: e.recipe.id, recipe: e.recipe })),
  };
}

/** Shared query hook — multiple components can call this and get the same cached data. */
export function useUpSoonData() {
  return useQuery({
    queryKey: ['up-soon'],
    queryFn: fetchUpSoonData,
  });
}

/** Adds a recipe to the "Up Soon" book, creating the book if it doesn't exist yet. */
export function useAddToUpSoon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (recipeId: number) => {
      // Get or create the "Up Soon" book
      let bookId: number | null = qc.getQueryData<UpSoonData | null>(['up-soon'])?.bookId ?? null;
      if (!bookId) {
        const book = await apiPost<RecipeBook>('/recipe-book/', { name: UP_SOON_BOOK_NAME });
        bookId = book.id;
      }
      return apiPost<RecipeBookEntry>('/recipe-book-entry/', { book: bookId, recipe: recipeId });
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
      if (!entry) throw new Error('Recipe not in Up Soon');
      await apiDelete(`/recipe-book-entry/${entry.entryId}/`);
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
