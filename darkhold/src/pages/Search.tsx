import { useState, useEffect, useRef, useCallback } from 'react';
import { Form, Row, Col, Spinner, Alert, Button, Collapse } from 'react-bootstrap';
import { useSearchParams } from 'react-router-dom';
import { useRecipeSearch } from '../hooks/useRecipeSearch';
import { RecipeCard } from '../components/RecipeCard';
import { MealPlanAddModal } from '../components/MealPlanAddModal';
import { LoadingMascot } from '../components/LoadingMascot';
import { AsyncTypeaheadFilter, type FilterOption } from '../components/AsyncTypeaheadFilter';
import { searchKeywords, searchFoods } from '../api/client';
import type { Recipe } from '../api/tandoor-types';

type ActiveFilter = 'tags' | 'ingredients';

export function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [modalRecipe, setModalRecipe] = useState<Recipe | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Set<ActiveFilter>>(new Set());

  const q = searchParams.get('q') || '';
  const keywordsParam = searchParams.get('keywords') || '';
  const foodsParam = searchParams.get('foods') || '';

  const [inputValue, setInputValue] = useState(q);
  const [selectedTags, setSelectedTags] = useState<FilterOption[]>([]);
  const [selectedFoods, setSelectedFoods] = useState<FilterOption[]>([]);

  // Sync text input with URL
  useEffect(() => {
    setInputValue(q);
  }, [q]);

  // Restore active filters panel when URL has filter params
  useEffect(() => {
    const next = new Set<ActiveFilter>();
    if (keywordsParam) next.add('tags');
    if (foodsParam) next.add('ingredients');
    if (next.size > 0) {
      setActiveFilters(next);
      setFiltersOpen(true);
    }
    // Only run on mount to restore state from URL
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const keywordIds = keywordsParam ? keywordsParam.split(',').map(Number).filter(Boolean) : [];
  const foodIds = foodsParam ? foodsParam.split(',').map(Number).filter(Boolean) : [];

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

  const handleTagsChange = (selected: FilterOption[]) => {
    setSelectedTags(selected);
    const next = new URLSearchParams(searchParams);
    if (selected.length > 0) {
      next.set('keywords', selected.map((t) => t.id).join(','));
    } else {
      next.delete('keywords');
    }
    setSearchParams(next);
  };

  const handleFoodsChange = (selected: FilterOption[]) => {
    setSelectedFoods(selected);
    const next = new URLSearchParams(searchParams);
    if (selected.length > 0) {
      next.set('foods', selected.map((f) => f.id).join(','));
    } else {
      next.delete('foods');
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
    if (filter === 'tags') handleTagsChange([]);
    if (filter === 'ingredients') handleFoodsChange([]);
  };

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError } =
    useRecipeSearch({ query: q, keywords: keywordIds, foods: foodIds });

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

  const hasQuery = !!(q || keywordIds.length || foodIds.length);

  const availableFilterButtons: { key: ActiveFilter; label: string; emoji: string }[] = [
    { key: 'tags', label: 'Tags', emoji: '🏷️' },
    { key: 'ingredients', label: 'Ingredients', emoji: '🥕' },
  ];

  return (
    <div>
      <h2 className="mb-3">Search Recipes</h2>

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
            {availableFilterButtons
              .filter(({ key }) => !activeFilters.has(key))
              .map(({ key, label, emoji }) => (
                <Button
                  key={key}
                  variant="outline-primary"
                  size="sm"
                  onClick={() => addFilter(key)}
                >
                  {emoji} {label}
                </Button>
              ))}
            {availableFilterButtons.every(({ key }) => activeFilters.has(key)) && (
              <span className="text-muted small align-self-center">All filters added.</span>
            )}
          </div>

          {activeFilters.has('tags') && (
            <AsyncTypeaheadFilter
              id="tags-filter"
              label="Tags"
              selected={selectedTags}
              onSearch={searchKeywords}
              onChange={handleTagsChange}
              onRemove={() => removeFilter('tags')}
              placeholder="Search tags…"
            />
          )}

          {activeFilters.has('ingredients') && (
            <AsyncTypeaheadFilter
              id="ingredients-filter"
              label="Ingredients"
              selected={selectedFoods}
              onSearch={searchFoods}
              onChange={handleFoodsChange}
              onRemove={() => removeFilter('ingredients')}
              placeholder="Search ingredients…"
            />
          )}
        </div>
      </Collapse>

      {isError && (
        <Alert variant="danger">Failed to load recipes. Check your API token in Settings.</Alert>
      )}

      {isLoading ? (
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

