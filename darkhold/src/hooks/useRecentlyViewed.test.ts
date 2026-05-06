import { describe, it, expect, afterEach } from 'vitest';
import {
  addRecentlyViewed,
  readRecentlyViewed,
  MAX_RECENTLY_VIEWED,
} from './useRecentlyViewed';
import type { Recipe } from '../api/tandoor-types';

function makeRecipe(id: number): Recipe {
  return { id, name: `Recipe ${id}`, created_by: 1 };
}

afterEach(() => {
  localStorage.clear();
});

describe('readRecentlyViewed', () => {
  it('returns empty array when storage is empty', () => {
    expect(readRecentlyViewed()).toEqual([]);
  });

  it('returns empty array when storage contains invalid JSON', () => {
    localStorage.setItem('recently_viewed_recipes', 'not-json');
    expect(readRecentlyViewed()).toEqual([]);
  });
});

describe('addRecentlyViewed', () => {
  it('adds a recipe to the list', () => {
    addRecentlyViewed(makeRecipe(1));
    const list = readRecentlyViewed();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(1);
    expect(list[0].name).toBe('Recipe 1');
  });

  it('stores most recent recipe first', () => {
    addRecentlyViewed(makeRecipe(1));
    addRecentlyViewed(makeRecipe(2));
    const list = readRecentlyViewed();
    expect(list[0].id).toBe(2);
    expect(list[1].id).toBe(1);
  });

  it('moves a re-visited recipe to the front without duplicates', () => {
    addRecentlyViewed(makeRecipe(1));
    addRecentlyViewed(makeRecipe(2));
    addRecentlyViewed(makeRecipe(1));
    const list = readRecentlyViewed();
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe(1);
    expect(list[1].id).toBe(2);
  });

  it('limits the list to MAX_RECENTLY_VIEWED entries', () => {
    for (let i = 1; i <= MAX_RECENTLY_VIEWED + 5; i++) {
      addRecentlyViewed(makeRecipe(i));
    }
    expect(readRecentlyViewed()).toHaveLength(MAX_RECENTLY_VIEWED);
  });

  it('stores the most recently added entries when limit is exceeded', () => {
    for (let i = 1; i <= MAX_RECENTLY_VIEWED + 3; i++) {
      addRecentlyViewed(makeRecipe(i));
    }
    const list = readRecentlyViewed();
    // The newest entry should be first
    expect(list[0].id).toBe(MAX_RECENTLY_VIEWED + 3);
    // Oldest entries should have been evicted
    expect(list.map((r) => r.id)).not.toContain(1);
  });

  it('preserves image, keywords and rating on the stored entry', () => {
    const recipe: Recipe = {
      id: 42,
      name: 'Test Recipe',
      created_by: 1,
      image: '/media/test.jpg',
      rating: 4,
      keywords: [{ id: 7, name: 'Italian' }],
    };
    addRecentlyViewed(recipe);
    const [stored] = readRecentlyViewed();
    expect(stored.image).toBe('/media/test.jpg');
    expect(stored.rating).toBe(4);
    expect(stored.keywords).toEqual([{ id: 7, name: 'Italian' }]);
  });
});
