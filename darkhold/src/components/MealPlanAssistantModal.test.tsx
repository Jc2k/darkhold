import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MealPlanAssistantModal } from './MealPlanAssistantModal';

vi.mock('../utils/mediaUrl', () => ({
  proxyMediaUrl: (value: string) => value,
}));

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
    const onSelectAlternative = vi.fn();
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
            onSelectAlternative={onSelectAlternative}
            onHide={() => {}}
          />
        </QueryClientProvider>,
      );
    });

    expect(document.body.textContent).toContain('Quick Noodles');
    expect(document.body.textContent).toContain('Sat 30 May');
    expect(document.body.textContent).not.toContain('2026-05-30');
    expect(document.body.textContent).toContain('Current meal');
    expect(document.body.textContent).toContain('Why it was selected');
    expect(document.body.textContent).toContain('Tagged for busy or quick dinners.');
    expect(document.body.textContent).toContain(
      'No busy-day recipes matched, so this slot fell back to the broader dinner pool.',
    );
    expect(document.body.textContent).toContain('Best alternatives');
    expect(document.body.textContent).toContain('Takeaway');
    expect(document.body.textContent).toContain('Useful quick fallback for a busy evening.');
    expect(document.body.textContent).toContain('Use this meal');
    expect(document.body.querySelectorAll('img').length).toBeGreaterThan(1);
    expect(
      Array.from(document.querySelectorAll('.badge'))
        .filter((badge) =>
          ['Score 36', '+16', '18'].some((value) => badge.textContent?.includes(value)),
        )
        .every((badge) => badge.classList.contains('d-inline-flex')),
    ).toBe(true);
    expect(document.querySelector('.meal-plan-assistant-modal')).not.toBeNull();
    expect(document.querySelector('.meal-plan-assistant-modal-content')).not.toBeNull();
    expect(document.querySelector('.meal-plan-assistant-modal-header')).not.toBeNull();
    expect(document.querySelector('.meal-plan-assistant-modal-body')).not.toBeNull();
    expect(
      document.querySelector('.modal-dialog')?.classList.contains('modal-dialog-scrollable'),
    ).toBe(true);

    const useThisMealButton = document.querySelector('button[aria-label="Use Takeaway instead"]');

    act(() => {
      (useThisMealButton as HTMLButtonElement | undefined)?.click();
    });

    expect(onSelectAlternative).toHaveBeenCalledWith({
      id: 2,
      name: 'Takeaway',
      created_by: 1,
      image: '/alt.jpg',
    });
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
