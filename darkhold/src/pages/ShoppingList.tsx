import { ListGroup, Form, Alert, Badge, Spinner, Button } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiDelete } from '../api/client';
import { broadcastInvalidation } from '../hooks/useInvalidationSocket';
import type { Food, SupermarketCategory } from '../api/tandoor-types';
import { LoadingMascot } from '../components/LoadingMascot';
import { formatFraction } from '../utils/fractions';

interface ShoppingEntry {
  id: number;
  amount?: number | null;
  unit?: { id: number; name: string } | null;
  unit_name?: string | null;
  food: Food | null;
  checked: boolean;
  ingredient_note?: string | null;
  recipe_mealplan?: { recipe_name: string } | null;
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
    const recipeName = entry.list_recipe_data?.recipe_data.name;
    if (recipeName && !agg.recipes.includes(recipeName)) {
      agg.recipes.push(recipeName);
    }
  }
  return Array.from(map.values());
}

export function ShoppingList() {
  const qc = useQueryClient();
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set());
  const [isClearing, setIsClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['shopping-list'],
    queryFn: () => apiGet<{ results: ShoppingEntry[] }>('/shopping-list-entry/?checked=false'),
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
    const ids = entries.map((e) => e.id);
    setPendingIds((prev: Set<number>) => new Set([...prev, ...ids]));
    Promise.allSettled(entries.map((entry) => toggle.mutateAsync({ id: entry.id, checked })))
      .finally(() => {
        setPendingIds((prev: Set<number>) => {
          const next = new Set(prev);
          ids.forEach((id) => next.delete(id));
          return next;
        });
      });
  };

  const clearAll = (entries: ShoppingEntry[]) => {
    if (!window.confirm(`Remove all ${entries.length} item${entries.length !== 1 ? 's' : ''} from your shopping list?`)) {
      return;
    }
    setIsClearing(true);
    setClearError(null);
    Promise.allSettled(entries.map((entry) => apiDelete(`/shopping-list-entry/${entry.id}/`)))
      .then((results) => {
        const failed = results.filter((r) => r.status === 'rejected').length;
        if (failed > 0) {
          setClearError(`Failed to remove ${failed} item${failed !== 1 ? 's' : ''}. Please try again.`);
        }
      })
      .finally(() => {
        setIsClearing(false);
        qc.invalidateQueries({ queryKey: ['shopping-list'] });
        broadcastInvalidation('shopping-list');
      });
  };

  if (isLoading) {
    return <LoadingMascot />;
  }

  if (isError) {
    return <Alert variant="danger">Failed to load shopping list. Check your API token.</Alert>;
  }

  const entries = data?.results ?? [];
  if (entries.length === 0) {
    return (
      <div className="pt-2">
        <p className="text-muted">Your shopping list is empty! Add recipes to your meal plan.</p>
      </div>
    );
  }

  const groups = groupByCategory(entries);
  const categoryNames = Object.keys(groups).filter((k) => groups[k].length > 0);

  return (
    <div className="pt-2">
      <div className="d-flex align-items-center justify-content-end mb-1">
        <Button
          variant="outline-danger"
          size="sm"
          onClick={() => clearAll(entries)}
          disabled={isClearing}
        >
          {isClearing ? <><Spinner animation="border" size="sm" className="me-1" />Clearing…</> : 'Clear'}
        </Button>
      </div>
      <p className="text-muted small mb-3">{entries.length} item{entries.length !== 1 ? 's' : ''}</p>
      {clearError && <Alert variant="danger" dismissible onClose={() => setClearError(null)}>{clearError}</Alert>}

      {categoryNames.map((cat) => {
        const aggregated = aggregateByIngredient(groups[cat]);
        return (
          <div key={cat} className="mb-4">
            <h6 className="text-muted text-uppercase mb-1" style={{ fontSize: '0.75rem', letterSpacing: '0.05em' }}>
              {cat}
              <Badge bg="secondary" className="ms-2">{aggregated.length}</Badge>
            </h6>
            <ListGroup variant="flush" className="border rounded">
              {aggregated.map((agg) => {
                const foodName = agg.food?.name ?? 'Unknown item';
                const amounts = agg.entries
                  .map(formatAmount)
                  .filter(Boolean)
                  .join(' + ');
                const notes = [...new Set(agg.entries.map(e => e.ingredient_note).filter(Boolean))];
                const isPending = agg.entries.some((e) => pendingIds.has(e.id));

                return (
                  <ListGroup.Item key={agg.food?.id != null ? `food-${agg.food.id}` : `entries-${agg.entries.map(e => e.id).join('-')}`} className="py-2">
                    <div className="d-flex align-items-start gap-2">
                      <button
                        type="button"
                        className="btn p-0 d-flex align-items-center justify-content-center flex-shrink-0 mt-1"
                        style={{ width: '2.25rem', height: '2.25rem', background: 'none', border: 'none', cursor: isPending ? 'wait' : 'pointer' }}
                        onClick={() => toggleAll(agg.entries, !agg.allChecked)}
                        disabled={isPending}
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
                        <span className={agg.allChecked ? 'text-decoration-line-through text-muted' : ''}>
                          {amounts && <span className="me-1 text-muted small">{amounts}</span>}
                          {agg.food?.id != null ? (
                            <Link to={`/ingredient/${agg.food.id}`}>{foodName}</Link>
                          ) : foodName}
                        </span>
                        {notes.map((note) => (
                          <span key={note} className="text-muted small ms-1">({note})</span>
                        ))}
                        {agg.recipes.length > 1 && (
                          <span className="ms-2">
                            <Badge bg="secondary" style={{ fontSize: '0.65rem', cursor: 'default' }} title={agg.recipes.join('\n')}>
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
