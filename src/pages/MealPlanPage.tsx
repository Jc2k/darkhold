import { useState } from 'react';
import { Row, Col, Card, Button, Modal, Form, Spinner, Alert } from 'react-bootstrap';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMealPlan, useDeleteMealPlan, useCreateMealPlan } from '../hooks/useMealPlan';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';
import type { MealPlan, Recipe, MealType, PaginatedResponse } from '../api/tandoor-types';
import { useRecipeSearch } from '../hooks/useRecipeSearch';

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function shortDay(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

interface SortableEntryProps {
  entry: MealPlan;
  onDelete: (id: number) => void;
  onClick: (entry: MealPlan) => void;
}

function SortableEntry({ entry, onDelete, onClick }: SortableEntryProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: entry.id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const recipe = typeof entry.recipe === 'object' ? entry.recipe : null;
  const mealType = typeof entry.meal_type === 'object' ? entry.meal_type : null;

  return (
    <div ref={setNodeRef} style={style} {...attributes} className="mb-2">
      <Card className="border-0 shadow-sm">
        <Card.Body className="py-2 px-3">
          <div className="d-flex align-items-center gap-2">
            <span {...listeners} style={{ cursor: 'grab', touchAction: 'none' }} className="text-muted">
              ⋮⋮
            </span>
            <div className="flex-grow-1" style={{ cursor: 'pointer' }} onClick={() => onClick(entry)}>
              <div className="small fw-semibold">{recipe?.name ?? `Recipe #${entry.recipe}`}</div>
              <div className="text-muted" style={{ fontSize: '0.7rem' }}>
                {mealType?.name}
                {entry.servings != null && ` · ${entry.servings} servings`}
              </div>
            </div>
            <Button
              variant="link"
              size="sm"
              className="text-danger p-0"
              onClick={() => onDelete(entry.id)}
            >
              ✕
            </Button>
          </div>
        </Card.Body>
      </Card>
    </div>
  );
}

interface EntryDetailModalProps {
  entry: MealPlan | null;
  onHide: () => void;
}

function EntryDetailModal({ entry, onHide }: EntryDetailModalProps) {
  if (!entry) return null;
  const recipe = typeof entry.recipe === 'object' ? entry.recipe : null;
  const mealType = typeof entry.meal_type === 'object' ? entry.meal_type : null;

  return (
    <Modal show={!!entry} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title className="fs-6">{recipe?.name ?? 'Meal Plan Entry'}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p><strong>Date:</strong> {entry.from_date}</p>
        <p><strong>Meal type:</strong> {mealType ? mealType.name : String(entry.meal_type)}</p>
        {entry.servings != null && <p><strong>Servings:</strong> {entry.servings}</p>}
        {entry.note && <p><strong>Notes:</strong> {entry.note}</p>}
        {recipe?.description && <p className="text-muted small">{recipe.description}</p>}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>Close</Button>
      </Modal.Footer>
    </Modal>
  );
}

interface AddMealModalProps {
  date: string;
  onHide: () => void;
  mealTypes: MealType[];
}

function AddMealModal({ date, onHide, mealTypes }: AddMealModalProps) {
  const [search, setSearch] = useState('');
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [mealTypeId, setMealTypeId] = useState<number>(mealTypes[0]?.id ?? 0);
  const [servings, setServings] = useState(2);
  const createMeal = useCreateMealPlan();

  const { data } = useRecipeSearch({ query: search, page_size: 10 });
  const recipes = data?.pages.flatMap((p) => p.results) ?? [];

  const handleSubmit = async () => {
    if (!selectedRecipe) return;
    await createMeal.mutateAsync({
      recipe: selectedRecipe.id as unknown as Recipe,
      meal_type: mealTypeId as unknown as MealType,
      from_date: date,
      servings,
      shopping: 1 as unknown as import('../api/tandoor-types').ShoppingList,
    });
    onHide();
  };

  return (
    <Modal show onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title className="fs-6">Add Meal — {date}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form.Group className="mb-3">
          <Form.Label>Search Recipe</Form.Label>
          <Form.Control
            type="search"
            placeholder="Type to search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && recipes.length > 0 && (
            <div className="border rounded mt-1" style={{ maxHeight: 200, overflowY: 'auto' }}>
              {recipes.map((r) => (
                <div
                  key={r.id}
                  className={`px-3 py-2 small ${selectedRecipe?.id === r.id ? 'bg-primary text-white' : ''}`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelectedRecipe(r)}
                >
                  {r.name}
                </div>
              ))}
            </div>
          )}
          {selectedRecipe && (
            <div className="mt-2 small text-success">✓ Selected: {selectedRecipe.name}</div>
          )}
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>Meal Type</Form.Label>
          <Form.Select value={mealTypeId} onChange={(e) => setMealTypeId(Number(e.target.value))}>
            {mealTypes.map((mt) => (
              <option key={mt.id} value={mt.id}>{mt.name}</option>
            ))}
          </Form.Select>
        </Form.Group>

        <Form.Group>
          <Form.Label>Servings</Form.Label>
          <Form.Control
            type="number"
            min={1}
            value={servings}
            onChange={(e) => setServings(Number(e.target.value))}
          />
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>Cancel</Button>
        <Button
          variant="success"
          disabled={!selectedRecipe || createMeal.isPending}
          onClick={handleSubmit}
        >
          {createMeal.isPending ? <Spinner size="sm" /> : 'Add'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export function MealPlanPage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [detailEntry, setDetailEntry] = useState<MealPlan | null>(null);
  const [addDate, setAddDate] = useState<string | null>(null);

  const startDate = addDays(new Date(), weekOffset * 7 - 3);
  const endDate = addDays(startDate, 9);

  const { data, isLoading, isError } = useMealPlan(startDate, endDate);
  const deleteMeal = useDeleteMealPlan();

  const { data: mealTypesData } = useQuery({
    queryKey: ['meal-types'],
    queryFn: () => apiGet<PaginatedResponse<MealType>>('/meal-type/'),
  });
  const mealTypes = mealTypesData?.results ?? [];

  const sensors = useSensors(useSensor(PointerSensor));

  const days = Array.from({ length: 10 }, (_, i) => addDays(startDate, i));

  const entriesByDay = (entries: MealPlan[]) =>
    days.reduce<Record<string, MealPlan[]>>((acc, day) => {
      const key = formatDate(day);
      acc[key] = entries.filter((e) => e.from_date === key);
      return acc;
    }, {});

  const allEntries = data?.results ?? [];
  const byDay = entriesByDay(allEntries);

  // Local state for DnD ordering within each day (visual only)
  const [dayOrder, setDayOrder] = useState<Record<string, number[]>>({});

  const getOrdered = (dateKey: string): MealPlan[] => {
    const entries = byDay[dateKey] ?? [];
    const order = dayOrder[dateKey];
    if (!order) return entries;
    return order.map((id) => entries.find((e) => e.id === id)).filter((e): e is MealPlan => !!e);
  };

  const handleDragEnd = (dateKey: string) => (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const entries = getOrdered(dateKey);
    const oldIndex = entries.findIndex((e) => e.id === active.id);
    const newIndex = entries.findIndex((e) => e.id === over.id);
    const reordered = arrayMove(entries, oldIndex, newIndex);
    setDayOrder((prev) => ({ ...prev, [dateKey]: reordered.map((e) => e.id) }));
  };

  if (isError) {
    return <Alert variant="danger">Failed to load meal plan.</Alert>;
  }

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
        <h2 className="mb-0">Meal Plan</h2>
        <div className="d-flex gap-2">
          <Button variant="outline-secondary" size="sm" onClick={() => setWeekOffset((w) => w - 1)}>
            ← Prev
          </Button>
          <Button variant="outline-secondary" size="sm" onClick={() => setWeekOffset(0)}>
            Today
          </Button>
          <Button variant="outline-secondary" size="sm" onClick={() => setWeekOffset((w) => w + 1)}>
            Next →
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="text-center py-5">
          <Spinner />
        </div>
      )}

      <Row xs={1} sm={2} md={3} lg={4} className="g-3">
        {days.map((day) => {
          const dateKey = formatDate(day);
          const isToday = dateKey === formatDate(new Date());
          const entries = getOrdered(dateKey);

          return (
            <Col key={dateKey}>
              <Card className={isToday ? 'border-primary' : ''}>
                <Card.Header className={`py-2 d-flex justify-content-between align-items-center ${isToday ? 'bg-primary text-white' : ''}`}>
                  <small className="fw-semibold">{shortDay(day)}</small>
                  <Button
                    variant={isToday ? 'light' : 'outline-secondary'}
                    size="sm"
                    style={{ fontSize: '0.7rem', padding: '0 6px' }}
                    onClick={() => setAddDate(dateKey)}
                  >
                    + Add
                  </Button>
                </Card.Header>
                <Card.Body className="p-2">
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd(dateKey)}
                  >
                    <SortableContext
                      items={entries.map((e) => e.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {entries.map((entry) => (
                        <SortableEntry
                          key={entry.id}
                          entry={entry}
                          onDelete={(id) => deleteMeal.mutate(id)}
                          onClick={setDetailEntry}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                  {entries.length === 0 && (
                    <p className="text-muted text-center mb-0" style={{ fontSize: '0.75rem' }}>
                      No meals
                    </p>
                  )}
                </Card.Body>
              </Card>
            </Col>
          );
        })}
      </Row>

      <EntryDetailModal entry={detailEntry} onHide={() => setDetailEntry(null)} />
      {addDate && (
        <AddMealModal date={addDate} onHide={() => setAddDate(null)} mealTypes={mealTypes} />
      )}
    </div>
  );
}
