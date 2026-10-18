import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Modal, Button, Form, Spinner, Alert } from 'react-bootstrap';
import { Heart, HeartFill } from 'react-bootstrap-icons';
import { Link } from 'react-router-dom';
import type { MealType } from '../api/tandoor-types';
import type { ShoppingListEntry } from '../hooks/useShoppingListEntries';
import { apiGet, apiPatch } from '../api/client';
import { invalidateCacheQueries } from '../hooks/useCacheInvalidation';
import {
  type PantryInventoryEntry,
  reservationMealPlanId,
  usablePantryBatches,
  usePantryInventory,
  usePantryReservations,
  useSetPantryReservation,
} from '../hooks/usePantryReservations';
import {
  useCookLog,
  useCreateCookLog,
  buildCookLogTimestamp,
  isCookedOnDate,
} from '../hooks/useCookLog';
import { formatDate } from '../utils/dateUtils';
import { requestPantryReplenishment } from '../hooks/usePantryReplenishment';

interface Props {
  show: boolean;
  onHide: () => void;
  recipeId: number;
  mealPlanDate: string;
  mealType?: MealType | null;
  /** Required to reconcile reservations belonging to a particular planned meal. */
  mealPlanId?: number;
}

function RatingHearts({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="d-flex gap-3" role="group" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(value === n ? null : n)}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            fontSize: '1.75rem',
            color: value !== null && n <= value ? '#dc3545' : '#adb5bd',
            lineHeight: 1,
          }}
          aria-label={`${n} heart${n !== 1 ? 's' : ''}${value === n ? ' (click to clear)' : ''}`}
          aria-pressed={value !== null && n <= value}
        >
          {value !== null && n <= value ? <HeartFill /> : <Heart />}
        </button>
      ))}
    </div>
  );
}


interface PantryAllocation {
  entry: ShoppingListEntry;
  batch: PantryInventoryEntry | null;
  amount: number;
}

/**
 * No stock is deducted simply because a meal was planned or a cook log exists.
 * This dialog explicitly confirms each batch and quantity on completion.
 */
export function CookLogModal({
  show,
  onHide,
  recipeId,
  mealPlanDate,
  mealType,
  mealPlanId,
}: Props) {
  const qc = useQueryClient();
  const [rating, setRating] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [batchChoices, setBatchChoices] = useState<Record<number, string>>({});
  const [usedAmounts, setUsedAmounts] = useState<Record<number, string>>({});
  const [replenishChoices, setReplenishChoices] = useState<Record<number, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cookCreated = useRef(false);
  const stockApplied = useRef(new Set<number>());
  const createCookLog = useCreateCookLog();
  const updateReservation = useSetPantryReservation();
  const shopping = usePantryReservations(mealPlanId != null);
  const reservations = mealPlanId == null
    ? []
    : shopping.reservations.filter((entry) => reservationMealPlanId(entry) === mealPlanId);
  const pantry = usePantryInventory(reservations.length > 0);
  const cookedQuery = useCookLog(mealPlanDate, mealPlanDate);
  const cookedByDate = cookedQuery.data;
  const hasPersonalToken = Boolean(localStorage.getItem('tandoor_token'));
  const today = formatDate(new Date());
  const alreadyLogged = isCookedOnDate(cookedByDate, recipeId, mealPlanDate);
  const isLoadingPantry =
    (mealPlanId != null && shopping.isLoading) ||
    (reservations.length > 0 && pantry.isLoading) ||
    (mealPlanId != null && cookedQuery.isLoading);
  const pantryUnavailable =
    (mealPlanId != null && (shopping.isError || cookedQuery.isError)) ||
    (reservations.length > 0 && pantry.isError);

  function compatibleBatches(entry: ShoppingListEntry) {
    return entry.food
      ? usablePantryBatches(pantry.data ?? [], entry.food.id, today).filter(
          (batch) => (batch.unit?.id ?? null) === (entry.unit?.id ?? null),
        )
      : [];
  }

  function getAllocation(entry: ShoppingListEntry): PantryAllocation {
    const batches = compatibleBatches(entry);
    const selected = batches.find((batch) => String(batch.id) === batchChoices[entry.id]) ?? batches[0] ?? null;
    // A missing shopping-list amount must be entered explicitly; never guess how much was used.
    const suggested = selected && Number(entry.amount) > 0
      ? Math.min(Number(entry.amount), Number(selected.amount))
      : 0;
    return {
      entry,
      batch: selected,
      amount: Number(usedAmounts[entry.id] ?? String(suggested)),
    };
  }

  function close(force = false) {
    // If stock was already changed but the shopping update failed, keep the
    // dialog open so retrying cannot accidentally deduct the same batch twice.
    if (!force && (saving || stockApplied.current.size > 0)) return;
    setRating(null);
    setNotes('');
    setBatchChoices({});
    setUsedAmounts({});
    setReplenishChoices({});
    setError(null);
    createCookLog.reset();
    onHide();
  }

  async function submit() {
    if (!hasPersonalToken || saving || isLoadingPantry || pantryUnavailable) return;
    setSaving(true);
    setError(null);
    try {
      const allocations = reservations.map(getAllocation);
      const totals = new Map<number, number>();
      for (const { batch, amount } of allocations) {
        if (!Number.isFinite(amount) || amount < 0) {
          throw new Error('Enter a valid non-negative amount for each pantry ingredient.');
        }
        if (amount > 0 && !batch) {
          throw new Error('Choose a matching pantry batch and unit, or set the amount used to zero.');
        }
        if (batch) totals.set(batch.id, (totals.get(batch.id) ?? 0) + amount);
      }
      for (const { batch } of allocations) {
        if (batch && (totals.get(batch.id) ?? 0) > Number(batch.amount)) {
          throw new Error('The reserved amounts exceed stock in a selected batch.');
        }
      }

      // Create the cook log once, even if a later inventory update needs retrying.
      if (!cookCreated.current && !alreadyLogged) {
        await createCookLog.mutateAsync({
          recipe: recipeId,
          rating: rating ?? null,
          comment: notes.trim() || null,
          created_at: buildCookLogTimestamp(mealPlanDate, mealType),
        });
        cookCreated.current = true;
      }

      for (const { entry, batch, amount } of allocations) {
        if (amount > 0 && batch && !stockApplied.current.has(entry.id)) {
          const current = await apiGet<PantryInventoryEntry>(`/inventory-entry/${batch.id}/`);
          const available = Number(current.amount);
          if (available < amount) {
            throw new Error(`Not enough stock remains for ${entry.food?.name ?? 'an ingredient'}.`);
          }
          await apiPatch<PantryInventoryEntry>(`/inventory-entry/${batch.id}/`, {
            amount: available - amount,
          });
          stockApplied.current.add(entry.id);
        }
        // Creating the replacement is optional and happens only after real use.
        // The helper refuses duplicates already awaiting purchase.
        if (amount > 0 && entry.food && replenishChoices[entry.id]) {
          await requestPantryReplenishment(entry.food, entry.unit ?? null, amount);
        }
        // A consumed pantry ingredient was supplied by the cupboard, not bought.
        // Mark it complete so it stops counting as an outstanding purchase.
        await updateReservation.mutateAsync({
          entries: [entry],
          reserved: false,
          completed: amount > 0,
        });
        stockApplied.current.delete(entry.id);
      }
      invalidateCacheQueries(qc, 'pantry-inventory', 'shopping-list', 'cook-log');
      close(true);
    } catch (err) {
      setError(
        (err instanceof Error ? err.message : 'Could not complete the pantry update.') +
          (stockApplied.current.size > 0
            ? ' Some pantry stock was already updated. Retry here to finish; do not close or refresh.'
            : ''),
      );
    } finally {
      setSaving(false);
    }
  }

  async function didNotCook() {
    if (!hasPersonalToken || saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateReservation.mutateAsync({ entries: reservations, reserved: false });
      invalidateCacheQueries(qc, 'shopping-list');
      close(true);
    } catch {
      setError('Could not release the pantry reservations.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal show={show} onHide={close} centered>
      <Modal.Header closeButton>
        <Modal.Title className="fs-6">
          {alreadyLogged && reservations.length > 0 ? 'Confirm pantry use' : 'Log Cook'}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {(error || createCookLog.isError) && (
          <Alert variant="danger" className="py-2 px-3 mb-3 small">
            {error ?? 'Failed to save cook log. Please try again.'}
          </Alert>
        )}
        {pantryUnavailable && (
          <Alert variant="warning">Pantry data is unavailable. The cook log has not been saved.</Alert>
        )}
        {!alreadyLogged && (
          <>
            <Form.Group className="mb-4">
              <Form.Label className="fw-semibold mb-2">Rating</Form.Label>
              <RatingHearts value={rating} onChange={setRating} />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Notes</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="How did it go? Any tweaks for next time?"
              />
            </Form.Group>
          </>
        )}
        {reservations.length > 0 && (
          <section aria-label="Confirm pantry use">
            <h3 className="h6">Confirm pantry use</h3>
            <p className="small text-muted">
              Set the amount actually used, or zero if you did not use it.
              Stock is only deducted when you save.
            </p>
            {reservations.map((entry) => {
              const batches = compatibleBatches(entry);
              const selected = getAllocation(entry);
              return (
                <div key={entry.id} className="border rounded p-2 mb-2">
                  <div className="fw-semibold mb-2">{entry.food?.name ?? 'Ingredient'}</div>
                  {batches.length === 0 && (
                    <Alert variant="warning" className="small py-1">
                      No usable batch with the same unit. Set amount to zero or correct the pantry entry.
                    </Alert>
                  )}
                  <Form.Group className="mb-2">
                    <Form.Label className="small">Pantry batch</Form.Label>
                    <Form.Select
                      value={selected.batch?.id ?? ''}
                      disabled={batches.length === 0 || saving}
                      onChange={(event) => setBatchChoices((previous) => ({
                        ...previous,
                        [entry.id]: event.target.value,
                      }))}
                    >
                      {batches.map((batch) => (
                        <option key={batch.id} value={batch.id}>
                          {batch.inventory_location.name} · {batch.amount} {batch.unit?.name ?? ''}
                          {batch.expires ? ` · expires ${batch.expires}` : ''}
                        </option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                  <Form.Group>
                    <Form.Label className="small">
                      Amount used {entry.unit?.name ? `(${entry.unit.name})` : ''}
                    </Form.Label>
                    <Form.Control
                      type="number"
                      min={0}
                      max={selected.batch ? Number(selected.batch.amount) : undefined}
                      step="any"
                      disabled={saving}
                      value={usedAmounts[entry.id] ?? String(selected.amount)}
                      onChange={(event) =>
                        setUsedAmounts((previous) => ({ ...previous, [entry.id]: event.target.value }))
                      }
                    />
                  </Form.Group>
                  {selected.amount > 0 && selected.batch && (
                    <Form.Check
                      className="mt-3"
                      type="checkbox"
                      id={`replenish-pantry-${entry.id}`}
                      label="Add a replacement to the shopping list?"
                      checked={replenishChoices[entry.id] ?? false}
                      disabled={saving}
                      onChange={(event) =>
                        setReplenishChoices((previous) => ({
                          ...previous,
                          [entry.id]: event.target.checked,
                        }))
                      }
                    />
                  )}
                </div>
              );
            })}
          </section>
        )}
        {isLoadingPantry && <Spinner size="sm" aria-label="Loading pantry reservations" />}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={() => close()} disabled={saving || stockApplied.current.size > 0}>
          Cancel
        </Button>
        {reservations.length > 0 && !alreadyLogged && (
          <Button variant="outline-secondary" onClick={didNotCook} disabled={saving || !hasPersonalToken}>
            Didn't cook this
          </Button>
        )}
        {!hasPersonalToken ? (
          <Alert variant="warning" className="mb-0 py-2 px-3">
            A personal API token is required.{' '}
            <Alert.Link as={Link} to="/settings" onClick={close}>Settings →</Alert.Link>
          </Alert>
        ) : (
          <Button
            variant="success"
            onClick={submit}
            disabled={saving || isLoadingPantry || pantryUnavailable}
          >
            {saving ? <Spinner size="sm" /> : reservations.length > 0 ? 'Confirm cook and pantry' : 'Save'}
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
}
