import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Row, Col, Alert } from 'react-bootstrap';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';
import type { RecipeBook, RecipeBookEntry, PaginatedResponse } from '../api/tandoor-types';
import { RecipeCard } from '../components/RecipeCard';
import { MealPlanAddModal } from '../components/MealPlanAddModal';
import { LoadingMascot } from '../components/LoadingMascot';
import type { Recipe } from '../api/tandoor-types';

async function fetchBookEntries(bookId: string): Promise<RecipeBookEntry[]> {
  const all: RecipeBookEntry[] = [];
  let page = 1;
  let hasNext = true;
  while (hasNext) {
    const data = await apiGet<PaginatedResponse<RecipeBookEntry>>('/recipe-book-entry/', {
      book: bookId,
      page_size: 100,
      page,
    });
    all.push(...data.results);
    hasNext = !!data.next;
    page++;
  }
  return all;
}

export function BookDetail() {
  const { id } = useParams<{ id: string }>();
  const [modalRecipe, setModalRecipe] = useState<Recipe | null>(null);

  const { data: book, isLoading: bookLoading, isError: bookError } = useQuery({
    queryKey: ['book', id],
    queryFn: () => apiGet<RecipeBook>(`/recipe-book/${id}/`),
    enabled: !!id,
  });

  const { data: entries, isLoading: entriesLoading, isError: entriesError } = useQuery({
    queryKey: ['book-entries', id],
    queryFn: () => fetchBookEntries(id!),
    enabled: !!id,
  });

  const isLoading = bookLoading || entriesLoading;
  const isError = bookError || entriesError;

  if (isLoading) {
    return <LoadingMascot label="Loading book…" />;
  }

  if (isError || !book) {
    return <Alert variant="danger">Failed to load book. Check your API token in Settings.</Alert>;
  }

  const recipes = entries?.map((entry) => entry.recipe).filter(Boolean) ?? [];

  return (
    <div>
      <h2 className="mb-1">{book.name}</h2>
      {book.description && <p className="text-muted mb-3">{book.description}</p>}

      {recipes.length === 0 && (
        <p className="text-muted text-center py-5">This book has no recipes yet.</p>
      )}

      <Row xs={2} md={3} lg={4} className="g-3">
        {recipes.map((recipe) => (
          <Col key={recipe.id}>
            <RecipeCard recipe={recipe} onAddToMealPlan={setModalRecipe} />
          </Col>
        ))}
      </Row>

      <MealPlanAddModal recipe={modalRecipe} onHide={() => setModalRecipe(null)} />
    </div>
  );
}
