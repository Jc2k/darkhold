import { useRef, useState } from 'react';
import { Alert, Button, ListGroup, Offcanvas, Spinner } from 'react-bootstrap';
import { Trash3 } from 'react-bootstrap-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { apiPost, searchFoods } from '../api/client';
import { invalidateCacheQueries } from '../hooks/useCacheInvalidation';
import { AsyncTypeaheadFilter, type FilterOption } from './AsyncTypeaheadFilter';
import { NoTokenAlert } from './NoTokenAlert';
import { SpeechRecognitionButton } from './SpeechRecognitionButton';
import type { ShoppingListEntry } from '../hooks/useShoppingListEntries';

const SWIPE_THRESHOLD_PX = 60;
const SWIPE_ACTION_WIDTH_PX = 104;
const FULL_SWIPE_THRESHOLD_PX = SWIPE_ACTION_WIDTH_PX * 2;

type AdHocFood = {
  customOption: true;
  id: string;
  name: string;
};

type ShoppingRequestFood = FilterOption | AdHocFood;

function isAdHocFood(food: ShoppingRequestFood): food is AdHocFood {
  return 'customOption' in food && food.customOption;
}

export function isUpSwipe(deltaX: number, deltaY: number): boolean {
  return deltaY <= -SWIPE_THRESHOLD_PX && Math.abs(deltaY) > Math.abs(deltaX);
}

export function ShoppingRequestPanel() {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedFoods, setSelectedFoods] = useState<FilterOption[]>([]);
  const [pendingFoods, setPendingFoods] = useState<ShoppingRequestFood[]>([]);
  const [openSwipeFoodId, setOpenSwipeFoodId] = useState<number | string | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [requestError, setRequestError] = useState<string | null>(null);
  const handleSwipeStart = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const rowSwipeStart = useRef<{
    foodId: number | string;
    pointerId: number;
    x: number;
    y: number;
  } | null>(null);
  const hasPersonalToken = Boolean(localStorage.getItem('tandoor_token'));
  const isOpen = searchParams.get('add') === 'request';

  const closeSwipeAction = () => {
    setOpenSwipeFoodId(null);
    setSwipeOffset(0);
  };

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
    closeSwipeAction();
  };

  const addRequest = useMutation({
    mutationFn: (foods: ShoppingRequestFood[]) =>
      Promise.all(
        foods.map((food) =>
          apiPost<ShoppingListEntry>('/shopping-list-entry/', {
            food: isAdHocFood(food) ? { name: food.name } : food,
            amount: 1,
            unit: isAdHocFood(food) ? { name: 'g' } : null,
          }),
        ),
      ),
    onMutate: () => setRequestError(null),
    onSuccess: (createdEntries) => {
      setSelectedFoods([]);
      setPendingFoods([]);
      closeSwipeAction();
      qc.setQueryData<ShoppingListEntry[]>(['shopping-list'], (current) => [
        ...(current ?? []),
        ...createdEntries,
      ]);
      invalidateCacheQueries(qc, 'shopping-list');
    },
    onError: () => setRequestError('Failed to add item. Please try again.'),
  });

  const stageSelectedFoods = (foods: ShoppingRequestFood[]) => {
    const food = foods[0];
    if (food) {
      setPendingFoods((current) =>
        current.some((pendingFood) => pendingFood.id === food.id) ? current : [...current, food],
      );
    }
    setSelectedFoods([]);
  };

  const stageSpokenFood = (name: string) => {
    stageSelectedFoods([{ customOption: true, id: `speech-${name.toLocaleLowerCase()}`, name }]);
  };

  const removePendingFood = (foodId: number | string) => {
    setPendingFoods((current) => current.filter((food) => food.id !== foodId));
    closeSwipeAction();
  };

  return (
    <>
      <button
        type="button"
        className="shopping-list-request-handle"
        aria-label="Add shopping request"
        onClick={open}
        onPointerDown={(event) => {
          handleSwipeStart.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
          };
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerUp={(event) => {
          const start = handleSwipeStart.current;
          handleSwipeStart.current = null;
          if (!start || start.pointerId !== event.pointerId) return;
          if (isUpSwipe(event.clientX - start.x, event.clientY - start.y)) open();
        }}
        onPointerCancel={() => {
          handleSwipeStart.current = null;
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
              onChange={stageSelectedFoods}
              placeholder="Search foods…"
              multiple={false}
              disabled={!hasPersonalToken || addRequest.isPending}
              allowNew
            />
            <SpeechRecognitionButton
              disabled={!hasPersonalToken || addRequest.isPending}
              onResult={stageSpokenFood}
            />
            {pendingFoods.length > 0 && (
              <ListGroup className="mb-3">
                {pendingFoods.map((food) => {
                  const isOpen = openSwipeFoodId === food.id;
                  return (
                    <ListGroup.Item
                      key={food.id}
                      className="shopping-list-swipe-shell shopping-request-swipe-item p-0"
                    >
                      <Button
                        type="button"
                        variant="danger"
                        className={`shopping-list-swipe-action shopping-list-swipe-action-check rounded-0${
                          isOpen && swipeOffset <= -FULL_SWIPE_THRESHOLD_PX
                            ? ' shopping-list-swipe-action-ready'
                            : ''
                        }`}
                        style={{ width: Math.max(-swipeOffset, SWIPE_ACTION_WIDTH_PX) }}
                        onClick={() => removePendingFood(food.id)}
                        disabled={addRequest.isPending}
                        aria-label={`Remove ${food.name}`}
                        tabIndex={isOpen && swipeOffset < 0 ? 0 : -1}
                      >
                        <Trash3 aria-hidden="true" />
                        <span>Delete</span>
                      </Button>
                      <div
                        className="shopping-list-swipe-content d-flex align-items-center justify-content-between gap-2 py-2 px-3"
                        style={{ transform: `translateX(${isOpen ? swipeOffset : 0}px)` }}
                        onPointerDown={(event) => {
                          if (
                            event.target instanceof Element &&
                            event.target.closest('a, button')
                          ) {
                            return;
                          }
                          if (event.pointerType === 'mouse' && event.button !== 0) return;
                          rowSwipeStart.current = {
                            foodId: food.id,
                            pointerId: event.pointerId,
                            x: event.clientX,
                            y: event.clientY,
                          };
                          event.currentTarget.setPointerCapture?.(event.pointerId);
                        }}
                        onPointerMove={(event) => {
                          const start = rowSwipeStart.current;
                          if (start?.foodId !== food.id || start.pointerId !== event.pointerId)
                            return;
                          const deltaX = Math.min(0, event.clientX - start.x);
                          const deltaY = event.clientY - start.y;
                          if (Math.abs(deltaX) <= Math.abs(deltaY)) return;
                          setOpenSwipeFoodId(food.id);
                          setSwipeOffset(deltaX);
                        }}
                        onPointerUp={(event) => {
                          const start = rowSwipeStart.current;
                          rowSwipeStart.current = null;
                          if (start?.foodId !== food.id || start.pointerId !== event.pointerId)
                            return;
                          const deltaX = event.clientX - start.x;
                          const deltaY = event.clientY - start.y;
                          if (
                            deltaX <= -FULL_SWIPE_THRESHOLD_PX &&
                            Math.abs(deltaX) > Math.abs(deltaY)
                          ) {
                            removePendingFood(food.id);
                          } else if (
                            deltaX <= -SWIPE_THRESHOLD_PX &&
                            Math.abs(deltaX) > Math.abs(deltaY)
                          ) {
                            setOpenSwipeFoodId(food.id);
                            setSwipeOffset(-SWIPE_ACTION_WIDTH_PX);
                          } else {
                            closeSwipeAction();
                          }
                        }}
                        onPointerCancel={() => {
                          rowSwipeStart.current = null;
                          closeSwipeAction();
                        }}
                      >
                        <span>{food.name}</span>
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          className="shopping-request-row-delete"
                          aria-label={`Remove ${food.name}`}
                          onClick={() => removePendingFood(food.id)}
                          disabled={addRequest.isPending}
                        >
                          <Trash3 size={14} aria-hidden="true" />
                        </Button>
                      </div>
                    </ListGroup.Item>
                  );
                })}
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
