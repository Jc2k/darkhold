import { useState } from 'react';
import { Modal, Button, Form, Row, Col, Spinner } from 'react-bootstrap';
import type { Recipe, Keyword } from '../api/tandoor-types';
import { useCreateMealPlan } from '../hooks/useMealPlan';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';

interface MealType {
  id: number;
  name: string;
}

interface Props {
  recipe: Recipe | null;
  onHide: () => void;
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function deriveMealType(recipe: Recipe, mealTypes: MealType[]): number | undefined {
  const keywords = Array.isArray(recipe.keywords)
    ? recipe.keywords.filter((k): k is Keyword => typeof k === 'object').map((k) => k.name.toLowerCase())
    : [];

  const find = (name: string) => mealTypes.find((mt) => mt.name.toLowerCase().includes(name));

  if (keywords.some((k) => k.includes('breakfast'))) return find('breakfast')?.id;
  if (keywords.some((k) => k.includes('lunch'))) return find('lunch')?.id;
  if (keywords.some((k) => k.includes('dessert') || k.includes('snack'))) return find('snack')?.id ?? find('dessert')?.id;
  return find('dinner')?.id ?? mealTypes[0]?.id;
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

  const { data: mealTypesData } = useQuery({
    queryKey: ['meal-types'],
    queryFn: () => apiGet<{ results: MealType[] }>('/meal-type/'),
  });
  const mealTypes = mealTypesData?.results ?? [];

  const createMealPlan = useCreateMealPlan();

  if (!recipe) return null;

  const handleSubmit = async () => {
    const date = customDate || formatDate(selectedDate);
    const mealTypeId = deriveMealType(recipe, mealTypes);
    await createMealPlan.mutateAsync({
      recipe: recipe.id as unknown as Recipe,
      meal_type: (mealTypeId ?? mealTypes[0]?.id) as unknown as import('../api/tandoor-types').MealType,
      from_date: date,
      servings,
      shopping: 1 as unknown as import('../api/tandoor-types').ShoppingList,
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
          <Form.Label>Servings</Form.Label>
          <Form.Control
            type="number"
            min={1}
            value={servings}
            onChange={(e) => setServings(Number(e.target.value))}
          />
        </Form.Group>

        <p className="text-muted small mb-0">
          <strong>Shopping list:</strong> Ingredients will be automatically added to your shopping list.
        </p>
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
