import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchProduceFoodNames } from './useMealPlanningAssistantData';

function makeCategoriesResponse(categories: Array<{ id: number; name: string }>) {
  return {
    count: categories.length,
    next: null,
    previous: null,
    results: categories,
  };
}

function makeFoodsResponse(foods: Array<{ id: number; name: string }>, next = false) {
  return {
    count: foods.length,
    next: next ? 'http://example.com/api/food/?page=2' : null,
    previous: null,
    results: foods.map((f) => ({ id: f.id, name: f.name, created_by: 1 })),
  };
}

describe('fetchProduceFoodNames', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns empty array when category name is empty', async () => {
    const result = await fetchProduceFoodNames('');
    expect(result).toEqual([]);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('returns empty array when the category is not found', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => makeCategoriesResponse([{ id: 1, name: 'Dairy' }]),
    } as Response);

    const result = await fetchProduceFoodNames('Produce');
    expect(result).toEqual([]);
  });

  it('returns food names (lowercased) from the matching category (case-insensitive match)', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () =>
          makeCategoriesResponse([
            { id: 5, name: 'Produce' },
            { id: 6, name: 'Dairy' },
          ]),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () =>
          makeFoodsResponse([
            { id: 10, name: 'Aubergine' },
            { id: 11, name: 'Courgette' },
            { id: 12, name: 'Leek' },
          ]),
      } as Response);

    const result = await fetchProduceFoodNames('produce');
    expect(result).toEqual(['aubergine', 'courgette', 'leek']);
  });

  it('trims whitespace from category name before matching', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => makeCategoriesResponse([{ id: 3, name: 'Produce' }]),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => makeFoodsResponse([{ id: 10, name: 'Broccoli' }]),
      } as Response);

    const result = await fetchProduceFoodNames('  Produce  ');
    expect(result).toEqual(['broccoli']);
  });

  it('paginates through multiple pages of foods', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => makeCategoriesResponse([{ id: 5, name: 'Produce' }]),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => makeFoodsResponse([{ id: 10, name: 'Aubergine' }], true),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => makeFoodsResponse([{ id: 11, name: 'Courgette' }]),
      } as Response);

    const result = await fetchProduceFoodNames('Produce');
    expect(result).toEqual(['aubergine', 'courgette']);
  });

  it('paginates through multiple pages of categories when necessary', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          count: 2,
          next: 'http://example.com/api/supermarket-category/?page=2',
          previous: null,
          results: [{ id: 1, name: 'Dairy' }],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => makeCategoriesResponse([{ id: 5, name: 'Produce' }]),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => makeFoodsResponse([{ id: 10, name: 'Kale' }]),
      } as Response);

    const result = await fetchProduceFoodNames('Produce');
    expect(result).toEqual(['kale']);
  });
});
