import { useQuery } from '@tanstack/react-query';

export interface AppConfig {
  tandoor_external_url?: string;
}

async function fetchAppConfig(): Promise<AppConfig> {
  try {
    const res = await fetch('/app-config.json');
    if (!res.ok) return {};
    return res.json() as Promise<AppConfig>;
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
