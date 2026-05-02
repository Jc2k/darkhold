import { ListGroup } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import type { Recipe } from '../api/tandoor-types';
import { NutritionBadge } from './NutritionBadge';

export function RecipeListItem({ recipe }: { recipe: Recipe }) {
  const navigate = useNavigate();
  return (
    <ListGroup.Item
      action
      onClick={() => navigate(`/recipe/${recipe.id}`)}
      className="d-flex justify-content-between align-items-center"
    >
      <span>{recipe.name}</span>
      <div className="d-flex align-items-center gap-2">
        <NutritionBadge nutrition={recipe.nutrition} />
        {recipe.cooking_time != null && (
          <small className="text-muted">{recipe.cooking_time} min</small>
        )}
      </div>
    </ListGroup.Item>
  );
}
