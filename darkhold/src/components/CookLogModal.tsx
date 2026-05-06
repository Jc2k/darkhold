import { useState } from 'react';
import { Modal, Button, Form, Spinner, Alert } from 'react-bootstrap';
import { Heart, HeartFill } from 'react-bootstrap-icons';
import { Link } from 'react-router-dom';
import type { MealType } from '../api/tandoor-types';
import { useCreateCookLog, buildCookLogTimestamp } from '../hooks/useCookLog';

interface Props {
  show: boolean;
  onHide: () => void;
  recipeId: number;
  /** The meal plan entry date (YYYY-MM-DD), used to calculate the created_at timestamp. */
  mealPlanDate: string;
  /** The meal type of the entry, used to infer time for historical entries. */
  mealType?: MealType | null;
}

function RatingHearts({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="d-flex gap-3" role="group" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(value === n ? null : n)}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            fontSize: '1.75rem',
            color: value !== null && n <= value ? '#dc3545' : '#adb5bd',
            lineHeight: 1,
          }}
          aria-label={`${n} heart${n !== 1 ? 's' : ''}${value === n ? ' (click to clear)' : ''}`}
          aria-pressed={value !== null && n <= value}
        >
          {value !== null && n <= value ? <HeartFill /> : <Heart />}
        </button>
      ))}
    </div>
  );
}

export function CookLogModal({ show, onHide, recipeId, mealPlanDate, mealType }: Props) {
  const [rating, setRating] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const createCookLog = useCreateCookLog();
  const hasPersonalToken = Boolean(localStorage.getItem('tandoor_token'));

  const handleHide = () => {
    if (createCookLog.isPending) return;
    setRating(null);
    setNotes('');
    createCookLog.reset();
    onHide();
  };

  const handleSubmit = async () => {
    if (!hasPersonalToken) return;
    await createCookLog.mutateAsync({
      recipe: recipeId,
      rating: rating ?? null,
      comment: notes.trim() || null,
      created_at: buildCookLogTimestamp(mealPlanDate, mealType),
    });
    handleHide();
  };

  return (
    <Modal show={show} onHide={handleHide} centered>
      <Modal.Header closeButton>
        <Modal.Title className="fs-6">Log Cook</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {createCookLog.isError && (
          <Alert variant="danger" className="py-2 px-3 mb-3 small">
            Failed to save cook log. Please try again.
          </Alert>
        )}
        <Form.Group className="mb-4">
          <Form.Label className="fw-semibold mb-2">Rating</Form.Label>
          <RatingHearts value={rating} onChange={setRating} />
        </Form.Group>
        <Form.Group>
          <Form.Label className="fw-semibold">Notes</Form.Label>
          <Form.Control
            as="textarea"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="How did it go? Any tweaks for next time?"
          />
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={handleHide} disabled={createCookLog.isPending}>
          Cancel
        </Button>
        {!hasPersonalToken ? (
          <Alert variant="warning" className="mb-0 py-2 px-3 d-flex align-items-center gap-2">
            <span>A personal API token is required.</span>
            <Alert.Link as={Link} to="/settings" onClick={handleHide}>
              Go to Settings →
            </Alert.Link>
          </Alert>
        ) : (
          <Button variant="success" onClick={handleSubmit} disabled={createCookLog.isPending}>
            {createCookLog.isPending ? <Spinner size="sm" /> : 'Save'}
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
}
