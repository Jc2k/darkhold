import type { ReactNode } from 'react';
import { Card, Button } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { EggFried, Plus } from 'react-bootstrap-icons';
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
            className="recipe-image-placeholder"
            style={{ height: IMAGE_HEIGHT }}
            onClick={() => navigate(destination)}
          >
            <EggFried size={72} aria-hidden="true" />
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
