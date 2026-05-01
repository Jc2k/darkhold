import { useState } from 'react';
import { Modal, Button, Form, Row, Col, Spinner } from 'react-bootstrap';
import type { Recipe, MealType, ShoppingList } from '../api/tandoor-types';
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

function getNextDays(n: number): Date[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d;
  });
}

function shortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function MealPlanAddModal({ recipe, onHide }: Props) {
  const days = getNextDays(7);
  const [selectedDate, setSelectedDate] = useState<Date>(days[0]);
  const [customDate, setCustomDate] = useState('');
  const [servings, setServings] = useState<number>(recipe?.servings ?? 2);
  const [mealTypeIdOverride, setMealTypeIdOverride] = useState<number | null>(null);
  const [note, setNote] = useState('');

  const { data: mealTypesData } = useQuery({
    queryKey: ['meal-types'],
    queryFn: () => apiGet<{ results: MealType[] }>('/meal-type/'),
  });
  const mealTypes = mealTypesData?.results ?? [];

  const { data: shoppingListsData } = useQuery({
    queryKey: ['shopping-lists'],
    queryFn: () => apiGet<{ results: ShoppingList[] }>('/shopping-list/'),
  });
  const shoppingListId = shoppingListsData?.results?.[0]?.id;

  const createMealPlan = useCreateMealPlan();

  if (!recipe) return null;

  const effectiveMealTypeId = mealTypeIdOverride ?? deriveMealType(recipe, mealTypes);

  const handleSubmit = async () => {
    const date = customDate || formatDate(selectedDate);
    await createMealPlan.mutateAsync({
      recipe: recipe.id as unknown as Recipe,
      meal_type: (effectiveMealTypeId ?? mealTypes[0]?.id) as unknown as MealType,
      from_date: date,
      servings,
      ...(note ? { note } : {}),
      ...(shoppingListId != null ? { shopping: shoppingListId as unknown as ShoppingList } : {}),
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
          <Row className="g-1 mb-2">
            {days.map((d) => (
              <Col key={d.toISOString()} xs="auto">
                <Button
                  size="sm"
                  variant={formatDate(d) === (customDate || formatDate(selectedDate)) ? 'primary' : 'outline-secondary'}
                  onClick={() => { setSelectedDate(d); setCustomDate(''); }}
                >
                  {shortDate(d)}
                </Button>
              </Col>
            ))}
          </Row>
          <Form.Control
            type="date"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            placeholder="Or pick a custom date"
          />
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
