import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ShoppingListEntry } from './useShoppingListEntries';
import { matchesUnboughtRequest, requestPantryReplenishment } from './usePantryReplenishment';

afterEach(() => {
  vi.unstubAllGlobals();
});

const food = { id: 10, name: 'Pesto' };
function entry(changes: Partial<ShoppingListEntry> = {}): ShoppingListEntry {
  return { id: 5, food, checked: false, unit: null, ...changes };
}
function response(body: unknown) {
  return { ok: true, json: async () => body };
}

describe('pantry replenishment matching', () => {
  it('recognises existing unbought requests for the same food and unit', () => {
    expect(matchesUnboughtRequest(entry(), 10, null)).toBe(true);
    expect(matchesUnboughtRequest(entry({ checked: true }), 10, null)).toBe(false);
    expect(matchesUnboughtRequest(entry({ unit: { id: 2, name: 'jar' } }), 10, null)).toBe(false);
    expect(matchesUnboughtRequest(entry({ food: { id: 12, name: 'Salsa' } }), 10, null)).toBe(false);
  });

  it('never treats a soft pantry reservation as an outstanding purchase', () => {
    const reserved = entry({
      shopping_lists: [{ id: 17, name: 'Use from Pantry' }],
    });
    expect(matchesUnboughtRequest(reserved, 10, null)).toBe(false);
  });
});

describe('requestPantryReplenishment', () => {
  it('skips creating duplicates when an unbought request already exists', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      count: 1,
      results: [entry()],
      next: null,
    }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await requestPantryReplenishment(food, null, 1)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('adds a separate labelled shopping request for confirmed use', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ count: 0, results: [], next: null }))
      .mockResolvedValueOnce(response({ id: 9, name: 'Pantry Replenishment' }))
      .mockResolvedValueOnce(response(entry({ id: 27 })));
    vi.stubGlobal('fetch', fetchMock);

    const created = await requestPantryReplenishment(food, null, 1);
    expect(created?.id).toBe(27);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const [, listRequest, request] = fetchMock.mock.calls;
    expect(listRequest[0]).toContain('/api/shopping-list/');
    expect(JSON.parse(request[1].body)).toMatchObject({
      food,
      amount: 1,
      checked: false,
      shopping_lists: [{ id: 9, name: 'Pantry Replenishment' }],
    });
  });

  it('never creates a replacement when nothing was used', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await requestPantryReplenishment(food, null, 0)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
