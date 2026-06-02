import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  apiPostMock,
  mutateMock,
  useMutationMock,
  invalidateQueriesMock,
  setQueryDataMock,
  broadcastInvalidationMock,
} = vi.hoisted(() => ({
  apiPostMock: vi.fn(),
  mutateMock: vi.fn(),
  useMutationMock: vi.fn(),
  invalidateQueriesMock: vi.fn(),
  setQueryDataMock: vi.fn(),
  broadcastInvalidationMock: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: useMutationMock,
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
    setQueryData: setQueryDataMock,
  }),
}));

vi.mock('../api/client', () => ({
  apiPost: apiPostMock,
  searchFoods: vi.fn(),
}));

vi.mock('../hooks/useInvalidationSocket', () => ({
  broadcastInvalidation: broadcastInvalidationMock,
}));

vi.mock('./NoTokenAlert', () => ({
  NoTokenAlert: () => <div>no-token</div>,
}));

vi.mock('./SpeechRecognitionButton', () => ({
  SpeechRecognitionButton: ({
    onResult,
    onErrorChange,
    onInterimResultChange,
  }: {
    onResult: (transcript: string) => void;
    onErrorChange?: (error: string | null) => void;
    onInterimResultChange?: (transcript: string | null) => void;
  }) => (
    <>
      <button type="button" onClick={() => onResult('Milk')}>
        Speak milk
      </button>
      <button type="button" onClick={() => onErrorChange?.('Mock speech error')}>
        Trigger speech error
      </button>
      <button type="button" onClick={() => onInterimResultChange?.('hot')}>
        Speak partial hot
      </button>
    </>
  ),
}));

vi.mock('./AsyncTypeaheadFilter', () => ({
  AsyncTypeaheadFilter: ({
    allowNew,
    onChange,
    placeholder,
  }: {
    allowNew?: boolean;
    placeholder?: string;
    onChange: (foods: Array<{ id: number | string; name: string; customOption?: true }>) => void;
  }) => (
    <>
      <span>{allowNew ? 'New foods enabled' : 'New foods disabled'}</span>
      <span>Placeholder: {placeholder}</span>
      <button type="button" onClick={() => onChange([{ id: 12, name: 'Tomatoes' }])}>
        Select tomatoes
      </button>
      <button
        type="button"
        onClick={() => onChange([{ id: 'new-id-1', name: 'Kitchen roll', customOption: true }])}
      >
        Add kitchen roll
      </button>
    </>
  ),
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
    vi.useFakeTimers();
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
    act(() => {
      root.unmount();
      vi.runOnlyPendingTimers();
    });
    vi.useRealTimers();
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

  it('posts multiple nested foods with default amounts on submit', async () => {
    apiPostMock.mockResolvedValueOnce({});
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/?add=request']}>
          <ShoppingRequestPanel />
        </MemoryRouter>,
      );
    });

    const addRequestMutation = useMutationMock.mock.calls[0][0] as {
      mutationFn: (foods: { id: number; name: string }[]) => Promise<unknown>;
    };
    await addRequestMutation.mutationFn([
      { id: 12, name: 'Tomatoes' },
      { id: 13, name: 'Carrots' },
    ]);

    expect(apiPostMock).toHaveBeenCalledWith('/shopping-list-entry/', {
      food: { id: 12, name: 'Tomatoes' },
      amount: 1,
      unit: null,
    });
    expect(apiPostMock).toHaveBeenCalledWith('/shopping-list-entry/', {
      food: { id: 13, name: 'Carrots' },
      amount: 1,
      unit: null,
    });
    expect(document.body.textContent).not.toContain('You can adjust the amount while shopping');
  });

  it('parses and posts ad-hoc foods via ingredient parser', async () => {
    apiPostMock
      .mockResolvedValueOnce({
        ingredient: {
          food: { id: 998, name: 'Kitchen roll' },
          unit: {
            id: 13,
            name: 'g',
            plural_name: 'g',
            description: null,
            base_unit: 'g',
            open_data_slug: 'unit-g',
          },
          amount: 100,
          note: '',
        },
      })
      .mockResolvedValueOnce({});
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/?add=request']}>
          <ShoppingRequestPanel />
        </MemoryRouter>,
      );
    });

    expect(document.body.textContent).toContain('New foods enabled');
    const addRequestMutation = useMutationMock.mock.calls[0][0] as {
      mutationFn: (
        foods: Array<{ id: string; name: string; customOption: true }>,
      ) => Promise<unknown>;
    };
    await addRequestMutation.mutationFn([
      { id: 'new-id-1', name: 'Kitchen roll', customOption: true },
    ]);

    expect(apiPostMock).toHaveBeenNthCalledWith(1, '/ingredient-parser/post/', {
      ingredient: 'Kitchen roll',
    });
    expect(apiPostMock).toHaveBeenNthCalledWith(2, '/shopping-list-entry/', {
      food: { id: 998, name: 'Kitchen roll' },
      amount: 100,
      unit: {
        id: 13,
        name: 'g',
        plural_name: 'g',
        description: null,
        base_unit: 'g',
        open_data_slug: 'unit-g',
      },
      note: '',
    });
  });

  it('appends created entries to the local cache and broadcasts an invalidation', () => {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/?add=request']}>
          <ShoppingRequestPanel />
        </MemoryRouter>,
      );
    });

    const addRequestMutation = useMutationMock.mock.calls[0][0] as {
      onSuccess: (
        entries: { id: number; food: { id: number; name: string }; checked: boolean }[],
      ) => void;
    };
    const existingEntry = { id: 1, food: { id: 11, name: 'Milk' }, checked: false };
    const createdEntry = { id: 2, food: { id: 12, name: 'Tomatoes' }, checked: false };

    act(() => addRequestMutation.onSuccess([createdEntry]));

    expect(setQueryDataMock).toHaveBeenCalledWith(['shopping-list'], expect.any(Function));
    const updateCache = setQueryDataMock.mock.calls[0][1] as (
      entries: (typeof existingEntry)[] | undefined,
    ) => (typeof existingEntry)[];
    expect(updateCache([existingEntry])).toEqual([existingEntry, createdEntry]);
    expect(updateCache(undefined)).toEqual([createdEntry]);
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ['shopping-list'] });
    expect(broadcastInvalidationMock).toHaveBeenCalledWith('shopping-list');
  });

  it('queues selections eagerly, removes them, and submits pending foods', () => {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/?add=request']}>
          <ShoppingRequestPanel />
        </MemoryRouter>,
      );
    });

    const findButton = (label: string) =>
      [...document.querySelectorAll('button')].find(
        (button) => button.textContent?.trim() === label,
      );

    act(() => findButton('Select tomatoes')?.click());
    expect(mutateMock).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Tomatoes');

    act(() => document.querySelector<HTMLButtonElement>('[aria-label="Remove Tomatoes"]')?.click());
    expect(document.querySelector('[aria-label="Remove Tomatoes"]')).toBeNull();

    act(() => findButton('Select tomatoes')?.click());
    act(() => findButton('Add')?.click());
    expect(mutateMock).toHaveBeenCalledWith([{ id: 12, name: 'Tomatoes' }]);
  });

  it('queues spoken foods through the existing pending request flow', () => {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/?add=request']}>
          <ShoppingRequestPanel />
        </MemoryRouter>,
      );
    });

    const findButton = (label: string) =>
      [...document.querySelectorAll('button')].find(
        (button) => button.textContent?.trim() === label,
      );

    act(() => findButton('Speak milk')?.click());
    expect(document.body.textContent).toContain('Milk');

    act(() => findButton('Add')?.click());
    expect(mutateMock).toHaveBeenCalledWith([
      { customOption: true, id: 'speech-milk', name: 'Milk' },
    ]);
  });

  it('shows interim speech as typeahead placeholder progress', () => {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/?add=request']}>
          <ShoppingRequestPanel />
        </MemoryRouter>,
      );
    });

    const findButton = (label: string) =>
      [...document.querySelectorAll('button')].find(
        (button) => button.textContent?.trim() === label,
      );

    expect(document.body.textContent).toContain('Placeholder: Search foods…');
    act(() => findButton('Speak partial hot')?.click());
    expect(document.body.textContent).toContain('Placeholder: hot');
  });

  it('renders speech errors below the input row without affecting the typeahead controls', () => {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/?add=request']}>
          <ShoppingRequestPanel />
        </MemoryRouter>,
      );
    });

    const findButton = (label: string) =>
      [...document.querySelectorAll('button')].find(
        (button) => button.textContent?.trim() === label,
      );

    act(() => findButton('Trigger speech error')?.click());
    expect(document.body.textContent).toContain('Mock speech error');
    expect(document.body.textContent).toContain('New foods enabled');
  });

  it('deletes a pending food after a full left swipe', () => {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/?add=request']}>
          <ShoppingRequestPanel />
        </MemoryRouter>,
      );
    });

    const selectTomatoes = [...document.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Select tomatoes',
    );
    act(() => selectTomatoes?.click());
    const row = document.querySelector('.shopping-list-swipe-content');
    expect(row).toBeTruthy();

    const dispatchPointer = (
      type: 'pointerdown' | 'pointermove' | 'pointerup',
      clientX: number,
    ) => {
      const event = new MouseEvent(type, { bubbles: true, clientX, clientY: 10 });
      Object.defineProperties(event, {
        pointerId: { value: 1 },
        pointerType: { value: 'touch' },
      });
      row?.dispatchEvent(event);
    };

    act(() => {
      dispatchPointer('pointerdown', 280);
      dispatchPointer('pointermove', 40);
      dispatchPointer('pointerup', 40);
    });

    expect(document.body.textContent).not.toContain('Tomatoes');
  });

  it('renders an unlabelled request handle with an accessible name', () => {
    act(() => {
      root.render(
        <MemoryRouter>
          <ShoppingRequestPanel />
        </MemoryRouter>,
      );
    });

    const handle = container.querySelector<HTMLButtonElement>('.shopping-list-request-handle');
    expect(handle?.getAttribute('aria-label')).toBe('Add shopping request');
    expect(handle?.textContent).toBe('');
    expect(handle?.querySelector('.shopping-list-request-handle-bar')).toBeTruthy();
  });

  it('opens the request panel when the request handle is tapped', () => {
    act(() => {
      root.render(
        <MemoryRouter>
          <ShoppingRequestPanel />
        </MemoryRouter>,
      );
    });

    const handle = container.querySelector<HTMLButtonElement>('.shopping-list-request-handle');
    act(() => handle?.click());

    expect(document.body.textContent).toContain('Add shopping request');
  });
});
