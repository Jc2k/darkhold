import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Row, Col, Badge, Alert, Button, Modal } from 'react-bootstrap';
import { apiGet } from '../api/client';
import type { Recipe, RecipeIngredient, RecipeStep, RecipeUnit, Food, Keyword } from '../api/tandoor-types';
import { TagBadge } from '../components/TagBadge';
import { NutritionBadge } from '../components/NutritionBadge';
import { RecipeFoodProperties } from '../components/FoodPropertiesTable';
import { MealPlanAddModal } from '../components/MealPlanAddModal';
import { LoadingMascot } from '../components/LoadingMascot';
import { proxyMediaUrl } from '../utils/mediaUrl';
import { formatFraction } from '../utils/fractions';

function CookingMode({ steps, onClose }: { steps: RecipeStep[]; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const sorted = [...steps].sort((a, b) => a.order - b.order);
  const current = sorted[index];

  return (
    <Modal show fullscreen onHide={onClose}>
      <Modal.Header closeButton>
        <Modal.Title>
          Step {index + 1} of {sorted.length}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="d-flex flex-column justify-content-center align-items-center text-center p-4">
        {current?.name && <h5 className="mb-3">{current.name}</h5>}
        {current?.ingredients && current.ingredients.length > 0 && (
          <ul className="list-unstyled mb-3 text-start w-100">
            {current.ingredients.map((ing: RecipeIngredient) => {
              const food = typeof ing.food === 'object' ? ing.food as Food : null;
              const unit = ing.unit as RecipeUnit | null;
              return (
                <li key={ing.id} className="mb-1">
                  {ing.amount != null && <span className="text-muted">{formatFraction(ing.amount)} </span>}
                  {unit?.name && <span className="text-muted">{unit.name} </span>}
                  <span>{food ? food.name : `Ingredient #${typeof ing.food === 'number' ? ing.food : ''}`}</span>
                  {ing.note && <span className="text-muted"> ({ing.note})</span>}
                </li>
              );
            })}
          </ul>
        )}
        <p className="fs-5">{current?.instruction}</p>
        {current?.time && <Badge bg="info">{current.time} min</Badge>}
      </Modal.Body>
      <Modal.Footer className="justify-content-between">
        <Button variant="secondary" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
          ← Previous
        </Button>
        <span className="text-muted small">
          {index + 1} / {sorted.length}
        </span>
        {index < sorted.length - 1 ? (
          <Button variant="primary" onClick={() => setIndex((i) => i + 1)}>
            Next →
          </Button>
        ) : (
          <Button variant="success" onClick={onClose}>
            ✓ Done
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
}

const circleButtonStyle = { width: 32, height: 32, padding: 0, borderRadius: '50%', lineHeight: 1, fontSize: '1.25rem' };

export function RecipeDetail() {
  const { id } = useParams<{ id: string }>();
  const [planRecipe, setPlanRecipe] = useState<Recipe | null>(null);
  const [cookingMode, setCookingMode] = useState(false);

  const { data: recipe, isLoading, isError } = useQuery({
    queryKey: ['recipe', id],
    queryFn: () => apiGet<Recipe>(`/recipe/${id}/`),
    enabled: !!id,
  });

  // Inject JSON-LD
  useEffect(() => {
    if (!recipe) return;
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'recipe-jsonld';
    script.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: recipe.name,
      description: recipe.description,
      image: recipe.image,
      recipeYield: recipe.servings,
      totalTime: recipe.cooking_time ? `PT${recipe.cooking_time}M` : undefined,
    });
    document.head.appendChild(script);
    return () => {
      document.getElementById('recipe-jsonld')?.remove();
    };
  }, [recipe]);

  if (isLoading) {
    return <LoadingMascot />;
  }

  if (isError || !recipe) {
    return <Alert variant="danger">Failed to load recipe.</Alert>;
  }

  const keywords = Array.isArray(recipe.keywords)
    ? recipe.keywords.filter((k): k is Keyword => typeof k === 'object')
    : [];

  const steps = recipe.steps ? [...recipe.steps].sort((a, b) => a.order - b.order) : [];

  // Collect all ingredients from all steps
  const allIngredients: RecipeIngredient[] = steps.flatMap((s) => s.ingredients ?? []);

  return (
    <div>
      {recipe.image && (
        <img
          src={proxyMediaUrl(recipe.image)}
          alt={recipe.name}
          className="w-100 rounded mb-3"
          style={{ maxHeight: 320, objectFit: 'cover' }}
        />
      )}

      <Row className="align-items-start mb-2">
        <Col>
          <h2 className="mb-1">{recipe.name}</h2>
          {recipe.rating != null && (
            <div className="text-warning mb-1 fs-5">
              {'★'.repeat(Math.round(recipe.rating))}
              {'☆'.repeat(5 - Math.round(recipe.rating))}
            </div>
          )}
          <div className="mb-2">
            {keywords.map((k) => (
              <TagBadge key={k.id} keyword={k} />
            ))}
          </div>
          <NutritionBadge nutrition={recipe.nutrition} />
          <RecipeFoodProperties foodProperties={recipe.food_properties} servings={recipe.servings} />
        </Col>
        <Col xs="auto" className="d-flex flex-column gap-2">
          <Button
            variant="success"
            size="sm"
            style={circleButtonStyle}
            onClick={() => setPlanRecipe(recipe)}
            aria-label="Add to meal plan"
          >
            +
          </Button>
          {steps.length > 0 && (
            <Button
              variant="primary"
              size="sm"
              style={circleButtonStyle}
              onClick={() => setCookingMode(true)}
              aria-label="Start cooking mode"
            >
              👨‍🍳
            </Button>
          )}
        </Col>
      </Row>

      {recipe.description && <p className="text-muted">{recipe.description}</p>}

      <div className="d-flex flex-wrap gap-3 mb-3 small text-muted">
        {recipe.cooking_time != null && <span>🕐 Cook: {recipe.cooking_time} min</span>}
        {recipe.waiting_time != null && <span>⏳ Wait: {recipe.waiting_time} min</span>}
        {recipe.servings != null && <span>🍽️ Serves: {recipe.servings}</span>}
        {recipe.source_url && (
          <a href={recipe.source_url} target="_blank" rel="noopener noreferrer">
            🔗 Source
          </a>
        )}
      </div>

      {allIngredients.length > 0 && (
        <section className="mb-4">
          <h5>Ingredients</h5>
          <ul className="list-unstyled">
            {allIngredients.map((ing: RecipeIngredient) => {
              const food = typeof ing.food === 'object' ? ing.food as Food : null;
              const unit = ing.unit as RecipeUnit | null;
              return (
                <li key={ing.id} className="mb-1">
                  {ing.amount != null && <span className="text-muted">{formatFraction(ing.amount)} </span>}
                  {unit?.name && <span className="text-muted">{unit.name} </span>}
                  {food ? (
                    <Link to={`/ingredient/${food.id}`}>{food.name}</Link>
                  ) : (
                    <span>Ingredient #{typeof ing.food === 'number' ? ing.food : ''}</span>
                  )}
                  {ing.note && <span className="text-muted"> ({ing.note})</span>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {steps.length > 0 && (
        <section className="mb-4">
          <h5>Instructions</h5>
          <ol className="ps-3">
            {steps.map((step) => (
              <li key={step.id} className="mb-3">
                {step.name && <strong className="d-block mb-1">{step.name}</strong>}
                <p className="mb-1" style={{ whiteSpace: 'pre-wrap' }}>{step.instruction}</p>
                {step.time != null && step.time !== 0 && <Badge bg="info" className="ms-2">{step.time} min</Badge>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {cookingMode && steps.length > 0 && (
        <CookingMode steps={steps} onClose={() => setCookingMode(false)} />
      )}

      <MealPlanAddModal recipe={planRecipe} onHide={() => setPlanRecipe(null)} />
    </div>
  );
}
