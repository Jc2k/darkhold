import type { ReactNode } from 'react';
import { Card, Button } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'react-bootstrap-icons';
import type { Recipe, Keyword } from '../api/tandoor-types';
import { TagBadge } from './TagBadge';
import { proxyMediaUrl } from '../utils/mediaUrl';
import { addToMealPlanButtonStyle } from '../utils/buttonStyles';
import { UpSoonButton } from './UpSoonButton';

interface Props {
  recipe: Recipe;
  onAddToMealPlan?: (recipe: Recipe) => void;
  /** Override the navigation target when clicking the card. Defaults to /recipe/:id */
  linkTo?: string;
  /** Optional extra action rendered in the image button overlay row. */
  imageOverlayAction?: ReactNode;
  /** Optional meal plan note rendered within the card. */
  mealPlanNote?: string;
}

const IMAGE_HEIGHT = 180;
const PLACEHOLDER_BG = '#d0d0d0';
const PLACEHOLDER_ICON_COLOR = '#a0a0a0';

export function RecipeCard({
  recipe,
  onAddToMealPlan,
  linkTo,
  imageOverlayAction,
  mealPlanNote,
}: Props) {
  const navigate = useNavigate();
  const destination = linkTo ?? `/recipe/${recipe.id}`;
  const keywords = Array.isArray(recipe.keywords)
    ? recipe.keywords.filter((k): k is Keyword => typeof k === 'object')
    : [];

  return (
    <Card className="h-100 recipe-card" style={{ cursor: 'pointer' }}>
      <div style={{ position: 'relative' }}>
        {recipe.image ? (
          <Card.Img
            variant="top"
            src={proxyMediaUrl(recipe.image)}
            style={{ height: IMAGE_HEIGHT, objectFit: 'cover' }}
            onClick={() => navigate(destination)}
          />
        ) : (
          <div
            role="img"
            aria-label="No image available"
            style={{
              height: IMAGE_HEIGHT,
              background: PLACEHOLDER_BG,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onClick={() => navigate(destination)}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="72"
              height="72"
              viewBox="0 0 24 24"
              fill={PLACEHOLDER_ICON_COLOR}
              aria-hidden="true"
            >
              {/* Pizza slice */}
              <path d="M12 2C6.48 2 2 6.48 2 12h10V2zm0 0c5.52 0 10 4.48 10 10h-10V2zM2 12c0 5.52 4.48 10 10 10L12 12H2z" />
            </svg>
          </div>
        )}
        {onAddToMealPlan && (
          <Button
            variant="success"
            size="sm"
            style={{
              ...addToMealPlanButtonStyle,
              position: 'absolute',
              bottom: 8,
              right: 8,
            }}
            onClick={(e) => {
              e.stopPropagation();
              onAddToMealPlan(recipe);
            }}
            aria-label="Add to meal plan"
          >
            <Plus />
          </Button>
        )}
        <UpSoonButton
          recipeId={recipe.id}
          style={{
            ...addToMealPlanButtonStyle,
            position: 'absolute',
            bottom: 8,
            right: onAddToMealPlan ? 48 : 8,
          }}
        />
        {imageOverlayAction}
      </div>
      <Card.Body onClick={() => navigate(destination)}>
        <Card.Title className="fs-6">{recipe.name}</Card.Title>
        {recipe.rating != null && (
          <div className="text-warning mb-1">{'★'.repeat(Math.round(recipe.rating))}</div>
        )}
        <div>
          {keywords.slice(0, 3).map((k) => (
            <TagBadge key={k.id} keyword={k} />
          ))}
        </div>
      </Card.Body>
      {mealPlanNote && (
        <Card.Footer className="small text-muted recipe-card-meal-plan-note">
          {mealPlanNote}
        </Card.Footer>
      )}
    </Card>
  );
}
