import { formatDate } from './dateUtils';

export const RECENTLY_ADDED_DAYS = 30;

export function buildRecentlyAddedRecipeParams(now: Date = new Date()) {
  const createdAtGte = new Date(now);
  createdAtGte.setHours(0, 0, 0, 0);
  createdAtGte.setDate(createdAtGte.getDate() - RECENTLY_ADDED_DAYS);

  return {
    created_at_gte: formatDate(createdAtGte),
    sort_order: '-created_at',
  } as const;
}
