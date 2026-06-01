import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MealPlan } from '../api/tandoor-types';

const { apiGetMock, apiPostMock, broadcastInvalidationMock } = vi.hoisted(() => ({
  apiGetMock: vi.fn(),
  apiPostMock: vi.fn(),
  broadcastInvalidationMock: vi.fn(),
}));

vi.mock('../api/client', () => ({
  apiGet: apiGetMock,
  apiPost: apiPostMock,
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
}));

vi.mock('./useInvalidationSocket', () => ({
  broadcastInvalidation: broadcastInvalidationMock,
}));

import { useCreateMealPlan } from './useMealPlan';

type CreateMealPlanMutation = ReturnType<typeof useCreateMealPlan>;
type ReactActGlobal = typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

function CreateMealPlanHarness({
  onReady,
}: {
  onReady: (mutation: CreateMealPlanMutation) => void;
}) {
  onReady(useCreateMealPlan());
  return null;
}

describe('useCreateMealPlan', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let queryClient: QueryClient;
  let mutation: CreateMealPlanMutation | undefined;
  const actGlobal = globalThis as ReactActGlobal;

  beforeEach(() => {
    actGlobal.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    queryClient = new QueryClient();
    mutation = undefined;
    apiGetMock.mockResolvedValue({ results: [] });
    apiPostMock.mockResolvedValue({
      id: 42,
      recipe: 1,
      meal_type: 2,
      from_date: '2026-05-30',
    } satisfies Partial<MealPlan>);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    queryClient.clear();
    vi.clearAllMocks();
    delete actGlobal.IS_REACT_ACT_ENVIRONMENT;
  });

  it('invalidates and broadcasts the shared shopping-list cache after creating a meal plan entry', async () => {
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <CreateMealPlanHarness onReady={(nextMutation) => (mutation = nextMutation)} />
        </QueryClientProvider>,
      );
    });

    await act(async () => {
      await mutation?.mutateAsync({
        recipe: 1,
        meal_type: 2,
        from_date: '2026-05-30',
        addshopping: true,
      });
    });

    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['shopping-list'] });
    expect(broadcastInvalidationMock).toHaveBeenCalledWith('shopping-list');
  });
});
