import { describe, it, expect } from 'vitest';
import { deriveMealType } from './mealUtils';
import type { MealType } from '../api/tandoor-types';

const mealTypes: MealType[] = [
  { id: 1, name: 'Breakfast' },
  { id: 2, name: 'Lunch' },
  { id: 3, name: 'Dinner' },
  { id: 4, name: 'Snack' },
];

describe('deriveMealType', () => {
  it('matches breakfast keyword to breakfast meal type', () => {
    const recipe = { id: 1, name: 'Eggs', keywords: [{ id: 10, name: 'Breakfast' }] };
    expect(deriveMealType(recipe, mealTypes)).toBe(1);
  });

  it('matches lunch keyword to lunch meal type', () => {
    const recipe = { id: 1, name: 'Sandwich', keywords: [{ id: 11, name: 'lunch' }] };
    expect(deriveMealType(recipe, mealTypes)).toBe(2);
  });

  it('matches dessert keyword to snack/dessert meal type', () => {
    const recipe = { id: 1, name: 'Cake', keywords: [{ id: 12, name: 'Dessert' }] };
    expect(deriveMealType(recipe, mealTypes)).toBe(4);
  });

  it('matches snack keyword to snack meal type', () => {
    const recipe = { id: 1, name: 'Biscuit', keywords: [{ id: 13, name: 'snack' }] };
    expect(deriveMealType(recipe, mealTypes)).toBe(4);
  });

  it('falls back to dinner when no matching keyword', () => {
    const recipe = { id: 1, name: 'Pasta', keywords: [{ id: 14, name: 'Italian' }] };
    expect(deriveMealType(recipe, mealTypes)).toBe(3);
  });

  it('falls back to first meal type when no dinner meal type exists', () => {
    const limited: MealType[] = [{ id: 5, name: 'Brunch' }];
    const recipe = { id: 1, name: 'Pasta', keywords: [] };
    expect(deriveMealType(recipe, limited)).toBe(5);
  });

  it('handles numeric keywords (ids only) without crashing', () => {
    const recipe = { id: 1, name: 'Pasta', keywords: [1, 2, 3] };
    expect(deriveMealType(recipe, mealTypes)).toBe(3);
  });

  it('handles recipes with no keywords', () => {
    const recipe = { id: 1, name: 'Pasta' };
    expect(deriveMealType(recipe, mealTypes)).toBe(3);
  });
});
