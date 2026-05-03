import { useState } from 'react';
import { Row, Col, Card, Button, Modal, Form, Spinner, Alert } from 'react-bootstrap';
import { proxyMediaUrl } from '../utils/mediaUrl';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMealPlan, useDeleteMealPlan, useCreateMealPlan, useUpdateMealPlan } from '../hooks/useMealPlan';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';
import type { MealPlan, Recipe, MealType, PaginatedResponse } from '../api/tandoor-types';
import { deriveMealType } from '../utils/mealUtils';
import { useRecipeSearch } from '../hooks/useRecipeSearch';
import { LoadingMascot } from '../components/LoadingMascot';

type WithSortable = { sortable?: { containerId: string } } | undefined;

const noop = () => {};

const circleButtonStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  padding: 0,
  borderRadius: '50%',
  lineHeight: 1,
  fontSize: '1rem',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

const thumbnailStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  objectFit: 'cover',
  borderRadius: 4,
  flexShrink: 0,
};

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function shortDay(d: Date): string {
  return d.toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatMonthYear(d: Date): string {
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

interface EntryCardProps {
  entry: MealPlan;
  onDelete: (id: number) => void;
  onClick: (entry: MealPlan) => void;
  dragging?: boolean;
}

function EntryCard({ entry, onDelete, onClick, dragging }: EntryCardProps) {
  const recipe = typeof entry.recipe === 'object' ? entry.recipe : null;
  const thumbnailSrc = recipe?.image ? proxyMediaUrl(recipe.image) : undefined;
  return (
    <Card className={`border-0 ${dragging ? 'shadow-lg' : 'shadow-sm'}`}>
      <Card.Body className="py-2 px-3">
        <div className="d-flex align-items-center gap-2">
          {thumbnailSrc && (
            <img
              src={thumbnailSrc}
              alt={recipe?.name ?? ''}
              style={{ ...thumbnailStyle, cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none' }}
            />
          )}
          <div className="flex-grow-1" style={{ cursor: 'pointer' }} onClick={() => onClick(entry)}>
            <div className="small fw-semibold">{recipe?.name ?? `Recipe #${entry.recipe}`}</div>
            {entry.note && (
              <div className="text-muted" style={{ fontSize: '0.7rem' }}>{entry.note}</div>
            )}
          </div>
          {!dragging && (
            <Button
              variant="danger"
              size="sm"
              style={circleButtonStyle}
              onClick={() => onDelete(entry.id)}
              aria-label="Remove meal"
            >
              <span aria-hidden="true">🗑️</span>
            </Button>
          )}
        </div>
      </Card.Body>
    </Card>
  );
}

interface SortableEntryProps {
  entry: MealPlan;
  onDelete: (id: number) => void;
  onClick: (entry: MealPlan) => void;
}

function SortableEntry({ entry, onDelete, onClick }: SortableEntryProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const recipe = typeof entry.recipe === 'object' ? entry.recipe : null;
  const thumbnailSrc = recipe?.image ? proxyMediaUrl(recipe.image) : undefined;

  return (
    <div ref={setNodeRef} style={{ ...style, opacity: isDragging ? 0.3 : 1 }} {...attributes} className="mb-2">
      <Card className="border-0 shadow-sm">
        <Card.Body className="py-2 px-3">
          <div className="d-flex align-items-center gap-2">
            {thumbnailSrc ? (
              <img
                ref={setActivatorNodeRef}
                {...listeners}
                src={thumbnailSrc}
                alt={recipe?.name ?? ''}
                style={{ ...thumbnailStyle, cursor: 'grab', touchAction: 'none' }}
              />
            ) : (
              <span
                ref={setActivatorNodeRef}
                {...listeners}
                style={{ cursor: 'grab', touchAction: 'none' }}
                className="text-muted"
              >
                ⋮⋮
              </span>
            )}
            <div className="flex-grow-1" style={{ cursor: 'pointer' }} onClick={() => onClick(entry)}>
              <div className="small fw-semibold">{recipe?.name ?? `Recipe #${entry.recipe}`}</div>
              {entry.note && (
                <div className="text-muted" style={{ fontSize: '0.7rem' }}>{entry.note}</div>
              )}
            </div>
            <Button
              variant="danger"
              size="sm"
              style={circleButtonStyle}
              onClick={() => onDelete(entry.id)}
              aria-label="Remove meal"
            >
              <span aria-hidden="true">🗑️</span>
            </Button>
          </div>
        </Card.Body>
      </Card>
    </div>
  );
}

interface DroppableDayProps {
  dateKey: string;
  children: React.ReactNode;
}

function DroppableDay({ dateKey, children }: DroppableDayProps) {
  const { setNodeRef, isOver } = useDroppable({ id: dateKey });
  return (
    <div
      ref={setNodeRef}
      style={{
        minHeight: 40,
        borderRadius: 4,
        backgroundColor: isOver ? 'rgba(13, 110, 253, 0.08)' : undefined,
        transition: 'background-color 0.15s',
      }}
    >
      {children}
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
  const [note, setNote] = useState('');
  const createMeal = useCreateMealPlan();

  const { data } = useRecipeSearch({ query: search, page_size: 10 });
  const recipes = data?.pages.flatMap((p) => p.results) ?? [];

  const handleSelectRecipe = (r: Recipe) => {
    setSelectedRecipe(r);
    const derived = deriveMealType(r, mealTypes);
    if (derived !== undefined) setMealTypeId(derived);
  };

  const handleSubmit = async () => {
    if (!selectedRecipe) return;
    await createMeal.mutateAsync({
      recipe: selectedRecipe.id as unknown as Recipe,
      meal_type: mealTypeId as unknown as MealType,
      from_date: date,
      servings,
      ...(note ? { note } : {}),
      addshopping: true,
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
                  onClick={() => handleSelectRecipe(r)}
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
          <Form.Label>Servings</Form.Label>
          <Form.Control
            type="number"
            min={1}
            value={servings}
            onChange={(e) => setServings(Number(e.target.value))}
          />
        </Form.Group>

        <Form.Group>
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
  const [activeId, setActiveId] = useState<number | null>(null);

  const today = new Date();
  const daysBackToSaturday = (today.getDay() + 1) % 7;
  const startDate = addDays(today, -daysBackToSaturday + weekOffset * 7);
  const endDate = addDays(startDate, 6);

  const { data, isLoading, isError } = useMealPlan(startDate, endDate);
  const deleteMeal = useDeleteMealPlan();
  const updateMeal = useUpdateMealPlan();

  const { data: mealTypesData } = useQuery({
    queryKey: ['meal-types'],
    queryFn: () => apiGet<PaginatedResponse<MealType>>('/meal-type/'),
  });
  const mealTypes = mealTypesData?.results ?? [];

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const days = Array.from({ length: 7 }, (_, i) => addDays(startDate, i));

  const entriesByDay = (entries: MealPlan[]) =>
    days.reduce<Record<string, MealPlan[]>>((acc, day) => {
      const key = formatDate(day);
      acc[key] = entries.filter((e) => e.from_date.split('T')[0] === key);
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

  const activeEntry = activeId != null ? allEntries.find((e) => e.id === activeId) ?? null : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as number);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const activeEntryId = active.id as number;
    const activeContainerId = (active.data.current as WithSortable)?.sortable?.containerId;

    if (!activeContainerId) return;

    // over.id is a string (dateKey) when dropped on a DroppableDay container,
    // or a number (entry id) when dropped on a SortableEntry.
    let targetContainerId: string;
    if (typeof over.id === 'string') {
      targetContainerId = over.id;
    } else {
      const overContainerId = (over.data.current as WithSortable)?.sortable?.containerId;
      if (!overContainerId) return;
      targetContainerId = overContainerId;
    }

    if (activeContainerId === targetContainerId) {
      // Within-day reorder
      if (active.id === over.id) return;
      const entries = getOrdered(activeContainerId);
      const oldIndex = entries.findIndex((e) => e.id === active.id);
      const newIndex = entries.findIndex((e) => e.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(entries, oldIndex, newIndex);
      setDayOrder((prev) => ({ ...prev, [activeContainerId]: reordered.map((e) => e.id) }));
    } else {
      // Cross-day move: update from_date via API
      const entry = allEntries.find((e) => e.id === activeEntryId);
      if (!entry) return;
      const recipeId = typeof entry.recipe === 'object' ? entry.recipe.id : entry.recipe;
      const mealTypeId = typeof entry.meal_type === 'object' ? entry.meal_type.id : entry.meal_type;
      updateMeal.mutate({
        id: activeEntryId,
        data: {
          from_date: targetContainerId,
          to_date: targetContainerId,
          recipe: recipeId,
          meal_type: mealTypeId,
        },
      });
    }
  };

  const handleDragCancel = () => {
    setActiveId(null);
  };

  if (isError) {
    return <Alert variant="danger">Failed to load meal plan.</Alert>;
  }

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
        <h2 className="mb-0">Meal Plan</h2>
        <div className="d-flex align-items-center gap-2">
          <span className="text-muted small">{formatMonthYear(startDate)}</span>
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

      {isLoading && <LoadingMascot />}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
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
                      variant="success"
                      size="sm"
                      style={circleButtonStyle}
                      onClick={() => setAddDate(dateKey)}
                      aria-label="Add meal"
                    >
                      +
                    </Button>
                  </Card.Header>
                  <Card.Body className="p-2">
                    <DroppableDay dateKey={dateKey}>
                      <SortableContext
                        id={dateKey}
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
                      {entries.length === 0 && (
                        <p className="text-muted text-center mb-0" style={{ fontSize: '0.75rem' }}>
                          No meals
                        </p>
                      )}
                    </DroppableDay>
                  </Card.Body>
                </Card>
              </Col>
            );
          })}
        </Row>

        <DragOverlay>
          {activeEntry && (
            <EntryCard
              entry={activeEntry}
              onDelete={noop}
              onClick={noop}
              dragging
            />
          )}
        </DragOverlay>
      </DndContext>

      <EntryDetailModal entry={detailEntry} onHide={() => setDetailEntry(null)} />
      {addDate && (
        <AddMealModal date={addDate} onHide={() => setAddDate(null)} mealTypes={mealTypes} />
      )}
    </div>
  );
}

