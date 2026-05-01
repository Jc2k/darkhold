import { ListGroup, Form, Spinner, Alert, Accordion, Badge } from 'react-bootstrap';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch } from '../api/client';
import type { Food, SupermarketCategory } from '../api/tandoor-types';

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

function groupByCategory(entries: ShoppingEntry[]): Record<string, ShoppingEntry[]> {
  const groups: Record<string, ShoppingEntry[]> = { Uncategorised: [] };
  for (const entry of entries) {
    const cat = entry.supermarket_category?.name ?? entry.food?.supermarket_category;
    const key = typeof cat === 'string' ? cat : 'Uncategorised';
    if (!groups[key]) groups[key] = [];
    groups[key].push(entry);
  }
  return groups;
}

function formatAmount(entry: ShoppingEntry): string {
  const parts: string[] = [];
  if (entry.amount != null) parts.push(String(entry.amount));
  const unitName = typeof entry.unit === 'object' && entry.unit ? entry.unit.name : entry.unit_name;
  if (unitName) parts.push(unitName);
  return parts.join(' ');
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

  if (isLoading) {
    return (
      <div className="text-center py-5">
        <Spinner />
      </div>
    );
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

      <Accordion defaultActiveKey={categoryNames} alwaysOpen>
        {categoryNames.map((cat) => (
          <Accordion.Item key={cat} eventKey={cat}>
            <Accordion.Header>
              {cat}
              <Badge bg="secondary" className="ms-2">{groups[cat].length}</Badge>
            </Accordion.Header>
            <Accordion.Body className="p-0">
              <ListGroup variant="flush">
                {groups[cat].map((entry) => {
                  const foodName = entry.food?.name ?? 'Unknown item';
                  const amt = formatAmount(entry);
                  const source = entry.recipe_mealplan?.recipe_name;

                  return (
                    <ListGroup.Item key={entry.id} className="py-2">
                      <div className="d-flex align-items-start gap-2">
                        <Form.Check
                          type="checkbox"
                          checked={entry.checked}
                          onChange={(e) => toggle.mutate({ id: entry.id, checked: e.target.checked })}
                          className="mt-1"
                        />
                        <div className="flex-grow-1">
                          <span className={entry.checked ? 'text-decoration-line-through text-muted' : ''}>
                            {amt && <span className="me-1 text-muted small">{amt}</span>}
                            {foodName}
                          </span>
                          {entry.ingredient_note && (
                            <span className="text-muted small ms-1">({entry.ingredient_note})</span>
                          )}
                          {source && (
                            <div className="text-muted" style={{ fontSize: '0.7rem' }}>
                              From: {source}
                            </div>
                          )}
                        </div>
                      </div>
                    </ListGroup.Item>
                  );
                })}
              </ListGroup>
            </Accordion.Body>
          </Accordion.Item>
        ))}
      </Accordion>
    </div>
  );
}
