import { useRef } from 'react';
import { ListGroup, Alert, Nav } from 'react-bootstrap';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';
import type { Recipe, Keyword, PaginatedResponse } from '../api/tandoor-types';
import { RecipeListItem } from '../components/RecipeListItem';
import { LoadingMascot } from '../components/LoadingMascot';

const GROUP_TAGS = ['Breakfast', 'Lunch', 'Dinner', 'Dessert', 'Soup', 'Salad', 'Snack'];

function groupRecipes(recipes: Recipe[], kwMap: Map<number, string>): Record<string, Recipe[]> {
  const groups: Record<string, Recipe[]> = {};
  GROUP_TAGS.forEach((tag) => (groups[tag] = []));
  groups['Other'] = [];

  for (const recipe of recipes) {
    const kwNames: string[] = Array.isArray(recipe.keywords)
      ? recipe.keywords.flatMap((k) => {
          if (typeof k === 'object' && k !== null && !Array.isArray(k)) {
            const kw = k as Keyword;
            return kw.name ? [kw.name] : [];
          }
          const name = kwMap.get(k as number);
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

async function fetchAllKeywords(): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  let page = 1;
  while (true) {
    const data = await apiGet<PaginatedResponse<Keyword>>('/keyword/', { page_size: 100, page });
    for (const kw of data.results) {
      map.set(kw.id, kw.name);
    }
    if (!data.next) break;
    page++;
  }
  return map;
}

async function fetchAllRecipes(): Promise<{ recipes: Recipe[]; kwMap: Map<number, string> }> {
  const [kwMap, recipes] = await Promise.all([
    fetchAllKeywords(),
    (async () => {
      const all: Recipe[] = [];
      let page = 1;
      while (true) {
        const data = await apiGet<PaginatedResponse<Recipe>>('/recipe/', { page_size: 100, page });
        all.push(...data.results);
        if (!data.next) break;
        page++;
      }
      return all;
    })(),
  ]);
  return { recipes, kwMap };
}

export function AllRecipes() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['all-recipes'],
    queryFn: fetchAllRecipes,
  });

  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const groups = data ? groupRecipes(data.recipes, data.kwMap) : {};
  const allGroups = [...GROUP_TAGS, 'Other'];

  const scrollTo = (tag: string) => {
    sectionRefs.current[tag]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (isLoading) {
    return <LoadingMascot label="Loading all recipes…" />;
  }

  if (isError) {
    return <Alert variant="danger">Failed to load recipes. Check your API token in Settings.</Alert>;
  }

  return (
    <div>
      <h2 className="mb-3">All Recipes</h2>

      {/* Jump-to section sidebar / quick nav */}
      <Nav className="flex-wrap gap-1 mb-4">
        {allGroups.map((tag) => (
          groups[tag]?.length > 0 && (
            <Nav.Link
              key={tag}
              className="py-1 px-2 border rounded small"
              onClick={() => scrollTo(tag)}
              style={{ cursor: 'pointer' }}
            >
              {tag} ({groups[tag].length})
            </Nav.Link>
          )
        ))}
      </Nav>

      {allGroups.map((tag) => {
        const recipes = groups[tag];
        if (!recipes || recipes.length === 0) return null;
        return (
          <section
            key={tag}
            ref={(el) => { sectionRefs.current[tag] = el; }}
            className="mb-4"
          >
            <h5
              className="sticky-top bg-body py-2 border-bottom mb-0"
              style={{ top: 0, zIndex: 10 }}
            >
              {tag}
              <span className="text-muted fw-normal ms-2 small">({recipes.length})</span>
            </h5>
            <ListGroup variant="flush">
              {recipes.map((r) => (
                <RecipeListItem key={r.id} recipe={r} />
              ))}
            </ListGroup>
          </section>
        );
      })}
    </div>
  );
}
