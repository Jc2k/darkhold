import { ListGroup, Form, Alert, Badge, Spinner, Button } from 'react-bootstrap';
import { Cart4 } from 'react-bootstrap-icons';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiDelete } from '../api/client';
import { broadcastInvalidation } from '../hooks/useInvalidationSocket';
import type { Food, SupermarketCategory } from '../api/tandoor-types';
import { LoadingMascot } from '../components/LoadingMascot';
import { NoTokenAlert } from '../components/NoTokenAlert';
import { formatFraction } from '../utils/fractions';

interface ShoppingEntry {
  id: number;
  amount?: number | null;
  unit?: { id: number; name: string } | null;
  unit_name?: string | null;
  food: Food | null;
  checked: boolean;
  ingredient_note?: string | null;
  recipe_mealplan?: {
    recipe_name: string;
    from_date?: string | null;
    meal_type?: {
      id?: number;
      name?: string | null;
      order?: number | null;
      time?: string | null;
    } | null;
  } | null;
  list_recipe_data?: { recipe_data: { name: string } } | null;
  list_recipe?: number | null;
  supermarket_category?: SupermarketCategory | null;
}

interface AggregatedIngredient {
  food: Food | null;
  entries: ShoppingEntry[];
  allChecked: boolean;
  recipes: string[];
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
  return entry.list_recipe_data?.recipe_data.name ?? entry.recipe_mealplan?.recipe_name ?? null;
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
  type RecipeSortPosition = {
    date: string;
    mealTimeMinutes: number;
    mealOrder: number;
    index: number;
  };
  type RecipeGroup = {
    name: string;
    entries: ShoppingEntry[];
    firstIndex: number;
    position: RecipeSortPosition | null;
  };

  const toMealTimeMinutes = (
    mealType?: { name?: string | null; time?: string | null } | null,
  ): number => {
    const time = mealType?.time;
    if (time) {
      const match = time.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
      if (match) {
        const hours = Number(match[1]);
        const minutes = Number(match[2]);
        if (
          Number.isInteger(hours) &&
          Number.isInteger(minutes) &&
          hours >= 0 &&
          hours <= 23 &&
          minutes >= 0 &&
          minutes <= 59
        ) {
          return hours * 60 + minutes;
        }
      }
    }

    const name = mealType?.name?.toLowerCase();
    if (name?.includes('breakfast')) return 8 * 60;
    if (name?.includes('lunch')) return 12 * 60;
    if (name?.includes('dinner')) return 18 * 60;
    return Number.MAX_SAFE_INTEGER;
  };

  const comparePositions = (a: RecipeSortPosition, b: RecipeSortPosition): number => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.mealTimeMinutes !== b.mealTimeMinutes) return a.mealTimeMinutes - b.mealTimeMinutes;
    if (a.mealOrder !== b.mealOrder) return a.mealOrder - b.mealOrder;
    return a.index - b.index;
  };

  const groups = new Map<string, RecipeGroup>();
  entries.forEach((entry, index) => {
    const key = getRecipeName(entry) ?? 'No recipe';
    if (!groups.has(key)) {
      groups.set(key, { name: key, entries: [], firstIndex: index, position: null });
    }
    const group = groups.get(key)!;
    group.entries.push(entry);

    const date = entry.recipe_mealplan?.from_date?.split('T')[0];
    if (date) {
      const position: RecipeSortPosition = {
        date,
        mealTimeMinutes: toMealTimeMinutes(entry.recipe_mealplan?.meal_type),
        mealOrder: entry.recipe_mealplan?.meal_type?.order ?? Number.MAX_SAFE_INTEGER,
        index,
      };
      if (!group.position || comparePositions(position, group.position) < 0) {
        group.position = position;
      }
    }
  });

  return Object.fromEntries(
    Array.from(groups.values())
      .sort((a, b) => {
        if (a.position && b.position) return comparePositions(a.position, b.position);
        if (a.position) return -1;
        if (b.position) return 1;
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
  const [viewMode, setViewMode] = useState<'category' | 'recipe'>('category');
  const hasPersonalToken = Boolean(localStorage.getItem('tandoor_token'));

  const { data, isLoading, isError } = useQuery({
    queryKey: ['shopping-list'],
    queryFn: () => apiGet<{ results: ShoppingEntry[] }>('/shopping-list-entry/'),
  });

  const toggle = useMutation({
    mutationFn: ({ id, checked }: { id: number; checked: boolean }) =>
      apiPatch(`/shopping-list-entry/${id}/`, { checked }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shopping-list'] });
      broadcastInvalidation('shopping-list');
    },
  });

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
        broadcastInvalidation('shopping-list');
      });
  };

  if (isLoading && !data) {
    return <LoadingMascot />;
  }

  if (isError) {
    return <Alert variant="danger">Failed to load shopping list. Check your API token.</Alert>;
  }

  const entries = data?.results ?? [];
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

  const groups = groupByCategory(entries);
  const categoryNames = Object.keys(groups).filter((k) => groups[k].length > 0);
  const recipeGroups = groupByRecipe(entries);
  const recipeNames = Object.keys(recipeGroups).filter((k) => recipeGroups[k].length > 0);
  const remainingCount = entries.filter((entry) => !entry.checked).length;

  return (
    <div className="pt-2">
      {!hasPersonalToken && <NoTokenAlert />}
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-1">
        <Form.Check
          type="switch"
          id="shopping-view-mode"
          label={viewMode === 'recipe' ? 'View: recipe' : 'View: category'}
          checked={viewMode === 'recipe'}
          onChange={(event) => setViewMode(event.currentTarget.checked ? 'recipe' : 'category')}
        />
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
        {entries.length !== 1 ? 's' : ''}
      </p>
      {clearError && (
        <Alert variant="danger" dismissible onClose={() => setClearError(null)}>
          {clearError}
        </Alert>
      )}

      {(viewMode === 'recipe' ? recipeNames : categoryNames).map((groupName) => {
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
                const quantityParts = agg.entries
                  .map((entry) => ({
                    id: entry.id,
                    text: formatAmount(entry),
                    checked: entry.checked,
                  }))
                  .filter((part) => part.text);

                return (
                  <ListGroup.Item
                    key={
                      agg.food?.id != null
                        ? `food-${agg.food.id}`
                        : `entries-${agg.entries.map((e) => e.id).join('-')}`
                    }
                    className="py-2"
                  >
                    <div className="d-flex align-items-start gap-2">
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
