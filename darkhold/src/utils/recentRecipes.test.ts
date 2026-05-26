import { describe, expect, it, vi, afterEach } from 'vitest';
import { buildRecentlyAddedRecipeParams, RECENTLY_ADDED_DAYS } from './recentRecipes';

describe('buildRecentlyAddedRecipeParams', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('builds a created_at_gte filter for recipes added in the last 30 days', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-26T14:15:00Z'));

    expect(buildRecentlyAddedRecipeParams()).toEqual({
      created_at_gte: '2026-04-26',
      sort_order: '-created_at',
    });
  });

  it('uses the provided reference date when one is supplied', () => {
    expect(buildRecentlyAddedRecipeParams(new Date('2026-01-10T20:00:00Z'))).toEqual({
      created_at_gte: '2025-12-11',
      sort_order: '-created_at',
    });
  });

  it('keeps the recently-added window at 30 days', () => {
    expect(RECENTLY_ADDED_DAYS).toBe(30);
  });
});
