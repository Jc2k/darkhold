import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Row, Col, Spinner, Alert, Button } from 'react-bootstrap';
import { Pencil } from 'react-bootstrap-icons';
import { apiGet } from '../api/client';
import type { Food, PaginatedResponse, Recipe } from '../api/tandoor-types';
import { RecipeCard } from '../components/RecipeCard';
import { MealPlanAddModal } from '../components/MealPlanAddModal';
import { LoadingMascot } from '../components/LoadingMascot';
import { FoodPropertiesTable } from '../components/FoodPropertiesTable';
import { useAppConfig } from '../hooks/useAppConfig';

export function IngredientDetail() {
  const { id } = useParams<{ id: string }>();
  const [modalRecipe, setModalRecipe] = useState<Recipe | null>(null);
  const { tandoor_external_url: externalUrl } = useAppConfig();

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
    return <LoadingMascot />;
  }

  if (foodError || !food) {
    return <Alert variant="danger">Failed to load ingredient.</Alert>;
  }

  return (
    <div>
      <div className="d-flex align-items-center gap-2 mb-1">
        <h2 className="mb-0">{food.name}</h2>
        {externalUrl && (
          <Button
            as="a"
            href={`${externalUrl}/edit/Food/${id}/`}
            target="_blank"
            rel="noopener noreferrer"
            variant="outline-secondary"
            size="sm"
            aria-label="Edit ingredient in Tandoor"
          >
            <Pencil />
          </Button>
        )}
      </div>
      {food.description && <p className="text-muted">{food.description}</p>}
      <FoodPropertiesTable
        properties={food.properties}
        amount={food.properties_food_amount}
        unit={food.properties_food_unit}
      />

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
