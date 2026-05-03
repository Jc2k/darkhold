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
      <div style={{ position: 'relative' }}>
        {recipe.image ? (
          <Card.Img
            variant="top"
            src={proxyMediaUrl(recipe.image)}
            style={{ height: 180, objectFit: 'cover' }}
            onClick={() => navigate(`/recipe/${recipe.id}`)}
          />
        ) : (
          <div
            style={{
              height: 180,
              background: '#d0d0d0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onClick={() => navigate(`/recipe/${recipe.id}`)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 24 24" fill="#a0a0a0" aria-hidden="true">
              {/* Pizza slice */}
              <path d="M12 2C6.48 2 2 6.48 2 12h10V2zm0 0c5.52 0 10 4.48 10 10h-10V2zM2 12c0 5.52 4.48 10 10 10L12 12H2z"/>
            </svg>
          </div>
        )}
        {onAddToMealPlan && (
          <Button
            variant="success"
            size="sm"
            style={{
              position: 'absolute',
              bottom: 8,
              right: 8,
              width: 32,
              height: 32,
              padding: 0,
              borderRadius: '50%',
              lineHeight: 1,
              fontSize: '1.25rem',
            }}
            onClick={(e) => {
              e.stopPropagation();
              onAddToMealPlan(recipe);
            }}
            aria-label="Add to meal plan"
          >
            +
          </Button>
        )}
      </div>
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
    </Card>
  );
}
