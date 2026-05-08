import { act, type RefCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { useDroppableMock } = vi.hoisted(() => ({
  useDroppableMock: vi.fn(),
}));

type ReactActGlobal = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

vi.mock('@dnd-kit/core', async () => {
  const actual = await vi.importActual<typeof import('@dnd-kit/core')>('@dnd-kit/core');
  return {
    ...actual,
    useDroppable: useDroppableMock,
  };
});

import { DroppableTableRow } from './DroppableTableRow';
import { useCompactMode, useOverflowState } from './MealPlanPage';

describe('DroppableTableRow', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const actGlobal = globalThis as ReactActGlobal;

  beforeEach(() => {
    actGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    useDroppableMock.mockReset();
    useDroppableMock.mockReturnValue({
      setNodeRef: vi.fn() as RefCallback<HTMLTableRowElement>,
      isOver: false,
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    delete actGlobal.IS_REACT_ACT_ENVIRONMENT;
  });

  it('adds the drop target class when hovered', () => {
    useDroppableMock.mockReturnValue({
      setNodeRef: vi.fn() as RefCallback<HTMLTableRowElement>,
      isOver: true,
    });

    act(() => {
      root.render(
        <table>
          <tbody>
            <DroppableTableRow dateKey="2026-05-07" className="base-row">
              <td>Meal</td>
            </DroppableTableRow>
          </tbody>
        </table>,
      );
    });

    expect(container.querySelector('tr')?.className).toBe('base-row meal-plan-row-drop-target');
  });

  it('leaves the base class unchanged when not hovered', () => {
    act(() => {
      root.render(
        <table>
          <tbody>
            <DroppableTableRow dateKey="2026-05-07" className="base-row">
              <td>Meal</td>
            </DroppableTableRow>
          </tbody>
        </table>,
      );
    });

    expect(container.querySelector('tr')?.className).toBe('base-row');
  });
});

describe('MealPlanPage hooks', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const actGlobal = globalThis as ReactActGlobal;
  const originalResizeObserver = globalThis.ResizeObserver;
  const observedElements: Element[] = [];
  const disconnectMock = vi.fn();

  class ResizeObserverMock {
    observe = vi.fn((element: Element) => {
      observedElements.push(element);
    });
    disconnect = disconnectMock;
    unobserve = vi.fn();
    constructor(_callback: ResizeObserverCallback) {}
  }

  function OverflowHarness() {
    const [setRef, isOverflowed] = useOverflowState<HTMLSpanElement>();
    return (
      <span ref={setRef} data-testid="overflow-target" data-overflowed={String(isOverflowed)}>
        test
      </span>
    );
  }

  function CompactHarness() {
    const [setRef, isCompact] = useCompactMode<HTMLDivElement>(360);
    return <div ref={setRef} data-testid="compact-target" data-compact={String(isCompact)} />;
  }

  beforeEach(() => {
    actGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    observedElements.length = 0;
    disconnectMock.mockReset();
    globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    delete actGlobal.IS_REACT_ACT_ENVIRONMENT;
    globalThis.ResizeObserver = originalResizeObserver;
  });

  it('updates overflow state when dimensions indicate clipping and cleans up observer', () => {
    act(() => {
      root.render(<OverflowHarness />);
    });

    const target = container.querySelector('[data-testid="overflow-target"]') as HTMLSpanElement;
    expect(target).toBeTruthy();
    let clientWidth = 120;
    let scrollWidth = 120;
    let clientHeight = 20;
    let scrollHeight = 20;
    Object.defineProperty(target, 'clientWidth', { configurable: true, get: () => clientWidth });
    Object.defineProperty(target, 'scrollWidth', { configurable: true, get: () => scrollWidth });
    Object.defineProperty(target, 'clientHeight', { configurable: true, get: () => clientHeight });
    Object.defineProperty(target, 'scrollHeight', { configurable: true, get: () => scrollHeight });

    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(target.getAttribute('data-overflowed')).toBe('false');

    scrollWidth = 240;
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(target.getAttribute('data-overflowed')).toBe('true');
    expect(observedElements).toContain(target);

    act(() => {
      root.render(<></>);
    });
    expect(disconnectMock).toHaveBeenCalled();
  });

  it('updates compact state when element width crosses breakpoint and cleans up observer', () => {
    act(() => {
      root.render(<CompactHarness />);
    });

    const target = container.querySelector('[data-testid="compact-target"]') as HTMLDivElement;
    expect(target).toBeTruthy();
    let width = 500;
    Object.defineProperty(target, 'clientWidth', { configurable: true, get: () => width });

    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(target.getAttribute('data-compact')).toBe('false');

    width = 320;
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(target.getAttribute('data-compact')).toBe('true');
    expect(observedElements).toContain(target);

    act(() => {
      root.render(<></>);
    });
    expect(disconnectMock).toHaveBeenCalled();
  });
});
