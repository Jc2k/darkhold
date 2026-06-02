import { useRef, useState, type ReactNode } from 'react';
import { Card, Button } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { EggFried, InfoCircle, Plus } from 'react-bootstrap-icons';
import type { Recipe, Keyword } from '../api/tandoor-types';
import { TagBadge } from './TagBadge';
import { proxyMediaUrl } from '../utils/mediaUrl';
import { addToMealPlanButtonStyle } from '../utils/buttonStyles';
import { UpSoonButton } from './UpSoonButton';
import { RecipeCardInfoModal } from './RecipeCardInfoModal';
import { hasLongPressMoved, LONG_PRESS_DELAY_MS } from '../utils/longPress';

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
  const [showInfo, setShowInfo] = useState(false);
  const [longPressPending, setLongPressPending] = useState(false);
  const longPressTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);
  const pointerStart = useRef<{ pointerId: number; x: number; y: number } | null>(null);

  const clearLongPress = () => {
    if (longPressTimeout.current) clearTimeout(longPressTimeout.current);
    longPressTimeout.current = null;
    setLongPressPending(false);
  };

  return (
    <>
      <Card
        className={`h-100 recipe-card recipe-card-long-press${longPressPending ? ' long-press-pending' : ''}`}
        style={{ cursor: 'pointer' }}
        onClickCapture={(event) => {
          if (!longPressTriggered.current) return;
          event.preventDefault();
          event.stopPropagation();
          longPressTriggered.current = false;
        }}
        onPointerDown={(event) => {
          if (event.target instanceof Element && event.target.closest('a, button')) return;
          if (event.pointerType === 'mouse') return;
          pointerStart.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
          longPressTriggered.current = false;
          clearLongPress();
          setLongPressPending(true);
          longPressTimeout.current = setTimeout(() => {
            longPressTriggered.current = true;
            longPressTimeout.current = null;
            setLongPressPending(false);
            setShowInfo(true);
          }, LONG_PRESS_DELAY_MS);
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={(event) => {
          const start = pointerStart.current;
          if (!start || start.pointerId !== event.pointerId) return;
          if (hasLongPressMoved(event.clientX - start.x, event.clientY - start.y)) clearLongPress();
        }}
        onPointerUp={(event) => {
          if (pointerStart.current?.pointerId !== event.pointerId) return;
          pointerStart.current = null;
          clearLongPress();
        }}
        onPointerCancel={() => {
          pointerStart.current = null;
          longPressTriggered.current = false;
          clearLongPress();
        }}
      >
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
          <Button
            variant="secondary"
            size="sm"
            className="recipe-card-info-button"
            style={{ ...addToMealPlanButtonStyle, position: 'absolute', bottom: 8, left: 8 }}
            onClick={(event) => {
              event.stopPropagation();
              setShowInfo(true);
            }}
            aria-label={`Show decision information for ${recipe.name}`}
          >
            <InfoCircle />
          </Button>
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
      {showInfo && (
        <RecipeCardInfoModal
          recipe={recipe}
          show
          onHide={() => setShowInfo(false)}
          onAddToMealPlan={onAddToMealPlan}
        />
      )}
    </>
  );
}
