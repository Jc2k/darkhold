import { useMemo } from 'react';
import { Alert, Badge, Button, Spinner } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { BoxSeam, ExclamationTriangle } from 'react-bootstrap-icons';
import { usePantryInventory, usePantryReservations, reservationMealPlanId } from '../hooks/usePantryReservations';
import { formatDate } from '../utils/dateUtils';

interface Props {
  onConfirmMeal: (mealPlanId: number) => void;
}

/** Display unresolved reservations, including those requiring a manual stock correction. */
export function PantryDashboardSections({ onConfirmMeal }: Props) {
  const pantry = usePantryInventory();
  const shopping = usePantryReservations();
  const today = formatDate(new Date());

  const expiring = useMemo(
    () =>
      (pantry.data ?? [])
        .filter((entry) => {
          if (!entry.expires || Number(entry.amount) <= 0) return false;
          const days = Math.round(
            (Date.parse(`${entry.expires}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
              86_400_000,
          );
          return days <= 30;
        })
        .sort((a, b) => (a.expires ?? '').localeCompare(b.expires ?? '')),
    [pantry.data, today],
  );

  const pending = useMemo(() => {
    const groups = new Map<number, { name: string; date: string; foods: string[] }>();
    for (const item of shopping.reservations) {
      const mealPlanId = reservationMealPlanId(item);
      const date = item.list_recipe_data?.meal_plan_data?.from_date?.split('T')[0];
      if (mealPlanId == null || !date || date > today) continue;
      const group = groups.get(mealPlanId) ?? {
        name: item.list_recipe_data?.recipe_data?.name ?? 'Planned meal',
        date,
        foods: [],
      };
      if (item.food?.name && !group.foods.includes(item.food.name)) group.foods.push(item.food.name);
      groups.set(mealPlanId, group);
    }
    return [...groups.entries()].sort((a, b) => a[1].date.localeCompare(b[1].date));
  }, [shopping.reservations, today]);

  return (
    <>
      {pending.length > 0 && (
        <section className="mb-4" aria-label="Pantry meals awaiting confirmation">
          <h5 className="mb-2"><BoxSeam className="me-2" />Pantry use to review</h5>
          <p className="text-muted small">
            Pantry reservations are used automatically after the planned meal date. If one is still
            here, review it or correct the pantry stock.
          </p>
          <div className="border rounded">
            {pending.map(([mealPlanId, meal]) => (
              <div key={mealPlanId} className="d-flex align-items-center gap-3 justify-content-between border-bottom p-3">
                <div>
                  <strong>{meal.name}</strong>
                  <div className="small text-muted">
                    {meal.date} · {meal.foods.join(', ')}
                  </div>
                </div>
                <Button
                  variant="outline-primary"
                  size="sm"
                  onClick={() => onConfirmMeal(mealPlanId)}
                >
                  Review
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}
      {shopping.isError && (
        <Alert variant="warning" className="small">
          Could not check for pantry reservations.
        </Alert>
      )}

      {expiring.length > 0 && (
        <section className="mb-4" aria-label="Pantry expiring soon">
          <div className="d-flex align-items-center justify-content-between mb-2">
            <h5 className="mb-0"><ExclamationTriangle className="me-2" />Pantry: use soon</h5>
            <Link to="/pantry" className="small text-muted">View pantry →</Link>
          </div>
          <div className="border rounded">
            {expiring.slice(0, 8).map((entry) => {
              const expired = !!entry.expires && entry.expires < today;
              return (
                <div key={entry.id} className="d-flex gap-2 align-items-center justify-content-between border-bottom p-2">
                  <div>
                    {entry.food ? (
                      <Link to={`/ingredient/${entry.food.id}`}>{entry.food.name}</Link>
                    ) : (
                      'Unknown food'
                    )}
                    <div className="small text-muted">
                      {entry.amount} {entry.unit?.name ?? ''} · {entry.inventory_location.name}
                      {' · '}{expired ? 'Expired' : 'Expires'} {entry.expires}
                    </div>
                  </div>
                  {expired && <Badge bg="danger">Expired</Badge>}
                </div>
              );
            })}
          </div>
          {expiring.length > 8 && (
            <p className="text-muted small mt-1">{expiring.length - 8} more expiring items.</p>
          )}
        </section>
      )}
      {expiring.length === 0 && !pantry.isLoading && !pantry.isError && (
        <div className="d-flex align-items-center gap-2 justify-content-between mb-4">
          <span className="small text-muted">No tracked pantry items expiring in the next 30 days.</span>
          <Link to="/pantry" className="small">View pantry →</Link>
        </div>
      )}
      {pantry.isLoading && <Spinner size="sm" aria-label="Loading pantry" />}
      {pantry.isError && (
        <Alert variant="warning" className="small">
          Could not load pantry expiry dates.
        </Alert>
      )}
    </>
  );
}
