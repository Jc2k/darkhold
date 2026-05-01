import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Row, Col, Card, Spinner, Alert } from 'react-bootstrap';
import { apiGet } from '../api/client';
import type { Food, PaginatedResponse, Recipe } from '../api/tandoor-types';
import { RecipeCard } from '../components/RecipeCard';
import { MealPlanAddModal } from '../components/MealPlanAddModal';

export function IngredientDetail() {
  const { id } = useParams<{ id: string }>();
  const [modalRecipe, setModalRecipe] = useState<Recipe | null>(null);

  const { data: food, isLoading: foodLoading, isError: foodError } = useQuery({
    queryKey: ['food', id],
    queryFn: () => apiGet<Food>(`/food/${id}/`),
    enabled: !!id,
  });

  const { data: recipesData, isLoading: recipesLoading } = useQuery({
    queryKey: ['recipes-by-food', id],
    queryFn: () => apiGet<PaginatedResponse<Recipe>>('/recipe/', { foods: id! }),
    enabled: !!id,
  });

  if (foodLoading) {
    return (
      <div className="text-center py-5">
        <Spinner />
      </div>
    );
  }

  if (foodError || !food) {
    return <Alert variant="danger">Failed to load ingredient.</Alert>;
  }

  return (
    <div>
      <h2 className="mb-1">{food.name}</h2>
      {food.description && <p className="text-muted">{food.description}</p>}

      <Card className="mb-4 d-inline-block">
        <Card.Body className="py-2 px-3">
          <span className="small text-muted">Food ID: {food.id}</span>
          {food.fdc_id && (
            <a
              href={`https://fdc.nal.usda.gov/fdc-app.html#/food-details/${food.fdc_id}/nutrients`}
              target="_blank"
              rel="noopener noreferrer"
              className="ms-3 small"
            >
              FDC Nutrition →
            </a>
          )}
        </Card.Body>
      </Card>

      <h5 className="mb-3">Recipes using {food.name}</h5>
      {recipesLoading && <Spinner size="sm" />}
      {!recipesLoading && (recipesData?.results.length ?? 0) === 0 && (
        <p className="text-muted">No recipes found.</p>
      )}
      <Row xs={2} md={3} lg={4} className="g-3">
        {(recipesData?.results ?? []).map((recipe) => (
          <Col key={recipe.id}>
            <RecipeCard recipe={recipe} onAddToMealPlan={setModalRecipe} />
          </Col>
        ))}
      </Row>

      <MealPlanAddModal recipe={modalRecipe} onHide={() => setModalRecipe(null)} />
    </div>
  );
}
