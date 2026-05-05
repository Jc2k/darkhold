import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Row, Col, Card, Button, InputGroup, Modal, Form, Spinner, Alert } from 'react-bootstrap';
import { AsyncTypeahead } from 'react-bootstrap-typeahead';
import 'react-bootstrap-typeahead/css/Typeahead.css';
import { Trash3, Plus } from 'react-bootstrap-icons';
import { proxyMediaUrl } from '../utils/mediaUrl';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMealPlan, useDeleteMealPlan, useCreateMealPlan, useUpdateMealPlan } from '../hooks/useMealPlan';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';
import type { MealPlan, Recipe, MealType, PaginatedResponse } from '../api/tandoor-types';
import { deriveMealType } from '../utils/mealUtils';
import { LoadingMascot } from '../components/LoadingMascot';

type WithSortable = { sortable?: { containerId: string } } | undefined;

const noop = () => {};

const navButtonStyle: React.CSSProperties = {
  minWidth: 44,
  minHeight: 44,
  fontSize: '1.5rem',
  lineHeight: 1,
  padding: '0 0.5rem',
};

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
  WebkitTouchCallout: 'none',
  userSelect: 'none',
};

const PLACEHOLDER_BG = '#d0d0d0';
const PLACEHOLDER_ICON_COLOR = '#a0a0a0';

function ThumbnailPlaceholder({ dragProps }: { dragProps?: React.HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> } }) {
  return (
    <div
      role="img"
      aria-label="No image available"
      style={{
        ...thumbnailStyle,
        background: PLACEHOLDER_BG,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      {...dragProps}
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill={PLACEHOLDER_ICON_COLOR} aria-hidden="true">
        <path d="M12 2C6.48 2 2 6.48 2 12h10V2zm0 0c5.52 0 10 4.48 10 10h-10V2zM2 12c0 5.52 4.48 10 10 10L12 12H2z"/>
      </svg>
    </div>
  );
}

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
      <Card.Body className="py-2 ps-3 pe-2">
        <div className="d-flex align-items-center gap-2">
          {thumbnailSrc ? (
            <img
              src={thumbnailSrc}
              alt={recipe?.name ?? ''}
              draggable={false}
              style={{ ...thumbnailStyle, cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none' }}
            />
          ) : (
            <ThumbnailPlaceholder />
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
              <Trash3 size={16} />
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
  isPending?: boolean;
}

function SortableEntry({ entry, onDelete, onClick, isPending }: SortableEntryProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const recipe = typeof entry.recipe === 'object' ? entry.recipe : null;
  const thumbnailSrc = recipe?.image ? proxyMediaUrl(recipe.image) : undefined;

  return (
    <div ref={setNodeRef} style={{ ...style, opacity: isDragging ? 0.3 : 1 }} {...attributes} className="mb-2">
      <div style={{ position: 'relative' }}>
        <Card className="border-0 shadow-sm" style={isPending ? { opacity: 0.55 } : undefined}>
          <Card.Body className="py-2 ps-3 pe-2">
            <div className="d-flex align-items-center gap-2">
              {thumbnailSrc ? (
                <img
                  ref={setActivatorNodeRef}
                  {...listeners}
                  src={thumbnailSrc}
                  alt={recipe?.name ?? ''}
                  draggable={false}
                  style={{ ...thumbnailStyle, cursor: 'grab', touchAction: 'none' }}
                />
              ) : (
                <ThumbnailPlaceholder
                  dragProps={{
                    ref: setActivatorNodeRef as React.Ref<HTMLDivElement>,
                    ...listeners,
                    style: { cursor: 'grab', touchAction: 'none' },
                  }}
                />
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
                <Trash3 size={16} />
              </Button>
            </div>
          </Card.Body>
        </Card>
        {isPending && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 4,
              backgroundColor: 'rgba(200, 200, 200, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <Spinner size="sm" variant="secondary" />
          </div>
        )}
      </div>
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
      className="meal-plan-day"
      style={{
        borderRadius: 4,
        backgroundColor: isOver ? 'rgba(13, 110, 253, 0.08)' : undefined,
        transition: 'background-color 0.15s',
      }}
    >
      {children}
    </div>
  );
}


interface AddMealModalProps {
  date: string;
  onHide: () => void;
  mealTypes: MealType[];
}

function AddMealModal({ date, onHide, mealTypes }: AddMealModalProps) {
  const [isSearching, setIsSearching] = useState(false);
  const [recipeOptions, setRecipeOptions] = useState<Recipe[]>([]);
  const [searchError, setSearchError] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [mealTypeId, setMealTypeId] = useState<number>(mealTypes[0]?.id ?? 0);
  const [servings, setServings] = useState(1);
  const [note, setNote] = useState('');
  const createMeal = useCreateMealPlan();

  const handleRecipeSearch = async (query: string) => {
    setIsSearching(true);
    setSearchError(false);
    try {
      const data = await apiGet<PaginatedResponse<Recipe>>('/recipe/', { query, page_size: 10 });
      setRecipeOptions(data.results);
    } catch {
      setSearchError(true);
      setRecipeOptions([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectRecipe = (selected: Recipe[]) => {
    const r = selected[0] ?? null;
    setSelectedRecipe(r);
    if (r) {
      const derived = deriveMealType(r, mealTypes);
      if (derived !== undefined) setMealTypeId(derived);
      setServings(r.servings ?? 1);
    }
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
          <AsyncTypeahead
            id="add-meal-recipe-search"
            isLoading={isSearching}
            labelKey="name"
            minLength={1}
            options={recipeOptions}
            selected={selectedRecipe ? [selectedRecipe] : []}
            onSearch={handleRecipeSearch}
            onChange={(opts) => handleSelectRecipe(opts as Recipe[])}
            placeholder="Type to search…"
          />
          {searchError && (
            <Alert variant="danger" className="py-1 px-2 mt-1 mb-0 small">
              Failed to load recipes.
            </Alert>
          )}
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>Servings</Form.Label>
          <InputGroup>
            <Button
              className="px-3"
              variant="outline-secondary"
              onClick={() => setServings((s) => Math.max(1, s - 1))}
              aria-label="Decrease servings"
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
              className="px-3"
              variant="outline-secondary"
              onClick={() => setServings((s) => s + 1)}
              aria-label="Increase servings"
            >+</Button>
          </InputGroup>
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
  const navigate = useNavigate();
  const [weekOffset, setWeekOffset] = useState(0);
  const [addDate, setAddDate] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  // Maps entry id -> optimistic target date for in-flight cross-day moves
  const [pendingMoves, setPendingMoves] = useState<Map<number, string>>(new Map());

  const today = new Date();
  const daysBackToSaturday = (today.getDay() + 1) % 7;
  const startDate = addDays(today, -daysBackToSaturday + weekOffset * 7);
  const endDate = addDays(startDate, 6);

  const { data, isLoading, isError } = useMealPlan(startDate, endDate);

  // Only show the full-screen spinner on the very first load.
  // Once data has been received at least once, week navigation and background
  // refreshes should rely solely on the corner progress spinner.
  const hasEverHadData = useRef(false);
  if (data !== undefined) hasEverHadData.current = true;
  const deleteMeal = useDeleteMealPlan();
  const updateMeal = useUpdateMealPlan();

  const { data: mealTypesData } = useQuery({
    queryKey: ['meal-types'],
    queryFn: () => apiGet<PaginatedResponse<MealType>>('/meal-type/'),
  });
  const mealTypes = mealTypesData?.results ?? [];

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const days = Array.from({ length: 7 }, (_, i) => addDays(startDate, i));

  const allEntries = data?.results ?? [];
  const byDay = days.reduce<Record<string, MealPlan[]>>((acc, day) => {
    const key = formatDate(day);
    acc[key] = allEntries.filter((e) => {
      const effectiveDate = pendingMoves.get(e.id) ?? e.from_date.split('T')[0];
      return effectiveDate === key;
    });
    return acc;
  }, {});

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

    if (activeContainerId === targetContainerId) return;

    // Cross-day move: optimistically update UI then confirm via API
    const entry = allEntries.find((e) => e.id === activeEntryId);
    if (!entry) return;
    const recipeId = typeof entry.recipe === 'object' ? entry.recipe.id : entry.recipe;
    const mealTypeId = typeof entry.meal_type === 'object' ? entry.meal_type.id : entry.meal_type;

    // Immediately show the entry in the new day
    setPendingMoves((prev) => new Map(prev).set(activeEntryId, targetContainerId));

    updateMeal.mutate(
      {
        id: activeEntryId,
        data: {
          recipe: recipeId,
          meal_type: mealTypeId,
          from_date: targetContainerId,
          to_date: targetContainerId,
          servings: entry.servings ?? 1,
        },
      },
      {
        onSettled: () => {
          setPendingMoves((prev) => {
            const next = new Map(prev);
            next.delete(activeEntryId);
            return next;
          });
        },
      },
    );
  };

  const handleDragCancel = () => {
    setActiveId(null);
  };

  if (isError) {
    return <Alert variant="danger">Failed to load meal plan.</Alert>;
  }

  return (
    <div className="pt-2 meal-plan-page">
      <div className="d-flex align-items-center mb-3">
        <Button
          variant="outline-secondary"
          onClick={() => setWeekOffset((w) => w - 1)}
          aria-label="Previous week"
          style={navButtonStyle}
        >‹</Button>
        <div className="flex-grow-1 text-center">
          <Button
            variant="outline-secondary"
            style={{ minHeight: 44, padding: '0 1rem' }}
            onClick={() => setWeekOffset(0)}
            aria-label="Go to current week"
          >
            Today
          </Button>
        </div>
        <Button
          variant="outline-secondary"
          onClick={() => setWeekOffset((w) => w + 1)}
          aria-label="Next week"
          style={navButtonStyle}
        >›</Button>
      </div>

      {!hasEverHadData.current && isLoading && <LoadingMascot />}

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
            const entries = byDay[dateKey] ?? [];

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
                      <Plus size={16} />
                    </Button>
                  </Card.Header>
                  <Card.Body className="p-2">
                    <DroppableDay dateKey={dateKey}>
                      <SortableContext
                        id={dateKey}
                        items={entries.map((e) => e.id)}
                      >
                        {entries.map((entry) => (
                          <SortableEntry
                            key={entry.id}
                            entry={entry}
                            onDelete={(id) => deleteMeal.mutate(id)}
                            onClick={(e) => navigate(`/meal-plan-entry/${e.id}`)}
                            isPending={pendingMoves.has(entry.id)}
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

      {addDate && (
        <AddMealModal date={addDate} onHide={() => setAddDate(null)} mealTypes={mealTypes} />
      )}
    </div>
  );
}

