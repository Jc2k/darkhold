import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiGet, apiPost, apiPatch, apiDelete, searchKeywords, searchFoods } from './client';

type MockFetch = ReturnType<typeof vi.fn>;

function mockFetch(response: Partial<Response> & { json?: () => Promise<unknown> }): MockFetch {
  const fn = vi.fn().mockResolvedValueOnce(response);
  vi.stubGlobal('fetch', fn);
  return fn;
}

function okJson(data: unknown): Partial<Response> & { json: () => Promise<unknown> } {
  return { ok: true, json: () => Promise.resolve(data) };
}

beforeEach(() => {
  localStorage.setItem('tandoor_token', 'test-token');
});

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// apiGet
// ---------------------------------------------------------------------------

describe('apiGet', () => {
  it('sends a GET request to the correct API path', async () => {
    const fn = mockFetch(okJson({ count: 0, results: [] }));
    await apiGet('/recipe/');
    const [url] = fn.mock.calls[0] as [string];
    expect(url).toContain('/api/recipe/');
  });

  it('sends the Bearer token in the Authorization header', async () => {
    const fn = mockFetch(okJson({}));
    await apiGet('/recipe/');
    const [, opts] = fn.mock.calls[0] as [string, RequestInit];
    expect((opts.headers as Record<string, string>)['Authorization']).toBe('Bearer test-token');
  });

  it('falls back to empty string token when none is stored', async () => {
    localStorage.clear();
    const fn = mockFetch(okJson({}));
    await apiGet('/recipe/');
    const [, opts] = fn.mock.calls[0] as [string, RequestInit];
    expect((opts.headers as Record<string, string>)['Authorization']).toBe('Bearer ');
  });

  it('appends query parameters to the URL', async () => {
    const fn = mockFetch(okJson({}));
    await apiGet('/recipe/', { query: 'pasta', page: 2 });
    const [url] = fn.mock.calls[0] as [string];
    expect(url).toContain('query=pasta');
    expect(url).toContain('page=2');
  });

  it('omits null, undefined, and empty-string parameters', async () => {
    const fn = mockFetch(okJson({}));
    await apiGet('/recipe/', { query: null, page: undefined, size: 10 });
    const [url] = fn.mock.calls[0] as [string];
    expect(url).not.toContain('query');
    expect(url).not.toContain('page=');
    expect(url).toContain('size=10');
  });

  it('throws with a message containing the status code on non-OK response', async () => {
    mockFetch({ ok: false, status: 404 } as Response);
    await expect(apiGet('/recipe/')).rejects.toThrow('API error 404');
  });

  it('returns the parsed JSON response', async () => {
    const data = { count: 1, results: [{ id: 1 }] };
    mockFetch(okJson(data));
    const result = await apiGet('/recipe/');
    expect(result).toEqual(data);
  });
});

// ---------------------------------------------------------------------------
// apiPost
// ---------------------------------------------------------------------------

describe('apiPost', () => {
  it('sends a POST request with the correct method and JSON body', async () => {
    const fn = mockFetch(okJson({ id: 1 }));
    await apiPost('/recipe/', { name: 'Pasta' });
    const [, opts] = fn.mock.calls[0] as [string, RequestInit];
    expect(opts.method).toBe('POST');
    expect(opts.body).toBe(JSON.stringify({ name: 'Pasta' }));
  });

  it('sets Content-Type to application/json', async () => {
    const fn = mockFetch(okJson({}));
    await apiPost('/recipe/', {});
    const [, opts] = fn.mock.calls[0] as [string, RequestInit];
    expect((opts.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('throws on non-OK response', async () => {
    mockFetch({ ok: false, status: 400 } as Response);
    await expect(apiPost('/recipe/', {})).rejects.toThrow('API error 400');
  });
});

// ---------------------------------------------------------------------------
// apiPatch
// ---------------------------------------------------------------------------

describe('apiPatch', () => {
  it('sends a PATCH request with the correct method and JSON body', async () => {
    const fn = mockFetch(okJson({ id: 1, name: 'Updated' }));
    await apiPatch('/recipe/1/', { name: 'Updated' });
    const [, opts] = fn.mock.calls[0] as [string, RequestInit];
    expect(opts.method).toBe('PATCH');
    expect(opts.body).toBe(JSON.stringify({ name: 'Updated' }));
  });

  it('throws on non-OK response', async () => {
    mockFetch({ ok: false, status: 403 } as Response);
    await expect(apiPatch('/recipe/1/', {})).rejects.toThrow('API error 403');
  });
});

// ---------------------------------------------------------------------------
// apiDelete
// ---------------------------------------------------------------------------

describe('apiDelete', () => {
  it('sends a DELETE request to the correct path', async () => {
    const fn = mockFetch({ ok: true } as Response);
    await apiDelete('/recipe/1/');
    const [url, opts] = fn.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/recipe/1/');
    expect(opts.method).toBe('DELETE');
  });

  it('resolves without a return value on success', async () => {
    mockFetch({ ok: true } as Response);
    const result = await apiDelete('/recipe/1/');
    expect(result).toBeUndefined();
  });

  it('throws on non-OK response', async () => {
    mockFetch({ ok: false, status: 403 } as Response);
    await expect(apiDelete('/recipe/1/')).rejects.toThrow('API error 403');
  });
});

// ---------------------------------------------------------------------------
// searchKeywords
// ---------------------------------------------------------------------------

describe('searchKeywords', () => {
  it('returns the results array from the keyword endpoint', async () => {
    const keywords = [{ id: 1, name: 'vegan' }];
    mockFetch(okJson({ count: 1, results: keywords }));
    const result = await searchKeywords('vegan');
    expect(result).toEqual(keywords);
  });

  it('includes the query and page_size parameters in the request', async () => {
    const fn = mockFetch(okJson({ count: 0, results: [] }));
    await searchKeywords('vegan');
    const [url] = fn.mock.calls[0] as [string];
    expect(url).toContain('/api/keyword/');
    expect(url).toContain('query=vegan');
    expect(url).toContain('page_size=20');
  });

  it('returns an empty array when results is absent', async () => {
    mockFetch(okJson({ count: 0 }));
    const result = await searchKeywords('nothing');
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// searchFoods
// ---------------------------------------------------------------------------

describe('searchFoods', () => {
  it('returns the results array from the food endpoint', async () => {
    const foods = [{ id: 5, name: 'tomato' }];
    mockFetch(okJson({ count: 1, results: foods }));
    const result = await searchFoods('tomato');
    expect(result).toEqual(foods);
  });

  it('includes the query and page_size parameters in the request', async () => {
    const fn = mockFetch(okJson({ count: 0, results: [] }));
    await searchFoods('tomato');
    const [url] = fn.mock.calls[0] as [string];
    expect(url).toContain('/api/food/');
    expect(url).toContain('query=tomato');
    expect(url).toContain('page_size=20');
  });

  it('returns an empty array when results is absent', async () => {
    mockFetch(okJson({ count: 0 }));
    const result = await searchFoods('nothing');
    expect(result).toEqual([]);
  });
});
