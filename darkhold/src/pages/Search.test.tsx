import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Search } from './Search';

const {
  apiGetMock,
  searchKeywordsMock,
  searchFoodsMock,
  useRecipeSearchMock,
} = vi.hoisted(() => ({
  apiGetMock: vi.fn(),
  searchKeywordsMock: vi.fn(),
  searchFoodsMock: vi.fn(),
  useRecipeSearchMock: vi.fn(),
}));

type ReactActGlobal = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

vi.mock('../api/client', () => ({
  apiGet: apiGetMock,
  searchKeywords: searchKeywordsMock,
  searchFoods: searchFoodsMock,
}));

vi.mock('../hooks/useRecipeSearch', () => ({
  useRecipeSearch: useRecipeSearchMock,
}));

vi.mock('../components/AsyncTypeaheadFilter', () => ({
  AsyncTypeaheadFilter: ({
    id,
    label,
    selected,
  }: {
    id: string;
    label: string;
    selected: { id: number; name: string }[];
  }) => (
    <div data-filter-id={id}>
      {label}: {selected.map((option) => option.name).join(', ')}
    </div>
  ),
}));

vi.mock('../components/RecipeCard', () => ({
  RecipeCard: () => <div>recipe</div>,
}));

vi.mock('../components/MealPlanAddModal', () => ({
  MealPlanAddModal: () => null,
}));

vi.mock('../components/LoadingMascot', () => ({
  LoadingMascot: ({ label }: { label?: string }) => <div>{label ?? 'loading'}</div>,
}));

describe('Search', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const actGlobal = globalThis as ReactActGlobal;

  beforeEach(() => {
    actGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    apiGetMock.mockReset();
    searchKeywordsMock.mockReset();
    searchFoodsMock.mockReset();
    useRecipeSearchMock.mockReset();
    useRecipeSearchMock.mockReturnValue({
      data: { pages: [{ results: [], next: null }] },
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      isLoading: false,
      isError: false,
    });

    vi.stubGlobal('IntersectionObserver', class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    delete actGlobal.IS_REACT_ACT_ENVIRONMENT;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('restores selected tag filters from the URL so the widget shows the applied filter', async () => {
    let resolveKeyword: ((value: { id: number; name: string }) => void) | undefined;

    apiGetMock.mockImplementation(async (path: string) => {
      if (path === '/keyword/42/') {
        return new Promise((resolve) => {
          resolveKeyword = resolve;
        });
      }
      throw new Error(`Unexpected path: ${path}`);
    });

    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/search?keywords=42']}>
          <Routes>
            <Route path="/search" element={<Search />} />
          </Routes>
        </MemoryRouter>,
      );
    });

    await act(async () => {
      resolveKeyword?.({ id: 42, name: 'Autumn' });
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Tags: Autumn');
    expect(apiGetMock).toHaveBeenCalledWith('/keyword/42/');
  });

  it('keeps rendering the remaining restored tags when one selected tag lookup fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let resolveKeyword: ((value: { id: number; name: string }) => void) | undefined;

    apiGetMock.mockImplementation((path: string) => {
      if (path === '/keyword/42/') {
        return new Promise((resolve) => {
          resolveKeyword = resolve;
        });
      }
      if (path === '/keyword/99/') {
        return Promise.reject(new Error('Not found'));
      }
      throw new Error(`Unexpected path: ${path}`);
    });

    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/search?keywords=42,99']}>
          <Routes>
            <Route path="/search" element={<Search />} />
          </Routes>
        </MemoryRouter>,
      );
    });

    await act(async () => {
      resolveKeyword?.({ id: 42, name: 'Autumn' });
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Tags: Autumn');
    expect(container.textContent).not.toContain('99');
    expect(warnSpy).toHaveBeenCalledWith('Failed to restore search filter option', expect.objectContaining({
      path: '/keyword/',
      id: 99,
    }));
  });
});
