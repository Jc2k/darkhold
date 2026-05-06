import { useState } from 'react';
import type { Recipe } from '../api/tandoor-types';

export const RECENTLY_VIEWED_KEY = 'recently_viewed_recipes';
export const MAX_RECENTLY_VIEWED = 10;

/** Minimal recipe snapshot stored per entry. */
export interface RecentRecipe {
  id: number;
  name: string;
  image?: string | null;
  keywords?: Recipe['keywords'];
  rating?: number | null;
  created_by: number;
}

export function readRecentlyViewed(): RecentRecipe[] {
  try {
    const raw = localStorage.getItem(RECENTLY_VIEWED_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecentRecipe[];
  } catch {
    return [];
  }
}

export function addRecentlyViewed(recipe: Recipe): void {
  const current = readRecentlyViewed();
  const filtered = current.filter((r) => r.id !== recipe.id);
  const entry: RecentRecipe = {
    id: recipe.id,
    name: recipe.name,
    image: recipe.image,
    keywords: recipe.keywords,
    rating: recipe.rating,
    created_by: recipe.created_by,
  };
  const updated = [entry, ...filtered].slice(0, MAX_RECENTLY_VIEWED);
  try {
    localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(updated));
  } catch {
    // storage full or unavailable — fail silently
  }
}

/**
 * Returns the list of recently viewed recipes from localStorage.
 * The list is read once on mount; it will be fresh whenever the component mounts.
 */
export function useRecentlyViewed(): RecentRecipe[] {
  const [recipes] = useState<RecentRecipe[]>(readRecentlyViewed);
  return recipes;
}
