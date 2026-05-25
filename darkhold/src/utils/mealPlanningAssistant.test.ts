import { describe, expect, it } from 'vitest';
import type { MealPlan, Recipe } from '../api/tandoor-types';
import {
  buildMealAssistantPlan,
  getRecipeKeywordNames,
  isBusyDinnerDay,
  isGoodWeatherDay,
  swapMealAssistantSelection,
  UNSUITABLE_DINNER_TAG_FRAGMENTS,
} from './mealPlanningAssistant';

function makeRecipe(
  id: number,
  name: string,
  keywords: Array<{ id: number; name: string }> = [],
  overrides: Partial<Recipe> = {},
): Recipe {
  return {
    id,
    name,
    created_by: 1,
    image: '/recipe.jpg',
    keywords,
    ...overrides,
  };
}

function makeMealPlan(
  id: number,
  recipe: Recipe | number,
  fromDate: string,
  overrides: Partial<MealPlan> = {},
): MealPlan {
  return {
    id,
    recipe,
    meal_type: { id: 3, name: 'Dinner', time: '18:00' },
    from_date: fromDate,
    ...overrides,
  };
}

describe('mealPlanningAssistant', () => {
  it('resolves recipe keyword names from inline objects and fallback ids', () => {
    expect(
      getRecipeKeywordNames(
        {
          keywords: [{ id: 1, name: 'Busy' }],
        },
        { 2: 'Quickies' },
      ),
    ).toEqual(['Busy']);

    expect(
      getRecipeKeywordNames(
        {
          keywords: [2],
        },
        { 2: 'Quickies' },
      ),
    ).toEqual(['Quickies']);
  });

  it('detects busy dinner days from long or dinner-time events', () => {
    expect(
      isBusyDinnerDay(
        [
          {
            name: 'Long meeting',
            start: '2026-05-30T15:00:00Z',
            end: '2026-05-30T17:30:00Z',
            allDay: false,
          },
        ],
        '18:00',
      ),
    ).toBe(true);

    expect(
      isBusyDinnerDay(
        [
          {
            name: 'Morning appointment',
            start: '2026-05-30T08:00:00Z',
            end: '2026-05-30T08:30:00Z',
            allDay: false,
          },
        ],
        '18:00',
      ),
    ).toBe(false);
  });

  it('detects good weather weekends and holidays only when conditions are dry and warm', () => {
    expect(
      isGoodWeatherDay(
        '2026-05-30',
        {
          date: '2026-05-30',
          weatherCode: 1,
          tempMinC: 12,
          tempMaxC: 24,
          sunrise: '2026-05-30T05:00:00Z',
          sunset: '2026-05-30T20:00:00Z',
          precipitationSumMm: 0,
          precipitationProbabilityMax: 10,
        },
        new Set<string>(),
      ),
    ).toBe(true);

    expect(
      isGoodWeatherDay(
        '2026-06-02',
        {
          date: '2026-06-02',
          weatherCode: 1,
          tempMinC: 12,
          tempMaxC: 24,
          sunrise: '2026-06-02T05:00:00Z',
          sunset: '2026-06-02T20:00:00Z',
          precipitationSumMm: 0,
          precipitationProbabilityMax: 10,
        },
        new Set<string>(),
      ),
    ).toBe(false);
  });

  it('fills empty slots with ranked meals and ranked alternatives', () => {
    const upSoonRecipe = makeRecipe(1, 'Quick Pasta', [
      { id: 10, name: 'Busy' },
      { id: 11, name: 'Pasta' },
    ]);
    const goodWeatherRecipe = makeRecipe(2, 'Garden Skewers', [{ id: 12, name: 'Outdoors' }]);
    const fallbackRecipe = makeRecipe(3, 'Rice Bowl', [{ id: 13, name: 'Rice' }]);
    const alternativeRecipe = makeRecipe(6, 'Noodle Stir Fry', [{ id: 14, name: 'Noodles' }]);
    const outdoorsAlternative = makeRecipe(7, 'Picnic Salad', [{ id: 12, name: 'Outdoors' }]);
    const excludedRecentRecipe = makeRecipe(4, 'Repeat Pasta', [{ id: 11, name: 'Pasta' }]);
    const poorRecipe = makeRecipe(5, 'One Star Soup', [], { rating: 1 });

    const plan = buildMealAssistantPlan({
      weekStart: new Date('2026-05-30T00:00:00'),
      weekEnd: new Date('2026-06-05T00:00:00'),
      emptyDinnerDates: ['2026-05-30', '2026-05-31'],
      existingWeekMeals: [],
      historicalMeals: [
        makeMealPlan(1, excludedRecentRecipe, '2026-05-20'),
        makeMealPlan(2, upSoonRecipe, '2026-05-10'),
        makeMealPlan(3, upSoonRecipe, '2026-05-03'),
        makeMealPlan(4, goodWeatherRecipe, '2026-04-12'),
      ],
      recipes: [
        upSoonRecipe,
        goodWeatherRecipe,
        fallbackRecipe,
        alternativeRecipe,
        outdoorsAlternative,
        excludedRecentRecipe,
        poorRecipe,
      ],
      upSoonRecipeIds: [1],
      recentAddedRecipeIds: [2],
      calendarEventsByDate: {
        '2026-05-30': [
          {
            name: 'Late appointment',
            start: '2026-05-30T17:00:00',
            end: '2026-05-30T19:30:00',
            allDay: false,
          },
        ],
      },
      weatherByDate: {
        '2026-05-31': {
          date: '2026-05-31',
          weatherCode: 1,
          tempMinC: 13,
          tempMaxC: 25,
          sunrise: '2026-05-31T05:00:00Z',
          sunset: '2026-05-31T20:00:00Z',
          precipitationSumMm: 0,
          precipitationProbabilityMax: 5,
        },
      },
      dinnerTime: '18:00',
    });

    expect(plan.slots).toHaveLength(2);
    expect(plan.slots[0].selected.recipe.name).toBe('Quick Pasta');
    expect(plan.slots[0].selected.components.some((component) => component.key === 'up-soon')).toBe(
      true,
    );
    expect(plan.slots[1].selected.recipe.name).toBe('Garden Skewers');
    expect(plan.slots[1].alternatives[0].recipe.name).toBe('Picnic Salad');
    expect(
      plan.slots.flatMap((slot) => [
        slot.selected.recipe.id,
        ...slot.alternatives.map((candidate) => candidate.recipe.id),
      ]),
    ).not.toContain(4);
    expect(
      plan.slots.flatMap((slot) => [
        slot.selected.recipe.id,
        ...slot.alternatives.map((candidate) => candidate.recipe.id),
      ]),
    ).not.toContain(5);
  });

  it('filters unsuitable dinner tags such as breakfast, lunch, drink, and baking', () => {
    expect(UNSUITABLE_DINNER_TAG_FRAGMENTS).toEqual(
      expect.arrayContaining(['breakfast', 'lunch', 'drink', 'baking']),
    );

    const dinnerRecipe = makeRecipe(1, 'Pasta Bake', [{ id: 20, name: 'Pasta' }]);
    const breakfastRecipe = makeRecipe(2, 'Pancakes', [{ id: 21, name: 'Breakfast' }]);
    const lunchRecipe = makeRecipe(3, 'Soup', [{ id: 22, name: 'Lunch' }]);
    const drinkRecipe = makeRecipe(4, 'Milkshake', [{ id: 23, name: 'Drink' }]);
    const bakingRecipe = makeRecipe(5, 'Cupcakes', [{ id: 24, name: 'Baking' }]);

    const plan = buildMealAssistantPlan({
      weekStart: new Date('2026-05-30T00:00:00'),
      weekEnd: new Date('2026-06-05T00:00:00'),
      emptyDinnerDates: ['2026-05-30'],
      existingWeekMeals: [],
      historicalMeals: [],
      recipes: [dinnerRecipe, breakfastRecipe, lunchRecipe, drinkRecipe, bakingRecipe],
      dinnerTime: '18:00',
    });

    expect(plan.slots[0]?.selected.recipe.name).toBe('Pasta Bake');
    expect(plan.slots[0]?.alternatives).toHaveLength(0);
  });

  it('can swap the selected meal with one of the ranked alternatives', () => {
    const slot = {
      date: '2026-05-30',
      role: 'general-dinner' as const,
      roleLabel: 'General dinner',
      selected: {
        recipe: makeRecipe(1, 'Quick Pasta'),
        role: 'general-dinner' as const,
        score: 20,
        components: [],
        warnings: [],
      },
      alternatives: [
        {
          recipe: makeRecipe(2, 'Rice Bowl'),
          role: 'general-dinner' as const,
          score: 18,
          components: [],
          warnings: [],
        },
        {
          recipe: makeRecipe(3, 'Noodles'),
          role: 'general-dinner' as const,
          score: 17,
          components: [],
          warnings: [],
        },
      ],
    };

    const updated = swapMealAssistantSelection(slot, 3);

    expect(updated.selected.recipe.name).toBe('Noodles');
    expect(updated.alternatives.map((alternative) => alternative.recipe.name)).toEqual([
      'Quick Pasta',
      'Rice Bowl',
    ]);
  });
});
