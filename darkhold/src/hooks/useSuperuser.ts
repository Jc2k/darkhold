import { useQuery } from '@tanstack/react-query';
import { fetchIsSuperuser } from '../api/housekeeping';

export function useSuperuser() {
  return useQuery({
    queryKey: ['is-superuser'],
    queryFn: fetchIsSuperuser,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });
}
