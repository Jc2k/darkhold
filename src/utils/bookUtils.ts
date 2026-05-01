import type { Keyword } from '../api/tandoor-types';

export function getFilterId(filter: Keyword | number | null | undefined): number | null {
  if (filter == null) return null;
  if (typeof filter === 'number') return filter;
  return filter.id;
}
