import { ListGroup, Form, Alert, Badge } from 'react-bootstrap';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch } from '../api/client';
import type { Food, SupermarketCategory } from '../api/tandoor-types';
import { LoadingMascot } from '../components/LoadingMascot';

interface ShoppingEntry {
  id: number;
  amount?: number | null;
  unit?: { id: number; name: string } | null;
  unit_name?: string | null;
  food: Food | null;
  checked: boolean;
  ingredient_note?: string | null;
  recipe_mealplan?: { recipe_name: string } | null;
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
  if (entry.amount != null) parts.push(String(entry.amount));
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
    const recipeName = entry.recipe_mealplan?.recipe_name;
    if (recipeName && !agg.recipes.includes(recipeName)) {
      agg.recipes.push(recipeName);
    }
  }
  return Array.from(map.values());
}

export function ShoppingList() {
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['shopping-list'],
    queryFn: () => apiGet<{ results: ShoppingEntry[] }>('/shopping-list-entry/?checked=false'),
  });

  const toggle = useMutation({
    mutationFn: ({ id, checked }: { id: number; checked: boolean }) =>
      apiPatch(`/shopping-list-entry/${id}/`, { checked }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shopping-list'] }),
  });

  const toggleAll = (entries: ShoppingEntry[], checked: boolean) => {
    Promise.all(entries.map((entry) => toggle.mutateAsync({ id: entry.id, checked }))).catch(() => {});
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
      <div>
        <h2 className="mb-3">Shopping List</h2>
        <p className="text-muted">Your shopping list is empty! Add recipes to your meal plan.</p>
      </div>
    );
  }

  const groups = groupByCategory(entries);
  const categoryNames = Object.keys(groups).filter((k) => groups[k].length > 0);

  return (
    <div>
      <h2 className="mb-1">Shopping List</h2>
      <p className="text-muted small mb-3">{entries.length} item{entries.length !== 1 ? 's' : ''}</p>

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

                return (
                  <ListGroup.Item key={agg.food?.id != null ? `food-${agg.food.id}` : `entries-${agg.entries.map(e => e.id).join('-')}`} className="py-2">
                    <div className="d-flex align-items-start gap-2">
                      <Form.Check
                        type="checkbox"
                        checked={agg.allChecked}
                        onChange={(e) => toggleAll(agg.entries, e.target.checked)}
                        className="mt-1"
                      />
                      <div className="flex-grow-1">
                        <span className={agg.allChecked ? 'text-decoration-line-through text-muted' : ''}>
                          {amounts && <span className="me-1 text-muted small">{amounts}</span>}
                          {foodName}
                        </span>
                        {notes.map((note) => (
                          <span key={note} className="text-muted small ms-1">({note})</span>
                        ))}
                        {agg.recipes.length > 0 && (
                          <div className="mt-1 d-flex flex-wrap align-items-center gap-1">
                            <Badge bg="info" text="dark" style={{ fontSize: '0.65rem' }}>
                              {agg.recipes.length} {agg.recipes.length === 1 ? 'recipe' : 'recipes'}
                            </Badge>
                            {agg.recipes.map((r) => (
                              <span key={r} className="text-muted" style={{ fontSize: '0.7rem' }}>{r}</span>
                            ))}
                          </div>
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
