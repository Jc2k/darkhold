import { Card, Button } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import type { Recipe, Keyword } from '../api/tandoor-types';
import { TagBadge } from './TagBadge';
import { proxyMediaUrl } from '../utils/mediaUrl';

interface Props {
  recipe: Recipe;
  onAddToMealPlan?: (recipe: Recipe) => void;
}

export function RecipeCard({ recipe, onAddToMealPlan }: Props) {
  const navigate = useNavigate();
  const keywords = (Array.isArray(recipe.keywords)
    ? recipe.keywords.filter((k): k is Keyword => typeof k === 'object')
    : []);

  return (
    <Card className="h-100 recipe-card" style={{ cursor: 'pointer' }}>
      {recipe.image && (
        <Card.Img
          variant="top"
          src={proxyMediaUrl(recipe.image)}
          style={{ height: 180, objectFit: 'cover' }}
          onClick={() => navigate(`/recipe/${recipe.id}`)}
        />
      )}
      <Card.Body onClick={() => navigate(`/recipe/${recipe.id}`)}>
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
      {onAddToMealPlan && (
        <Card.Footer className="d-flex justify-content-end p-1">
          <Button
            size="sm"
            variant="outline-success"
            onClick={(e) => {
              e.stopPropagation();
              onAddToMealPlan(recipe);
            }}
          >
            + Plan
          </Button>
        </Card.Footer>
      )}
    </Card>
  );
}
