import { describe, expect, it } from 'vitest';
import { binomialUpperTail, getWeekdayRecipeSignal } from './weekdayRecipeSignals';

describe('weekdayRecipeSignals', () => {
  it('detects a significant one-day recipe preference', () => {
    const signal = getWeekdayRecipeSignal({
      dayCounts: [0, 7, 0, 0, 0, 0, 0],
      totalPlanCount: 7,
    });

    expect(signal).toMatchObject({
      total: 7,
      days: [{ dayIndex: 1, label: 'Monday', count: 7, share: 1 }],
      expectedShare: 1 / 7,
      observedShare: 1,
    });
    expect(signal?.pValue).toBeLessThan(0.05);
  });

  it('detects a significant two-day recipe preference', () => {
    const signal = getWeekdayRecipeSignal({
      dayCounts: [0, 5, 0, 5, 0, 0, 0],
      totalPlanCount: 10,
    });

    expect(signal).toMatchObject({
      days: [
        { dayIndex: 1, label: 'Monday', count: 5, share: 0.5 },
        { dayIndex: 3, label: 'Wednesday', count: 5, share: 0.5 },
      ],
      expectedShare: 2 / 7,
      observedShare: 1,
    });
  });

  it('ignores weak or under-sampled weekday concentrations', () => {
    expect(
      getWeekdayRecipeSignal({ dayCounts: [0, 4, 0, 0, 0, 0, 0], totalPlanCount: 4 }),
    ).toBeUndefined();
    expect(
      getWeekdayRecipeSignal({ dayCounts: [1, 2, 1, 1, 1, 1, 0], totalPlanCount: 7 }),
    ).toBeUndefined();
  });

  it('calculates an exact binomial upper tail', () => {
    expect(binomialUpperTail(7, 7, 1 / 7)).toBeCloseTo((1 / 7) ** 7);
  });
});
