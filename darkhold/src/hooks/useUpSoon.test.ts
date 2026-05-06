import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchUpSoonData, UP_SOON_BOOK_NAME } from './useUpSoon';

const makeBook = (id: number, name: string) => ({
  id,
  name,
  description: '',
  order: 0,
  filter: null,
  created_by: 1,
});

const makeEntry = (id: number, recipeId: number, recipeName: string, bookId: number) => ({
  id,
  book: bookId,
  book_content: makeBook(bookId, UP_SOON_BOOK_NAME),
  recipe: { id: recipeId, name: recipeName, created_by: 1 },
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchUpSoonData', () => {
  it('returns null when no "Up Soon" book exists', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ count: 1, results: [makeBook(10, 'Other Book')], next: null }),
      }),
    );

    const result = await fetchUpSoonData();
    expect(result).toBeNull();
  });

  it('returns bookId and entries when "Up Soon" book exists', async () => {
    const fetchMock = vi
      .fn()
      // First call: GET /recipe-book/ (page 1)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            count: 1,
            results: [makeBook(42, UP_SOON_BOOK_NAME)],
            next: null,
          }),
      })
      // Second call: GET /recipe-book-entry/?book=42 (page 1)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            count: 2,
            results: [makeEntry(1, 100, 'Pasta', 42), makeEntry(2, 200, 'Soup', 42)],
            next: null,
          }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchUpSoonData();
    expect(result).not.toBeNull();
    expect(result!.bookId).toBe(42);
    expect(result!.entries).toHaveLength(2);
    expect(result!.entries[0]).toMatchObject({ entryId: 1, recipeId: 100 });
    expect(result!.entries[1]).toMatchObject({ entryId: 2, recipeId: 200 });
  });

  it('handles pagination for books', async () => {
    const fetchMock = vi
      .fn()
      // GET /recipe-book/ page 1 — no "Up Soon" yet, has next
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            count: 2,
            results: [makeBook(1, 'Favourites')],
            next: '/api/recipe-book/?page=2',
          }),
      })
      // GET /recipe-book/ page 2 — "Up Soon" book here
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            count: 2,
            results: [makeBook(55, UP_SOON_BOOK_NAME)],
            next: null,
          }),
      })
      // GET /recipe-book-entry/?book=55 page 1 — no entries
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ count: 0, results: [], next: null }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchUpSoonData();
    expect(result).not.toBeNull();
    expect(result!.bookId).toBe(55);
    expect(result!.entries).toHaveLength(0);
  });

  it('filters out entries without a recipe', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ count: 1, results: [makeBook(42, UP_SOON_BOOK_NAME)], next: null }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            count: 2,
            results: [
              makeEntry(1, 100, 'Valid', 42),
              // Entry with null recipe (shouldn't happen but defensive)
              { id: 2, book: 42, book_content: makeBook(42, UP_SOON_BOOK_NAME), recipe: null },
            ],
            next: null,
          }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchUpSoonData();
    expect(result!.entries).toHaveLength(1);
    expect(result!.entries[0].recipeId).toBe(100);
  });
});
