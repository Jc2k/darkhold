import { ListGroup, Form, Alert, Badge, Spinner, Button, ButtonGroup } from 'react-bootstrap';
import { ArrowLeft, Cart4, ThreeDotsVertical } from 'react-bootstrap-icons';
import { Link } from 'react-router-dom';
import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPatch, apiDelete, apiGet, apiPost } from '../api/client';
import { broadcastInvalidation } from '../hooks/useInvalidationSocket';
import type { Food, ShoppingList as TandoorShoppingList } from '../api/tandoor-types';
import { LoadingMascot } from '../components/LoadingMascot';
import { NoTokenAlert } from '../components/NoTokenAlert';
import { formatFraction } from '../utils/fractions';
import {
  fetchAllShoppingListEntries,
  type ShoppingListEntry as ShoppingEntry,
} from '../hooks/useShoppingListEntries';
import {
  invalidateAndRefreshMealPlanRedirectWeek,
  MEAL_PLAN_REDIRECT_WEEK_BROADCAST_KEY,
} from '../utils/mealPlanRedirect';

export { fetchAllShoppingListEntries } from '../hooks/useShoppingListEntries';

const TO_CHECK_LIST_NAME = 'To Check';
const SWIPE_THRESHOLD_PX = 60;
const SWIPE_ACTION_WIDTH_PX = 104;
const FULL_SWIPE_THRESHOLD_PX = SWIPE_ACTION_WIDTH_PX * 2;

export function isInShoppingList(entry: ShoppingEntry, listName: string): boolean {
  return entry.shopping_lists?.some((list) => list.name === listName) ?? false;
}

export function isLeftSwipe(deltaX: number, deltaY: number): boolean {
  return deltaX <= -SWIPE_THRESHOLD_PX && Math.abs(deltaX) > Math.abs(deltaY);
}

export function isFullLeftSwipe(deltaX: number, deltaY: number): boolean {
  return deltaX <= -FULL_SWIPE_THRESHOLD_PX && Math.abs(deltaX) > Math.abs(deltaY);
}

export function addShoppingListToEntries(
  entries: ShoppingEntry[],
  entryIds: Set<number>,
  shoppingList: TandoorShoppingList,
): ShoppingEntry[] {
  return entries.map((entry) => {
    if (!entryIds.has(entry.id) || isInShoppingList(entry, shoppingList.name)) return entry;
    return { ...entry, shopping_lists: [...(entry.shopping_lists ?? []), shoppingList] };
  });
}

interface AggregatedIngredient {
  food: Food | null;
  entries: ShoppingEntry[];
  allChecked: boolean;
  recipes: string[];
}

function getRecipeFromDate(entry: ShoppingEntry): string | null {
  return entry.list_recipe_data?.meal_plan_data?.from_date ?? null;
}

function formatAmount(entry: ShoppingEntry): string {
  const parts: string[] = [];
  if (entry.amount != null) parts.push(formatFraction(entry.amount));
  const unitName = typeof entry.unit === 'object' && entry.unit ? entry.unit.name : entry.unit_name;
  if (unitName) parts.push(unitName);
  return parts.join(' ');
}

function groupByCategory(entries: ShoppingEntry[]): Record<string, ShoppingEntry[]> {
  const groups: Record<string, ShoppingEntry[]> = { Uncategorised: [] };
  for (const entry of entries) {
    const foodCat = entry.food?.supermarket_category;
    const catName =
      entry.supermarket_category?.name ??
      (typeof foodCat === 'object' && foodCat !== null ? foodCat.name : null);
    const key = catName ?? 'Uncategorised';
    if (!groups[key]) groups[key] = [];
    groups[key].push(entry);
  }
  return groups;
}

function getRecipeName(entry: ShoppingEntry): string | null {
  return entry.list_recipe_data?.recipe_data.name ?? null;
}

function aggregateByIngredient(entries: ShoppingEntry[]): AggregatedIngredient[] {
  const map = new Map<string, AggregatedIngredient>();
  for (const entry of entries) {
    const key = entry.food?.id != null ? `food-${entry.food.id}` : `entry-${entry.id}`;
    if (!map.has(key)) {
      map.set(key, { food: entry.food, entries: [], allChecked: true, recipes: [] });
    }
    const agg = map.get(key)!;
    agg.entries.push(entry);
    if (!entry.checked) agg.allChecked = false;
    const recipeName = getRecipeName(entry);
    if (recipeName && !agg.recipes.includes(recipeName)) {
      agg.recipes.push(recipeName);
    }
  }
  return Array.from(map.values());
}

function groupByRecipe(entries: ShoppingEntry[]): Record<string, ShoppingEntry[]> {
  type RecipeGroup = {
    name: string;
    entries: ShoppingEntry[];
    firstIndex: number;
    fromDate: string | null;
  };

  const groups = new Map<string, RecipeGroup>();
  entries.forEach((entry, index) => {
    const key = getRecipeName(entry) ?? 'No recipe';
    if (!groups.has(key)) {
      groups.set(key, { name: key, entries: [], firstIndex: index, fromDate: null });
    }
    const group = groups.get(key)!;
    group.entries.push(entry);

    const fromDate = getRecipeFromDate(entry);
    if (fromDate && (!group.fromDate || fromDate < group.fromDate)) {
      group.fromDate = fromDate;
    }
  });

  return Object.fromEntries(
    Array.from(groups.values())
      .sort((a, b) => {
        if (a.fromDate && b.fromDate) return a.fromDate.localeCompare(b.fromDate);
        if (a.fromDate) return -1;
        if (b.fromDate) return 1;
        if (a.firstIndex !== b.firstIndex) return a.firstIndex - b.firstIndex;
        return a.name.localeCompare(b.name);
      })
      .map((group) => [group.name, group.entries]),
  );
}

export function ShoppingList() {
  const qc = useQueryClient();
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set());
  const [isClearing, setIsClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const swipeStart = useRef<{ key: string; pointerId: number; x: number; y: number } | null>(null);
  const [openSwipeKey, setOpenSwipeKey] = useState<string | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [viewMode, setViewMode] = useState<'category' | 'recipe'>('category');
  const [hideChecked, setHideChecked] = useState(false);
  const [showToCheckOnly, setShowToCheckOnly] = useState(false);
  const hasPersonalToken = Boolean(localStorage.getItem('tandoor_token'));

  const { data, isLoading, isError } = useQuery({
    queryKey: ['shopping-list'],
    queryFn: fetchAllShoppingListEntries,
  });

  const { data: toCheckList } = useQuery({
    queryKey: ['shopping-list-to-check'],
    queryFn: () => apiPost<TandoorShoppingList>('/shopping-list/', { name: TO_CHECK_LIST_NAME }),
    enabled: hasPersonalToken,
  });

  const toggle = useMutation({
    mutationFn: ({ id, checked }: { id: number; checked: boolean }) =>
      apiPatch(`/shopping-list-entry/${id}/`, { checked }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shopping-list'] });
      broadcastInvalidation('shopping-list');
    },
  });

  const moveToCheck = useMutation({
    mutationFn: (entries: ShoppingEntry[]) => {
      if (!toCheckList) throw new Error('The To Check list is not ready yet.');
      return Promise.all(
        entries.map((entry) =>
          apiPatch(`/shopping-list-entry/${entry.id}/`, {
            shopping_lists: [...(entry.shopping_lists ?? []), toCheckList],
          }),
        ),
      );
    },
    onMutate: (entries) => {
      setMoveError(null);
      setPendingIds((previous) => new Set([...previous, ...entries.map((entry) => entry.id)]));
    },
    onSuccess: (_result, entries) => {
      if (!toCheckList) return;
      const entryIds = new Set(entries.map((entry) => entry.id));
      qc.setQueryData<ShoppingEntry[]>(['shopping-list'], (current) =>
        current ? addShoppingListToEntries(current, entryIds, toCheckList) : current,
      );
      qc.invalidateQueries({ queryKey: ['shopping-list'] });
      broadcastInvalidation('shopping-list');
    },
    onError: () => {
      setMoveError('Failed to send item to To Check. Please try again.');
    },
    onSettled: (_result, _error, entries) => {
      setPendingIds((previous) => {
        const next = new Set(previous);
        entries.forEach((entry) => next.delete(entry.id));
        return next;
      });
    },
  });

  const closeSwipeAction = () => {
    setOpenSwipeKey(null);
    setSwipeOffset(0);
  };

  const sendToCheck = (entries: ShoppingEntry[]) => {
    if (
      !hasPersonalToken ||
      !toCheckList ||
      entries.every((entry) => isInShoppingList(entry, TO_CHECK_LIST_NAME))
    )
      return;
    closeSwipeAction();
    moveToCheck.mutate(entries.filter((entry) => !isInShoppingList(entry, TO_CHECK_LIST_NAME)));
  };

  const toggleAll = (entries: ShoppingEntry[], checked: boolean) => {
    if (!hasPersonalToken) return;
    const ids = entries.map((e) => e.id);
    setPendingIds((prev: Set<number>) => new Set([...prev, ...ids]));
    Promise.allSettled(
      entries.map((entry) => toggle.mutateAsync({ id: entry.id, checked })),
    ).finally(() => {
      setPendingIds((prev: Set<number>) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    });
  };

  const clearAll = (entries: ShoppingEntry[]) => {
    if (!hasPersonalToken) return;
    if (
      !window.confirm(
        `Remove all ${entries.length} item${entries.length !== 1 ? 's' : ''} from your shopping list?`,
      )
    ) {
      return;
    }
    setIsClearing(true);
    setClearError(null);
    Promise.allSettled(entries.map((entry) => apiDelete(`/shopping-list-entry/${entry.id}/`)))
      .then((results) => {
        const failed = results.filter((r) => r.status === 'rejected').length;
        if (failed > 0) {
          setClearError(
            `Failed to remove ${failed} item${failed !== 1 ? 's' : ''}. Please try again.`,
          );
        }
      })
      .finally(() => {
        setIsClearing(false);
        qc.invalidateQueries({ queryKey: ['shopping-list'] });
        void invalidateAndRefreshMealPlanRedirectWeek(qc, apiGet);
        broadcastInvalidation('shopping-list');
        broadcastInvalidation(MEAL_PLAN_REDIRECT_WEEK_BROADCAST_KEY);
      });
  };

  if (isLoading && !data) {
    return <LoadingMascot />;
  }

  if (isError) {
    return <Alert variant="danger">Failed to load shopping list. Check your API token.</Alert>;
  }

  const entries = data ?? [];
  const visibleEntries = entries.filter(
    (entry) =>
      (!hideChecked || !entry.checked) &&
      (!showToCheckOnly || isInShoppingList(entry, TO_CHECK_LIST_NAME)),
  );
  if (entries.length === 0) {
    return (
      <div
        className="d-flex flex-column align-items-center justify-content-center"
        style={{ minHeight: '60vh' }}
      >
        <Cart4 size={64} className="text-muted mb-3" />
        <p className="text-muted text-center">
          Your shopping list is empty! Add recipes to your meal plan.
        </p>
      </div>
    );
  }

  const groups = groupByCategory(visibleEntries);
  const categoryNames = Object.keys(groups).filter((k) => groups[k].length > 0);
  const recipeGroups = groupByRecipe(visibleEntries);
  const recipeNames = Object.keys(recipeGroups).filter((k) => recipeGroups[k].length > 0);
  const remainingCount = entries.filter((entry) => !entry.checked).length;
  const visibleGroupNames = viewMode === 'recipe' ? recipeNames : categoryNames;

  return (
    <div className="pt-2">
      {!hasPersonalToken && <NoTokenAlert />}
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-1">
        <div className="d-flex flex-wrap align-items-center gap-2">
          <span className="text-muted small">View</span>
          <ButtonGroup size="sm" aria-label="Shopping list view">
            <Button
              variant={viewMode === 'category' ? 'primary' : 'outline-secondary'}
              onClick={() => setViewMode('category')}
              aria-label="Show category groups"
              aria-pressed={viewMode === 'category'}
            >
              Category
            </Button>
            <Button
              variant={viewMode === 'recipe' ? 'primary' : 'outline-secondary'}
              onClick={() => setViewMode('recipe')}
              aria-label="Show recipe groups"
              aria-pressed={viewMode === 'recipe'}
            >
              Recipe
            </Button>
          </ButtonGroup>
          <span className="text-muted small ms-1">Filters</span>
          <Button
            variant={showToCheckOnly ? 'primary' : 'outline-secondary'}
            size="sm"
            onClick={() => setShowToCheckOnly((value) => !value)}
            aria-label="Show To Check items only"
            aria-pressed={showToCheckOnly}
          >
            To Check
          </Button>
          <Button
            variant={hideChecked ? 'primary' : 'outline-secondary'}
            size="sm"
            onClick={() => setHideChecked((value) => !value)}
            aria-label="Hide checked items"
            aria-pressed={hideChecked}
          >
            Hide checked items
          </Button>
        </div>
        <Button
          variant="outline-danger"
          size="sm"
          onClick={() => clearAll(entries)}
          disabled={isClearing || !hasPersonalToken}
        >
          {isClearing ? (
            <>
              <Spinner animation="border" size="sm" className="me-1" />
              Clearing…
            </>
          ) : (
            'Clear'
          )}
        </Button>
      </div>
      <p className="text-muted small mb-3">
        {remainingCount} item{remainingCount !== 1 ? 's' : ''} remaining of {entries.length} item
        {entries.length !== 1 ? 's' : ''}. Swipe an item left to send it to To Check.
      </p>
      {clearError && (
        <Alert variant="danger" dismissible onClose={() => setClearError(null)}>
          {clearError}
        </Alert>
      )}
      {moveError && (
        <Alert variant="danger" dismissible onClose={() => setMoveError(null)}>
          {moveError}
        </Alert>
      )}

      {visibleGroupNames.length === 0 && (
        <Alert variant="light" className="border">
          No items match the current filters. Turn off a filter to show more shopping list items.
        </Alert>
      )}

      {visibleGroupNames.map((groupName) => {
        const groupedEntries = viewMode === 'recipe' ? recipeGroups[groupName] : groups[groupName];
        const aggregated = aggregateByIngredient(groupedEntries);
        return (
          <div key={groupName} className="mb-4">
            <h6
              className="text-muted text-uppercase mb-1"
              style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}
            >
              {groupName}
              <Badge bg="secondary" className="ms-2">
                {aggregated.length}
              </Badge>
            </h6>
            <ListGroup variant="flush" className="border rounded">
              {aggregated.map((agg) => {
                const foodName = agg.food?.name ?? 'Unknown item';
                const notes = [
                  ...new Set(agg.entries.map((e) => e.ingredient_note).filter(Boolean)),
                ];
                const isPending = agg.entries.some((e) => pendingIds.has(e.id));
                const rowKey =
                  agg.food?.id != null
                    ? `food-${agg.food.id}`
                    : `entries-${agg.entries.map((entry) => entry.id).join('-')}`;
                const isToCheck = agg.entries.every((entry) =>
                  isInShoppingList(entry, TO_CHECK_LIST_NAME),
                );
                const quantityParts = agg.entries
                  .map((entry) => ({
                    id: entry.id,
                    text: formatAmount(entry),
                    checked: entry.checked,
                  }))
                  .filter((part) => part.text);

                return (
                  <ListGroup.Item key={rowKey} className="shopping-list-swipe-item p-0">
                    <div className="shopping-list-swipe-shell">
                      <Button
                        variant="secondary"
                        className={`shopping-list-swipe-action rounded-0${
                          openSwipeKey === rowKey && swipeOffset >= FULL_SWIPE_THRESHOLD_PX
                            ? ' shopping-list-swipe-action-ready'
                            : ''
                        }`}
                        style={{
                          width:
                            openSwipeKey === rowKey
                              ? Math.max(swipeOffset, SWIPE_ACTION_WIDTH_PX)
                              : SWIPE_ACTION_WIDTH_PX,
                        }}
                        onClick={() => sendToCheck(agg.entries)}
                        disabled={isPending || isToCheck || !toCheckList || !hasPersonalToken}
                        aria-label={`Send ${foodName} to To Check`}
                        tabIndex={openSwipeKey === rowKey ? 0 : -1}
                      >
                        <ArrowLeft aria-hidden="true" />
                        <span>To Check</span>
                      </Button>
                      <div
                        className="shopping-list-swipe-content d-flex align-items-start gap-2 py-2 px-3"
                        style={{
                          transform: `translateX(-${openSwipeKey === rowKey ? swipeOffset : 0}px)`,
                        }}
                        onPointerDown={(event) => {
                          if (event.pointerType === 'mouse' && event.button !== 0) return;
                          swipeStart.current = {
                            key: rowKey,
                            pointerId: event.pointerId,
                            x: event.clientX,
                            y: event.clientY,
                          };
                          event.currentTarget.setPointerCapture?.(event.pointerId);
                        }}
                        onPointerMove={(event) => {
                          const start = swipeStart.current;
                          if (start?.key !== rowKey || start.pointerId !== event.pointerId) return;
                          const deltaX = event.clientX - start.x;
                          const deltaY = event.clientY - start.y;
                          if (Math.abs(deltaX) <= Math.abs(deltaY)) return;
                          setOpenSwipeKey(rowKey);
                          setSwipeOffset(Math.max(-deltaX, 0));
                        }}
                        onPointerUp={(event) => {
                          const start = swipeStart.current;
                          swipeStart.current = null;
                          if (start?.key !== rowKey || start.pointerId !== event.pointerId) return;
                          const deltaX = event.clientX - start.x;
                          const deltaY = event.clientY - start.y;
                          if (isFullLeftSwipe(deltaX, deltaY)) {
                            sendToCheck(agg.entries);
                          } else if (isLeftSwipe(deltaX, deltaY)) {
                            setOpenSwipeKey(rowKey);
                            setSwipeOffset(SWIPE_ACTION_WIDTH_PX);
                          } else {
                            closeSwipeAction();
                          }
                        }}
                        onPointerCancel={() => {
                          swipeStart.current = null;
                          closeSwipeAction();
                        }}
                      >
                        <button
                          type="button"
                          className="btn p-0 d-flex align-items-center justify-content-center flex-shrink-0 mt-1"
                          style={{
                            width: '2.25rem',
                            height: '2.25rem',
                            background: 'none',
                            border: 'none',
                            cursor: isPending ? 'wait' : hasPersonalToken ? 'pointer' : 'default',
                          }}
                          onClick={() => toggleAll(agg.entries, !agg.allChecked)}
                          disabled={isPending || !hasPersonalToken}
                          aria-label={agg.allChecked ? `Uncheck ${foodName}` : `Check ${foodName}`}
                          aria-pressed={agg.allChecked}
                        >
                          {isPending ? (
                            <Spinner animation="border" size="sm" />
                          ) : (
                            <Form.Check
                              type="checkbox"
                              checked={agg.allChecked}
                              readOnly
                              tabIndex={-1}
                              style={{ pointerEvents: 'none' }}
                            />
                          )}
                        </button>
                        <div className="flex-grow-1">
                          {quantityParts.length > 0 && (
                            <span className="me-1 text-muted small">
                              {quantityParts.map((part, index) => (
                                <span
                                  key={part.id}
                                  className={part.checked ? 'text-decoration-line-through' : ''}
                                >
                                  {index > 0 && <span>{' + '}</span>}
                                  {part.text}
                                </span>
                              ))}
                            </span>
                          )}
                          <span
                            className={
                              agg.allChecked ? 'text-decoration-line-through text-muted' : ''
                            }
                          >
                            {agg.food?.id != null ? (
                              <Link to={`/ingredient/${agg.food.id}`}>{foodName}</Link>
                            ) : (
                              foodName
                            )}
                          </span>
                          {notes.map((note) => (
                            <span key={note} className="text-muted small ms-1">
                              ({note})
                            </span>
                          ))}
                          {viewMode === 'category' && agg.recipes.length > 1 && (
                            <span className="ms-2">
                              <Badge
                                bg="secondary"
                                style={{ fontSize: '0.65rem', cursor: 'default' }}
                                title={agg.recipes.join('\n')}
                              >
                                {agg.recipes.length} recipes
                              </Badge>
                            </span>
                          )}
                        </div>
                        {!isToCheck && (
                          <button
                            type="button"
                            className="shopping-list-more-action btn btn-sm btn-outline-secondary flex-shrink-0"
                            onClick={() => {
                              setOpenSwipeKey(rowKey);
                              setSwipeOffset(SWIPE_ACTION_WIDTH_PX);
                            }}
                            disabled={isPending || !toCheckList || !hasPersonalToken}
                            aria-label={`Show actions for ${foodName}`}
                            aria-expanded={openSwipeKey === rowKey}
                          >
                            <ThreeDotsVertical aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </div>
                  </ListGroup.Item>
                );
              })}
            </ListGroup>
          </div>
        );
      })}
    </div>
  );
}
