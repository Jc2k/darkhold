import { describe, expect, it } from 'vitest';
import { buildRecipeSimilarityIndex } from './recipeSimilarity';

describe('recipeSimilarity', () => {
  it('builds deterministic similarities and multi-recipe affinity clusters', () => {
    const recipes = [
      {
        id: 1,
        name: 'Tomato Pasta',
        keywords: ['Pasta'],
        ingredientFoodIds: [10, 11],
        ingredientFoodNames: ['Tomato', 'Basil'],
      },
      {
        id: 2,
        name: 'Creamy Tomato Pasta',
        keywords: ['Pasta'],
        ingredientFoodIds: [10, 12],
        ingredientFoodNames: ['Tomato', 'Cream'],
      },
      {
        id: 3,
        name: 'Creamy Basil Pasta',
        keywords: ['Pasta'],
        ingredientFoodIds: [11, 12],
        ingredientFoodNames: ['Basil', 'Cream'],
      },
      {
        id: 4,
        name: 'Chicken Rice Bowl',
        keywords: ['Rice'],
        ingredientFoodIds: [20, 21],
        ingredientFoodNames: ['Chicken', 'Rice'],
      },
    ];

    const first = buildRecipeSimilarityIndex(recipes);
    const second = buildRecipeSimilarityIndex(recipes);

    expect(first).toEqual(second);
    expect(first.recipeSimilarities['1'][0]).toMatchObject({
      recipeId: 2,
      sharedTerms: expect.arrayContaining(['pasta', 'tomato']),
    });
    expect(first.recipeSimilarities['1'][0].score).toBeGreaterThan(0.15);
    expect(first.recipeClusterMemberships['1']).toMatchObject({
      clusterId: 'cluster-1',
      label: 'pasta · basil · cream',
      size: 3,
    });
    expect(first.recipeClusterMemberships['2'].clusterId).toBe('cluster-1');
    expect(first.recipeClusterMemberships['3'].clusterId).toBe('cluster-1');
    expect(first.recipeClusters['cluster-1']).toEqual({
      id: 'cluster-1',
      label: 'pasta · basil · cream',
      labelTerms: ['pasta', 'basil', 'cream'],
      recipeIds: [1, 2, 3],
      size: 3,
    });
    expect(first.recipeClusters['cluster-4']).toBeUndefined();
    expect(first.recipeClusterMemberships['4']).toBeUndefined();
  });

  it('keeps day-context signals out of affinity clusters', () => {
    const recipes = [
      {
        id: 1,
        name: 'Garden Salad',
        keywords: ['Salad'],
        ingredientFoodIds: [1],
        ingredientFoodNames: ['Lettuce'],
        weatherTags: ['hot-day'],
      },
      {
        id: 2,
        name: 'Ice Cream',
        keywords: ['Dessert'],
        ingredientFoodIds: [2],
        ingredientFoodNames: ['Cream'],
        weatherTags: ['hot-day'],
      },
    ];

    const index = buildRecipeSimilarityIndex(recipes);

    expect(index.recipeSimilarities['1']).toEqual([]);
    expect(index.recipeClusters).toEqual({});
    expect(index.recipeClusterMemberships).toEqual({});
  });
});
