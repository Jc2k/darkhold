import { Badge, Button, Modal, Spinner } from 'react-bootstrap';
import { JournalRichtext, Plus } from 'react-bootstrap-icons';
import { Link } from 'react-router-dom';
import type { Keyword, Recipe } from '../api/tandoor-types';
import { useRecipeCardInfo } from '../hooks/useRecipeCardInfo';
import { getRecipeNutritionFacts } from '../utils/recipeCardInfo';
import { TagBadge } from './TagBadge';
import { UpSoonButton } from './UpSoonButton';

interface Props {
  recipe: Recipe;
  show: boolean;
  onHide: () => void;
  onAddToMealPlan?: (recipe: Recipe) => void;
}

function nutritionToneLabel(tone: 'success' | 'warning' | 'danger' | 'secondary'): string {
  if (tone === 'success') return 'target met';
  if (tone === 'warning') return 'close to target';
  if (tone === 'danger') return 'outside target';
  return 'no target set';
}

function formatLastHad(value: string | null): string {
  if (!value) return 'Not recorded';
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function RecipeCardInfoModal({ recipe, show, onHide, onAddToMealPlan }: Props) {
  const { data, isLoading, isError } = useRecipeCardInfo(recipe.id, show);
  const detailedRecipe = data?.recipe ?? recipe;
  const keywords = Array.isArray(detailedRecipe.keywords)
    ? detailedRecipe.keywords.filter((keyword): keyword is Keyword => typeof keyword === 'object')
    : [];
  const nutritionFacts = getRecipeNutritionFacts(detailedRecipe);

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title className="fs-5">{detailedRecipe.name}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {isLoading && !data && (
          <div className="text-muted d-flex align-items-center gap-2 mb-3">
            <Spinner size="sm" /> Loading recipe details…
          </div>
        )}
        {isError && <p className="text-danger small">Could not refresh recipe details.</p>}

        <dl className="row mb-3">
          <dt className="col-4">Rating</dt>
          <dd className="col-8 mb-2">
            {detailedRecipe.rating != null ? `${detailedRecipe.rating} / 5` : 'Not rated'}
          </dd>
          <dt className="col-4">Last had</dt>
          <dd className="col-8 mb-2">
            {isLoading && !data ? 'Loading…' : formatLastHad(data?.lastCookedAt ?? null)}
          </dd>
        </dl>

        <section className="mb-3" aria-labelledby={`recipe-${recipe.id}-keywords`}>
          <h6 id={`recipe-${recipe.id}-keywords`}>Keywords</h6>
          {keywords.length > 0 ? (
            <div className="d-flex flex-wrap gap-1">
              {keywords.map((keyword) => (
                <TagBadge key={keyword.id} keyword={keyword} />
              ))}
            </div>
          ) : (
            <p className="small text-muted mb-0">No keywords</p>
          )}
        </section>

        <section aria-labelledby={`recipe-${recipe.id}-nutrition`}>
          <h6 id={`recipe-${recipe.id}-nutrition`}>Nutrition per serving</h6>
          {nutritionFacts.length > 0 ? (
            <div className="d-flex flex-wrap gap-2">
              {nutritionFacts.map((item) => (
                <Badge
                  key={item.key}
                  bg={item.tone}
                  className="recipe-card-info-fact"
                  title={nutritionToneLabel(item.tone)}
                  aria-label={`${item.label}: ${item.value}${item.unit}, ${nutritionToneLabel(item.tone)}`}
                >
                  {item.label}: {item.value}
                  {item.unit}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="small text-muted mb-0">No nutritional facts available</p>
          )}
        </section>
      </Modal.Body>
      <Modal.Footer className="justify-content-start gap-2">
        <UpSoonButton recipeId={recipe.id} className="app-icon-button" />
        {onAddToMealPlan && (
          <Button
            variant="success"
            className="app-icon-button"
            onClick={() => {
              onHide();
              onAddToMealPlan(recipe);
            }}
          >
            <Plus aria-hidden="true" />
          </Button>
        )}
        <Link
          to={`/recipe/${recipe.id}`}
          className="btn btn-outline-primary app-icon-button"
          onClick={onHide}
          aria-label="View full recipe"
        >
          <JournalRichtext aria-hidden="true" />
        </Link>
      </Modal.Footer>
    </Modal>
  );
}
