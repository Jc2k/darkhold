import { Badge } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import type { Keyword } from '../api/tandoor-types';

export function TagBadge({ keyword }: { keyword: Keyword }) {
  const navigate = useNavigate();
  return (
    <Badge
      bg="secondary"
      className="me-1 mb-1"
      style={{ cursor: 'pointer' }}
      onClick={() => navigate(`/search?keywords=${keyword.id}`)}
    >
      {keyword.name}
    </Badge>
  );
}
