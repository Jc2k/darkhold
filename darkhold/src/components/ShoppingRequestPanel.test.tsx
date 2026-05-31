import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { apiPostMock, mutateMock, useMutationMock, invalidateQueriesMock } = vi.hoisted(() => ({
  apiPostMock: vi.fn(),
  mutateMock: vi.fn(),
  useMutationMock: vi.fn(),
  invalidateQueriesMock: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: useMutationMock,
  useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }),
}));

vi.mock('../api/client', () => ({
  apiPost: apiPostMock,
  searchFoods: vi.fn(),
}));

vi.mock('../hooks/useInvalidationSocket', () => ({
  broadcastInvalidation: vi.fn(),
}));

vi.mock('./NoTokenAlert', () => ({
  NoTokenAlert: () => <div>no-token</div>,
}));

import { isUpSwipe, ShoppingRequestPanel } from './ShoppingRequestPanel';

type ReactActGlobal = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

describe('ShoppingRequestPanel', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const actGlobal = globalThis as ReactActGlobal;

  beforeEach(() => {
    actGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    localStorage.setItem('tandoor_token', 'test-token');
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }));
    useMutationMock.mockImplementation((options) => ({
      mutate: mutateMock,
      isPending: false,
      options,
    }));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    localStorage.clear();
    delete actGlobal.IS_REACT_ACT_ENVIRONMENT;
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('detects upward swipes beyond the movement threshold', () => {
    expect(isUpSwipe(5, -60)).toBe(true);
    expect(isUpSwipe(5, -59)).toBe(false);
    expect(isUpSwipe(100, -80)).toBe(false);
    expect(isUpSwipe(5, 80)).toBe(false);
  });

  it('posts a nested food with a default amount', async () => {
    apiPostMock.mockResolvedValueOnce({});
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/?add=request']}>
          <ShoppingRequestPanel />
        </MemoryRouter>,
      );
    });

    const addRequestMutation = useMutationMock.mock.calls[0][0] as {
      mutationFn: (food: { id: number; name: string }) => Promise<unknown>;
    };
    await addRequestMutation.mutationFn({ id: 12, name: 'Tomatoes' });

    expect(apiPostMock).toHaveBeenCalledWith('/shopping-list-entry/', {
      food: { id: 12, name: 'Tomatoes' },
      amount: 1,
      unit: null,
    });
    expect(document.body.textContent).toContain('You can adjust the amount while shopping');
  });

  it('renders an unlabelled iOS-style handle with an accessible name', () => {
    act(() => {
      root.render(
        <MemoryRouter>
          <ShoppingRequestPanel />
        </MemoryRouter>,
      );
    });

    const handle = container.querySelector<HTMLButtonElement>('.shopping-list-request-handle');
    expect(handle?.getAttribute('aria-label')).toBe('Swipe up or tap to add a shopping request');
    expect(handle?.textContent).toBe('');
    expect(handle?.querySelector('.shopping-list-request-handle-bar')).toBeTruthy();
  });
});
