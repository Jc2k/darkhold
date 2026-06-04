import { describe, expect, it } from 'vitest';
import type { MealPlan, Recipe } from '../api/tandoor-types';
import { buildMealAssistantPrecalculation } from './mealAssistantPrecalculation';
import {
  buildMealAssistantPlan,
  getCalendarEventDatesByCategory,
  getRecipeKeywordNames,
  getRecipeProduceTags,
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

    expect(
      getRecipeKeywordNames(
        {
          keywords: [{ id: 3 } as unknown as { id: number; name: string }],
        },
        { 3: 'Breakfast' },
      ),
    ).toEqual(['Breakfast']);
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

  it('ignores context and bank-holiday events when detecting busy dinner days', () => {
    expect(
      isBusyDinnerDay(
        [
          {
            name: 'All day context',
            start: '2026-05-30',
            allDay: true,
            category: 'context',
          },
          {
            name: 'Bank holiday',
            start: '2026-05-30',
            allDay: true,
            category: 'bank-holiday',
          },
        ],
        '18:00',
      ),
    ).toBe(false);
  });

  it('does not treat all-day appointments without times as busy dinner days', () => {
    expect(
      isBusyDinnerDay(
        [
          {
            name: 'General reminder',
            start: '2026-05-30',
            allDay: true,
            category: 'appointment',
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

  it('extracts dates by calendar event category', () => {
    const byCategory = getCalendarEventDatesByCategory(
      {
        '2026-06-01': [
          {
            name: 'Meeting',
            start: '2026-06-01T09:00:00Z',
            allDay: false,
            category: 'appointment',
          },
        ],
        '2026-06-02': [
          { name: 'Holiday', start: '2026-06-02', allDay: true, category: 'bank-holiday' },
        ],
        '2026-06-03': [{ name: 'Info', start: '2026-06-03', allDay: true, category: 'context' }],
      },
      'bank-holiday',
    );
    expect([...byCategory]).toEqual(['2026-06-02']);
    expect(getCalendarEventDatesByCategory({}, 'appointment')).toEqual(new Set<string>());
  });

  it('treats bank-holiday calendar categories as public holidays for good-weather slots', () => {
    const outdoorsRecipe = makeRecipe(1, 'Garden Skewers', [{ id: 12, name: 'Outdoors' }]);
    const fallbackRecipe = makeRecipe(2, 'Pasta Bake', [{ id: 20, name: 'Pasta' }]);

    const plan = buildMealAssistantPlan({
      weekStart: new Date('2026-06-01T00:00:00'),
      weekEnd: new Date('2026-06-07T00:00:00'),
      emptyDinnerDates: ['2026-06-02'],
      existingWeekMeals: [],
      historicalMeals: [],
      recipes: [outdoorsRecipe, fallbackRecipe],
      calendarEventsByDate: {
        '2026-06-02': [
          { name: 'Bank holiday', start: '2026-06-02', allDay: true, category: 'bank-holiday' },
        ],
      },
      weatherByDate: {
        '2026-06-02': {
          date: '2026-06-02',
          weatherCode: 1,
          tempMinC: 12,
          tempMaxC: 24,
          sunrise: '2026-06-02T05:00:00Z',
          sunset: '2026-06-02T20:00:00Z',
          precipitationSumMm: 0,
          precipitationProbabilityMax: 10,
        },
      },
      dinnerTime: '18:00',
    });

    expect(plan.slots[0]?.role).toBe('good-weather');
    expect(plan.slots[0]?.selected.recipe.name).toBe('Garden Skewers');
  });

  it('fills empty slots with ranked meals and ranked alternatives', () => {
    const upSoonRecipe = makeRecipe(1, 'Quick Pasta', [
      { id: 10, name: 'Busy' },
      { id: 11, name: 'Pasta' },
    ]);
    const goodWeatherRecipe = makeRecipe(2, 'Garden Skewers', [{ id: 12, name: 'Outdoors' }], {
      created_at: '2026-05-15T10:00:00Z',
    });
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

  it('weights recipes toward matching precalculated weather history for the live forecast', () => {
    const weatherMatchedRecipe = makeRecipe(1, 'Zesty Grill Plate');
    const fallbackRecipe = makeRecipe(2, 'Aardvark Stew');
    const historicalMeals = [
      makeMealPlan(1, weatherMatchedRecipe, '2026-06-06'),
      makeMealPlan(2, weatherMatchedRecipe, '2026-06-13'),
      makeMealPlan(3, weatherMatchedRecipe, '2026-06-20'),
    ];
    const precalculation = buildMealAssistantPrecalculation({
      generatedAt: '2026-06-03T00:00:00.000Z',
      recipes: [weatherMatchedRecipe, fallbackRecipe],
      keywordNameById: {},
      mealPlans: historicalMeals,
      weatherByDate: {
        '2026-06-06': {
          temperatureBand: 'hot',
          precipitationBand: 'dry',
          daylightHours: 16,
          daylightBand: 'long',
          outdoorSuitability: 'good',
          tags: ['hot-day', 'dry-day', 'long-daylight', 'outdoor-good'],
        },
        '2026-06-13': {
          temperatureBand: 'hot',
          precipitationBand: 'dry',
          daylightHours: 16,
          daylightBand: 'long',
          outdoorSuitability: 'good',
          tags: ['hot-day', 'dry-day', 'long-daylight', 'outdoor-good'],
        },
        '2026-06-20': {
          temperatureBand: 'hot',
          precipitationBand: 'dry',
          daylightHours: 16,
          daylightBand: 'long',
          outdoorSuitability: 'good',
          tags: ['hot-day', 'dry-day', 'long-daylight', 'outdoor-good'],
        },
      },
    });

    const plan = buildMealAssistantPlan({
      weekStart: new Date('2026-07-20T00:00:00'),
      weekEnd: new Date('2026-07-26T00:00:00'),
      emptyDinnerDates: ['2026-07-25'],
      existingWeekMeals: [],
      historicalMeals: [],
      recipes: [weatherMatchedRecipe, fallbackRecipe],
      weatherByDate: {
        '2026-07-25': {
          date: '2026-07-25',
          weatherCode: 1,
          tempMinC: 17,
          tempMaxC: 28,
          sunrise: '2026-07-25T05:10:00Z',
          sunset: '2026-07-25T21:05:00Z',
          precipitationSumMm: 0,
          precipitationProbabilityMax: 5,
        },
      },
      dinnerTime: '18:00',
      precalculation,
    });

    expect(plan.slots[0]?.selected.recipe.name).toBe('Zesty Grill Plate');
    expect(
      plan.slots[0]?.selected.components.find((component) => component.key === 'weather-history'),
    ).toMatchObject({
      label: 'Weather fit',
    });
  });

  it('weights recipes toward matching precalculated calendar history for live appointments', () => {
    const calendarMatchedRecipe = makeRecipe(1, 'Bob Night Pasta');
    const fallbackRecipe = makeRecipe(2, 'Aardvark Stew');
    const precalculation = buildMealAssistantPrecalculation({
      generatedAt: '2026-06-03T00:00:00.000Z',
      recipes: [calendarMatchedRecipe, fallbackRecipe],
      keywordNameById: {},
      mealPlans: [
        makeMealPlan(1, calendarMatchedRecipe, '2026-05-05'),
        makeMealPlan(2, calendarMatchedRecipe, '2026-05-12'),
      ],
      calendarByDate: {
        '2026-05-05': {
          bankHoliday: false,
          appointmentFeatures: ['bob|long'],
        },
        '2026-05-12': {
          bankHoliday: false,
          appointmentFeatures: ['bob|long'],
        },
      },
    });

    const plan = buildMealAssistantPlan({
      weekStart: new Date('2026-07-20T00:00:00'),
      weekEnd: new Date('2026-07-26T00:00:00'),
      emptyDinnerDates: ['2026-07-22'],
      existingWeekMeals: [],
      historicalMeals: [],
      recipes: [calendarMatchedRecipe, fallbackRecipe],
      calendarEventsByDate: {
        '2026-07-22': [
          {
            name: 'Dinner with Bob',
            description: 'School pickup first',
            start: '2026-07-22T16:00:00Z',
            end: '2026-07-22T19:30:00Z',
            allDay: false,
            category: 'appointment',
          },
        ],
      },
      dinnerTime: '18:00',
      precalculation,
    });

    expect(plan.slots[0]?.selected.recipe.name).toBe('Bob Night Pasta');
    expect(
      plan.slots[0]?.selected.components.find((component) => component.key === 'calendar-history'),
    ).toMatchObject({
      label: 'Calendar fit',
    });
  });

  it('prefers close alternatives from precalculated similarities', () => {
    const selectedRecipe = makeRecipe(1, 'Quick Pasta', [{ id: 10, name: 'Busy' }], {
      steps: [
        {
          id: 1,
          instruction: 'Cook',
          order: 1,
          ingredients: [
            { id: 1, food: { id: 10, name: 'Tomato' } },
            { id: 2, food: { id: 11, name: 'Basil' } },
          ],
        },
      ],
    });
    const similarAlternative = makeRecipe(2, 'Zesty Pasta', [], {
      steps: [
        {
          id: 1,
          instruction: 'Cook',
          order: 1,
          ingredients: [
            { id: 1, food: { id: 10, name: 'Tomato' } },
            { id: 2, food: { id: 12, name: 'Cream' } },
          ],
        },
      ],
    });
    const genericAlternative = makeRecipe(3, 'Apple Curry', []);
    const precalculation = buildMealAssistantPrecalculation({
      generatedAt: '2026-06-03T00:00:00.000Z',
      keywordNameById: {},
      recipes: [selectedRecipe, similarAlternative, genericAlternative],
      mealPlans: [],
    });

    const plan = buildMealAssistantPlan({
      weekStart: new Date('2026-05-30T00:00:00'),
      weekEnd: new Date('2026-06-05T00:00:00'),
      emptyDinnerDates: ['2026-05-30'],
      existingWeekMeals: [],
      historicalMeals: [],
      recipes: [selectedRecipe, similarAlternative, genericAlternative],
      upSoonRecipeIds: [1],
      dinnerTime: '18:00',
      precalculation,
    });

    expect(plan.slots[0]?.selected.recipe.name).toBe('Quick Pasta');
    expect(plan.slots[0]?.alternatives[0].recipe.name).toBe('Zesty Pasta');
    expect(plan.slots[0]?.alternatives[0].components.some((c) => c.key === 'similar-to-1')).toBe(
      true,
    );
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

  it('filters unsuitable dinner tags when recipe keywords only include ids on inline objects', () => {
    const dinnerRecipe = makeRecipe(1, 'Pasta Bake', [{ id: 20, name: 'Pasta' }]);
    const breakfastRecipe = makeRecipe(2, 'Granola', [
      { id: 21 } as unknown as { id: number; name: string },
    ]);

    const plan = buildMealAssistantPlan({
      weekStart: new Date('2026-05-30T00:00:00'),
      weekEnd: new Date('2026-06-05T00:00:00'),
      emptyDinnerDates: ['2026-05-30'],
      existingWeekMeals: [],
      historicalMeals: [],
      recipes: [dinnerRecipe, breakfastRecipe],
      keywordNameById: { 21: 'Breakfast' },
      dinnerTime: '18:00',
    });

    expect(plan.slots[0]?.selected.recipe.name).toBe('Pasta Bake');
    expect(plan.slots[0]?.alternatives).toHaveLength(0);
  });

  it('plans lunch slots only from recipes tagged with lunch in lunch mode', () => {
    const lunchRecipe = makeRecipe(1, 'Sandwich', [{ id: 30, name: 'Lunch' }]);
    const dinnerRecipe = makeRecipe(2, 'Pasta Bake', [{ id: 31, name: 'Pasta' }]);
    const idOnlyLunchRecipe = makeRecipe(3, 'Wrap', [
      { id: 32 } as unknown as { id: number; name: string },
    ]);

    const plan = buildMealAssistantPlan({
      weekStart: new Date('2026-05-30T00:00:00'),
      weekEnd: new Date('2026-06-05T00:00:00'),
      planType: 'lunch',
      emptyDinnerDates: ['2026-05-30', '2026-05-31'],
      existingWeekMeals: [],
      historicalMeals: [],
      recipes: [lunchRecipe, dinnerRecipe, idOnlyLunchRecipe],
      keywordNameById: { 32: 'Lunch' },
      dinnerTime: '12:00',
    });

    expect(plan.slots).toHaveLength(2);
    expect(plan.slots.every((slot) => slot.role === 'general-lunch')).toBe(true);
    expect(
      plan.slots.flatMap((slot) => [
        slot.selected.recipe.id,
        ...slot.alternatives.map((candidate) => candidate.recipe.id),
      ]),
    ).not.toContain(2);
  });

  it('filters unsuitable dinner recipes by recipe name as well as tags', () => {
    const dinnerRecipe = makeRecipe(1, 'Quick Pasta', []);
    const breakfastByName = makeRecipe(2, 'Breakfast for Dinner', []);

    const plan = buildMealAssistantPlan({
      weekStart: new Date('2026-05-30T00:00:00'),
      weekEnd: new Date('2026-06-05T00:00:00'),
      emptyDinnerDates: ['2026-05-30'],
      existingWeekMeals: [],
      historicalMeals: [],
      recipes: [dinnerRecipe, breakfastByName],
      dinnerTime: '18:00',
    });

    expect(plan.slots[0]?.selected.recipe.name).toBe('Quick Pasta');
    expect(
      plan.slots.flatMap((slot) => [
        slot.selected.recipe.name,
        ...slot.alternatives.map((candidate) => candidate.recipe.name),
      ]),
    ).not.toContain('Breakfast for Dinner');
  });

  it('matches flavour roles from recipe names and silently falls back to general dinner', () => {
    const pastaByName = makeRecipe(1, 'Quick Pasta', []);
    const riceByName = makeRecipe(2, 'Rice Bowl', []);
    const noodlesByName = makeRecipe(3, 'Noodle Stir Fry', []);
    const generalDinnerCandidate = makeRecipe(4, 'Roast Vegetables', []);

    const pastaPlan = buildMealAssistantPlan({
      weekStart: new Date('2026-05-30T00:00:00'),
      weekEnd: new Date('2026-06-05T00:00:00'),
      emptyDinnerDates: ['2026-06-01'],
      existingWeekMeals: [],
      historicalMeals: [],
      recipes: [pastaByName],
      dinnerTime: '18:00',
    });

    expect(pastaPlan.slots.some((slot) => slot.role === 'pasta')).toBe(true);
    expect(pastaPlan.slots.find((slot) => slot.role === 'pasta')?.selected.recipe.name).toBe(
      'Quick Pasta',
    );
    expect(pastaPlan.slots.find((slot) => slot.role === 'pasta')?.roleFlavourDetail).toBe(
      'Try to have at least one pasta dish this week.',
    );

    const soyFreePlan = buildMealAssistantPlan({
      weekStart: new Date('2026-05-30T00:00:00'),
      weekEnd: new Date('2026-06-05T00:00:00'),
      emptyDinnerDates: ['2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06'],
      existingWeekMeals: [],
      historicalMeals: [],
      recipes: [pastaByName, riceByName, noodlesByName, generalDinnerCandidate],
      dinnerTime: '18:00',
    });

    const generalDinnerSlot = soyFreePlan.slots.find((slot) => slot.selected.recipe.id === 4);
    expect(generalDinnerSlot?.role).toBe('general-dinner');
    expect(generalDinnerSlot?.selected.warnings).toEqual([]);
  });

  it('silently falls back to general dinner when the category is already covered by an existing week meal', () => {
    const noodleRecipe = makeRecipe(1, 'Noodle Stir Fry', []);
    const busyNoodleRecipe = makeRecipe(2, 'Quick Noodles', [{ id: 10, name: 'Busy' }]);
    const generalRecipe = makeRecipe(3, 'Roast Vegetables', []);

    // The busy-day planner already added a noodle dish earlier in the week.
    // The noodle flavour slot should silently skip and pick a general dinner recipe instead.
    const plan = buildMealAssistantPlan({
      weekStart: new Date('2026-06-02T00:00:00'),
      weekEnd: new Date('2026-06-08T00:00:00'),
      emptyDinnerDates: ['2026-06-04'],
      existingWeekMeals: [makeMealPlan(100, busyNoodleRecipe, '2026-06-02')],
      historicalMeals: [],
      recipes: [noodleRecipe, generalRecipe],
      dinnerTime: '18:00',
    });

    const slot = plan.slots[0];
    expect(slot?.role).toBe('general-dinner');
    expect(slot?.roleLabel).toBe('General dinner');
    expect(slot?.selected.warnings).toEqual([]);
  });

  it('attaches roleFlavourDetail describing the triggering appointment for busy-day slots', () => {
    const quickRecipe = makeRecipe(1, 'Quick Noodles', [{ id: 10, name: 'Busy' }]);

    const plan = buildMealAssistantPlan({
      weekStart: new Date('2026-05-25T00:00:00'),
      weekEnd: new Date('2026-05-31T00:00:00'),
      emptyDinnerDates: ['2026-05-26'],
      existingWeekMeals: [],
      historicalMeals: [],
      recipes: [quickRecipe],
      calendarEventsByDate: {
        '2026-05-26': [
          {
            name: 'Dentist appointment',
            start: '2026-05-26T16:00:00',
            end: '2026-05-26T18:30:00',
            allDay: false,
          },
        ],
      },
      dinnerTime: '18:00',
    });

    expect(plan.slots[0]?.role).toBe('busy-day');
    expect(plan.slots[0]?.roleFlavourDetail).toContain('Dentist appointment');
  });

  it('attaches roleFlavourDetail describing the weather and day type for good-weather slots', () => {
    const outdoorsRecipe = makeRecipe(1, 'Garden Skewers', [{ id: 12, name: 'Outdoors' }]);

    const plan = buildMealAssistantPlan({
      weekStart: new Date('2026-05-25T00:00:00'),
      weekEnd: new Date('2026-05-31T00:00:00'),
      emptyDinnerDates: ['2026-05-30'],
      existingWeekMeals: [],
      historicalMeals: [],
      recipes: [outdoorsRecipe],
      weatherByDate: {
        '2026-05-30': {
          date: '2026-05-30',
          weatherCode: 1,
          tempMinC: 14,
          tempMaxC: 26,
          sunrise: '2026-05-30T05:00:00Z',
          sunset: '2026-05-30T20:00:00Z',
          precipitationSumMm: 0,
          precipitationProbabilityMax: 5,
        },
      },
      dinnerTime: '18:00',
    });

    expect(plan.slots[0]?.role).toBe('good-weather');
    expect(plan.slots[0]?.roleFlavourDetail).toContain('26°');
    expect(plan.slots[0]?.roleFlavourDetail).toContain('Saturday');
  });

  it('attaches roleFlavourDetail with bank holiday name for good-weather bank holiday slots', () => {
    const outdoorsRecipe = makeRecipe(1, 'Garden Skewers', [{ id: 12, name: 'Outdoors' }]);

    const plan = buildMealAssistantPlan({
      weekStart: new Date('2026-05-25T00:00:00'),
      weekEnd: new Date('2026-05-31T00:00:00'),
      emptyDinnerDates: ['2026-05-26'],
      existingWeekMeals: [],
      historicalMeals: [],
      recipes: [outdoorsRecipe],
      calendarEventsByDate: {
        '2026-05-26': [
          {
            name: 'Spring Bank Holiday',
            start: '2026-05-26',
            allDay: true,
            category: 'bank-holiday',
          },
        ],
      },
      weatherByDate: {
        '2026-05-26': {
          date: '2026-05-26',
          weatherCode: 1,
          tempMinC: 14,
          tempMaxC: 22,
          sunrise: '2026-05-26T05:00:00Z',
          sunset: '2026-05-26T20:00:00Z',
          precipitationSumMm: 0,
          precipitationProbabilityMax: 5,
        },
      },
      dinnerTime: '18:00',
    });

    expect(plan.slots[0]?.role).toBe('good-weather');
    expect(plan.slots[0]?.roleFlavourDetail).toContain('Spring Bank Holiday');
  });

  it('attaches roleFlavourDetail for takeaway slots', () => {
    const takeawayRecipe = makeRecipe(1, 'Takeaway', [{ id: 15, name: 'Takeaway' }]);

    const plan = buildMealAssistantPlan({
      weekStart: new Date('2026-05-25T00:00:00'),
      weekEnd: new Date('2026-05-31T00:00:00'),
      emptyDinnerDates: ['2026-05-26'],
      existingWeekMeals: [],
      historicalMeals: [],
      recipes: [takeawayRecipe],
      dinnerTime: '18:00',
    });

    expect(plan.slots[0]?.role).toBe('takeaway');
    expect(plan.slots[0]?.roleFlavourDetail).toContain('21 days');
  });

  it('uses special-day flavour on configured recurring dates and prefers recipes tagged special', () => {
    const specialRecipe = makeRecipe(1, 'Birthday Roast', [{ id: 100, name: 'Special' }]);
    const busyRecipe = makeRecipe(2, 'Quick Pasta', [{ id: 10, name: 'Busy' }]);

    const plan = buildMealAssistantPlan({
      weekStart: new Date('2026-05-25T00:00:00'),
      weekEnd: new Date('2026-05-31T00:00:00'),
      emptyDinnerDates: ['2026-05-26'],
      existingWeekMeals: [],
      historicalMeals: [],
      recipes: [specialRecipe, busyRecipe],
      calendarEventsByDate: {
        '2026-05-26': [
          {
            name: 'Late appointment',
            start: '2026-05-26T17:30:00',
            end: '2026-05-26T19:30:00',
            allDay: false,
          },
        ],
      },
      specialDates: [{ date: '2025-05-26', reason: "John's birthday" }],
      dinnerTime: '18:00',
    });

    expect(plan.slots[0]?.role).toBe('special-day');
    expect(plan.slots[0]?.selected.recipe.name).toBe('Birthday Roast');
    expect(plan.slots[0]?.roleFlavourDetail).toBe("Picked a special meal for John's birthday.");
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

  it('identifies produce tags from recipe name and keywords using a provided food name list', () => {
    const aubergineByName = makeRecipe(1, 'Aubergine Parmigiana', []);
    const eggplantByKeyword = makeRecipe(2, 'Stir Fry', [{ id: 50, name: 'Eggplant' }]);
    const courgetteSoup = makeRecipe(3, 'Courgette Soup', []);
    const generalDinner = makeRecipe(4, 'Pasta Bake', []);

    expect(getRecipeProduceTags(aubergineByName, {}, ['aubergine', 'courgette'])).toEqual([
      'aubergine',
    ]);
    expect(
      getRecipeProduceTags(eggplantByKeyword, { 50: 'Eggplant' }, ['aubergine', 'eggplant']),
    ).toEqual(['eggplant']);
    expect(getRecipeProduceTags(courgetteSoup, {}, ['aubergine', 'courgette'])).toEqual([
      'courgette',
    ]);
    expect(getRecipeProduceTags(generalDinner, {}, ['aubergine', 'courgette'])).toEqual([]);
    // Returns empty when produceFoodNames is empty (feature disabled)
    expect(getRecipeProduceTags(aubergineByName, {}, [])).toEqual([]);
  });

  it('penalises a recipe when the same produce ingredient would appear a second time this week', () => {
    const aubergineRecipe1 = makeRecipe(1, 'Aubergine Parmigiana', []);
    const aubergineRecipe2 = makeRecipe(2, 'Stuffed Aubergine', []);
    const generalRecipe = makeRecipe(3, 'Rice Bowl', [{ id: 13, name: 'Rice' }]);

    // existingWeekMeals already contains one aubergine dish; the second should be penalised
    const plan = buildMealAssistantPlan({
      weekStart: new Date('2026-05-25T00:00:00'),
      weekEnd: new Date('2026-05-31T00:00:00'),
      emptyDinnerDates: ['2026-05-27'],
      existingWeekMeals: [makeMealPlan(100, aubergineRecipe1, '2026-05-25')],
      historicalMeals: [],
      recipes: [aubergineRecipe2, generalRecipe],
      produceFoodNames: ['aubergine'],
      dinnerTime: '18:00',
    });

    const slot = plan.slots[0];
    expect(slot).toBeDefined();
    // The general recipe (no aubergine) should win because the second aubergine is penalised
    expect(slot?.selected.recipe.name).toBe('Rice Bowl');

    // The aubergine candidate should carry the produce-repeat component
    const aubergineCand = slot?.alternatives.find((a) => a.recipe.name === 'Stuffed Aubergine');
    expect(aubergineCand?.components.some((c) => c.key === 'produce-repeat-aubergine')).toBe(true);
    expect(
      aubergineCand?.components.find((c) => c.key === 'produce-repeat-aubergine')?.score,
    ).toBeLessThan(0);
  });

  it('penalises a recipe more heavily when the same produce would appear a third time', () => {
    const aubergineRecipe1 = makeRecipe(1, 'Aubergine Parmigiana', []);
    const aubergineRecipe2 = makeRecipe(2, 'Stuffed Aubergine', []);
    const aubergineRecipe3 = makeRecipe(3, 'Aubergine Curry', []);
    const generalRecipe = makeRecipe(4, 'Rice Bowl', [{ id: 13, name: 'Rice' }]);

    const plan = buildMealAssistantPlan({
      weekStart: new Date('2026-05-25T00:00:00'),
      weekEnd: new Date('2026-05-31T00:00:00'),
      emptyDinnerDates: ['2026-05-28'],
      existingWeekMeals: [
        makeMealPlan(100, aubergineRecipe1, '2026-05-25'),
        makeMealPlan(101, aubergineRecipe2, '2026-05-26'),
      ],
      historicalMeals: [],
      recipes: [aubergineRecipe3, generalRecipe],
      produceFoodNames: ['aubergine'],
      dinnerTime: '18:00',
    });

    const slot = plan.slots[0];
    expect(slot?.selected.recipe.name).toBe('Rice Bowl');
    const aubergineCand = slot?.alternatives.find((a) => a.recipe.name === 'Aubergine Curry');
    const penaltyComponent = aubergineCand?.components.find(
      (c) => c.key === 'produce-repeat-aubergine',
    );
    // Third occurrence should carry a heavier penalty than the second (existingCount=2 vs 1)
    expect(penaltyComponent?.score).toBeLessThanOrEqual(-20);
  });

  it('penalises recipes that repeat the same similarity cluster within the week', () => {
    const earlierPasta = makeRecipe(1, 'Creamy Tomato Pasta', [], {
      steps: [
        {
          id: 1,
          instruction: 'Cook',
          order: 1,
          ingredients: [
            { id: 1, food: { id: 10, name: 'Tomato' } },
            { id: 2, food: { id: 12, name: 'Cream' } },
          ],
        },
      ],
    });
    const repeatedClusterRecipe = makeRecipe(2, 'A Tomato Pasta', [], {
      steps: [
        {
          id: 1,
          instruction: 'Cook',
          order: 1,
          ingredients: [
            { id: 1, food: { id: 10, name: 'Tomato' } },
            { id: 2, food: { id: 11, name: 'Basil' } },
          ],
        },
      ],
    });
    const generalRecipe = makeRecipe(3, 'Z Rice Bowl', []);
    const precalculation = buildMealAssistantPrecalculation({
      generatedAt: '2026-06-03T00:00:00.000Z',
      keywordNameById: {},
      recipes: [earlierPasta, repeatedClusterRecipe, generalRecipe],
      mealPlans: [],
    });

    const plan = buildMealAssistantPlan({
      weekStart: new Date('2026-05-25T00:00:00'),
      weekEnd: new Date('2026-05-31T00:00:00'),
      emptyDinnerDates: ['2026-05-27'],
      existingWeekMeals: [makeMealPlan(100, earlierPasta, '2026-05-25')],
      historicalMeals: [],
      recipes: [repeatedClusterRecipe, generalRecipe],
      dinnerTime: '18:00',
      precalculation,
    });

    expect(plan.slots[0]?.selected.recipe.name).toBe('Z Rice Bowl');
    const repeatedClusterCandidate = plan.slots[0]?.alternatives.find(
      (candidate) => candidate.recipe.id === 2,
    );
    expect(
      repeatedClusterCandidate?.components.some(
        (component) => component.key === 'same-cluster-repeat',
      ),
    ).toBe(true);
    expect(
      repeatedClusterCandidate?.components.find(
        (component) => component.key === 'same-cluster-repeat',
      )?.score,
    ).toBeLessThan(0);
  });

  it('tracks aubergine and eggplant as independent produce names (no synonym grouping)', () => {
    const aubergineRecipe = makeRecipe(1, 'Aubergine Parmigiana', []);
    const eggplantRecipe = makeRecipe(2, 'Eggplant Stir Fry', []);
    const generalRecipe = makeRecipe(3, 'Rice Bowl', [{ id: 13, name: 'Rice' }]);

    // Both names in the list but only aubergine has been used this week.
    // 'eggplant' count is still 0, so Eggplant Stir Fry is NOT penalised.
    const plan = buildMealAssistantPlan({
      weekStart: new Date('2026-05-25T00:00:00'),
      weekEnd: new Date('2026-05-31T00:00:00'),
      emptyDinnerDates: ['2026-05-27'],
      existingWeekMeals: [makeMealPlan(100, aubergineRecipe, '2026-05-25')],
      historicalMeals: [],
      recipes: [eggplantRecipe, generalRecipe],
      produceFoodNames: ['aubergine', 'eggplant'],
      dinnerTime: '18:00',
    });

    const slot = plan.slots[0];
    const eggplantCand =
      slot?.selected.recipe.name === 'Eggplant Stir Fry'
        ? slot.selected
        : slot?.alternatives.find((a) => a.recipe.name === 'Eggplant Stir Fry');
    expect(eggplantCand?.components.some((c) => c.key.startsWith('produce-repeat-'))).toBe(false);
  });

  it('does not penalise the first occurrence of a produce ingredient in the week', () => {
    const aubergineRecipe = makeRecipe(1, 'Aubergine Parmigiana', []);
    const generalRecipe = makeRecipe(2, 'Rice Bowl', [{ id: 13, name: 'Rice' }]);

    const plan = buildMealAssistantPlan({
      weekStart: new Date('2026-05-25T00:00:00'),
      weekEnd: new Date('2026-05-31T00:00:00'),
      emptyDinnerDates: ['2026-05-27'],
      existingWeekMeals: [],
      historicalMeals: [],
      recipes: [aubergineRecipe, generalRecipe],
      produceFoodNames: ['aubergine'],
      dinnerTime: '18:00',
    });

    const slot = plan.slots[0];
    const aubergineCand =
      slot?.selected.recipe.name === 'Aubergine Parmigiana'
        ? slot.selected
        : slot?.alternatives.find((a) => a.recipe.name === 'Aubergine Parmigiana');
    expect(aubergineCand?.components.some((c) => c.key.startsWith('produce-repeat-'))).toBe(false);
  });

  it('skips produce penalty entirely when produceFoodNames is not provided', () => {
    const aubergineRecipe1 = makeRecipe(1, 'Aubergine Parmigiana', []);
    const aubergineRecipe2 = makeRecipe(2, 'Stuffed Aubergine', []);

    // No produceFoodNames supplied → no penalty regardless of repetition
    const plan = buildMealAssistantPlan({
      weekStart: new Date('2026-05-25T00:00:00'),
      weekEnd: new Date('2026-05-31T00:00:00'),
      emptyDinnerDates: ['2026-05-27'],
      existingWeekMeals: [makeMealPlan(100, aubergineRecipe1, '2026-05-25')],
      historicalMeals: [],
      recipes: [aubergineRecipe2],
      dinnerTime: '18:00',
    });

    const slot = plan.slots[0];
    expect(slot?.selected.components.some((c) => c.key.startsWith('produce-repeat-'))).toBe(false);
  });

  it('uses precalculated produce tags for repetition penalties', () => {
    const usedProduceRecipe = makeRecipe(1, 'Roasted traybake', [], {
      steps: [{ id: 1, instruction: 'prep', order: 1, ingredients: [{ id: 1, food: 10 }] }],
    });
    const candidateProduceRecipe = makeRecipe(2, 'Weeknight bake', [], {
      steps: [{ id: 1, instruction: 'prep', order: 1, ingredients: [{ id: 2, food: 10 }] }],
    });
    const generalRecipe = makeRecipe(3, 'Rice Bowl', [{ id: 13, name: 'Rice' }]);
    const precalculation = buildMealAssistantPrecalculation({
      generatedAt: '2026-06-03T00:00:00.000Z',
      recipes: [usedProduceRecipe, candidateProduceRecipe, generalRecipe],
      keywordNameById: {},
      mealPlans: [],
      produceFoods: [{ id: 10, name: 'aubergine' }],
    });

    const plan = buildMealAssistantPlan({
      weekStart: new Date('2026-05-25T00:00:00'),
      weekEnd: new Date('2026-05-31T00:00:00'),
      emptyDinnerDates: ['2026-05-27'],
      existingWeekMeals: [makeMealPlan(100, usedProduceRecipe, '2026-05-25')],
      historicalMeals: [],
      recipes: [candidateProduceRecipe, generalRecipe],
      dinnerTime: '18:00',
      precalculation,
    });

    const slot = plan.slots[0];
    expect(slot?.selected.recipe.name).toBe('Rice Bowl');
    const produceCandidate = slot?.alternatives.find((a) => a.recipe.name === 'Weeknight bake');
    expect(produceCandidate?.components.some((c) => c.key === 'produce-repeat-aubergine')).toBe(
      true,
    );
  });

  it('does not add a due-again score when a recipe has no history', () => {
    const recipe = makeRecipe(1, 'Fresh Find');
    const plan = buildMealAssistantPlan({
      weekStart: new Date('2026-06-01T00:00:00'),
      weekEnd: new Date('2026-06-07T00:00:00'),
      emptyDinnerDates: ['2026-06-03'],
      existingWeekMeals: [],
      historicalMeals: [],
      recipes: [recipe],
      dinnerTime: '18:00',
    });

    expect(
      plan.slots[0]?.selected.components.some((component) => component.key === 'due-again'),
    ).toBe(false);
  });

  it('does not add a due-again score when only one history entry exists', () => {
    const recipe = makeRecipe(1, 'Single Entry Curry');
    const plan = buildMealAssistantPlan({
      weekStart: new Date('2026-06-01T00:00:00'),
      weekEnd: new Date('2026-06-07T00:00:00'),
      emptyDinnerDates: ['2026-06-03'],
      existingWeekMeals: [],
      historicalMeals: [makeMealPlan(10, recipe.id, '2026-03-01')],
      recipes: [recipe],
      dinnerTime: '18:00',
    });

    expect(
      plan.slots[0]?.selected.components.some((component) => component.key === 'due-again'),
    ).toBe(false);
  });

  it('adds a due-again score for recipes overdue against regular monthly cadence', () => {
    const overdueRecipe = makeRecipe(1, 'Zesty Monthly Pasta Curry');
    const fallbackRecipe = makeRecipe(2, 'Aardvark Pasta');
    const historicalMeals = [
      makeMealPlan(1, overdueRecipe.id, '2026-01-01'),
      makeMealPlan(2, overdueRecipe.id, '2026-02-01'),
      makeMealPlan(3, overdueRecipe.id, '2026-03-01'),
      makeMealPlan(4, overdueRecipe.id, '2026-04-01'),
    ];
    const precalculation = buildMealAssistantPrecalculation({
      generatedAt: '2026-06-03T00:00:00.000Z',
      recipes: [overdueRecipe, fallbackRecipe],
      keywordNameById: {},
      mealPlans: historicalMeals,
    });

    const plan = buildMealAssistantPlan({
      weekStart: new Date('2026-06-01T00:00:00'),
      weekEnd: new Date('2026-06-07T00:00:00'),
      emptyDinnerDates: ['2026-06-03'],
      existingWeekMeals: [],
      historicalMeals: [],
      recipes: [overdueRecipe, fallbackRecipe],
      dinnerTime: '18:00',
      precalculation,
    });

    const overdueCandidate =
      plan.slots[0]?.selected.recipe.id === overdueRecipe.id
        ? plan.slots[0].selected
        : plan.slots[0]?.alternatives.find((candidate) => candidate.recipe.id === overdueRecipe.id);
    const dueComponent = overdueCandidate?.components.find(
      (component) => component.key === 'due-again',
    );
    expect(dueComponent?.label).toBe('Due again');
    expect(dueComponent?.score).toBeGreaterThan(0);
  });

  it('keeps recently planned recipes excluded even when long-term cadence exists', () => {
    const recentlyPlannedRecipe = makeRecipe(1, 'Cadence But Recent');
    const fallbackRecipe = makeRecipe(2, 'Always Available');
    const historicalMeals = [
      makeMealPlan(1, recentlyPlannedRecipe.id, '2026-01-01'),
      makeMealPlan(2, recentlyPlannedRecipe.id, '2026-02-01'),
      makeMealPlan(3, recentlyPlannedRecipe.id, '2026-03-01'),
      makeMealPlan(4, recentlyPlannedRecipe.id, '2026-05-30'),
    ];

    const plan = buildMealAssistantPlan({
      weekStart: new Date('2026-06-01T00:00:00'),
      weekEnd: new Date('2026-06-07T00:00:00'),
      emptyDinnerDates: ['2026-06-03'],
      existingWeekMeals: [],
      historicalMeals,
      recipes: [recentlyPlannedRecipe, fallbackRecipe],
      dinnerTime: '18:00',
    });

    expect(plan.slots[0]?.selected.recipe.id).toBe(fallbackRecipe.id);
    const allCandidateIds = [
      plan.slots[0]?.selected.recipe.id,
      ...(plan.slots[0]?.alternatives.map((candidate) => candidate.recipe.id) ?? []),
    ];
    expect(allCandidateIds).not.toContain(recentlyPlannedRecipe.id);
  });

  it('beam search avoids greedy local optimum by reserving a high-value recipe for a later slot', () => {
    // Recipe A (busyRecipe): tagged busy + marked up-soon.
    //   Greedy scores it highest in slot 1 (general-dinner, Wed): up-soon=24.
    //   But it is the only busy recipe so it would be invaluable in slot 2 (busy-day, Thu): up-soon=24 + role-fit=16 = 40.
    //   Greedy picks A for slot 1, leaving slot 2 with only generalRecipe (score 0).
    //   Greedy total = 24. Beam total = 0 + 40 = 40 → beam wins.
    const busyRecipe = makeRecipe(1, 'Quick Stir Fry', [{ id: 10, name: 'Busy' }]);
    const generalRecipe = makeRecipe(2, 'Oven Bake', []);

    const plan = buildMealAssistantPlan({
      weekStart: new Date('2026-06-01T00:00:00'),
      weekEnd: new Date('2026-06-07T00:00:00'),
      // Wed = general-dinner, Thu = busy-day (late appointment)
      emptyDinnerDates: ['2026-06-03', '2026-06-04'],
      existingWeekMeals: [],
      historicalMeals: [],
      recipes: [busyRecipe, generalRecipe],
      upSoonRecipeIds: [1],
      calendarEventsByDate: {
        '2026-06-04': [
          {
            name: 'Late client call',
            start: '2026-06-04T17:00:00',
            end: '2026-06-04T19:00:00',
            allDay: false,
          },
        ],
      },
      dinnerTime: '18:00',
    });

    expect(plan.slots).toHaveLength(2);
    // Beam search should save busyRecipe (high cumulative value) for the busy-day slot
    expect(plan.slots[1]?.selected.recipe.name).toBe('Quick Stir Fry');
    expect(plan.slots[0]?.selected.recipe.name).toBe('Oven Bake');
    // The busy-day slot carries both up-soon and role-fit bonus
    const busySlot = plan.slots[1];
    expect(busySlot?.selected.components.some((c) => c.key === 'up-soon')).toBe(true);
    expect(busySlot?.selected.components.some((c) => c.key === 'role-fit')).toBe(true);
    // The general-dinner slot's score is lower than the busy-day slot's score
    expect(plan.slots[0]?.selected.score).toBeLessThan(plan.slots[1]?.selected.score);
  });

  it('beam search preserves no-duplicate behaviour across slots', () => {
    const recipeA = makeRecipe(1, 'Pasta Arrabbiata', []);
    const recipeB = makeRecipe(2, 'Rice Pilaf', []);
    const recipeC = makeRecipe(3, 'Noodle Soup', []);

    const plan = buildMealAssistantPlan({
      weekStart: new Date('2026-06-01T00:00:00'),
      weekEnd: new Date('2026-06-07T00:00:00'),
      emptyDinnerDates: ['2026-06-03', '2026-06-04', '2026-06-05'],
      existingWeekMeals: [],
      historicalMeals: [],
      recipes: [recipeA, recipeB, recipeC],
      dinnerTime: '18:00',
    });

    const selectedIds = plan.slots.map((s) => s.selected.recipe.id);
    // Every selected recipe must be unique across slots
    expect(new Set(selectedIds).size).toBe(selectedIds.length);
  });

  it('beam search respects week-level produce penalty across slots', () => {
    // Slot 1 already-existing meal uses courgette.
    // Both remaining candidates also use courgette.
    // Beam search should still apply the cumulative penalty correctly across paths.
    const existingCourgette = makeRecipe(1, 'Courgette Fritters', []);
    const courgette2 = makeRecipe(2, 'Stuffed Courgette', []);
    const neutralRecipe = makeRecipe(3, 'Bean Stew', []);

    const plan = buildMealAssistantPlan({
      weekStart: new Date('2026-06-01T00:00:00'),
      weekEnd: new Date('2026-06-07T00:00:00'),
      emptyDinnerDates: ['2026-06-03'],
      existingWeekMeals: [makeMealPlan(100, existingCourgette, '2026-06-01')],
      historicalMeals: [],
      recipes: [courgette2, neutralRecipe],
      produceFoodNames: ['courgette'],
      dinnerTime: '18:00',
    });

    // neutralRecipe has no courgette penalty and should win
    expect(plan.slots[0]?.selected.recipe.name).toBe('Bean Stew');
    const courgetteCand = plan.slots[0]?.alternatives.find(
      (a) => a.recipe.name === 'Stuffed Courgette',
    );
    expect(courgetteCand?.components.some((c) => c.key === 'produce-repeat-courgette')).toBe(true);
  });
});
