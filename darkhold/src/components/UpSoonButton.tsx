import { Button, Spinner } from 'react-bootstrap';
import { BookmarkPlus, BookmarkDash } from 'react-bootstrap-icons';
import { useUpSoonForRecipe } from '../hooks/useUpSoon';

interface Props {
  recipeId: number;
  style?: React.CSSProperties;
}

export function UpSoonButton({ recipeId, style }: Props) {
  const hasPersonalToken = Boolean(localStorage.getItem('tandoor_token'));
  const { isLoading, isInUpSoon, isPending, toggle } = useUpSoonForRecipe(recipeId);

  if (!hasPersonalToken || isLoading) return null;

  return (
    <Button
      variant={isInUpSoon ? 'warning' : 'outline-secondary'}
      size="sm"
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        toggle();
      }}
      disabled={isPending}
      aria-label={isInUpSoon ? 'Remove from Up Soon' : 'Add to Up Soon'}
    >
      {isPending ? (
        <Spinner size="sm" />
      ) : isInUpSoon ? (
        <BookmarkDash />
      ) : (
        <BookmarkPlus />
      )}
    </Button>
  );
}
