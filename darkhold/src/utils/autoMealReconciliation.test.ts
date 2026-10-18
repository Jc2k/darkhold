import { describe, expect, it } from 'vitest';
import type { MealPlan } from '../api/tandoor-types';
import type { RolloverShoppingEntry } from './shoppingRollover';
import {
  automaticCookLogTimestamp,
  duePlannedMeals,
  existingCookLogKeys,
  pantryDeductionRetry,
  planAutomaticPantryDeductions,
  previousCalendarDate,
  reservationMealId,
} from './autoMealReconciliation';

const meal = (id: number, from_date: string, to_date?: string): MealPlan => ({
  id, from_date, to_date, recipe: id + 10, meal_type: { id: 1, name: 'Dinner', time: '18:30' },
});
const reserved: RolloverShoppingEntry = {
  id: 8, checked: false, food: { id: 25, name: 'Milk' },
  unit: { id: 3, name: 'litres' }, amount: 3,
  shopping_lists: [{ id: 2, name: 'Use from Pantry' }],
  list_recipe_data: { mealplan: 42, meal_plan_data: { id: 42, from_date: '2026-10-16' } },
};

describe('automatic meal planner cook logs', () => {
  it('waits for the whole planned date range and respects the activation cutoff', () => {
    const plans = [
      meal(1, '2026-10-16'), meal(2, '2026-10-17', '2026-10-18'),
      meal(3, '2026-10-18'), meal(4, '2026-10-19'),
      meal(5, '2026-10-01'), meal(6, '2026-10-17', '2026-10-19'),
    ];
    expect(duePlannedMeals(plans, '2026-10-18', '2026-10-17')).toEqual([]);
    expect(duePlannedMeals(plans, '2026-10-19', '2026-10-17').map((x) => x.id)).toEqual([2, 3]);
    expect(previousCalendarDate('2026-03-01')).toBe('2026-02-28');
    expect(previousCalendarDate('2026-10-25')).toBe('2026-10-24');
  });
  it('uses the backfill recipe/date identity and configured meal time without inventing ratings', () => {
    const m = meal(2, '2026-10-17T09:00:00');
    expect(automaticCookLogTimestamp(m)).toBe('2026-10-17T18:30:00');
    expect(automaticCookLogTimestamp({ ...m, meal_type: 1 })).toBe('2026-10-17T12:00:00');
    expect(existingCookLogKeys([
      { id: 1, recipe: 12, created_at: '2026-10-17T18:30:00' },
    ]).has('2026-10-17:12')).toBe(true);
  });
  it('links reservations by meal plan id, not just recipe', () => {
    expect(reservationMealId(reserved)).toBe(42);
    expect(reservationMealId({ ...reserved, list_recipe_data: null })).toBeNull();
  });
});

describe('automatic pantry batch reconciliation', () => {
  const stocks = [
    { id: 1, food: { id: 25 }, unit: { id: 3 }, amount: '1.5', expires: '2026-10-17' },
    { id: 2, food: { id: 25 }, unit: { id: 3 }, amount: '4', expires: '2026-10-30' },
    { id: 3, food: { id: 25 }, unit: { id: 4 }, amount: '20', expires: null },
    { id: 4, food: { id: 99 }, unit: { id: 3 }, amount: '12', expires: null },
  ];
  it('deducts the planned quantity across compatible batches oldest first', () => {
    expect(planAutomaticPantryDeductions(reserved, stocks, '2026-10-16')).toEqual([
      { batchId: 1, before: 1.5, after: 0, applied: false },
      { batchId: 2, before: 4, after: 2.5, applied: false },
    ]);
    expect(planAutomaticPantryDeductions(reserved, stocks, '2026-10-18')).toEqual([
      { batchId: 2, before: 4, after: 1, applied: false },
    ]);
  });
  it('never guesses amounts, changes units or allows a negative batch', () => {
    expect(() => planAutomaticPantryDeductions({ ...reserved, amount: null }, stocks, '2026-10-18')).toThrow();
    expect(() => planAutomaticPantryDeductions({ ...reserved, amount: 6 }, stocks, '2026-10-18')).toThrow('Insufficient');
    expect(() => planAutomaticPantryDeductions({ ...reserved, unit: { id: 12, name: 'each' } }, stocks, '2026-10-18')).toThrow('Insufficient');
    expect(() => planAutomaticPantryDeductions(reserved, [], '2026-10-18')).toThrow('Insufficient');
  });
  it('reconciles an uncertain PATCH without blindly deducting a second time', () => {
    const movement = { batchId: 2, before: 4, after: 1, applied: false };
    expect(pantryDeductionRetry('4', movement)).toBe('safe-to-apply');
    expect(pantryDeductionRetry('1', movement)).toBe('already-applied');
    expect(pantryDeductionRetry('2', movement)).toBe('conflict');
    expect(pantryDeductionRetry('not a number', movement)).toBe('conflict');
  });
});
