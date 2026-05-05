import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchAppConfig } from './useAppConfig';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchAppConfig', () => {
  it('returns config when the response is valid JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ tandoor_external_url: 'https://tandoor.example.com' }),
    }));

    const config = await fetchAppConfig();
    expect(config).toEqual({ tandoor_external_url: 'https://tandoor.example.com' });
  });

  it('returns has_default_token when present in the response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ has_default_token: true }),
    }));

    const config = await fetchAppConfig();
    expect(config).toEqual({ has_default_token: true });
  });

  it('returns empty object when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}),
    }));

    const config = await fetchAppConfig();
    expect(config).toEqual({});
  });

  it('returns empty object when the response body is malformed JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
    }));

    const config = await fetchAppConfig();
    expect(config).toEqual({});
  });

  it('returns empty object when fetch throws a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Network error')));

    const config = await fetchAppConfig();
    expect(config).toEqual({});
  });

  it('returns empty object when the config file is missing (404)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve(null),
    }));

    const config = await fetchAppConfig();
    expect(config).toEqual({});
  });
});
