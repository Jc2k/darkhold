import { memo, useEffect, useRef, useState } from 'react';
import { ListGroup, Button } from 'react-bootstrap';
import { Plus } from 'react-bootstrap-icons';
import { useNavigate } from 'react-router-dom';
import type { Recipe } from '../api/tandoor-types';
import { addToMealPlanButtonStyle } from '../utils/buttonStyles';
import { hasLongPressMoved, LONG_PRESS_DELAY_MS } from '../utils/longPress';
import { RecipeCardInfoModal } from './RecipeCardInfoModal';
import { UpSoonButton } from './UpSoonButton';

interface Props {
  recipe: Recipe;
  onAddToMealPlan?: (recipe: Recipe) => void;
}

const SWIPE_ACTION_WIDTH_PX = 52;
const SWIPE_THRESHOLD_PX = 60;
const OPEN_SWIPE_WIDTH_PX = SWIPE_ACTION_WIDTH_PX * 2;
const FULL_SWIPE_THRESHOLD_PX = OPEN_SWIPE_WIDTH_PX * 2;

export const RecipeListItem = memo(function RecipeListItem({ recipe, onAddToMealPlan }: Props) {
  const navigate = useNavigate();
  const [showInfo, setShowInfo] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [draggingSwipe, setDraggingSwipe] = useState(false);
  const [longPressPending, setLongPressPending] = useState(false);
  const pointerStart = useRef<{
    pointerId: number;
    x: number;
    y: number;
    initialOffset: number;
  } | null>(null);
  const longPressTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);

  const clearLongPress = () => {
    if (longPressTimeout.current) clearTimeout(longPressTimeout.current);
    longPressTimeout.current = null;
    setLongPressPending(false);
  };

  useEffect(
    () => () => {
      if (longPressTimeout.current) clearTimeout(longPressTimeout.current);
    },
    [],
  );

  const closeSwipeAction = () => {
    setDraggingSwipe(false);
    setSwipeOffset(0);
  };

  const openMealPlan = () => {
    closeSwipeAction();
    onAddToMealPlan?.(recipe);
  };

  return (
    <>
      <ListGroup.Item
        className={`recipe-list-swipe-item p-0${draggingSwipe ? ' recipe-list-swipe-item-dragging' : ''}`}
      >
        <div className="recipe-list-swipe-shell">
          <div className="recipe-list-swipe-actions">
            {onAddToMealPlan && (
              <Button
                variant="success"
                className={`recipe-list-swipe-action rounded-0${swipeOffset <= -FULL_SWIPE_THRESHOLD_PX ? ' recipe-list-swipe-action-ready' : ''}`}
                onClick={openMealPlan}
                aria-label={`Add ${recipe.name} to meal plan`}
                tabIndex={swipeOffset < 0 ? 0 : -1}
              >
                <Plus aria-hidden="true" />
              </Button>
            )}
            <UpSoonButton recipeId={recipe.id} />
          </div>
          <div
            className={`recipe-list-swipe-content d-flex justify-content-between align-items-center px-3 py-2${longPressPending ? ' recipe-list-long-press-pending' : ''}${draggingSwipe ? ' recipe-list-swipe-content-dragging' : ''}`}
            style={{ transform: `translateX(${swipeOffset}px)` }}
            onClickCapture={(event) => {
              if (!suppressClick.current) return;
              event.preventDefault();
              event.stopPropagation();
              suppressClick.current = false;
            }}
            role="button"
            tabIndex={0}
            onClick={() => navigate(`/recipe/${recipe.id}`)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') navigate(`/recipe/${recipe.id}`);
            }}
            onPointerDown={(event) => {
              if (event.target instanceof Element && event.target.closest('a, button')) return;
              if (event.pointerType === 'mouse' && event.button !== 0) return;
              pointerStart.current = {
                pointerId: event.pointerId,
                x: event.clientX,
                y: event.clientY,
                initialOffset: swipeOffset,
              };
              setDraggingSwipe(true);
              suppressClick.current = false;
              if (event.pointerType !== 'mouse') {
                clearLongPress();
                setLongPressPending(true);
                longPressTimeout.current = setTimeout(() => {
                  suppressClick.current = true;
                  longPressTimeout.current = null;
                  setLongPressPending(false);
                  closeSwipeAction();
                  setShowInfo(true);
                }, LONG_PRESS_DELAY_MS);
              }
              event.currentTarget.setPointerCapture?.(event.pointerId);
            }}
            onPointerMove={(event) => {
              const start = pointerStart.current;
              if (!start || start.pointerId !== event.pointerId) return;
              const deltaX = event.clientX - start.x;
              const deltaY = event.clientY - start.y;
              if (hasLongPressMoved(deltaX, deltaY)) clearLongPress();
              if (Math.abs(deltaX) <= Math.abs(deltaY)) return;
              suppressClick.current = true;
              setSwipeOffset(Math.min(0, start.initialOffset + deltaX));
            }}
            onPointerUp={(event) => {
              const start = pointerStart.current;
              pointerStart.current = null;
              setDraggingSwipe(false);
              clearLongPress();
              if (!start || start.pointerId !== event.pointerId) return;
              const deltaX = event.clientX - start.x;
              const deltaY = event.clientY - start.y;
              const finalOffset = Math.min(0, start.initialOffset + deltaX);
              if (
                finalOffset <= -FULL_SWIPE_THRESHOLD_PX &&
                Math.abs(finalOffset) > Math.abs(deltaY)
              ) {
                openMealPlan();
              } else if (
                finalOffset <= -SWIPE_THRESHOLD_PX &&
                Math.abs(finalOffset) > Math.abs(deltaY)
              ) {
                setSwipeOffset(-OPEN_SWIPE_WIDTH_PX);
              } else {
                closeSwipeAction();
              }
            }}
            onPointerCancel={() => {
              pointerStart.current = null;
              suppressClick.current = false;
              clearLongPress();
              closeSwipeAction();
            }}
          >
            <span>{recipe.name}</span>
            <div className="d-flex align-items-center gap-2">
              {recipe.cooking_time != null && (
                <small className="text-muted">{recipe.cooking_time} min</small>
              )}
              <div
                className="recipe-list-row-actions align-items-center gap-2"
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <UpSoonButton
                  recipeId={recipe.id}
                  style={{ ...addToMealPlanButtonStyle, flexShrink: 0 }}
                />
                {onAddToMealPlan && (
                  <Button
                    variant="success"
                    size="sm"
                    style={{ ...addToMealPlanButtonStyle, flexShrink: 0 }}
                    onClick={openMealPlan}
                    aria-label="Add to meal plan"
                  >
                    <Plus aria-hidden="true" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </ListGroup.Item>
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
});
