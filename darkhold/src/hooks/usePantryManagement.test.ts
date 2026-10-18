import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPantryEntry, pantryExpiryStatus } from './usePantryManagement';

afterEach(() => {
  vi.unstubAllGlobals();
});

const location = {
  id: 6,
  name: 'Garage freezer',
  is_freezer: true,
  household: { id: 2, name: 'Home' },
};

function reply(data: unknown) {
  return { ok: true, json: async () => data };
}

describe('pantryExpiryStatus', () => {
  it('reports expired batches and upcoming expiry without relying on a timezone', () => {
    expect(pantryExpiryStatus('2026-10-17', '2026-10-18')).toBe('expired');
    expect(pantryExpiryStatus('2026-10-18', '2026-10-18')).toBe('soon');
    expect(pantryExpiryStatus('2026-11-17', '2026-10-18')).toBe('soon');
    expect(pantryExpiryStatus('2026-11-18', '2026-10-18')).toBe('later');
    expect(pantryExpiryStatus(null, '2026-10-18')).toBe('unknown');
  });
});

describe('createPantryEntry', () => {
  it('uses the selected existing food and records expiry and location', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply({ id: 27 }));
    vi.stubGlobal('fetch', fetchMock);

    await createPantryEntry({
      food: { id: 10, name: 'Pesto' },
      location,
      amount: 2,
      unit: null,
      expires: '2026-12-01',
      subLocation: 'upper shelf',
      note: 'Special batch',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/inventory-entry/');
    expect(JSON.parse(options.body as string)).toMatchObject({
      food: { id: 10, name: 'Pesto' },
      inventory_location: location,
      amount: 2,
      expires: '2026-12-01',
      sub_location: 'upper shelf',
    });
  });

  it('creates a new food before adding it to inventory', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(reply({ id: 19, name: 'Special chutney' }))
      .mockResolvedValueOnce(reply({ id: 31 }));
    vi.stubGlobal('fetch', fetchMock);

    await createPantryEntry({
      food: { name: 'Special chutney' },
      location,
      amount: 1,
      unit: null,
      expires: null,
      subLocation: '',
      note: '',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('/api/food/');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ name: 'Special chutney' });
    expect(fetchMock.mock.calls[1][0]).toContain('/api/inventory-entry/');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).food).toMatchObject({
      id: 19,
      name: 'Special chutney',
    });
  });

  it('rejects invalid quantities before any API writes', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(createPantryEntry({
      food: { name: 'Pesto' },
      location,
      amount: 0,
      unit: null,
      expires: null,
      subLocation: '',
      note: '',
    })).rejects.toThrow(/amount greater than zero/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
