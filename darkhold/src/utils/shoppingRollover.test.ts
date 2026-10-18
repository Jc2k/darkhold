import { describe, expect, it } from 'vitest';
import {
  isLinkedToToday,
  overduePantryReservations,
  pantryReplenishmentPatch,
  planShoppingRollover,
  shoppingCycleStart,
  ukRolloverClock,
} from './shoppingRollover';

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

  it('preserves new-plan shopping, pantry commitments and unbought requests', () => {
    const entries = [
      dated(1, '2026-10-12'), // old planned item to clear
      dated(2, '2026-10-18'), // new plan, never clear
      dated(3, '2026-10-20', true), // even checked upcoming plan must stay
      { id: 4, checked: true }, // old bought manual request to clear
      { id: 5, checked: false }, // unbought manual request to keep
      { id: 6, checked: false, shopping_lists: [{ name: 'Pantry Replenishment' }] },
      { ...dated(9, '2026-10-10'), shopping_lists: [{ name: 'Pantry Replenishment' }] },
      { ...dated(10, '2026-10-10', true), shopping_lists: [{ name: 'Pantry Replenishment' }] },
      { ...dated(7, '2026-10-12'), shopping_lists: [{ name: 'Use from Pantry' }] },
      dated(8, '2026-10-16', false, '2026-10-19'), // spans today: keep
    ];
    expect(planShoppingRollover(entries, '2026-10-18')).toEqual({
      cycle: '2026-10-17',
      ready: true,
      ids: [1, 4, 10],
    });
  });

  it('does not treat a meal planned for tomorrow as arriving today', () => {
    expect(isLinkedToToday(dated(1, '2026-10-19'), '2026-10-18')).toBe(false);
  });
});

describe('automatic pantry replacement transfer', () => {
  const reserved = (id: number, from: string, to?: string) => ({
    ...dated(id, from, false, to),
    shopping_lists: [{ id: 4, name: 'Use from Pantry' }],
  });

  it('transfers only unchecked pantry reservations whose whole meal is in the past', () => {
    const entries = [
      reserved(1, '2026-10-16'),
      reserved(2, '2026-10-17', '2026-10-18'),
      reserved(3, '2026-10-17', '2026-10-19'),
      reserved(4, '2026-10-18'),
      { ...reserved(5, '2026-10-17'), checked: true },
      dated(6, '2026-10-16'),
      { id: 7, checked: false, shopping_lists: [{ name: 'Use from Pantry' }] },
      { ...reserved(8, '2026-10-10'), shopping_lists: [{ name: 'Pantry Replenishment' }] },
    ];
    expect(overduePantryReservations(entries, '2026-10-18').map((entry) => entry.id))
      .toEqual([1]);
  });

  it('compares planned date portions and waits until the next day', () => {
    expect(overduePantryReservations([reserved(1, '2026-10-17T23:00:00Z')], '2026-10-17'))
      .toHaveLength(0);
    expect(overduePantryReservations([reserved(1, '2026-10-17T23:00:00Z')], '2026-10-18'))
      .toHaveLength(1);
  });

  it('converts the existing entry atomically rather than creating a duplicate', () => {
    const old = {
      ...reserved(14, '2026-10-16'),
      shopping_lists: [
        { id: 4, name: 'Use from Pantry' },
        { id: 7, name: 'Amazon' },
      ],
    };
    const patch = pantryReplenishmentPatch(old, { id: 12, name: 'Pantry Replenishment' });
    expect(patch).toEqual({
      checked: false,
      list_recipe: null,
      shopping_lists: [
        { id: 7, name: 'Amazon' },
        { id: 12, name: 'Pantry Replenishment' },
      ],
    });
    const after = { ...old, ...patch };
    expect(overduePantryReservations([after], '2026-10-18')).toEqual([]);
    expect(planShoppingRollover([after, dated(19, '2026-10-18')], '2026-10-18').ids)
      .not.toContain(14);
  });

  it('keeps a replenishment even with stale old-plan metadata until it is bought', () => {
    const restock = {
      ...dated(41, '2026-10-10'),
      shopping_lists: [{ id: 5, name: 'Pantry Replenishment' }],
    };
    const plan = dated(42, '2026-10-18');
    expect(planShoppingRollover([restock, plan], '2026-10-18').ids).toEqual([]);
    expect(planShoppingRollover([{ ...restock, checked: true }, plan], '2026-10-18').ids)
      .toEqual([41]);
  });
});
