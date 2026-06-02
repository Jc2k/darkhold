import { Button, Spinner, OverlayTrigger, Popover } from 'react-bootstrap';
import { BookmarkPlus, BookmarkDash } from 'react-bootstrap-icons';
import { Link } from 'react-router-dom';
import { useUpSoonForRecipe } from '../hooks/useUpSoon';

interface Props {
  recipeId: number;
  style?: React.CSSProperties;
  showLabel?: boolean;
}

export function UpSoonButton({ recipeId, style, showLabel = false }: Props) {
  const hasPersonalToken = Boolean(localStorage.getItem('tandoor_token'));
  const { isLoading, isInUpSoon, isPending, toggle } = useUpSoonForRecipe(recipeId);

  if (isLoading) return null;

  if (!hasPersonalToken) {
    return (
      <OverlayTrigger
        trigger="click"
        placement="bottom"
        rootClose
        overlay={
          <Popover>
            <Popover.Body className="p-2">
              A personal API token is required. <Link to="/settings">Go to Settings →</Link>
            </Popover.Body>
          </Popover>
        }
      >
        <Button
          variant="outline-secondary"
          size="sm"
          style={style}
          onClick={(e) => e.stopPropagation()}
          aria-label="Add to Up Soon"
        >
          <BookmarkPlus />
          {showLabel && <span className="ms-2">Add to upcoming</span>}
        </Button>
      </OverlayTrigger>
    );
  }

  return (
    <Button
      variant={isInUpSoon ? 'warning' : 'secondary'}
      size="sm"
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        toggle();
      }}
      disabled={isPending}
      aria-label={isInUpSoon ? 'Remove from Up Soon' : 'Add to Up Soon'}
    >
      {isPending ? <Spinner size="sm" /> : isInUpSoon ? <BookmarkDash /> : <BookmarkPlus />}
      {showLabel && (
        <span className="ms-2">{isInUpSoon ? 'Remove from upcoming' : 'Add to upcoming'}</span>
      )}
    </Button>
  );
}
