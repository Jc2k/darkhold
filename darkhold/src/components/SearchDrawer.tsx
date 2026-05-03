import { useState, useEffect, useRef, useCallback } from 'react';
import { Offcanvas, Form, Spinner, Row, Col } from 'react-bootstrap';
import { useLocation } from 'react-router-dom';
import { useRecipeSearch } from '../hooks/useRecipeSearch';
import { RecipeCard } from './RecipeCard';
import { MealPlanAddModal } from './MealPlanAddModal';
import type { Recipe } from '../api/tandoor-types';

interface SearchDrawerProps {
  show: boolean;
  onHide: () => void;
}

export function SearchDrawer({ show, onHide }: SearchDrawerProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [modalRecipe, setModalRecipe] = useState<Recipe | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const location = useLocation();

  // Close drawer on navigation
  useEffect(() => {
    if (show) onHide();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Auto-focus input when drawer opens; clear query when it closes
  useEffect(() => {
    if (show) {
      const timer = setTimeout(() => inputRef.current?.focus(), 300);
      return () => clearTimeout(timer);
    } else {
      setQuery('');
      setDebouncedQuery('');
    }
  }, [show]);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 400);
    return () => clearTimeout(timer);
  }, [query]);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useRecipeSearch({ query: debouncedQuery });

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
    <>
      <Offcanvas
        show={show}
        onHide={onHide}
        placement="bottom"
        className="bg-dark text-white"
        style={{ height: '85vh' }}
      >
        <Offcanvas.Header closeButton closeVariant="white">
          <Offcanvas.Title>🔍 Search Recipes</Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body>
          <Form className="mb-3" onSubmit={(e) => e.preventDefault()}>
            <Form.Control
              ref={inputRef}
              type="search"
              placeholder="Search recipes…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="bg-dark text-white border-secondary"
            />
          </Form>

          {isLoading && debouncedQuery ? (
            <div className="text-center py-4"><Spinner size="sm" /></div>
          ) : (
            <>
              <Row xs={2} md={3} className="g-2">
                {recipes.map((recipe) => (
                  <Col key={recipe.id}>
                    <RecipeCard recipe={recipe} onAddToMealPlan={setModalRecipe} />
                  </Col>
                ))}
              </Row>

              {recipes.length === 0 && debouncedQuery && !isLoading && (
                <p className="text-muted text-center py-5">No recipes found.</p>
              )}

              {!debouncedQuery && (
                <p className="text-muted text-center py-5">Start typing to search recipes.</p>
              )}

              <div ref={loaderRef} className="text-center py-3">
                {isFetchingNextPage && <Spinner size="sm" />}
              </div>
            </>
          )}
        </Offcanvas.Body>
      </Offcanvas>

      <MealPlanAddModal recipe={modalRecipe} onHide={() => setModalRecipe(null)} />
    </>
  );
}
