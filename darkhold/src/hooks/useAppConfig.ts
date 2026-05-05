import { useQuery } from '@tanstack/react-query';

export interface AppConfig {
  tandoor_external_url?: string;
}

export async function fetchAppConfig(): Promise<AppConfig> {
  try {
    const res = await fetch('/app-config.json');
    // Non-ok responses (e.g. 404 when running outside the add-on) are handled
    // gracefully so the app still works without an external URL configured.
    if (!res.ok) return {};
    try {
      return (await res.json()) as AppConfig;
    } catch {
      return {};
    }
  } catch {
    return {};
  }
}

export function useAppConfig(): AppConfig {
  const { data } = useQuery({
    queryKey: ['app-config'],
    queryFn: fetchAppConfig,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return data ?? {};
}
