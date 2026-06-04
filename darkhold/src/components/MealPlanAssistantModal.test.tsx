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
              roleFlavourDetail: 'Busy because of: Long dentist appointment.',
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
                  {
                    key: 'produce-repeat-aubergine',
                    label: 'Produce repetition',
                    score: -10,
                    detail: 'Would be the second aubergine dish this week.',
                  },
                  {
                    key: 'week-balance-avoidance',
                    label: 'Week balance',
                    score: 0,
                    detail: 'Avoids repeating recipe clusters already planned this week.',
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
                    {
                      key: 'same-cluster-repeat',
                      label: 'Cluster repetition',
                      score: -12,
                      detail: 'Would be the second recipe this week from the noodles cluster.',
                    },
                  ],
                  warnings: ['This is a placeholder recipe entry rather than a cookable recipe.'],
                },
              ],
              hardExclusions: [
                {
                  recipe: { id: 3, name: 'One Star Soup', created_by: 1, image: '/poor.jpg' },
                  reason: 'Low rating',
                  detail: 'Filtered out because its rating is 1 star.',
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
    expect(document.body.textContent).toContain('Busy because of: Long dentist appointment.');
    expect(document.body.textContent).toContain('Top positive factors');
    expect(document.body.textContent).toContain('Tagged for busy or quick dinners.');
    expect(document.body.textContent).toContain('Top penalties');
    expect(document.body.textContent).toContain('Would be the second aubergine dish this week.');
    expect(document.body.textContent).toContain('Neutral and balance factors');
    expect(document.body.textContent).toContain(
      'Avoids repeating recipe clusters already planned this week.',
    );
    expect(document.body.textContent).toContain(
      'No busy-day recipes matched, so this slot fell back to the broader dinner pool.',
    );
    expect(document.body.textContent).toContain('Best alternatives');
    expect(document.body.textContent).toContain('Takeaway');
    expect(document.body.textContent).toContain(
      'Why not: Would be the second recipe this week from the noodles cluster.',
    );
    expect(document.body.textContent).toContain('Hard filters');
    expect(document.body.textContent).toContain('One Star Soup · Low rating');
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

  it('explains neutral picks without claiming only other candidates scored lower', () => {
    const client = new QueryClient();
    act(() => {
      root.render(
        <QueryClientProvider client={client}>
          <MealPlanAssistantModal
            analysis={{
              date: '2026-06-01',
              role: 'general-dinner',
              roleLabel: 'General dinner',
              selected: {
                recipe: { id: 10, name: 'Bean Stew', created_by: 1, image: '/bean.jpg' },
                role: 'general-dinner',
                score: 0,
                components: [
                  {
                    key: 'eligible-neutral',
                    label: 'Eligible fallback',
                    score: 0,
                    detail: 'Passed the hard filters and stayed available as a neutral fallback.',
                  },
                ],
                warnings: [],
              },
              alternatives: [],
              hardExclusions: [],
            }}
            onHide={() => {}}
          />
        </QueryClientProvider>,
      );
    });

    expect(document.body.textContent).toContain('No positive scoring signals stood out');
    expect(document.body.textContent).toContain('Passed the hard filters');
    expect(document.body.textContent).not.toContain(
      'This meal won mainly because other candidates scored lower.',
    );
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
