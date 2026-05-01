import { useState, useEffect, useRef, useCallback } from 'react';
import { Form, Row, Col, Spinner, Alert, Button } from 'react-bootstrap';
import { useSearchParams } from 'react-router-dom';
import { useRecipeSearch } from '../hooks/useRecipeSearch';
import { RecipeCard } from '../components/RecipeCard';
import { MealPlanAddModal } from '../components/MealPlanAddModal';
import { LoadingMascot } from '../components/LoadingMascot';
import type { Recipe } from '../api/tandoor-types';

export function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [modalRecipe, setModalRecipe] = useState<Recipe | null>(null);

  const q = searchParams.get('q') || '';
  const keywordsParam = searchParams.get('keywords');
  const keywords = keywordsParam ? keywordsParam.split(',').map(Number).filter(Boolean) : [];

  const [inputValue, setInputValue] = useState(q);

  useEffect(() => {
    setInputValue(q);
  }, [q]);

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

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError } =
    useRecipeSearch({ query: q, keywords });

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

  return (
    <div>
      <h2 className="mb-3">Search Recipes</h2>

      <Form onSubmit={handleSearch} className="mb-4">
        <Row className="g-2">
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
        </Row>
      </Form>

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
              {q || keywords.length ? 'No recipes found for your search.' : 'Start searching to see recipes.'}
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
