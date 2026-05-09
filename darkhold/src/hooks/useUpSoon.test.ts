import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchUpSoonData, createUpSoonBook, UP_SOON_BOOK_NAME } from './useUpSoon';

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
      // Second call: GET /recipe-book-entry/?book=42 (page 1) — Promise.all, entries first
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            count: 2,
            results: [makeEntry(1, 100, 'Pasta', 42), makeEntry(2, 200, 'Soup', 42)],
            next: null,
          }),
      })
      // Third call: GET /recipe/?books_and=42 (page 1) — Promise.all, recipes second
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            count: 2,
            results: [
              { id: 100, name: 'Pasta', created_by: 1 },
              { id: 200, name: 'Soup', created_by: 1 },
            ],
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
      // GET /recipe-book-entry/?book=55 page 1 — no entries (Promise.all, entries first)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ count: 0, results: [], next: null }),
      })
      // GET /recipe/?books_and=55 page 1 — no recipes (Promise.all, recipes second)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ count: 0, results: [], next: null }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchUpSoonData();
    expect(result).not.toBeNull();
    expect(result!.bookId).toBe(55);
    expect(result!.entries).toHaveLength(0);
  });

  it('fetches full recipe when entry returns recipe as a number', async () => {
    const fetchMock = vi
      .fn()
      // GET /recipe-book/ (page 1)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ count: 1, results: [makeBook(42, UP_SOON_BOOK_NAME)], next: null }),
      })
      // GET /recipe-book-entry/?book=42 (page 1) — recipe returned as plain number
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            count: 1,
            results: [
              { id: 7, book: 42, book_content: makeBook(42, UP_SOON_BOOK_NAME), recipe: 100 },
            ],
            next: null,
          }),
      })
      // GET /recipe/?books_and=42 (page 1) — full recipe fetched via books_and
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            count: 1,
            results: [{ id: 100, name: 'Pasta', created_by: 1 }],
            next: null,
          }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchUpSoonData();
    expect(result).not.toBeNull();
    expect(result!.entries).toHaveLength(1);
    expect(result!.entries[0].recipeId).toBe(100);
    expect(result!.entries[0].recipe.name).toBe('Pasta');
  });

  it('filters out entries without a recipe', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ count: 1, results: [makeBook(42, UP_SOON_BOOK_NAME)], next: null }),
      })
      // Entries: one valid, one with null recipe
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
      })
      // GET /recipe/?books_and=42 — only the valid recipe is returned
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            count: 1,
            results: [{ id: 100, name: 'Valid', created_by: 1 }],
            next: null,
          }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchUpSoonData();
    expect(result!.entries).toHaveLength(1);
    expect(result!.entries[0].recipeId).toBe(100);
  });
});

describe('createUpSoonBook', () => {
  it('fetches users and creates book with shared set to all user IDs', async () => {
    const fetchMock = vi
      .fn()
      // First call: GET /user/
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve([
            { id: 1, username: 'alice' },
            { id: 2, username: 'bob' },
          ]),
      })
      // Second call: POST /recipe-book/
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 99, name: UP_SOON_BOOK_NAME, shared: [1, 2] }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const book = await createUpSoonBook();
    expect(book.id).toBe(99);
    expect(book.name).toBe(UP_SOON_BOOK_NAME);

    const postCall = fetchMock.mock.calls[1];
    const postBody = JSON.parse(postCall[1].body);
    expect(postBody.name).toBe(UP_SOON_BOOK_NAME);
    expect(postBody.shared).toEqual([1, 2]);
  });

  it('creates book shared with empty array when no users are returned', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 10, name: UP_SOON_BOOK_NAME, shared: [] }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const book = await createUpSoonBook();
    expect(book.id).toBe(10);

    const postBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(postBody.shared).toEqual([]);
  });
});
