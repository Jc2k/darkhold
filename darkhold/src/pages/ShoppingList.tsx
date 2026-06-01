import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faAmazon } from '@fortawesome/free-brands-svg-icons';
import { ListGroup, Alert, Badge, Spinner, Button, ButtonGroup, Modal } from 'react-bootstrap';
import {
  Basket3,
  Basket3Fill,
  Cart4,
  Eyeglasses,
  InfoCircle,
  PencilFill,
  PersonFill,
  PlusCircle,
  QuestionCircleFill,
  Trash3,
} from 'react-bootstrap-icons';
import { Link } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
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
const TOOLBAR_BUTTON_STYLE = { minHeight: 44, padding: '0 1rem' };
const LONG_PRESS_DELAY_MS = 500;
const LONG_PRESS_MOVE_TOLERANCE_PX = 10;

export function isInShoppingList(entry: ShoppingEntry, listName: string): boolean {
  return entry.shopping_lists?.some((list) => list.name === listName) ?? false;
}

export function isLeftSwipe(deltaX: number, deltaY: number): boolean {
  return deltaX <= -SWIPE_THRESHOLD_PX && Math.abs(deltaX) > Math.abs(deltaY);
}

export function isRightSwipe(deltaX: number, deltaY: number): boolean {
  return deltaX >= SWIPE_THRESHOLD_PX && Math.abs(deltaX) > Math.abs(deltaY);
}

export function isFullLeftSwipe(deltaX: number, deltaY: number): boolean {
  return deltaX <= -FULL_SWIPE_THRESHOLD_PX && Math.abs(deltaX) > Math.abs(deltaY);
}

export function isFullRightSwipe(deltaX: number, deltaY: number): boolean {
  return deltaX >= FULL_SWIPE_THRESHOLD_PX && Math.abs(deltaX) > Math.abs(deltaY);
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

export function removeShoppingListEntries(
  entries: ShoppingEntry[],
  entryIds: Set<number>,
): ShoppingEntry[] {
  return entries.filter((entry) => !entryIds.has(entry.id));
}

export function updateShoppingListEntries(
  entries: ShoppingEntry[],
  entryIds: Set<number>,
  updates: { checked?: boolean; toCheckList?: TandoorShoppingList; isToCheck?: boolean },
): ShoppingEntry[] {
  return entries.map((entry) => {
    if (!entryIds.has(entry.id)) return entry;
    const next = { ...entry };
    if (updates.checked !== undefined) next.checked = updates.checked;
    if (updates.toCheckList && updates.isToCheck !== undefined) {
      const shoppingLists = (entry.shopping_lists ?? []).filter(
        (list) => list.name !== TO_CHECK_LIST_NAME,
      );
      next.shopping_lists = updates.isToCheck
        ? [...shoppingLists, updates.toCheckList]
        : shoppingLists;
    }
    return next;
  });
}

interface ShoppingListRecipe {
  id: number | null;
  name: string;
}

interface AggregatedIngredient {
  food: Food | null;
  entries: ShoppingEntry[];
  allChecked: boolean;
  recipes: ShoppingListRecipe[];
}

interface IngredientInfo {
  food: Food | null;
  isAmazon: boolean;
  isToCheck: boolean;
  recipes: ShoppingListRecipe[];
  requestedBy: string[];
}

function getRecipeFromDate(entry: ShoppingEntry): string | null {
  return entry.list_recipe_data?.meal_plan_data?.from_date ?? null;
}

export function formatAmount(entry: ShoppingEntry): string {
  const unitName = typeof entry.unit === 'object' && entry.unit ? entry.unit.name : entry.unit_name;
  if (!entry.list_recipe_data?.meal_plan_data) return '';

  const parts: string[] = [];
  if (entry.amount != null) parts.push(formatFraction(entry.amount));
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

function getRecipe(entry: ShoppingEntry): ShoppingListRecipe | null {
  const name = getRecipeName(entry);
  return name ? { id: entry.list_recipe_data?.recipe ?? null, name } : null;
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
    const recipe = getRecipe(entry);
    if (
      recipe &&
      !agg.recipes.some((candidate) =>
        recipe.id != null && candidate.id != null
          ? candidate.id === recipe.id
          : candidate.name === recipe.name,
      )
    ) {
      agg.recipes.push(recipe);
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
    const key = getRecipeName(entry) ?? 'Requests';
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
        if (a.name === 'Requests' && b.name !== 'Requests') return -1;
        if (b.name === 'Requests' && a.name !== 'Requests') return 1;
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
  const longPressTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);
  const [longPressKey, setLongPressKey] = useState<string | null>(null);
  const [ingredientInfo, setIngredientInfo] = useState<IngredientInfo | null>(null);
  const [openSwipeKey, setOpenSwipeKey] = useState<string | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [viewMode, setViewMode] = useState<'category' | 'recipe'>('category');
  const [filter, setFilter] = useState<'to-check' | 'to-buy' | null>(null);
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

  useEffect(
    () => () => {
      if (longPressTimeout.current) clearTimeout(longPressTimeout.current);
    },
    [],
  );

  const clearLongPress = () => {
    if (longPressTimeout.current) clearTimeout(longPressTimeout.current);
    longPressTimeout.current = null;
    setLongPressKey(null);
  };

  const openIngredientInfo = (agg: AggregatedIngredient) => {
    const requestedBy = [
      ...new Set(
        agg.entries
          .filter((entry) => !getRecipeName(entry))
          .map((entry) => entry.created_by?.username)
          .filter((username): username is string => Boolean(username)),
      ),
    ];
    setIngredientInfo({
      food: agg.food,
      isAmazon: agg.entries.some((entry) => isInShoppingList(entry, 'Amazon')),
      isToCheck: agg.entries.some((entry) => isInShoppingList(entry, TO_CHECK_LIST_NAME)),
      recipes: agg.recipes,
      requestedBy,
    });
  };

  type UpdateEntriesVariables = {
    entries: ShoppingEntry[];
    checked?: boolean;
    isToCheck?: boolean;
  };

  const updateEntries = useMutation({
    mutationFn: ({ entries, checked, isToCheck }: UpdateEntriesVariables) => {
      if (isToCheck !== undefined && !toCheckList) {
        throw new Error('The To Check list is not ready yet.');
      }
      return Promise.all(
        entries.map((entry) => {
          const shoppingLists = (entry.shopping_lists ?? []).filter(
            (list) => list.name !== TO_CHECK_LIST_NAME,
          );
          return apiPatch(`/shopping-list-entry/${entry.id}/`, {
            ...(checked !== undefined && { checked }),
            ...(isToCheck !== undefined && {
              shopping_lists: isToCheck ? [...shoppingLists, toCheckList!] : shoppingLists,
            }),
          });
        }),
      );
    },
    onMutate: ({ entries }) => {
      setMoveError(null);
      setPendingIds((previous) => new Set([...previous, ...entries.map((entry) => entry.id)]));
    },
    onSuccess: (_result, { entries, checked, isToCheck }) => {
      const entryIds = new Set(entries.map((entry) => entry.id));
      qc.setQueryData<ShoppingEntry[]>(['shopping-list'], (current) =>
        current
          ? updateShoppingListEntries(current, entryIds, { checked, isToCheck, toCheckList })
          : current,
      );
      qc.invalidateQueries({ queryKey: ['shopping-list'] });
      broadcastInvalidation('shopping-list');
    },
    onError: () => {
      setMoveError('Failed to update item. Please try again.');
    },
    onSettled: (_result, _error, { entries }) => {
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

  const toggleToCheck = (entries: ShoppingEntry[]) => {
    if (!hasPersonalToken || !toCheckList) return;
    const isToCheck = !entries.every((entry) => isInShoppingList(entry, TO_CHECK_LIST_NAME));
    closeSwipeAction();
    updateEntries.mutate({ entries, isToCheck, ...(isToCheck && { checked: false }) });
  };

  const toggleChecked = (entries: ShoppingEntry[], checked: boolean) => {
    if (!hasPersonalToken) return;
    closeSwipeAction();
    updateEntries.mutate({
      entries,
      checked,
      ...(checked && toCheckList && { isToCheck: false }),
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
        const removedIds = new Set(
          entries
            .filter((_entry, index) => results[index].status === 'fulfilled')
            .map((entry) => entry.id),
        );
        qc.setQueryData<ShoppingEntry[]>(['shopping-list'], (current) =>
          current ? removeShoppingListEntries(current, removedIds) : current,
        );
        const failed = results.length - removedIds.size;
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
      (filter !== 'to-buy' || !entry.checked) &&
      (filter !== 'to-check' || isInShoppingList(entry, TO_CHECK_LIST_NAME)),
  );
  if (entries.length === 0) {
    return (
      <div
        className="d-flex flex-column align-items-center justify-content-center"
        style={{ minHeight: '60vh' }}
      >
        <Cart4 size={64} className="text-muted mb-3" />
        <p className="text-muted text-center">
          Your shopping list is empty! Add recipes to your meal plan or add a shopping request.
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
          <ButtonGroup aria-label="Shopping list view">
            <Button
              variant={viewMode === 'category' ? 'primary' : 'outline-secondary'}
              style={TOOLBAR_BUTTON_STYLE}
              onClick={() => setViewMode('category')}
              aria-label="Show category groups"
              aria-pressed={viewMode === 'category'}
            >
              Category
            </Button>
            <Button
              variant={viewMode === 'recipe' ? 'primary' : 'outline-secondary'}
              style={TOOLBAR_BUTTON_STYLE}
              onClick={() => setViewMode('recipe')}
              aria-label="Show recipe groups"
              aria-pressed={viewMode === 'recipe'}
            >
              Recipe
            </Button>
          </ButtonGroup>
          <ButtonGroup aria-label="Shopping list filters">
            <Button
              variant={filter === 'to-buy' ? 'primary' : 'outline-secondary'}
              style={TOOLBAR_BUTTON_STYLE}
              onClick={() => setFilter((value) => (value === 'to-buy' ? null : 'to-buy'))}
              aria-label="Show To Buy items only"
              aria-pressed={filter === 'to-buy'}
            >
              {filter === 'to-buy' ? (
                <Basket3Fill aria-hidden="true" />
              ) : (
                <Basket3 aria-hidden="true" />
              )}
            </Button>
            <Button
              variant={filter === 'to-check' ? 'primary' : 'outline-secondary'}
              style={TOOLBAR_BUTTON_STYLE}
              onClick={() => setFilter((value) => (value === 'to-check' ? null : 'to-check'))}
              aria-label="Show To Check items only"
              aria-pressed={filter === 'to-check'}
            >
              <Eyeglasses aria-hidden="true" />
            </Button>
          </ButtonGroup>
        </div>
        <Button
          variant="outline-danger"
          style={TOOLBAR_BUTTON_STYLE}
          onClick={() => clearAll(entries)}
          disabled={isClearing || !hasPersonalToken}
          aria-label="Clear shopping list"
        >
          {isClearing ? (
            <>
              <Spinner animation="border" size="sm" className="me-1" />
              Clearing…
            </>
          ) : (
            <Trash3 aria-hidden="true" />
          )}
        </Button>
      </div>
      <p className="text-muted small mb-3">
        {remainingCount} item{remainingCount !== 1 ? 's' : ''} remaining of {entries.length} item
        {entries.length !== 1 ? 's' : ''}.
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
                const isManualRequest = agg.entries.some((entry) => !getRecipeName(entry));
                const isAmazon = agg.entries.some((entry) => isInShoppingList(entry, 'Amazon'));
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
                        variant="success"
                        className={`shopping-list-swipe-action shopping-list-swipe-action-buy rounded-0${
                          openSwipeKey === rowKey && swipeOffset >= FULL_SWIPE_THRESHOLD_PX
                            ? ' shopping-list-swipe-action-ready'
                            : ''
                        }`}
                        style={{ width: Math.max(swipeOffset, SWIPE_ACTION_WIDTH_PX) }}
                        onClick={() => toggleChecked(agg.entries, !agg.allChecked)}
                        disabled={isPending || !hasPersonalToken}
                        aria-label={
                          agg.allChecked ? `Mark ${foodName} to buy` : `Mark ${foodName} bought`
                        }
                        tabIndex={openSwipeKey === rowKey && swipeOffset > 0 ? 0 : -1}
                      >
                        <PlusCircle aria-hidden="true" />
                        <span>{agg.allChecked ? 'To Buy' : 'Bought'}</span>
                      </Button>
                      <Button
                        variant="secondary"
                        className={`shopping-list-swipe-action shopping-list-swipe-action-check rounded-0${
                          openSwipeKey === rowKey && swipeOffset <= -FULL_SWIPE_THRESHOLD_PX
                            ? ' shopping-list-swipe-action-ready'
                            : ''
                        }`}
                        style={{ width: Math.max(-swipeOffset, SWIPE_ACTION_WIDTH_PX) }}
                        onClick={() => toggleToCheck(agg.entries)}
                        disabled={isPending || !toCheckList || !hasPersonalToken}
                        aria-label={`${isToCheck ? 'Return' : 'Send'} ${foodName} ${isToCheck ? 'from' : 'to'} To Check`}
                        tabIndex={openSwipeKey === rowKey && swipeOffset < 0 ? 0 : -1}
                      >
                        <QuestionCircleFill aria-hidden="true" />
                        <span>{isToCheck ? 'To Buy' : 'To Check'}</span>
                      </Button>
                      <div
                        className={`shopping-list-swipe-content d-flex align-items-center gap-2 py-2 px-3${
                          longPressKey === rowKey ? ' shopping-list-long-press-pending' : ''
                        }`}
                        style={{
                          transform: `translateX(${openSwipeKey === rowKey ? swipeOffset : 0}px)`,
                        }}
                        onPointerDown={(event) => {
                          if (
                            event.target instanceof Element &&
                            event.target.closest('a, button')
                          ) {
                            return;
                          }
                          if (event.pointerType === 'mouse' && event.button !== 0) return;
                          swipeStart.current = {
                            key: rowKey,
                            pointerId: event.pointerId,
                            x: event.clientX,
                            y: event.clientY,
                          };
                          longPressTriggered.current = false;
                          if (event.pointerType !== 'mouse') {
                            clearLongPress();
                            setLongPressKey(rowKey);
                            longPressTimeout.current = setTimeout(() => {
                              longPressTriggered.current = true;
                              longPressTimeout.current = null;
                              closeSwipeAction();
                              openIngredientInfo(agg);
                            }, LONG_PRESS_DELAY_MS);
                          }
                          event.currentTarget.setPointerCapture?.(event.pointerId);
                        }}
                        onPointerMove={(event) => {
                          const start = swipeStart.current;
                          if (start?.key !== rowKey || start.pointerId !== event.pointerId) return;
                          const deltaX = event.clientX - start.x;
                          const deltaY = event.clientY - start.y;
                          if (
                            Math.abs(deltaX) > LONG_PRESS_MOVE_TOLERANCE_PX ||
                            Math.abs(deltaY) > LONG_PRESS_MOVE_TOLERANCE_PX
                          ) {
                            clearLongPress();
                          }
                          if (Math.abs(deltaX) <= Math.abs(deltaY)) return;
                          setOpenSwipeKey(rowKey);
                          setSwipeOffset(deltaX);
                        }}
                        onPointerUp={(event) => {
                          const start = swipeStart.current;
                          swipeStart.current = null;
                          clearLongPress();
                          if (start?.key !== rowKey || start.pointerId !== event.pointerId) return;
                          if (longPressTriggered.current) {
                            longPressTriggered.current = false;
                            return;
                          }
                          const deltaX = event.clientX - start.x;
                          const deltaY = event.clientY - start.y;
                          if (isFullLeftSwipe(deltaX, deltaY)) toggleToCheck(agg.entries);
                          else if (isFullRightSwipe(deltaX, deltaY))
                            toggleChecked(agg.entries, !agg.allChecked);
                          else if (isLeftSwipe(deltaX, deltaY)) {
                            setOpenSwipeKey(rowKey);
                            setSwipeOffset(-SWIPE_ACTION_WIDTH_PX);
                          } else if (isRightSwipe(deltaX, deltaY)) {
                            setOpenSwipeKey(rowKey);
                            setSwipeOffset(SWIPE_ACTION_WIDTH_PX);
                          } else closeSwipeAction();
                        }}
                        onPointerCancel={() => {
                          swipeStart.current = null;
                          longPressTriggered.current = false;
                          clearLongPress();
                          closeSwipeAction();
                        }}
                      >
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
                            {foodName}
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
                                title={agg.recipes.map((recipe) => recipe.name).join('\n')}
                              >
                                {agg.recipes.length} recipes
                              </Badge>
                            </span>
                          )}
                        </div>
                        {isManualRequest && (
                          <PencilFill
                            className="text-muted flex-shrink-0"
                            aria-label="Added manually"
                            title="Added manually"
                          />
                        )}
                        {isAmazon && (
                          <FontAwesomeIcon
                            icon={faAmazon}
                            className="text-muted flex-shrink-0"
                            aria-label="Amazon"
                            title="Amazon"
                          />
                        )}
                        {isToCheck && (
                          <QuestionCircleFill
                            className="shopping-list-to-check-indicator text-secondary flex-shrink-0"
                            aria-label="To Check"
                          />
                        )}
                        <div className="shopping-list-row-actions flex-shrink-0">
                          <Button
                            variant="outline-secondary"
                            size="sm"
                            onClick={() => openIngredientInfo(agg)}
                            aria-label={`Show details for ${foodName}`}
                          >
                            <InfoCircle aria-hidden="true" />
                          </Button>
                          <Button
                            variant="outline-secondary"
                            size="sm"
                            onClick={() => toggleToCheck(agg.entries)}
                            disabled={isPending || !toCheckList || !hasPersonalToken}
                            aria-label={`${isToCheck ? 'Return' : 'Send'} ${foodName} ${isToCheck ? 'from' : 'to'} To Check`}
                          >
                            <QuestionCircleFill aria-hidden="true" />
                          </Button>
                          <Button
                            variant="outline-success"
                            size="sm"
                            onClick={() => toggleChecked(agg.entries, !agg.allChecked)}
                            disabled={isPending || !hasPersonalToken}
                            aria-label={
                              agg.allChecked ? `Mark ${foodName} to buy` : `Mark ${foodName} bought`
                            }
                          >
                            <PlusCircle aria-hidden="true" />
                          </Button>
                        </div>
                        {isPending && (
                          <Spinner animation="border" size="sm" className="flex-shrink-0" />
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

      <Modal show={ingredientInfo != null} onHide={() => setIngredientInfo(null)} centered>
        <Modal.Header closeButton>
          <Modal.Title>{ingredientInfo?.food?.name ?? 'Shopping list item'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {(ingredientInfo?.isAmazon ||
            ingredientInfo?.isToCheck ||
            (ingredientInfo?.requestedBy.length ?? 0) > 0) && (
            <ul className="shopping-list-info-facts list-unstyled">
              {ingredientInfo?.isAmazon && (
                <li>
                  <FontAwesomeIcon icon={faAmazon} aria-hidden="true" />
                  <span>This item is bought from Amazon.</span>
                </li>
              )}
              {ingredientInfo?.requestedBy.map((username) => (
                <li key={username}>
                  <PersonFill aria-hidden="true" />
                  <span>This item was requested by {username}.</span>
                </li>
              ))}
              {ingredientInfo?.isToCheck && (
                <li>
                  <QuestionCircleFill aria-hidden="true" />
                  <span>Check to see if we have any.</span>
                </li>
              )}
            </ul>
          )}

          {(ingredientInfo?.recipes.length ?? 0) > 0 && (
            <section>
              <h3 className="h6">Added for recipes</h3>
              <ul>
                {ingredientInfo?.recipes.map((recipe) => (
                  <li key={recipe.id ?? recipe.name}>
                    {recipe.id != null ? (
                      <Link to={`/recipe/${recipe.id}`} onClick={() => setIngredientInfo(null)}>
                        {recipe.name}
                      </Link>
                    ) : (
                      recipe.name
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {ingredientInfo?.food?.id != null && (
            <p className="mb-0">
              See{' '}
              <Link
                to={`/ingredient/${ingredientInfo.food.id}`}
                onClick={() => setIngredientInfo(null)}
              >
                all recipes
              </Link>{' '}
              that use this ingredient.
            </p>
          )}
        </Modal.Body>
      </Modal>
    </div>
  );
}
