import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Recipe } from '../api/tandoor-types';

const { navigateMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('./RecipeCardInfoModal', () => ({
  RecipeCardInfoModal: ({ show }: { show: boolean }) =>
    show ? <div data-testid="recipe-card-info-modal" /> : null,
}));

vi.mock('./UpSoonButton', () => ({
  UpSoonButton: ({ style }: { style?: React.CSSProperties }) => (
    <div data-testid="up-soon-button" style={style} />
  ),
}));

import { RecipeCard } from './RecipeCard';

type ReactActGlobal = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

const recipeFixture: Recipe = {
  id: 1,
  name: 'Test Recipe',
  created_by: 1,
  keywords: [],
  image: null,
  rating: null,
};

function dispatchTouchPointer(
  element: Element,
  type: string,
  options: { x?: number; y?: number } = {},
) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, {
    pointerType: { value: 'touch' },
    pointerId: { value: 1 },
    clientX: { value: options.x ?? 0 },
    clientY: { value: options.y ?? 0 },
  });
  element.dispatchEvent(event);
}

function renderRecipeCard(root: ReturnType<typeof createRoot>, imageOverlayAction?: ReactNode) {
  act(() => {
    root.render(
      <RecipeCard
        recipe={recipeFixture}
        onAddToMealPlan={vi.fn()}
        imageOverlayAction={imageOverlayAction}
      />,
    );
  });
}

describe('RecipeCard', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const actGlobal = globalThis as ReactActGlobal;

  beforeEach(() => {
    actGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
    delete actGlobal.IS_REACT_ACT_ENVIRONMENT;
  });

  it('renders image overlay action when provided', () => {
    renderRecipeCard(root, <button data-testid="overlay-action">Overlay action</button>);
    expect(container.querySelector('[data-testid="overlay-action"]')).not.toBeNull();
  });

  it('does not render image overlay action when not provided', () => {
    renderRecipeCard(root);
    expect(container.querySelector('[data-testid="overlay-action"]')).toBeNull();
  });

  it('opens decision information after a touch long press', () => {
    vi.useFakeTimers();
    renderRecipeCard(root);
    const card = container.querySelector('.recipe-card')!;

    act(() => {
      dispatchTouchPointer(card, 'pointerdown');
      vi.advanceTimersByTime(500);
    });

    expect(container.querySelector('[data-testid="recipe-card-info-modal"]')).not.toBeNull();
  });
});
