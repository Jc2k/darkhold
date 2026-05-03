import { Card } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { Book } from 'react-bootstrap-icons';
import type { RecipeBook } from '../api/tandoor-types';
import { proxyMediaUrl } from '../utils/mediaUrl';

interface Props {
  book: RecipeBook;
  coverImage?: string | null;
}

export function BookCard({ book, coverImage }: Props) {
  const navigate = useNavigate();

  return (
    <Card
      className="h-100 recipe-card"
      style={{ cursor: 'pointer' }}
      onClick={() => navigate(`/books/${book.id}`)}
    >
      {coverImage ? (
        <Card.Img
          variant="top"
          src={proxyMediaUrl(coverImage)}
          style={{ height: 180, objectFit: 'cover' }}
        />
      ) : (
        <div
          className="d-flex align-items-center justify-content-center bg-secondary text-white"
          style={{ height: 180, fontSize: '3rem' }}
        >
          <Book size={72} />
        </div>
      )}
      <Card.Body>
        <Card.Title className="fs-6">{book.name}</Card.Title>
        {book.description && (
          <Card.Text className="text-muted small text-clamp-3">
            {book.description}
          </Card.Text>
        )}
      </Card.Body>
    </Card>
  );
}
