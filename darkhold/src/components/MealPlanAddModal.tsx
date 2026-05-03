import { useState } from 'react';
import { Modal, Button, Form, Spinner } from 'react-bootstrap';
import type { Recipe, MealType } from '../api/tandoor-types';
import { useCreateMealPlan } from '../hooks/useMealPlan';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';
import { deriveMealType } from '../utils/mealUtils';

interface Props {
  recipe: Recipe | null;
  onHide: () => void;
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function formatMonthYear(d: Date): string {
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function getWeekStartingSaturday(weekOffset: number): Date[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysUntilSaturday = (6 - today.getDay() + 7) % 7;
  const saturday = new Date(today);
  saturday.setDate(today.getDate() + daysUntilSaturday + weekOffset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(saturday);
    d.setDate(saturday.getDate() + i);
    return d;
  });
}

export function MealPlanAddModal({ recipe, onHide }: Props) {
  const [weekOffset, setWeekOffset] = useState(0);
  const days = getWeekStartingSaturday(weekOffset);
  const [selectedDate, setSelectedDate] = useState<Date>(() => getWeekStartingSaturday(0)[0]);
  const [servings, setServings] = useState<number>(recipe?.servings ?? 2);
  const [mealTypeIdOverride, setMealTypeIdOverride] = useState<number | null>(null);
  const [note, setNote] = useState('');

  const { data: mealTypesData } = useQuery({
    queryKey: ['meal-types'],
    queryFn: () => apiGet<{ results: MealType[] }>('/meal-type/'),
  });
  const mealTypes = mealTypesData?.results ?? [];

  const createMealPlan = useCreateMealPlan();

  if (!recipe) return null;

  const effectiveMealTypeId = mealTypeIdOverride ?? deriveMealType(recipe, mealTypes);

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
        <Modal.Title className="fs-6">Add to Meal Plan</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="fw-semibold mb-3">{recipe.name}</p>

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
          <Form.Label>Meal Type</Form.Label>
          <Form.Select
            value={effectiveMealTypeId ?? ''}
            onChange={(e) => setMealTypeIdOverride(Number(e.target.value))}
          >
            {mealTypes.map((mt) => (
              <option key={mt.id} value={mt.id}>{mt.name}</option>
            ))}
          </Form.Select>
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>Servings</Form.Label>
          <Form.Control
            type="number"
            min={1}
            value={servings}
            onChange={(e) => setServings(Number(e.target.value))}
          />
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
