import { describe, expect, it } from 'vitest';
import { isLinkedToToday, planShoppingRollover, shoppingCycleStart, ukRolloverClock } from './shoppingRollover';

const dated = (id: number, from: string, checked = false, to?: string) => ({
  id,
  checked,
  list_recipe_data: { meal_plan_data: { from_date: from, ...(to ? { to_date: to } : {}) } },
});

describe('UK 4 a.m. shopping rollover', () => {
  it('uses Europe/London wall clock across both DST transitions', () => {
    expect(ukRolloverClock(new Date('2026-03-29T02:00:00Z'))).toEqual({
      date: '2026-03-29', hour: 3,
    });
    expect(ukRolloverClock(new Date('2026-03-29T03:00:00Z')).hour).toBe(4);
    expect(ukRolloverClock(new Date('2026-10-25T04:00:00Z')).hour).toBe(4);
  });

  it('uses DarkHold’s Saturday–Friday shopping week', () => {
    expect(shoppingCycleStart('2026-10-18')).toBe('2026-10-17');
    expect(shoppingCycleStart('2026-10-23')).toBe('2026-10-17');
    expect(shoppingCycleStart('2026-10-24')).toBe('2026-10-24');
  });

  it('does nothing unless a linked shopping-list meal covers the day', () => {
    expect(planShoppingRollover([
      dated(1, '2026-10-12'),
      { id: 2, checked: true },
    ], '2026-10-18')).toEqual({
      cycle: '2026-10-17',
      ready: false,
      ids: [],
    });
  });

  it('clears the entire list once a meal-plan ingredient covers today', () => {
    const entries = [
      dated(1, '2026-10-12'), // previous week's planned ingredient
      dated(2, '2026-10-18'), // current meal-plan ingredient triggers clearing
      dated(3, '2026-10-20', true), // future planned ingredient
      { id: 4, checked: true }, // purchased request
      { id: 5, checked: false }, // unbought manual request
      { id: 6, checked: false, shopping_lists: [{ name: 'Pantry Replenishment' }] },
      { ...dated(7, '2026-10-12'), shopping_lists: [{ name: 'Use from Pantry' }] },
      dated(8, '2026-10-16', false, '2026-10-19'), // meal spans the cycle boundary
    ];
    const snapshot = structuredClone(entries);

    expect(planShoppingRollover(entries, '2026-10-18')).toEqual({
      cycle: '2026-10-17',
      ready: true,
      ids: [1, 2, 3, 4, 5, 6, 7, 8],
    });
    // The decision function only returns shopping-entry IDs; it does not
    // edit or remove anything from the underlying meal plan.
    expect(entries).toEqual(snapshot);
  });

  it('does not clear manually added items with no meal-plan trigger', () => {
    expect(planShoppingRollover([{ id: 9, checked: false }], '2026-10-18')).toEqual({
      cycle: '2026-10-17',
      ready: false,
      ids: [],
    });
  });

  it('does not treat a meal planned for tomorrow as arriving today', () => {
    expect(isLinkedToToday(dated(1, '2026-10-19'), '2026-10-18')).toBe(false);
  });
});
