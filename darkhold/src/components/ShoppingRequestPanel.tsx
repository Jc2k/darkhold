import { useRef, useState } from 'react';
import { Alert, Offcanvas, Spinner } from 'react-bootstrap';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { apiPost, searchFoods } from '../api/client';
import { broadcastInvalidation } from '../hooks/useInvalidationSocket';
import { AsyncTypeaheadFilter, type FilterOption } from './AsyncTypeaheadFilter';
import { NoTokenAlert } from './NoTokenAlert';

const SWIPE_THRESHOLD_PX = 60;

export function isUpSwipe(deltaX: number, deltaY: number): boolean {
  return deltaY <= -SWIPE_THRESHOLD_PX && Math.abs(deltaY) > Math.abs(deltaX);
}

export function ShoppingRequestPanel() {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedFoods, setSelectedFoods] = useState<FilterOption[]>([]);
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
    setRequestError(null);
  };

  const addRequest = useMutation({
    mutationFn: (food: FilterOption) =>
      apiPost('/shopping-list-entry/', { food, amount: 1, unit: null }),
    onMutate: () => setRequestError(null),
    onSuccess: () => {
      setSelectedFoods([]);
      qc.invalidateQueries({ queryKey: ['shopping-list'] });
      broadcastInvalidation('shopping-list');
    },
    onError: () => setRequestError('Failed to add item. Please try again.'),
  });

  const selectFood = (foods: FilterOption[]) => {
    const food = foods[0];
    setSelectedFoods(food ? [food] : []);
    if (food) addRequest.mutate(food);
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
            <p className="text-muted small">
              Search for a food to add it directly to your shopping list. You can adjust the amount
              while shopping.
            </p>
            {!hasPersonalToken && <NoTokenAlert />}
            {requestError && <Alert variant="danger">{requestError}</Alert>}
            <AsyncTypeaheadFilter
              id="shopping-list-request-food"
              label="Food"
              selected={selectedFoods}
              onSearch={searchFoods}
              onChange={selectFood}
              onRemove={close}
              placeholder="Search foods…"
              multiple={false}
              disabled={!hasPersonalToken || addRequest.isPending}
              removeLabel="Close food search"
            />
            {addRequest.isPending && (
              <div className="text-muted small d-flex align-items-center gap-2">
                <Spinner animation="border" size="sm" /> Adding request…
              </div>
            )}
          </Offcanvas.Body>
        </Offcanvas>
      )}
    </>
  );
}
