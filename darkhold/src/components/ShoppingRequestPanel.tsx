import { useRef, useState } from 'react';
import { Alert, Button, ListGroup, Offcanvas, Spinner } from 'react-bootstrap';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { apiPost, searchFoods } from '../api/client';
import { broadcastInvalidation } from '../hooks/useInvalidationSocket';
import { AsyncTypeaheadFilter, type FilterOption } from './AsyncTypeaheadFilter';
import { NoTokenAlert } from './NoTokenAlert';
import type { ShoppingListEntry } from '../hooks/useShoppingListEntries';

const SWIPE_THRESHOLD_PX = 60;

export function isUpSwipe(deltaX: number, deltaY: number): boolean {
  return deltaY <= -SWIPE_THRESHOLD_PX && Math.abs(deltaY) > Math.abs(deltaX);
}

export function ShoppingRequestPanel() {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedFoods, setSelectedFoods] = useState<FilterOption[]>([]);
  const [pendingFoods, setPendingFoods] = useState<FilterOption[]>([]);
  const [requestError, setRequestError] = useState<string | null>(null);
  const swipeStart = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const hasPersonalToken = Boolean(localStorage.getItem('tandoor_token'));
  const isOpen = searchParams.get('add') === 'request';

  const open = () => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('add', 'request');
      return next;
    });
  };

  const close = () => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('add');
      return next;
    });
    setSelectedFoods([]);
    setPendingFoods([]);
    setRequestError(null);
  };

  const addRequest = useMutation({
    mutationFn: (foods: FilterOption[]) =>
      Promise.all(
        foods.map((food) =>
          apiPost<ShoppingListEntry>('/shopping-list-entry/', { food, amount: 1, unit: null }),
        ),
      ),
    onMutate: () => setRequestError(null),
    onSuccess: (createdEntries) => {
      setSelectedFoods([]);
      setPendingFoods([]);
      qc.setQueryData<ShoppingListEntry[]>(['shopping-list'], (current) => [
        ...(current ?? []),
        ...createdEntries,
      ]);
      qc.invalidateQueries({ queryKey: ['shopping-list'] });
      broadcastInvalidation('shopping-list');
    },
    onError: () => setRequestError('Failed to add item. Please try again.'),
  });

  const addSelectedFood = () => {
    const food = selectedFoods[0];
    if (!food) return;
    setPendingFoods((current) =>
      current.some((pendingFood) => pendingFood.id === food.id) ? current : [...current, food],
    );
    setSelectedFoods([]);
  };

  const removePendingFood = (foodId: number) => {
    setPendingFoods((current) => current.filter((food) => food.id !== foodId));
  };

  return (
    <>
      <button
        type="button"
        className="shopping-list-request-handle"
        aria-label="Swipe up or tap to add a shopping request"
        onClick={open}
        onPointerDown={(event) => {
          swipeStart.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
          };
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerUp={(event) => {
          const start = swipeStart.current;
          swipeStart.current = null;
          if (!start || start.pointerId !== event.pointerId) return;
          if (isUpSwipe(event.clientX - start.x, event.clientY - start.y)) open();
        }}
        onPointerCancel={() => {
          swipeStart.current = null;
        }}
      >
        <span className="shopping-list-request-handle-bar" aria-hidden="true" />
      </button>
      {isOpen && (
        <Offcanvas show onHide={close} placement="bottom" className="shopping-list-request-panel">
          <Offcanvas.Header closeButton>
            <Offcanvas.Title>Add shopping request</Offcanvas.Title>
          </Offcanvas.Header>
          <Offcanvas.Body>
            {!hasPersonalToken && <NoTokenAlert />}
            {requestError && <Alert variant="danger">{requestError}</Alert>}
            <AsyncTypeaheadFilter
              id="shopping-list-request-food"
              label="Food"
              selected={selectedFoods}
              onSearch={searchFoods}
              onChange={setSelectedFoods}
              onRemove={() => setSelectedFoods([])}
              placeholder="Search foods…"
              multiple={false}
              disabled={!hasPersonalToken || addRequest.isPending}
              removeLabel="Clear selected food"
            />
            <Button
              type="button"
              variant="outline-primary"
              size="sm"
              className="mb-3"
              onClick={addSelectedFood}
              disabled={!hasPersonalToken || addRequest.isPending || selectedFoods.length === 0}
            >
              Add
            </Button>
            {pendingFoods.length > 0 && (
              <ListGroup className="mb-3">
                {pendingFoods.map((food) => (
                  <ListGroup.Item
                    key={food.id}
                    className="d-flex align-items-center justify-content-between gap-2"
                  >
                    <span>{food.name}</span>
                    <Button
                      type="button"
                      variant="outline-secondary"
                      size="sm"
                      aria-label={`Remove ${food.name}`}
                      onClick={() => removePendingFood(food.id)}
                      disabled={addRequest.isPending}
                    >
                      ×
                    </Button>
                  </ListGroup.Item>
                ))}
              </ListGroup>
            )}
            <Button
              type="button"
              variant="primary"
              onClick={() => addRequest.mutate(pendingFoods)}
              disabled={!hasPersonalToken || addRequest.isPending || pendingFoods.length === 0}
            >
              {addRequest.isPending ? (
                <>
                  <Spinner animation="border" size="sm" className="me-2" />
                  Adding requests…
                </>
              ) : (
                'Submit requests'
              )}
            </Button>
          </Offcanvas.Body>
        </Offcanvas>
      )}
    </>
  );
}
