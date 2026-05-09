import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Row, Col, Badge, Alert, Button, Modal } from 'react-bootstrap';
import {
  Plus,
  Play,
  Info,
  Pencil,
  DashCircle,
  PlusCircle,
  Clock,
  HourglassSplit,
  People,
  BoxArrowUpRight,
  Share,
  Check2Circle,
} from 'react-bootstrap-icons';
import { OverlayTrigger, Popover } from 'react-bootstrap';
import { apiGet, apiPost } from '../api/client';
import type {
  Recipe,
  RecipeIngredient,
  RecipeStep,
  RecipeUnit,
  Food,
  Keyword,
  FoodProperty,
  MealPlan,
  MealType,
  PaginatedResponse,
} from '../api/tandoor-types';
import { TagBadge } from '../components/TagBadge';
import { MealPlanAddModal } from '../components/MealPlanAddModal';
import { CookLogModal } from '../components/CookLogModal';
import { LoadingMascot } from '../components/LoadingMascot';
import { UpSoonButton } from '../components/UpSoonButton';
import { proxyMediaUrl } from '../utils/mediaUrl';
import { formatFraction } from '../utils/fractions';
import { useRecipeWeightG } from '../hooks/useRecipeWeightG';
import { useAppConfig } from '../hooks/useAppConfig';
import { broadcastInvalidation } from '../hooks/useInvalidationSocket';
import { useCookLog, isCookedOnDate } from '../hooks/useCookLog';

const MAX_RECENTLY_VIEWED_ITEMS = 10;
const CALORIE_PROPERTY_NAME_PATTERN = /(^|\b)(calories?|kcal)(\b|$)/i;

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

function IngredientList({
  ingredients,
  linkFoods = false,
  scaleFactor,
  itemProp,
}: {
  ingredients: RecipeIngredient[];
  linkFoods?: boolean;
  scaleFactor?: number;
  itemProp?: string;
}) {
  const sections = splitIngredientSections(ingredients);
  return (
    <>
      {sections.map((section, i) => (
        <div key={`${section.header ?? ''}-${i}`}>
          {section.header && <strong className="d-block mt-2 mb-1">{section.header}</strong>}
          <ul className="list-unstyled mb-0">
            {section.items.map((ing: RecipeIngredient) => {
              const food = ing.food && typeof ing.food === 'object' ? (ing.food as Food) : null;
              const unit = ing.unit as RecipeUnit | null;
              const displayAmount =
                ing.amount != null && scaleFactor != null ? ing.amount * scaleFactor : ing.amount;
              return (
                <li
                  key={ing.id}
                  className="mb-1"
                  itemProp={itemProp && !ing.is_header ? itemProp : undefined}
                >
                  {!ing.no_amount && displayAmount != null && (
                    <span className="text-muted">{formatFraction(displayAmount)} </span>
                  )}
                  {unit?.name && <span className="text-muted">{unit.name} </span>}
                  {food ? (
                    linkFoods ? (
                      <Link to={`/ingredient/${food.id}`}>{food.name}</Link>
                    ) : (
                      <span>{food.name}</span>
                    )
                  ) : ing.food ? (
                    <span>Ingredient #{typeof ing.food === 'number' ? ing.food : ''}</span>
                  ) : null}
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

function CookingMode({
  steps,
  scaleFactor,
  onClose,
}: {
  steps: RecipeStep[];
  scaleFactor?: number;
  onClose: () => void;
}) {
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
      <Modal.Body className="d-flex flex-column justify-content-center align-items-center p-4">
        <div className="w-100" style={{ maxWidth: 720 }}>
          {current?.name && <h5 className="mb-3">{current.name}</h5>}
          {current?.ingredients && current.ingredients.length > 0 && (
            <div className="mb-3">
              <IngredientList ingredients={current.ingredients} scaleFactor={scaleFactor} />
            </div>
          )}
          <ReactMarkdown>{current?.instruction ?? ''}</ReactMarkdown>
          {!!current?.time && <Badge bg="info">{current.time} min</Badge>}
        </div>
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
  ingredients,
  onClose,
}: {
  foodProperties: Record<string, FoodProperty>;
  servings?: number | null;
  ingredients: RecipeIngredient[];
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
  const explicitServingWeightG = weightProp ? weightProp.total_value / per : null;

  // Progressive weight estimate from ingredient units (background queries refine this).
  const {
    weightG: estimatedTotalG,
    isApproximate,
    isLoading: weightLoading,
  } = useRecipeWeightG(ingredients);
  const estimatedServingWeightG = estimatedTotalG != null ? estimatedTotalG / per : null;

  // Prefer the explicit property weight; fall back to the progressive estimate.
  const servingWeightG = explicitServingWeightG ?? estimatedServingWeightG;
  const weightIsApproximate = explicitServingWeightG == null && isApproximate;

  const hasAnyMissing = nutrients.some((n) => n.missing_value);

  return (
    <div
      className="position-absolute top-0 start-0 w-100 h-100 overflow-auto"
      style={{ background: 'rgba(0,0,0,0.82)', zIndex: 5 }}
      role="region"
      aria-label="Nutrition information"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
    >
      <div
        className="ps-3 py-2 text-white"
        style={{ fontSize: '0.875rem', paddingRight: '3.5rem' }}
      >
        <p className="mb-1 fw-bold text-center" style={{ fontSize: '0.95rem' }}>
          Nutrition Information
        </p>
        {servings != null && servings > 1 && (
          <p className="mb-1 text-center text-white-50" style={{ fontSize: '0.8rem' }}>
            Serving size: 1 of {servings}
          </p>
        )}
        <table className="w-100 mb-1" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid rgba(255,255,255,0.5)' }}>
              <th className="text-start pb-1">Nutrient</th>
              <th className="text-end pb-1">Per serving</th>
              <th className="text-end pb-1">
                Per 100g
                {weightIsApproximate ? <span aria-label="approximate"> ~</span> : ''}
              </th>
            </tr>
          </thead>
          <tbody>
            {nutrients.map((n) => {
              const perServing = n.total_value / per;
              const per100g = servingWeightG != null ? (perServing / servingWeightG) * 100 : null;
              return (
                <tr key={n.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.15)' }}>
                  <td className="py-1">
                    {n.name}
                    {n.unit ? ` (${n.unit})` : ''}
                    {n.missing_value ? '\u00a0*' : ''}
                  </td>
                  <td className="text-end py-1">{formatNutrientValue(perServing, n.unit)}</td>
                  <td className="text-end py-1">
                    {per100g != null
                      ? formatNutrientValue(per100g, n.unit)
                      : weightLoading
                        ? '…'
                        : '–'}
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
        {weightIsApproximate && (
          <p className="mb-0 text-white-50" style={{ fontSize: '0.8rem' }}>
            ~ Per 100g values are estimated from ingredient units
          </p>
        )}
        {servingWeightG == null && !weightLoading && (
          <p className="mb-0 text-white-50" style={{ fontSize: '0.8rem' }}>
            Per 100g values unavailable (no serving weight defined)
          </p>
        )}
      </div>
    </div>
  );
}

const MIN_SERVINGS = 1;

function minutesToDuration(minutes?: number | null): string | undefined {
  if (minutes == null || minutes <= 0) return undefined;
  return `PT${Math.round(minutes)}M`;
}

function getIngredientFoodName(ingredient: RecipeIngredient): string {
  return ingredient.food && typeof ingredient.food === 'object' ? ingredient.food.name : '';
}

function getRecipeTotalMinutes(recipe: Recipe): number {
  return (recipe.cooking_time ?? 0) + (recipe.waiting_time ?? 0);
}

const circleButtonStyle = {
  width: 32,
  height: 32,
  padding: 0,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '1.1rem',
};

interface RecipeDetailContentProps {
  recipe: Recipe;
  /** Servings override from a meal plan entry. Scales ingredient amounts when set. */
  servingsOverride?: number | null;
  /** Note from a meal plan entry, shown as a banner above the recipe. */
  mealPlanNote?: string | null;
  /** The full meal plan entry, used to show the cook log tick button. */
  mealPlanEntry?: MealPlan | null;
}

export function RecipeDetailContent({
  recipe,
  servingsOverride,
  mealPlanNote,
  mealPlanEntry,
}: RecipeDetailContentProps) {
  const [planRecipe, setPlanRecipe] = useState<Recipe | null>(null);
  const [cookingMode, setCookingMode] = useState(false);
  const [showNutrition, setShowNutrition] = useState(false);
  const [showCookLog, setShowCookLog] = useState(false);
  const { tandoor_external_url: externalUrl } = useAppConfig();

  const [userServings, setUserServings] = useState<number>(
    servingsOverride ?? recipe.servings ?? 1,
  );

  // Keep userServings in sync if the recipe or override changes (e.g. navigation)
  useEffect(() => {
    setUserServings(servingsOverride ?? recipe.servings ?? 1);
  }, [recipe.id, servingsOverride, recipe.servings]);

  // Determine whether to show the cook log tick button.
  const entryDate = mealPlanEntry?.from_date?.split('T')[0] ?? null;
  const today = new Date().toISOString().split('T')[0];
  const isEligibleForCookLog = entryDate !== null && entryDate <= today;

  const { data: cookLogData } = useCookLog(entryDate ?? today, entryDate ?? today);
  const isCooked = isEligibleForCookLog
    ? isCookedOnDate(cookLogData, recipe.id, entryDate!)
    : false;

  const mealType =
    mealPlanEntry && typeof mealPlanEntry.meal_type === 'object'
      ? (mealPlanEntry.meal_type as MealType)
      : null;

  const hasPersonalToken = Boolean(localStorage.getItem('tandoor_token'));

  const keywords = Array.isArray(recipe.keywords)
    ? recipe.keywords.filter((k): k is Keyword => typeof k === 'object')
    : [];

  const steps = recipe.steps ? [...recipe.steps].sort((a, b) => a.order - b.order) : [];

  // Collect all ingredients from all steps
  const allIngredients: RecipeIngredient[] = steps.flatMap((s) => s.ingredients ?? []);

  const scaleFactor =
    recipe.servings != null && recipe.servings > 0 ? userServings / recipe.servings : undefined;
  const cookTimeDuration = minutesToDuration(recipe.cooking_time);
  const prepTimeDuration = minutesToDuration(recipe.waiting_time);
  const totalTimeDuration = minutesToDuration(getRecipeTotalMinutes(recipe));

  return (
    <article itemScope itemType="https://schema.org/Recipe">
      <div className="position-relative mb-3">
        {recipe.image && (
          <img
            src={proxyMediaUrl(recipe.image)}
            alt={recipe.name}
            itemProp="image"
            className="w-100 rounded"
            style={{ maxHeight: 320, objectFit: 'cover', display: 'block' }}
          />
        )}
        {showNutrition && recipe.food_properties && (
          <NutritionOverlay
            foodProperties={recipe.food_properties}
            servings={userServings}
            ingredients={allIngredients}
            onClose={() => setShowNutrition(false)}
          />
        )}
        <div
          className="position-absolute top-0 end-0 d-flex flex-column gap-2 p-2"
          style={{
            background: 'rgba(0,0,0,0.25)',
            borderBottomLeftRadius: 8,
            zIndex: 10,
          }}
        >
          <Button
            variant="success"
            size="sm"
            style={circleButtonStyle}
            onClick={() => setPlanRecipe(recipe)}
            aria-label="Add to meal plan"
          >
            <Plus />
          </Button>
          {isEligibleForCookLog && !isCooked && !hasPersonalToken && (
            <OverlayTrigger
              trigger="click"
              placement="bottom"
              rootClose
              overlay={
                <Popover>
                  <Popover.Body className="p-2">
                    A personal API token is required. <Link to="/settings">Go to Settings →</Link>
                  </Popover.Body>
                </Popover>
              }
            >
              <Button
                variant="outline-secondary"
                size="sm"
                style={circleButtonStyle}
                aria-label="Log as cooked"
              >
                <Check2Circle />
              </Button>
            </OverlayTrigger>
          )}
          {isEligibleForCookLog && !isCooked && hasPersonalToken && (
            <Button
              variant="secondary"
              size="sm"
              style={circleButtonStyle}
              onClick={() => setShowCookLog(true)}
              aria-label="Log as cooked"
            >
              <Check2Circle />
            </Button>
          )}
          <UpSoonButton recipeId={recipe.id} style={circleButtonStyle} />
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
              aria-label={
                showNutrition ? 'Hide nutrition information' : 'Show nutrition information'
              }
              aria-pressed={showNutrition}
            >
              <Info />
            </Button>
          )}
          {externalUrl && (
            <Button
              as="a"
              href={`${externalUrl}/edit/recipe/${recipe.id}/`}
              target="_blank"
              rel="noopener noreferrer"
              variant="light"
              size="sm"
              style={circleButtonStyle}
              aria-label="Edit recipe in Tandoor"
            >
              <Pencil />
            </Button>
          )}
          {typeof navigator.share === 'function' && (
            <Button
              variant="light"
              size="sm"
              style={circleButtonStyle}
              onClick={async () => {
                try {
                  await navigator.share({
                    title: recipe.name,
                    url: window.location.href,
                  });
                } catch {
                  // User cancelled or share failed — nothing to do
                }
              }}
              aria-label="Share recipe"
            >
              <Share />
            </Button>
          )}
        </div>
      </div>

      <Row className="align-items-start mb-2">
        <Col>
          <h2 className="mb-1" itemProp="name">
            {recipe.name}
          </h2>
          <div className="d-flex flex-wrap gap-3 mb-1 small text-muted">
            {recipe.cooking_time != null && (
              <span className="d-inline-flex align-items-center gap-1">
                {cookTimeDuration && <meta itemProp="cookTime" content={cookTimeDuration} />}
                <Clock /> Cook: {recipe.cooking_time} min
              </span>
            )}
            {recipe.waiting_time != null && (
              <span className="d-inline-flex align-items-center gap-1">
                {prepTimeDuration && <meta itemProp="prepTime" content={prepTimeDuration} />}
                <HourglassSplit /> Wait: {recipe.waiting_time} min
              </span>
            )}
            {totalTimeDuration && <meta itemProp="totalTime" content={totalTimeDuration} />}
            {recipe.servings != null && (
              <span className="d-inline-flex align-items-center gap-1">
                <meta itemProp="recipeYield" content={`${recipe.servings} servings`} />
                <People /> Serves:
                <Button
                  variant="link"
                  className="p-0 text-muted"
                  style={{ lineHeight: 1 }}
                  onClick={() => setUserServings((s) => Math.max(MIN_SERVINGS, s - 1))}
                  aria-label="Decrease servings"
                  disabled={userServings <= MIN_SERVINGS}
                >
                  <DashCircle />
                </Button>
                <strong>{userServings}</strong>
                <Button
                  variant="link"
                  className="p-0 text-muted"
                  style={{ lineHeight: 1 }}
                  onClick={() => setUserServings((s) => s + 1)}
                  aria-label="Increase servings"
                >
                  <PlusCircle />
                </Button>
                {servingsOverride != null ? (
                  servingsOverride === userServings ? (
                    <Badge bg="info" style={{ fontSize: '0.7em' }}>
                      meal plan
                    </Badge>
                  ) : (
                    <span className="text-muted" style={{ fontSize: '0.8em' }}>
                      (meal plan: {servingsOverride})
                    </span>
                  )
                ) : recipe.servings === userServings ? (
                  <Badge bg="secondary" style={{ fontSize: '0.7em' }}>
                    default
                  </Badge>
                ) : (
                  <span className="text-muted" style={{ fontSize: '0.8em' }}>
                    (default: {recipe.servings})
                  </span>
                )}
              </span>
            )}
            {recipe.source_url && (
              <a
                href={recipe.source_url}
                target="_blank"
                rel="noopener noreferrer"
                itemProp="sameAs"
                className="d-inline-flex align-items-center gap-1"
              >
                <BoxArrowUpRight /> Source
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
              <span key={k.id} itemProp="keywords">
                <TagBadge keyword={k} />
              </span>
            ))}
          </div>
        </Col>
      </Row>

      {mealPlanNote && (
        <Alert variant="info" className="mb-3">
          <strong>Meal plan note:</strong> {mealPlanNote}
        </Alert>
      )}

      {recipe.description && (
        <p className="text-muted" itemProp="description">
          {recipe.description}
        </p>
      )}

      {allIngredients.length > 0 && (
        <section className="mb-4">
          <h5>Ingredients</h5>
          <IngredientList
            ingredients={allIngredients}
            linkFoods
            scaleFactor={scaleFactor}
            itemProp="recipeIngredient"
          />
        </section>
      )}

      {steps.length === 1 && (
        <section className="mb-4">
          <h5>Instructions</h5>
          <div itemProp="recipeInstructions">
            <ReactMarkdown>{steps[0].instruction}</ReactMarkdown>
          </div>
        </section>
      )}

      {steps.length > 1 && (
        <section className="mb-4">
          <h5>Instructions</h5>
          <ol className="ps-3">
            {steps.map((step) => (
              <li key={step.id} className="mb-3">
                {step.name && <strong className="d-block mb-1">{step.name}</strong>}
                <div className="mb-1" itemProp="recipeInstructions">
                  <ReactMarkdown>{step.instruction}</ReactMarkdown>
                </div>
                {step.time != null && step.time !== 0 && (
                  <Badge bg="info" className="ms-2">
                    {step.time} min
                  </Badge>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {cookingMode && steps.length > 0 && (
        <CookingMode
          steps={steps}
          scaleFactor={scaleFactor}
          onClose={() => setCookingMode(false)}
        />
      )}

      <MealPlanAddModal recipe={planRecipe} onHide={() => setPlanRecipe(null)} />
      {isEligibleForCookLog && entryDate && (
        <CookLogModal
          show={showCookLog}
          onHide={() => setShowCookLog(false)}
          recipeId={recipe.id}
          mealPlanDate={entryDate}
          mealType={mealType}
        />
      )}
    </article>
  );
}

export function RecipeDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const {
    data: recipe,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['recipe', id],
    queryFn: () => apiGet<Recipe>(`/recipe/${id}/`),
    enabled: !!id,
  });

  useRecipeJsonLd(recipe);

  useEffect(() => {
    if (!id) return;
    // Only record view logs for authenticated users with a personal token.
    // Users relying on a default/shared server token don't have a personal
    // identity in Tandoor, so logging their views would be meaningless.
    if (!localStorage.getItem('tandoor_token')) return;

    // Capture the recipe from cache now so we can update the recently-viewed
    // list optimistically (before the network round-trip completes).
    const recipeData = queryClient.getQueryData<Recipe>(['recipe', id]);
    if (recipeData) {
      queryClient.setQueryData<PaginatedResponse<Recipe>>(['recently-viewed'], (old) => {
        const existing = old?.results ?? [];
        const filtered = existing.filter((r) => r.id !== recipeData.id);
        return {
          count: old?.count ?? filtered.length + 1,
          next: old?.next ?? null,
          previous: old?.previous ?? null,
          results: [recipeData, ...filtered].slice(0, MAX_RECENTLY_VIEWED_ITEMS),
        };
      });
    }

    // Fire-and-forget — never block the viewing experience.
    apiPost('/view-log/', { recipe: Number(id) })
      .then(() => {
        // Invalidate so the shelf re-syncs with the server in the background.
        queryClient.invalidateQueries({ queryKey: ['recently-viewed'] });
        broadcastInvalidation('recently-viewed');
      })
      .catch(() => {
        // Roll back the optimistic update by re-fetching from the server.
        queryClient.invalidateQueries({ queryKey: ['recently-viewed'] });
      });
    // Only record a view when navigating to a different recipe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (isLoading && !recipe) {
    return <LoadingMascot />;
  }

  if (isError || !recipe) {
    return <Alert variant="danger">Failed to load recipe.</Alert>;
  }

  return <RecipeDetailContent recipe={recipe} />;
}

function useRecipeJsonLd(recipe: Recipe | undefined) {
  useEffect(() => {
    if (!recipe) return;
    const steps = recipe.steps ? [...recipe.steps].sort((a, b) => a.order - b.order) : [];
    const recipeIngredients = steps
      .flatMap((step) => step.ingredients ?? [])
      .filter((ingredient) => !ingredient.is_header)
      .map((ingredient) => {
        const amount =
          !ingredient.no_amount && ingredient.amount != null
            ? `${formatFraction(ingredient.amount)} `
            : '';
        const unit = ingredient.unit?.name ? `${ingredient.unit.name} ` : '';
        const foodName = getIngredientFoodName(ingredient);
        const note = ingredient.note ? ` (${ingredient.note})` : '';
        return `${amount}${unit}${foodName}${note}`.trim();
      })
      .filter(Boolean);
    const recipeInstructions = steps
      .map((step) => {
        const text = step.instruction?.replace(/\s+/g, ' ').trim();
        if (!text) return null;
        return {
          '@type': 'HowToStep',
          name: step.name,
          text,
        };
      })
      .filter((step): step is NonNullable<typeof step> => step !== null);
    const keywords = Array.isArray(recipe.keywords)
      ? recipe.keywords
          .filter((keyword): keyword is Keyword => typeof keyword === 'object')
          .map((keyword) => keyword.name)
      : [];
    const servings = Math.max(recipe.servings ?? 1, 1);
    const caloriesProperty = recipe.food_properties
      ? Object.values(recipe.food_properties).find((property) =>
          CALORIE_PROPERTY_NAME_PATTERN.test(property.name),
        )
      : undefined;
    const calories = caloriesProperty
      ? `${Math.round(caloriesProperty.total_value / servings)} ${caloriesProperty.unit ?? 'kcal'}`
      : undefined;
    const proxiedImage = recipe.image ? proxyMediaUrl(recipe.image) : undefined;
    const image = proxiedImage
      ? new URL(proxiedImage, window.location.origin).toString()
      : undefined;
    const prepTime = minutesToDuration(recipe.waiting_time);
    const cookTime = minutesToDuration(recipe.cooking_time);
    const totalTime = minutesToDuration(getRecipeTotalMinutes(recipe));
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'recipe-jsonld';
    script.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: recipe.name,
      description: recipe.description,
      image,
      url: window.location.href,
      prepTime,
      cookTime,
      totalTime,
      recipeYield: recipe.servings,
      keywords: keywords.length > 0 ? keywords.join(', ') : undefined,
      recipeIngredient: recipeIngredients.length > 0 ? recipeIngredients : undefined,
      recipeInstructions: recipeInstructions.length > 0 ? recipeInstructions : undefined,
      nutrition: calories ? { '@type': 'NutritionInformation', calories } : undefined,
    });
    document.head.appendChild(script);
    return () => {
      document.getElementById('recipe-jsonld')?.remove();
    };
  }, [recipe]);
}

export { useRecipeJsonLd };
