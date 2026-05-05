import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { useQuery } from '@tanstack/react-query';
import { Row, Col, Badge, Alert, Button, Modal } from 'react-bootstrap';
import { Plus, Play, Info } from 'react-bootstrap-icons';
import { apiGet } from '../api/client';
import type { Recipe, RecipeIngredient, RecipeStep, RecipeUnit, Food, Keyword, FoodProperty } from '../api/tandoor-types';
import { TagBadge } from '../components/TagBadge';
import { MealPlanAddModal } from '../components/MealPlanAddModal';
import { LoadingMascot } from '../components/LoadingMascot';
import { proxyMediaUrl } from '../utils/mediaUrl';
import { formatFraction } from '../utils/fractions';

type IngredientSection = { header: string | null; items: RecipeIngredient[] };

function splitIngredientSections(ingredients: RecipeIngredient[]): IngredientSection[] {
  const sections: IngredientSection[] = [];
  let current: IngredientSection = { header: null, items: [] };
  for (const ing of ingredients) {
    if (ing.is_header) {
      if (current.items.length > 0 || current.header !== null) {
        sections.push(current);
      }
      current = { header: ing.note ?? null, items: [] };
    } else {
      current.items.push(ing);
    }
  }
  sections.push(current);
  return sections.filter((s) => s.header !== null || s.items.length > 0);
}

function IngredientList({ ingredients, linkFoods = false }: { ingredients: RecipeIngredient[]; linkFoods?: boolean }) {
  const sections = splitIngredientSections(ingredients);
  return (
    <>
      {sections.map((section, i) => (
        <div key={`${section.header ?? ''}-${i}`}>
          {section.header && <strong className="d-block mt-2 mb-1">{section.header}</strong>}
          <ul className="list-unstyled mb-0">
            {section.items.map((ing: RecipeIngredient) => {
              const food = ing.food && typeof ing.food === 'object' ? ing.food as Food : null;
              const unit = ing.unit as RecipeUnit | null;
              return (
                <li key={ing.id} className="mb-1">
                  {!ing.no_amount && ing.amount != null && <span className="text-muted">{formatFraction(ing.amount)} </span>}
                  {unit?.name && <span className="text-muted">{unit.name} </span>}
                  {food ? (
                    linkFoods ? <Link to={`/ingredient/${food.id}`}>{food.name}</Link> : <span>{food.name}</span>
                  ) : (
                    ing.food ? <span>Ingredient #{typeof ing.food === 'number' ? ing.food : ''}</span> : null
                  )}
                  {ing.note && <span className="text-muted"> ({ing.note})</span>}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );
}

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
          <div className="mb-3 text-start w-100">
            <IngredientList ingredients={current.ingredients} />
          </div>
        )}
        <ReactMarkdown>{current?.instruction ?? ''}</ReactMarkdown>
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

function formatNutrientValue(value: number, unit?: string | null): string {
  return `${Math.round(value)}${unit ? `\u00a0${unit}` : ''}`;
}

function NutritionOverlay({
  foodProperties,
  servings,
  onClose,
}: {
  foodProperties: Record<string, FoodProperty>;
  servings?: number | null;
  onClose: () => void;
}) {
  const nutrients = Object.values(foodProperties)
    .filter((n) => n.total_value > 0)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  if (nutrients.length === 0) return null;

  const per = servings && servings > 0 ? servings : 1;

  // Try to find a property representing serving weight in grams (e.g. "Weight" with unit "g").
  const weightProp = nutrients.find(
    (n) => n.unit?.trim().toLowerCase() === 'g' && /weight/i.test(n.name),
  );
  const servingWeightG = weightProp ? weightProp.total_value / per : null;

  const hasAnyMissing = nutrients.some((n) => n.missing_value);

  return (
    <div
      className="position-absolute top-0 start-0 w-100 h-100 overflow-auto"
      style={{ background: 'rgba(0,0,0,0.82)', zIndex: 5, WebkitOverflowScrolling: 'touch' }}
      role="region"
      aria-label="Nutrition information"
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
    >
      <div className="px-3 py-2 text-white" style={{ fontSize: '0.875rem', paddingRight: '3.5rem' }}>
        <p className="mb-1 fw-bold text-center" style={{ fontSize: '0.95rem' }}>
          Nutrition Information
        </p>
        {servings != null && servings > 1 && (
          <p className="mb-1 text-center text-white-50" style={{ fontSize: '0.8rem' }}>
            Serving size: 1 of {servings}
          </p>
        )}
        <table className="w-100 mb-1" style={{ borderCollapse: 'collapse', border: '1px solid rgba(255,255,255,0.3)' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid rgba(255,255,255,0.5)' }}>
              <th className="text-start pb-1 px-1">Nutrient</th>
              <th className="text-end pb-1 px-1">Per serving</th>
              <th className="text-end pb-1 px-1">Per 100g</th>
            </tr>
          </thead>
          <tbody>
            {nutrients.map((n) => {
              const perServing = n.total_value / per;
              const per100g =
                servingWeightG != null ? (perServing / servingWeightG) * 100 : null;
              return (
                <tr key={n.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
                  <td className="py-1 px-1">
                    {n.name}
                    {n.unit ? ` (${n.unit})` : ''}
                    {n.missing_value ? '\u00a0*' : ''}
                  </td>
                  <td className="text-end py-1 px-1">
                    {formatNutrientValue(perServing, n.unit)}
                  </td>
                  <td className="text-end py-1 px-1">
                    {per100g != null ? formatNutrientValue(per100g, n.unit) : '–'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {hasAnyMissing && (
          <p className="mb-0 text-warning" style={{ fontSize: '0.8rem' }}>
            * Nutritional data missing for one or more ingredients
          </p>
        )}
        {servingWeightG == null && (
          <p className="mb-0 text-white-50" style={{ fontSize: '0.8rem' }}>
            Per 100g values unavailable (no serving weight defined)
          </p>
        )}
      </div>
    </div>
  );
}

const circleButtonStyle = { width: 32, height: 32, padding: 0, borderRadius: '50%', lineHeight: 1, fontSize: '1.25rem' };

export function RecipeDetail() {
  const { id } = useParams<{ id: string }>();
  const [planRecipe, setPlanRecipe] = useState<Recipe | null>(null);
  const [cookingMode, setCookingMode] = useState(false);
  const [showNutrition, setShowNutrition] = useState(false);

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
      <div className="position-relative mb-3">
        {recipe.image && (
          <img
            src={proxyMediaUrl(recipe.image)}
            alt={recipe.name}
            className="w-100 rounded"
            style={{ maxHeight: 320, objectFit: 'cover', display: 'block' }}
          />
        )}
        {showNutrition && recipe.food_properties && (
          <NutritionOverlay foodProperties={recipe.food_properties} servings={recipe.servings} onClose={() => setShowNutrition(false)} />
        )}
        <div className="position-absolute top-0 end-0 d-flex flex-column gap-2 p-2" style={{ background: 'rgba(0,0,0,0.25)', borderBottomLeftRadius: 8, zIndex: 10 }}>
          <Button
            variant="success"
            size="sm"
            style={circleButtonStyle}
            onClick={() => setPlanRecipe(recipe)}
            aria-label="Add to meal plan"
          >
            <Plus />
          </Button>
          {steps.length > 0 && (
            <Button
              variant="primary"
              size="sm"
              style={circleButtonStyle}
              onClick={() => setCookingMode(true)}
              aria-label="Start cooking mode"
            >
              <Play />
            </Button>
          )}
          {recipe.food_properties && Object.keys(recipe.food_properties).length > 0 && (
            <Button
              variant={showNutrition ? 'info' : 'light'}
              size="sm"
              style={circleButtonStyle}
              onClick={() => setShowNutrition((v) => !v)}
              aria-label={showNutrition ? 'Hide nutrition information' : 'Show nutrition information'}
              aria-pressed={showNutrition}
            >
              <Info />
            </Button>
          )}
        </div>
      </div>

      <Row className="align-items-start mb-2">
        <Col>
          <h2 className="mb-1">{recipe.name}</h2>
          <div className="d-flex flex-wrap gap-3 mb-1 small text-muted">
            {recipe.cooking_time != null && <span>🕐 Cook: {recipe.cooking_time} min</span>}
            {recipe.waiting_time != null && <span>⏳ Wait: {recipe.waiting_time} min</span>}
            {recipe.servings != null && <span>🍽️ Serves: {recipe.servings}</span>}
            {recipe.source_url && (
              <a href={recipe.source_url} target="_blank" rel="noopener noreferrer">
                🔗 Source
              </a>
            )}
          </div>
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
        </Col>
      </Row>

      {recipe.description && <p className="text-muted">{recipe.description}</p>}

      {allIngredients.length > 0 && (
        <section className="mb-4">
          <h5>Ingredients</h5>
          <IngredientList ingredients={allIngredients} linkFoods />
        </section>
      )}

      {steps.length === 1 && (
        <section className="mb-4">
          <h5>Instructions</h5>
          <ReactMarkdown>{steps[0].instruction}</ReactMarkdown>
        </section>
      )}

      {steps.length > 1 && (
        <section className="mb-4">
          <h5>Instructions</h5>
          <ol className="ps-3">
            {steps.map((step) => (
              <li key={step.id} className="mb-3">
                {step.name && <strong className="d-block mb-1">{step.name}</strong>}
                <div className="mb-1"><ReactMarkdown>{step.instruction}</ReactMarkdown></div>
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
