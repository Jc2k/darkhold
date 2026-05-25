import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MealPlanAssistantModal } from './MealPlanAssistantModal';

describe('MealPlanAssistantModal', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const actGlobal = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

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
    delete actGlobal.IS_REACT_ACT_ENVIRONMENT;
  });

  it('renders the selected meal, reasons, warnings, and alternatives', () => {
    const client = new QueryClient();
    act(() => {
      root.render(
        <QueryClientProvider client={client}>
          <MealPlanAssistantModal
            analysis={{
              date: '2026-05-30',
              role: 'busy-day',
              roleLabel: 'Busy day',
              selected: {
                recipe: { id: 1, name: 'Quick Noodles', created_by: 1, image: '/image.jpg' },
                role: 'busy-day',
                score: 36,
                components: [
                  {
                    key: 'role-fit',
                    label: 'Fits the day',
                    score: 16,
                    detail: 'Tagged for busy or quick dinners.',
                  },
                ],
                warnings: [
                  'No busy-day recipes matched, so this slot fell back to the broader dinner pool.',
                ],
              },
              alternatives: [
                {
                  recipe: { id: 2, name: 'Takeaway', created_by: 1, image: '/alt.jpg' },
                  role: 'busy-day',
                  score: 18,
                  components: [
                    {
                      key: 'role-fit',
                      label: 'Fits the day',
                      score: 12,
                      detail: 'Useful quick fallback for a busy evening.',
                    },
                  ],
                  warnings: ['This is a placeholder recipe entry rather than a cookable recipe.'],
                },
              ],
            }}
            onHide={() => {}}
          />
        </QueryClientProvider>,
      );
    });

    expect(document.body.textContent).toContain('Quick Noodles');
    expect(document.body.textContent).toContain('Why it was selected');
    expect(document.body.textContent).toContain('Tagged for busy or quick dinners.');
    expect(document.body.textContent).toContain(
      'No busy-day recipes matched, so this slot fell back to the broader dinner pool.',
    );
    expect(document.body.textContent).toContain('Best alternatives');
    expect(document.body.textContent).toContain('Takeaway');
    expect(document.body.textContent).toContain('Useful quick fallback for a busy evening.');
  });

  it('renders nothing when no analysis is provided', () => {
    const client = new QueryClient();
    act(() => {
      root.render(
        <QueryClientProvider client={client}>
          <MealPlanAssistantModal analysis={null} onHide={() => {}} />
        </QueryClientProvider>,
      );
    });

    expect(container.innerHTML).toBe('');
  });
});
