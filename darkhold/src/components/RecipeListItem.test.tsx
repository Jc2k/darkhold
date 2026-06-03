import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Recipe } from '../api/tandoor-types';

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('./RecipeCardInfoModal', () => ({
  RecipeCardInfoModal: ({ show }: { show: boolean }) =>
    show ? <div data-testid="recipe-list-info-modal" /> : null,
}));

vi.mock('./UpSoonButton', () => ({
  UpSoonButton: () => <button aria-label="Add to Up Soon" />,
}));

import { RecipeListItem } from './RecipeListItem';

type ReactActGlobal = typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

const recipeFixture: Recipe = { id: 1, name: 'Test Recipe', created_by: 1, cooking_time: 20 };

function dispatchTouchPointer(element: Element, type: string, x = 0, y = 0) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, {
    pointerType: { value: 'touch' },
    pointerId: { value: 1 },
    clientX: { value: x },
    clientY: { value: y },
  });
  element.dispatchEvent(event);
}

describe('RecipeListItem', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let addToMealPlan: ReturnType<typeof vi.fn<(recipe: Recipe) => void>>;
  const actGlobal = globalThis as ReactActGlobal;

  beforeEach(() => {
    actGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    addToMealPlan = vi.fn<(recipe: Recipe) => void>();
    act(() =>
      root.render(<RecipeListItem recipe={recipeFixture} onAddToMealPlan={addToMealPlan} />),
    );
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    navigateMock.mockReset();
    vi.useRealTimers();
    delete actGlobal.IS_REACT_ACT_ENVIRONMENT;
  });

  it('keeps desktop buttons in the hover action container', () => {
    const actions = container.querySelector('.recipe-list-row-actions');
    expect(actions?.querySelector('button[aria-label="Add to meal plan"]')).not.toBeNull();
    expect(actions?.querySelector('button[aria-label="Add to Up Soon"]')).not.toBeNull();
  });

  it('reveals icon-only actions when swiped left', () => {
    const content = container.querySelector('.recipe-list-swipe-content')!;
    act(() => {
      dispatchTouchPointer(content, 'pointerdown', 140, 10);
      dispatchTouchPointer(content, 'pointermove', 40, 12);
      dispatchTouchPointer(content, 'pointerup', 40, 12);
    });

    expect((content as HTMLDivElement).style.transform).toBe('translateX(-104px)');
    expect(container.querySelector('.recipe-list-swipe-actions')?.textContent).toBe('');
  });

  it('opens the meal-plan modal action after a full left swipe', () => {
    const content = container.querySelector('.recipe-list-swipe-content')!;
    act(() => {
      dispatchTouchPointer(content, 'pointerdown', 280, 10);
      dispatchTouchPointer(content, 'pointermove', 40, 12);
      dispatchTouchPointer(content, 'pointerup', 40, 12);
    });

    expect(addToMealPlan).toHaveBeenCalledWith(recipeFixture);
    expect((content as HTMLDivElement).style.transform).toBe('translateX(0px)');
  });

  it('continues dragging from the revealed swipe offset instead of snapping back', () => {
    const content = container.querySelector('.recipe-list-swipe-content')!;
    act(() => {
      dispatchTouchPointer(content, 'pointerdown', 140, 10);
      dispatchTouchPointer(content, 'pointermove', 40, 12);
      dispatchTouchPointer(content, 'pointerup', 40, 12);
    });

    expect((content as HTMLDivElement).style.transform).toBe('translateX(-104px)');

    act(() => {
      dispatchTouchPointer(content, 'pointerdown', 140, 10);
      dispatchTouchPointer(content, 'pointermove', 110, 12);
    });

    expect(content.classList.contains('recipe-list-swipe-content-dragging')).toBe(true);
    expect((content as HTMLDivElement).style.transform).toBe('translateX(-134px)');

    act(() => {
      dispatchTouchPointer(content, 'pointerup', 110, 12);
    });

    expect((content as HTMLDivElement).style.transform).toBe('translateX(-104px)');
  });

  it('closes a revealed swipe action when dragged back to the right', () => {
    const content = container.querySelector('.recipe-list-swipe-content')!;
    act(() => {
      dispatchTouchPointer(content, 'pointerdown', 140, 10);
      dispatchTouchPointer(content, 'pointermove', 40, 12);
      dispatchTouchPointer(content, 'pointerup', 40, 12);
    });

    act(() => {
      dispatchTouchPointer(content, 'pointerdown', 40, 10);
      dispatchTouchPointer(content, 'pointermove', 140, 12);
      dispatchTouchPointer(content, 'pointerup', 140, 12);
    });

    expect((content as HTMLDivElement).style.transform).toBe('translateX(0px)');
  });

  it('opens recipe-card decision information after a touch long press', () => {
    vi.useFakeTimers();
    const content = container.querySelector('.recipe-list-swipe-content')!;
    act(() => {
      dispatchTouchPointer(content, 'pointerdown');
      vi.advanceTimersByTime(500);
    });

    expect(container.querySelector('[data-testid="recipe-list-info-modal"]')).not.toBeNull();
  });
});
