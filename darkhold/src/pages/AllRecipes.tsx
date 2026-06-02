import { useEffect, useRef, useState } from 'react';
import { ListGroup, Alert, Nav } from 'react-bootstrap';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';
import type { Recipe, Keyword, PaginatedResponse } from '../api/tandoor-types';
import { RecipeListItem } from '../components/RecipeListItem';
import { LoadingMascot } from '../components/LoadingMascot';
import { MealPlanAddModal } from '../components/MealPlanAddModal';
import { ALL_RECIPES_GC_TIME, ALL_RECIPES_STALE_TIME } from '../utils/cacheConfig';

const GROUP_TAGS = [
  'Placeholders',
  'Breakfast',
  'Lunch',
  'Quickies',
  'Specials',
  'Burger',
  'Bowl',
  'Noodles',
  'Pasta',
  'Rice',
  'Chips',
  'Potatoes',
  'Pizza',
  'Pastry',
  'Bread',
  'Baking',
  'Snack',
  'Drink',
];

function groupRecipes(recipes: Recipe[], kwMap: Record<number, string>): Record<string, Recipe[]> {
  const groups: Record<string, Recipe[]> = {};
  GROUP_TAGS.forEach((tag) => (groups[tag] = []));
  groups['Other'] = [];

  for (const recipe of recipes) {
    const kwNames: string[] = Array.isArray(recipe.keywords)
      ? recipe.keywords.flatMap((k) => {
          if (typeof k === 'object' && k !== null && !Array.isArray(k)) {
            const kw = k as Keyword;
            const name = kw.name ?? kwMap[kw.id];
            return name ? [name] : [];
          }
          const name = kwMap[k as number];
          return name ? [name] : [];
        })
      : [];

    let matched = false;
    for (const tag of GROUP_TAGS) {
      if (kwNames.some((n) => n.toLowerCase().includes(tag.toLowerCase()))) {
        groups[tag].push(recipe);
        matched = true;
        break;
      }
    }
    if (!matched) groups['Other'].push(recipe);
  }

  return groups;
}

async function fetchAllKeywords(): Promise<Record<number, string>> {
  const map: Record<number, string> = {};
  let page = 1;
  while (true) {
    const data = await apiGet<PaginatedResponse<Keyword>>('/keyword/', {
      page_size: 100,
      page,
    });
    for (const kw of data.results) map[kw.id] = kw.name;
    if (!data.next) break;
    page++;
  }
  return map;
}

export function AllRecipes() {
  const {
    data: recipePages,
    isLoading,
    isError: isRecipeError,
    hasNextPage,
    fetchNextPage,
    isFetching,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['all-recipes', 'pages'],
    queryFn: ({ pageParam }) =>
      apiGet<PaginatedResponse<Recipe>>('/recipe/', { page_size: 100, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, pages) => (lastPage.next ? pages.length + 1 : undefined),
    staleTime: ALL_RECIPES_STALE_TIME,
    gcTime: ALL_RECIPES_GC_TIME,
    refetchOnMount: 'always',
  });
  const { data: kwMap = {}, isError: isKeywordError } = useQuery({
    queryKey: ['keywords', 'all'],
    queryFn: fetchAllKeywords,
  });

  useEffect(() => {
    if (hasNextPage && !isFetching && !isFetchingNextPage) void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetching, isFetchingNextPage]);

  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const [modalRecipe, setModalRecipe] = useState<Recipe | null>(null);
  const recipes = recipePages?.pages.flatMap((page) => page.results) ?? [];
  const groups = groupRecipes(recipes, kwMap);
  const allGroups = [...GROUP_TAGS, 'Other'];

  const scrollTo = (tag: string) => {
    sectionRefs.current[tag]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (isLoading && !recipePages) return <LoadingMascot label="Loading all recipes…" />;

  if (isRecipeError || isKeywordError) {
    return (
      <Alert variant="danger">Failed to load recipes. Check your API token in Settings.</Alert>
    );
  }

  return (
    <div className="pt-2">
      <Nav className="flex-wrap gap-1 mb-4 justify-content-center">
        {allGroups.map(
          (tag) =>
            groups[tag]?.length > 0 && (
              <Nav.Link
                key={tag}
                className="py-1 px-2 border rounded small"
                onClick={() => scrollTo(tag)}
                style={{ cursor: 'pointer' }}
              >
                {tag} ({groups[tag].length})
              </Nav.Link>
            ),
        )}
      </Nav>

      {allGroups.map((tag) => {
        const groupedRecipes = groups[tag];
        if (!groupedRecipes || groupedRecipes.length === 0) return null;
        return (
          <section
            key={tag}
            ref={(el) => {
              sectionRefs.current[tag] = el;
            }}
            className="mb-4"
          >
            <h5 className="all-recipes-section-heading sticky-top bg-body py-2 border-bottom mb-0">
              {tag}
              <span className="text-muted fw-normal ms-2 small">({groupedRecipes.length})</span>
            </h5>
            <ListGroup variant="flush">
              {groupedRecipes.map((recipe) => (
                <RecipeListItem key={recipe.id} recipe={recipe} onAddToMealPlan={setModalRecipe} />
              ))}
            </ListGroup>
          </section>
        );
      })}

      <MealPlanAddModal
        recipe={modalRecipe}
        keywordNameById={kwMap}
        onHide={() => setModalRecipe(null)}
      />
    </div>
  );
}
