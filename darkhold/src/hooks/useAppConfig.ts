import { useQuery } from '@tanstack/react-query';

export interface AppConfig {
  tandoor_external_url?: string;
  /** True when the server has a default token configured and nginx will inject
   *  it for requests that carry no personal token.  The SPA uses this to skip
   *  the /settings redirect for unauthenticated users. */
  has_default_token?: boolean;
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

export function useAppConfig(): AppConfig & { isConfigLoading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: ['app-config'],
    queryFn: fetchAppConfig,
  });
  return { ...(data ?? {}), isConfigLoading: isLoading };
}
