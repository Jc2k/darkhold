import { useState, useEffect, useRef, useCallback } from 'react';
import { Form, Row, Col, Spinner, Alert, Button, Collapse } from 'react-bootstrap';
import { useSearchParams } from 'react-router-dom';
import { useRecipeSearch } from '../hooks/useRecipeSearch';
import { RecipeCard } from '../components/RecipeCard';
import { MealPlanAddModal } from '../components/MealPlanAddModal';
import { LoadingMascot } from '../components/LoadingMascot';
import { AsyncTypeaheadFilter, type FilterOption } from '../components/AsyncTypeaheadFilter';
import { apiGet, searchKeywords, searchFoods } from '../api/client';
import type { Recipe } from '../api/tandoor-types';

type ActiveFilter = 'tags' | 'ingredients';

interface FilterConfig {
  key: ActiveFilter;
  label: string;
  emoji: string;
  urlParam: string;
  searcher: (query: string) => Promise<FilterOption[]>;
}

const FILTER_CONFIGS: FilterConfig[] = [
  { key: 'tags', label: 'Tags', emoji: '🏷️', urlParam: 'keywords', searcher: searchKeywords },
  { key: 'ingredients', label: 'Ingredients', emoji: '🥕', urlParam: 'foods', searcher: searchFoods },
];

async function loadSelectedOptions(path: '/keyword/' | '/food/', ids: number[]): Promise<FilterOption[]> {
  const options = await Promise.all(ids.map(async (id) => {
    try {
      const option = await apiGet<FilterOption>(`${path}${id}/`);
      return { id: option.id, name: option.name };
    } catch {
      return null;
    }
  }));
  return options.filter((option): option is FilterOption => option !== null);
}

export function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [modalRecipe, setModalRecipe] = useState<Recipe | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Set<ActiveFilter>>(new Set());
  const [selectedOptions, setSelectedOptions] = useState<Record<ActiveFilter, FilterOption[]>>({
    tags: [],
    ingredients: [],
  });

  const q = searchParams.get('q') || '';

  const [inputValue, setInputValue] = useState(q);

  // Sync text input with URL
  useEffect(() => {
    setInputValue(q);
  }, [q]);

  // Restore active filters panel when URL has filter params
  useEffect(() => {
    const next = new Set<ActiveFilter>();
    for (const cfg of FILTER_CONFIGS) {
      if (searchParams.get(cfg.urlParam)) next.add(cfg.key);
    }
    if (next.size > 0) {
      setActiveFilters(next);
      setFiltersOpen(true);
    }
    // Only run on mount to restore state from URL
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const keywordParam = searchParams.get('keywords') || '';
  const foodParam = searchParams.get('foods') || '';
  const keywordIds = keywordParam.split(',').map(Number).filter(Boolean);
  const foodIds = foodParam.split(',').map(Number).filter(Boolean);
  const ratingParam = searchParams.get('rating');
  const rating = ratingParam !== null ? Number(ratingParam) : undefined;
  const cookingTimeLteParam = searchParams.get('cooking_time__lte');
  const cookingTimeLte = cookingTimeLteParam !== null ? Number(cookingTimeLteParam) : undefined;
  const newOnly = searchParams.get('new') === 'true';
  const sortOrder = searchParams.get('sort_order') || undefined;

  useEffect(() => {
    let cancelled = false;

    const syncSelectedOptions = async () => {
      const [tags, ingredients] = await Promise.all([
        loadSelectedOptions('/keyword/', keywordIds),
        loadSelectedOptions('/food/', foodIds),
      ]);

      if (!cancelled) {
        setSelectedOptions({ tags, ingredients });
      }
    };

    void syncSelectedOptions();

    return () => {
      cancelled = true;
    };
  }, [foodParam, keywordParam]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const next = new URLSearchParams(searchParams);
    if (inputValue) {
      next.set('q', inputValue);
    } else {
      next.delete('q');
    }
    setSearchParams(next);
  };

  const handleFilterChange = (key: ActiveFilter, selected: FilterOption[]) => {
    const cfg = FILTER_CONFIGS.find((c) => c.key === key)!;
    setSelectedOptions((prev) => ({ ...prev, [key]: selected }));
    const next = new URLSearchParams(searchParams);
    if (selected.length > 0) {
      next.set(cfg.urlParam, selected.map((o) => o.id).join(','));
    } else {
      next.delete(cfg.urlParam);
    }
    setSearchParams(next);
  };

  const addFilter = (filter: ActiveFilter) => {
    setActiveFilters((prev) => new Set([...prev, filter]));
  };

  const removeFilter = (filter: ActiveFilter) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      next.delete(filter);
      return next;
    });
    handleFilterChange(filter, []);
  };

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError } =
    useRecipeSearch({ query: q, keywords: keywordIds, foods: foodIds, rating, cooking_time__lte: cookingTimeLte, new: newOnly, sort_order: sortOrder });

  const recipes = data?.pages.flatMap((p) => p.results) ?? [];

  const loaderRef = useRef<HTMLDivElement | null>(null);

  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  );

  useEffect(() => {
    const observer = new IntersectionObserver(handleObserver, { threshold: 0.1 });
    const el = loaderRef.current;
    if (el) observer.observe(el);
    return () => { if (el) observer.unobserve(el); };
  }, [handleObserver]);

  const hasQuery = !!(q || keywordIds.length || foodIds.length || rating !== undefined || cookingTimeLte !== undefined || newOnly);

  return (
    <div className="pt-2">
      <Form onSubmit={handleSearch} className="mb-2">
        <Row className="g-2 align-items-center">
          <Col>
            <Form.Control
              type="search"
              placeholder="Search recipes…"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
            />
          </Col>
          <Col xs="auto">
            <Button type="submit" variant="primary">Search</Button>
          </Col>
          <Col xs="auto">
            <Button
              variant={filtersOpen ? 'secondary' : 'outline-secondary'}
              onClick={() => setFiltersOpen((o) => !o)}
              aria-expanded={filtersOpen}
              aria-controls="advanced-filters"
              title="Advanced filters"
            >
              ☰
            </Button>
          </Col>
        </Row>
      </Form>

      <Collapse in={filtersOpen}>
        <div id="advanced-filters" className="border rounded p-3 mb-3 bg-light">
          <div className="d-flex flex-wrap gap-2 mb-3">
            {FILTER_CONFIGS.filter(({ key }) => !activeFilters.has(key)).map(({ key, label, emoji }) => (
              <Button key={key} variant="outline-primary" size="sm" onClick={() => addFilter(key)}>
                {emoji} {label}
              </Button>
            ))}
            {FILTER_CONFIGS.every(({ key }) => activeFilters.has(key)) && (
              <span className="text-muted small align-self-center">All filters added.</span>
            )}
          </div>

          {FILTER_CONFIGS.filter(({ key }) => activeFilters.has(key)).map(({ key, label, searcher }) => (
            <AsyncTypeaheadFilter
              key={key}
              id={`${key}-filter`}
              label={label}
              selected={selectedOptions[key]}
              onSearch={searcher}
              onChange={(selected) => handleFilterChange(key, selected)}
              onRemove={() => removeFilter(key)}
            />
          ))}
        </div>
      </Collapse>

      {isError && (
        <Alert variant="danger">Failed to load recipes. Check your API token in Settings.</Alert>
      )}

      {isLoading && !data ? (
        <LoadingMascot label="Searching recipes…" />
      ) : (
        <>
          <Row xs={2} md={3} lg={4} className="g-3">
            {recipes.map((recipe) => (
              <Col key={recipe.id}>
                <RecipeCard recipe={recipe} onAddToMealPlan={setModalRecipe} />
              </Col>
            ))}
          </Row>

          {recipes.length === 0 && !isLoading && (
            <p className="text-muted text-center py-5">
              {hasQuery ? 'No recipes found for your search.' : 'Start searching to see recipes.'}
            </p>
          )}

          <div ref={loaderRef} className="text-center py-3">
            {isFetchingNextPage && <Spinner size="sm" />}
          </div>
        </>
      )}

      <MealPlanAddModal recipe={modalRecipe} onHide={() => setModalRecipe(null)} />
    </div>
  );
}
