import { describeCalendarAppointmentFeature } from './calendarFeatures.ts';

export interface RecipeSimilarityInput {
  id: number;
  name: string;
  keywords: string[];
  ingredientFoodIds: number[];
  ingredientFoodNames: string[];
  categories?: string[];
  weatherTags?: string[];
  calendarFeatures?: string[];
}

export interface MealAssistantSimilarRecipe {
  recipeId: number;
  score: number;
  sharedTerms: string[];
}

export interface MealAssistantRecipeCluster {
  id: string;
  label: string;
  labelTerms: string[];
  recipeIds: number[];
  size: number;
}

export interface MealAssistantRecipeClusterMembership {
  clusterId: string;
  label: string;
  labelTerms: string[];
  size: number;
}

export interface RecipeSimilarityIndex {
  recipeSimilarities: Record<string, MealAssistantSimilarRecipe[]>;
  recipeClusters: Record<string, MealAssistantRecipeCluster>;
  recipeClusterMemberships: Record<string, MealAssistantRecipeClusterMembership>;
}

interface RecipeToken {
  key: string;
  label: string;
  source: 'keyword' | 'ingredient' | 'food-id' | 'category' | 'weather' | 'calendar' | 'name';
}

interface ClusterLabelTerm {
  label: string;
  count: number;
  priority: number;
}

const NAME_STOP_WORDS = new Set(['and', 'for', 'the', 'with', 'from', 'into', 'over', 'under']);
const MIN_SIMILARITY_SCORE = 0.15;
const CLUSTER_SIMILARITY_THRESHOLD = 0.18;
const MAX_SIMILAR_RECIPES = 5;

function normalizedText(value: string): string {
  return value.trim().toLowerCase();
}

function uniqueSortedStrings(values: Iterable<string>): string[] {
  return [...new Set([...values].map(normalizedText).filter(Boolean))].sort();
}

function nameTerms(name: string): string[] {
  return uniqueSortedStrings(
    name
      .split(/[^a-z0-9]+/i)
      .map((term) => term.trim().toLowerCase())
      .filter((term) => term.length >= 3 && !NAME_STOP_WORDS.has(term)),
  );
}

function buildRecipeTokens(recipe: RecipeSimilarityInput): Map<string, RecipeToken> {
  const tokens = new Map<string, RecipeToken>();
  for (const keyword of uniqueSortedStrings(recipe.keywords)) {
    tokens.set(`keyword:${keyword}`, {
      key: `keyword:${keyword}`,
      label: keyword,
      source: 'keyword',
    });
  }
  for (const ingredientName of uniqueSortedStrings(recipe.ingredientFoodNames)) {
    tokens.set(`ingredient:${ingredientName}`, {
      key: `ingredient:${ingredientName}`,
      label: ingredientName,
      source: 'ingredient',
    });
  }
  for (const ingredientFoodId of [...new Set(recipe.ingredientFoodIds)].sort((a, b) => a - b)) {
    tokens.set(`food-id:${ingredientFoodId}`, {
      key: `food-id:${ingredientFoodId}`,
      label: `food #${ingredientFoodId}`,
      source: 'food-id',
    });
  }
  for (const category of uniqueSortedStrings(recipe.categories ?? [])) {
    tokens.set(`category:${category}`, {
      key: `category:${category}`,
      label: category,
      source: 'category',
    });
  }
  for (const weatherTag of uniqueSortedStrings(recipe.weatherTags ?? [])) {
    tokens.set(`weather:${weatherTag}`, {
      key: `weather:${weatherTag}`,
      label: weatherTag,
      source: 'weather',
    });
  }
  for (const calendarFeature of uniqueSortedStrings(recipe.calendarFeatures ?? [])) {
    tokens.set(`calendar:${calendarFeature}`, {
      key: `calendar:${calendarFeature}`,
      label: describeCalendarAppointmentFeature(calendarFeature),
      source: 'calendar',
    });
  }
  for (const term of nameTerms(recipe.name)) {
    tokens.set(`name:${term}`, { key: `name:${term}`, label: term, source: 'name' });
  }
  return tokens;
}

function similarityScore(left: Map<string, RecipeToken>, right: Map<string, RecipeToken>): number {
  if (left.size === 0 && right.size === 0) return 0;
  let intersection = 0;
  for (const key of left.keys()) {
    if (right.has(key)) intersection += 1;
  }
  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : Math.round((intersection / union) * 1000) / 1000;
}

function tokenSourcePriority(source: RecipeToken['source']): number {
  switch (source) {
    case 'keyword':
      return 0;
    case 'ingredient':
      return 1;
    case 'category':
      return 2;
    case 'weather':
      return 3;
    case 'calendar':
      return 4;
    case 'name':
      return 5;
    case 'food-id':
      return 6;
  }
}

function sharedTerms(left: Map<string, RecipeToken>, right: Map<string, RecipeToken>): string[] {
  const shared = [...left.values()]
    .filter((token) => right.has(token.key))
    .sort(
      (a, b) =>
        tokenSourcePriority(a.source) - tokenSourcePriority(b.source) ||
        a.label.localeCompare(b.label),
    )
    .map((token) => token.label);
  return [...new Set(shared)].slice(0, 4);
}

function clusterLabelTerms(recipes: RecipeSimilarityInput[]): string[] {
  const counts = new Map<string, ClusterLabelTerm>();
  const addLabel = (label: string, priority: number) => {
    const normalized = normalizedText(label);
    if (!normalized) return;
    const existing = counts.get(normalized);
    counts.set(normalized, {
      label: normalized,
      count: (existing?.count ?? 0) + 1,
      priority: Math.min(existing?.priority ?? priority, priority),
    });
  };

  for (const recipe of recipes) {
    const recipePriorities = new Map<string, number>();
    for (const keyword of uniqueSortedStrings(recipe.keywords)) recipePriorities.set(keyword, 0);
    for (const ingredient of uniqueSortedStrings(recipe.ingredientFoodNames)) {
      recipePriorities.set(ingredient, Math.min(recipePriorities.get(ingredient) ?? 1, 1));
    }
    for (const category of uniqueSortedStrings(recipe.categories ?? [])) {
      recipePriorities.set(category, Math.min(recipePriorities.get(category) ?? 2, 2));
    }
    for (const weatherTag of uniqueSortedStrings(recipe.weatherTags ?? [])) {
      recipePriorities.set(weatherTag, Math.min(recipePriorities.get(weatherTag) ?? 3, 3));
    }
    for (const calendarFeature of uniqueSortedStrings(recipe.calendarFeatures ?? [])) {
      recipePriorities.set(
        describeCalendarAppointmentFeature(calendarFeature),
        Math.min(recipePriorities.get(describeCalendarAppointmentFeature(calendarFeature)) ?? 4, 4),
      );
    }
    for (const [label, priority] of recipePriorities.entries()) {
      addLabel(label, priority);
    }
  }

  if (counts.size === 0) {
    for (const recipe of recipes) {
      for (const term of new Set(nameTerms(recipe.name))) addLabel(term, 3);
    }
  }

  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.priority - b.priority || a.label.localeCompare(b.label))
    .slice(0, 3)
    .map((term) => term.label);
}

export function buildRecipeSimilarityIndex(
  recipes: RecipeSimilarityInput[],
): RecipeSimilarityIndex {
  const sortedRecipes = recipes
    .slice()
    .sort((left, right) => left.id - right.id || left.name.localeCompare(right.name));
  const recipesById = new Map(sortedRecipes.map((recipe) => [recipe.id, recipe]));
  const tokensById = new Map(sortedRecipes.map((recipe) => [recipe.id, buildRecipeTokens(recipe)]));
  const recipeSimilarities: Record<string, MealAssistantSimilarRecipe[]> = Object.fromEntries(
    sortedRecipes.map((recipe) => [String(recipe.id), [] as MealAssistantSimilarRecipe[]]),
  );
  const adjacency = new Map<number, Set<number>>();
  for (const recipe of sortedRecipes) {
    adjacency.set(recipe.id, new Set<number>());
  }

  for (let leftIndex = 0; leftIndex < sortedRecipes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < sortedRecipes.length; rightIndex += 1) {
      const leftRecipe = sortedRecipes[leftIndex];
      const rightRecipe = sortedRecipes[rightIndex];
      const leftTokens = tokensById.get(leftRecipe.id) ?? new Map<string, RecipeToken>();
      const rightTokens = tokensById.get(rightRecipe.id) ?? new Map<string, RecipeToken>();
      const score = similarityScore(leftTokens, rightTokens);
      if (score >= MIN_SIMILARITY_SCORE) {
        const overlap = sharedTerms(leftTokens, rightTokens);
        recipeSimilarities[String(leftRecipe.id)].push({
          recipeId: rightRecipe.id,
          score,
          sharedTerms: overlap,
        });
        recipeSimilarities[String(rightRecipe.id)].push({
          recipeId: leftRecipe.id,
          score,
          sharedTerms: overlap,
        });
      }
      if (score >= CLUSTER_SIMILARITY_THRESHOLD) {
        adjacency.get(leftRecipe.id)?.add(rightRecipe.id);
        adjacency.get(rightRecipe.id)?.add(leftRecipe.id);
      }
    }
  }

  for (const recipe of sortedRecipes) {
    recipeSimilarities[String(recipe.id)] = recipeSimilarities[String(recipe.id)]
      .slice()
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.recipeId - right.recipeId ||
          (recipesById.get(left.recipeId)?.name ?? '').localeCompare(
            recipesById.get(right.recipeId)?.name ?? '',
          ),
      )
      .slice(0, MAX_SIMILAR_RECIPES);
  }

  const visited = new Set<number>();
  const recipeClusters: Record<string, MealAssistantRecipeCluster> = {};
  const recipeClusterMemberships: Record<string, MealAssistantRecipeClusterMembership> = {};

  for (const recipe of sortedRecipes) {
    if (visited.has(recipe.id)) continue;
    const stack = [recipe.id];
    const component: number[] = [];
    visited.add(recipe.id);
    while (stack.length > 0) {
      const current = stack.pop();
      if (current == null) continue;
      component.push(current);
      const neighbours = [...(adjacency.get(current) ?? [])].sort((a, b) => a - b);
      for (const neighbour of neighbours) {
        if (visited.has(neighbour)) continue;
        visited.add(neighbour);
        stack.push(neighbour);
      }
    }
    component.sort((a, b) => a - b);
    const clusterRecipes = component
      .map((recipeId) => recipesById.get(recipeId))
      .filter((value): value is RecipeSimilarityInput => value != null);
    const labelTerms = clusterLabelTerms(clusterRecipes);
    const clusterId = `cluster-${component[0]}`;
    const primaryRecipeName = recipesById.get(component[0])?.name;
    const label = labelTerms.join(' · ') || primaryRecipeName || 'recipe cluster';
    recipeClusters[clusterId] = {
      id: clusterId,
      label,
      labelTerms,
      recipeIds: component,
      size: component.length,
    };
    for (const recipeId of component) {
      recipeClusterMemberships[String(recipeId)] = {
        clusterId,
        label,
        labelTerms,
        size: component.length,
      };
    }
  }

  return {
    recipeSimilarities,
    recipeClusters,
    recipeClusterMemberships,
  };
}
