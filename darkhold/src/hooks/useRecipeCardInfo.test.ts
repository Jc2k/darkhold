import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchRecipeCardInfo } from './useRecipeCardInfo';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('fetchRecipeCardInfo', () => {
  it('fetches detailed recipe data without requesting private cook logs when no personal token exists', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 7, name: 'Soup', created_by: 1 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchRecipeCardInfo(7)).resolves.toEqual({
      recipe: { id: 7, name: 'Soup', created_by: 1 },
      lastCookedAt: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost/api/recipe/7/');
  });

  it('includes the latest cook-log timestamp when a personal token exists', async () => {
    localStorage.setItem('tandoor_token', 'personal-token');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 7, name: 'Soup', created_by: 1 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          count: 1,
          results: [{ id: 4, recipe: 7, created_at: '2026-05-01T18:00:00' }],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchRecipeCardInfo(7)).resolves.toEqual({
      recipe: { id: 7, name: 'Soup', created_by: 1 },
      lastCookedAt: '2026-05-01T18:00:00',
    });
    expect(fetchMock.mock.calls[1][0]).toBe(
      'http://localhost/api/cook-log/?recipe=7&ordering=-created_at&page_size=1',
    );
  });

  it('keeps detailed recipe data available if cook-log loading fails', async () => {
    localStorage.setItem('tandoor_token', 'personal-token');
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 7, name: 'Soup', created_by: 1 }),
        })
        .mockResolvedValueOnce({ ok: false, status: 403 }),
    );

    await expect(fetchRecipeCardInfo(7)).resolves.toEqual({
      recipe: { id: 7, name: 'Soup', created_by: 1 },
      lastCookedAt: null,
    });
  });
});
