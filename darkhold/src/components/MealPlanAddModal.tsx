import { useState, useEffect } from 'react';
import { Modal, Button, Form, InputGroup, Spinner } from 'react-bootstrap';
import type { Recipe, MealType } from '../api/tandoor-types';
import { useCreateMealPlan } from '../hooks/useMealPlan';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';
import { deriveMealType } from '../utils/mealUtils';
import { formatDate, formatMonthYear, getWeekStartingSaturday } from '../utils/dateUtils';

interface Props {
  recipe: Recipe | null;
  onHide: () => void;
}

export function MealPlanAddModal({ recipe, onHide }: Props) {
  const [weekOffset, setWeekOffset] = useState(0);
  const days = getWeekStartingSaturday(weekOffset);
  const [selectedDate, setSelectedDate] = useState<Date>(() => getWeekStartingSaturday(0)[0]);
  const [servings, setServings] = useState<number>(recipe?.servings ?? 1);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (recipe) {
      setServings(recipe.servings ?? 1);
    }
  }, [recipe]);

  const { data: mealTypesData } = useQuery({
    queryKey: ['meal-types'],
    queryFn: () => apiGet<{ results: MealType[] }>('/meal-type/'),
  });
  const mealTypes = mealTypesData?.results ?? [];

  const createMealPlan = useCreateMealPlan();

  if (!recipe) return null;

  const effectiveMealTypeId = deriveMealType(recipe, mealTypes);

  const handleSubmit = async () => {
    const date = formatDate(selectedDate);
    await createMealPlan.mutateAsync({
      recipe: recipe.id as unknown as Recipe,
      meal_type: (effectiveMealTypeId ?? mealTypes[0]?.id) as unknown as MealType,
      from_date: date,
      servings,
      ...(note ? { note } : {}),
      addshopping: true,
    });
    onHide();
  };

  return (
    <Modal show={!!recipe} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title className="fs-6" style={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          Add "{recipe.name}" to Meal Plan
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form.Group className="mb-3">
          <Form.Label>Date</Form.Label>
          <div className="d-flex align-items-center justify-content-between mb-1">
            <span className="text-muted small">{formatMonthYear(days[0])}</span>
          </div>
          <div className="d-flex align-items-center gap-1 flex-nowrap">
            <Button
              size="sm"
              variant="outline-secondary"
              onClick={() => setWeekOffset((w) => w - 1)}
              aria-label="Previous week"
            >‹</Button>
            {days.map((d) => (
              <Button
                key={d.toISOString()}
                size="sm"
                variant={formatDate(d) === formatDate(selectedDate) ? 'primary' : 'outline-secondary'}
                onClick={() => setSelectedDate(d)}
                className="d-flex flex-column align-items-center px-2 py-1 flex-fill"
                style={{ minWidth: 0 }}
              >
                <span style={{ fontSize: '0.65rem', lineHeight: 1 }}>
                  {d.toLocaleDateString('en-GB', { weekday: 'short' })}
                </span>
                <span style={{ fontSize: '0.85rem', lineHeight: 1.2, fontWeight: 600 }}>
                  {d.getDate()}
                </span>
              </Button>
            ))}
            <Button
              size="sm"
              variant="outline-secondary"
              onClick={() => setWeekOffset((w) => w + 1)}
              aria-label="Next week"
            >›</Button>
          </div>
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>Servings</Form.Label>
          <InputGroup>
            <Button
              variant="outline-secondary"
              onClick={() => setServings((s) => Math.max(1, s - 1))}
              aria-label="Decrease servings"
              style={{ width: '2.5rem' }}
            >-</Button>
            <Form.Control
              type="text"
              inputMode="numeric"
              value={servings}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= 1) setServings(val);
                else if (e.target.value === '') setServings(1);
              }}
              style={{ textAlign: 'center' }}
            />
            <Button
              variant="outline-secondary"
              onClick={() => setServings((s) => s + 1)}
              aria-label="Increase servings"
              style={{ width: '2.5rem' }}
            >+</Button>
          </InputGroup>
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>Notes</Form.Label>
          <Form.Control
            as="textarea"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional notes…"
          />
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>Cancel</Button>
        <Button variant="success" onClick={handleSubmit} disabled={createMealPlan.isPending}>
          {createMealPlan.isPending ? <Spinner size="sm" /> : 'Add to Plan'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
