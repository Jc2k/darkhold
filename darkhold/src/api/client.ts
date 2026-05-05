const BASE_URL = "/api";

function getToken(): string {
  return localStorage.getItem("tandoor_token") || "";
}

function buildUrl(
  path: string,
  params?: Record<string, string | number | boolean | undefined | null>,
): string {
  const url = new URL(BASE_URL + path, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") {
        url.searchParams.set(k, String(v));
      }
    });
  }
  return url.toString();
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    "Content-Type": "application/json",
  };
}

export async function apiGet<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined | null>,
): Promise<T> {
  const res = await fetch(buildUrl(path, params), { headers: authHeaders() });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(buildUrl(path), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(buildUrl(path), {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function apiDelete(path: string): Promise<void> {
  const res = await fetch(buildUrl(path), {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
}

export async function searchKeywords(query: string) {
  const res = await apiGet<{ count: number; results: { id: number; name: string }[] }>('/keyword/', { query, page_size: 20 });
  return res.results ?? [];
}

export async function searchFoods(query: string) {
  const res = await apiGet<{ count: number; results: { id: number; name: string }[] }>('/food/', { query, page_size: 20 });
  return res.results ?? [];
}
