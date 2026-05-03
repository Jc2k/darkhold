import { memo } from 'react';
import { ListGroup, Button } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import type { Recipe } from '../api/tandoor-types';
import { addToMealPlanButtonStyle } from '../utils/buttonStyles';

interface Props {
  recipe: Recipe;
  onAddToMealPlan?: (recipe: Recipe) => void;
}

export const RecipeListItem = memo(function RecipeListItem({ recipe, onAddToMealPlan }: Props) {
  const navigate = useNavigate();
  return (
    <ListGroup.Item
      action
      onClick={() => navigate(`/recipe/${recipe.id}`)}
      className="d-flex justify-content-between align-items-center"
    >
      <span>{recipe.name}</span>
      <div className="d-flex align-items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {recipe.cooking_time != null && (
          <small className="text-muted">{recipe.cooking_time} min</small>
        )}
        {onAddToMealPlan && (
          <Button
            variant="success"
            size="sm"
            style={{ ...addToMealPlanButtonStyle, flexShrink: 0 }}
            onClick={() => onAddToMealPlan(recipe)}
            aria-label="Add to meal plan"
          >
            +
          </Button>
        )}
      </div>
    </ListGroup.Item>
  );
});
