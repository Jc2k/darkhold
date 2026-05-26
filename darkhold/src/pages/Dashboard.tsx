import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookmarkFill, Check2Circle } from 'react-bootstrap-icons';
import { apiGet } from '../api/client';
import type { Recipe, Keyword, MealPlan, MealType, PaginatedResponse } from '../api/tandoor-types';
import { RecipeCard } from '../components/RecipeCard';
import { MealPlanAddModal } from '../components/MealPlanAddModal';
import { CookLogModal } from '../components/CookLogModal';
import { LoadingMascot } from '../components/LoadingMascot';

import { useUpSoonData } from '../hooks/useUpSoon';
import { useCookLog } from '../hooks/useCookLog';
import { useMealPlan } from '../hooks/useMealPlan';
import { smallCircleButtonStyle } from '../utils/buttonStyles';
import { formatDate, getMealPlanWeekStartSaturday } from '../utils/dateUtils';
import { buildRecentlyAddedRecipeParams } from '../utils/recentRecipes';

function addDays(date: Date, numDays: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + numDays);
  return result;
}

function toMealTimeMinutes(mealType: MealType | number): number {
  if (typeof mealType !== 'object') return Number.MAX_SAFE_INTEGER;

  const time = mealType.time;
  if (!time) return Number.MAX_SAFE_INTEGER;

  const match = time.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return Number.MAX_SAFE_INTEGER;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return Number.MAX_SAFE_INTEGER;
  }

  return hours * 60 + minutes;
}

function compareMealPlanEntries(a: MealPlan, b: MealPlan): number {
  if (a.from_date !== b.from_date) return a.from_date.localeCompare(b.from_date);

  const aMealTime = toMealTimeMinutes(a.meal_type);
  const bMealTime = toMealTimeMinutes(b.meal_type);
  if (aMealTime !== bMealTime) return aMealTime - bMealTime;

  const aMealOrder =
    typeof a.meal_type === 'object'
      ? (a.meal_type.order ?? Number.MAX_SAFE_INTEGER)
      : Number.MAX_SAFE_INTEGER;
  const bMealOrder =
    typeof b.meal_type === 'object'
      ? (b.meal_type.order ?? Number.MAX_SAFE_INTEGER)
      : Number.MAX_SAFE_INTEGER;
  if (aMealOrder !== bMealOrder) return aMealOrder - bMealOrder;

  return a.id - b.id;
}

function shortDay(date: Date): string {
  return date.toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' });
}

interface ShelfProps {
  title: ReactNode;
  searchLink?: string;
  recipes: Recipe[];
  loading: boolean;
  error: boolean;
  onAddToMealPlan: (r: Recipe) => void;
}

function RecipeShelf({ title, searchLink, recipes, loading, error, onAddToMealPlan }: ShelfProps) {
  if (loading) return null;
  if (!error && recipes.length === 0) return null;
  return (
    <section className="mb-4">
      <div className="d-flex align-items-center justify-content-between mb-2">
        <h5 className="mb-0">{title}</h5>
        {searchLink && (
          <Link to={searchLink} className="small text-muted">
            See all →
          </Link>
        )}
      </div>
      {error && <span className="text-danger small">Failed to load</span>}
      <div
        className="d-flex gap-3 pb-2 hide-scrollbar"
        style={{ overflowX: 'auto', scrollSnapType: 'x mandatory' }}
      >
        {recipes.map((r) => (
          <div key={r.id} style={{ minWidth: 200, maxWidth: 200, scrollSnapAlign: 'start' }}>
            <RecipeCard recipe={r} onAddToMealPlan={onAddToMealPlan} />
          </div>
        ))}
      </div>
    </section>
  );
}

interface UpcomingMealsShelfProps {
  days: Date[];
  mealsByDay: Record<string, MealPlan[]>;
  loading: boolean;
  error: boolean;
  onAddToMealPlan: (r: Recipe) => void;
  cookedToday: number[];
  onLogCook: (entry: MealPlan) => void;
}

const cookLogButtonStyle: React.CSSProperties = {
  ...smallCircleButtonStyle,
  position: 'absolute',
  bottom: 8,
  right: 88,
};

function UpcomingMealsShelf({
  days,
  mealsByDay,
  loading,
  error,
  onAddToMealPlan,
  cookedToday,
  onLogCook,
}: UpcomingMealsShelfProps) {
  // Flatten days into individual card items so all cards sit in one horizontal row.
  // The date label is shown only above the first card of each day group.
  const DATE_LABEL_HEIGHT = '1.4rem';
  const todayStr = formatDate(new Date());
  const items = days.flatMap(
    (day): Array<{ day: Date; entry: MealPlan | null; isFirstOfDay: boolean }> => {
      const key = formatDate(day);
      const entries = mealsByDay[key] ?? [];
      if (entries.length === 0) {
        return [{ day, entry: null, isFirstOfDay: true }];
      }
      return entries.map((entry, index) => ({ day, entry, isFirstOfDay: index === 0 }));
    },
  );

  if (loading) return null;

  return (
    <section className="mb-4">
      <div className="d-flex align-items-center justify-content-between mb-2">
        <h5 className="mb-0">🗓️ Upcoming Meals</h5>
        <Link to="/meal-plan" className="small text-muted">
          See all →
        </Link>
      </div>
      {error && <span className="text-danger small">Failed to load</span>}
      <div
        className="d-flex gap-3 hide-scrollbar"
        style={{ overflowX: 'auto', scrollSnapType: 'x mandatory' }}
      >
        {items.map(({ day, entry, isFirstOfDay }) => {
          const recipe = entry && typeof entry.recipe === 'object' ? entry.recipe : null;
          const dateKey = formatDate(day);
          const isEligible = dateKey <= todayStr && entry !== null && recipe !== null;
          const recipeId = recipe?.id ?? 0;
          const isCooked = isEligible && cookedToday.includes(recipeId);
          return (
            <div
              key={entry ? `${formatDate(day)}-${entry.id}` : `${formatDate(day)}-empty`}
              className="d-flex flex-column"
              style={{
                minWidth: 200,
                maxWidth: 200,
                flexShrink: 0,
                scrollSnapAlign: isFirstOfDay ? 'start' : 'none',
              }}
            >
              <div
                className="text-muted small fw-semibold mb-1 text-center"
                style={{ height: DATE_LABEL_HEIGHT }}
              >
                {isFirstOfDay ? shortDay(day) : null}
              </div>
              <div className="flex-grow-1" style={{ position: 'relative' }}>
                {entry && recipe ? (
                  <>
                    <RecipeCard
                      recipe={recipe}
                      onAddToMealPlan={onAddToMealPlan}
                      linkTo={`/meal-plan-entry/${entry.id}`}
                      imageOverlayAction={
                        isEligible && !isCooked ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            style={cookLogButtonStyle}
                            onClick={(e) => {
                              e.stopPropagation();
                              onLogCook(entry);
                            }}
                            aria-label="Log as cooked"
                          >
                            <Check2Circle size={14} />
                          </Button>
                        ) : undefined
                      }
                    />
                  </>
                ) : (
                  <div
                    className="d-flex h-100 align-items-center justify-content-center text-muted border rounded"
                    style={{ fontSize: '0.8rem', borderStyle: 'dashed' as const }}
                  >
                    No meal planned
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function useDashboardShelf(queryKey: string[], queryFn: () => Promise<PaginatedResponse<Recipe>>) {
  return useQuery({ queryKey, queryFn });
}

function useTagShelf(tag: string) {
  // Step 1: look up the keyword by exact name to get its ID.
  const keywordQuery = useQuery({
    queryKey: ['keywords', 'by-name', tag],
    queryFn: async () => {
      const data = await apiGet<PaginatedResponse<Keyword>>('/keyword/', {
        query: tag,
        page_size: 100,
      });
      return data.results.find((k) => k.name.toLowerCase() === tag.toLowerCase()) ?? null;
    },
  });

  const keywordId = keywordQuery.data?.id;

  // Step 2: fetch recipes filtered by keyword, sorted by cook date (most recent first) then newest first.
  const recipeQuery = useQuery({
    queryKey: ['recipes', 'tag', tag],
    queryFn: () =>
      apiGet<PaginatedResponse<Recipe>>('/recipe/', {
        keywords: keywordId as number,
        sort_order: '-lastcooked',
        page_size: 10,
      }),
    enabled: keywordId !== undefined,
  });

  return {
    data: recipeQuery.data,
    isLoading: keywordQuery.isLoading || recipeQuery.isLoading,
    isError: keywordQuery.isError || recipeQuery.isError,
    keywordId,
  };
}

interface SeasonConfig {
  tag: string;
  title: string;
  emoji: string;
}

const SEASON_CONFIGS: SeasonConfig[] = [
  { tag: 'spring', title: 'Spring', emoji: '🌸' },
  { tag: 'summer', title: 'Summer', emoji: '☀️' },
  { tag: 'autumn', title: 'Autumn', emoji: '🍂' },
  { tag: 'winter', title: 'Winter', emoji: '❄️' },
  { tag: 'christmas', title: 'Christmas', emoji: '🎄' },
];

function getActiveSeasons(date: Date): Set<string> {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const active = new Set<string>();

  if ((month === 2 && day >= 15) || (month >= 3 && month <= 5) || (month === 6 && day <= 14)) {
    active.add('spring');
  }
  if ((month === 5 && day >= 15) || (month >= 6 && month <= 8) || (month === 9 && day <= 14)) {
    active.add('summer');
  }
  if ((month === 8 && day >= 15) || (month >= 9 && month <= 11) || (month === 12 && day <= 14)) {
    active.add('autumn');
  }
  if (
    (month === 11 && day >= 15) ||
    month === 12 ||
    month === 1 ||
    month === 2 ||
    (month === 3 && day <= 14)
  ) {
    active.add('winter');
  }
  if (month === 12) {
    active.add('christmas');
  }

  return active;
}

function useSeasonalShelf(tag: string, enabled: boolean) {
  const keywordQuery = useQuery({
    queryKey: ['keywords', 'by-name', tag],
    queryFn: async () => {
      const data = await apiGet<PaginatedResponse<Keyword>>('/keyword/', {
        query: tag,
        page_size: 100,
      });
      return data.results.find((k) => k.name.toLowerCase() === tag.toLowerCase()) ?? null;
    },
    enabled,
  });

  const keywordId = keywordQuery.data?.id;

  const recipeQuery = useQuery({
    queryKey: ['recipes', 'seasonal', tag],
    queryFn: () =>
      apiGet<PaginatedResponse<Recipe>>('/recipe/', {
        keywords: keywordId as number,
        page_size: 10,
      }),
    enabled: enabled && keywordId !== undefined,
  });

  return {
    data: recipeQuery.data,
    isLoading: keywordQuery.isLoading || recipeQuery.isLoading,
    isError: keywordQuery.isError || recipeQuery.isError,
    keywordId,
  };
}

interface TagShelfConfig {
  tag: string;
  title: string;
  emoji: string;
}

const TAG_SHELF_CONFIGS: TagShelfConfig[] = [
  { tag: 'Adam', title: 'Adam', emoji: '👨‍🍳' },
  { tag: 'soy-free', title: 'Soy Free', emoji: '🌱' },
  { tag: 'pasta', title: 'Pasta', emoji: '🍝' },
];

function TagShelf({
  config,
  onAddToMealPlan,
}: {
  config: TagShelfConfig;
  onAddToMealPlan: (r: Recipe) => void;
}) {
  const query = useTagShelf(config.tag);
  const searchLink = query.keywordId
    ? `/search?keywords=${query.keywordId}`
    : `/search?q=${encodeURIComponent(config.tag)}`;
  return (
    <RecipeShelf
      title={`${config.emoji} ${config.title}`}
      searchLink={searchLink}
      recipes={query.data?.results ?? []}
      loading={query.isLoading}
      error={query.isError}
      onAddToMealPlan={onAddToMealPlan}
    />
  );
}

function SeasonalShelf({
  config,
  enabled,
  onAddToMealPlan,
}: {
  config: SeasonConfig;
  enabled: boolean;
  onAddToMealPlan: (r: Recipe) => void;
}) {
  const query = useSeasonalShelf(config.tag, enabled);
  if (!enabled) return null;
  const searchLink = query.keywordId
    ? `/search?keywords=${query.keywordId}`
    : `/search?q=${config.tag}`;
  return (
    <RecipeShelf
      title={`${config.emoji} ${config.title} Recipes`}
      searchLink={searchLink}
      recipes={query.data?.results ?? []}
      loading={query.isLoading}
      error={query.isError}
      onAddToMealPlan={onAddToMealPlan}
    />
  );
}

async function fetchRecentMealPlans(fromDate: string, toDate: string): Promise<MealPlan[]> {
  const all: MealPlan[] = [];
  let page = 1;
  let hasNext = true;
  while (hasNext) {
    const data = await apiGet<PaginatedResponse<MealPlan>>('/meal-plan/', {
      from_date: fromDate,
      to_date: toDate,
      page_size: 100,
      page,
    });
    all.push(...data.results);
    hasNext = !!data.next;
    page++;
  }
  return all;
}

function useRegularsShelf() {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const sixWeeksAgo = useMemo(() => addDays(today, -42), [today]);

  return useQuery({
    queryKey: ['meal-plan', 'regulars', formatDate(sixWeeksAgo), formatDate(today)],
    queryFn: async () => {
      const entries = await fetchRecentMealPlans(formatDate(sixWeeksAgo), formatDate(today));

      const recipeById = new Map<number, Recipe>();
      const countById = new Map<number, number>();

      for (const mp of entries) {
        if (typeof mp.recipe === 'object') {
          const id = mp.recipe.id;
          countById.set(id, (countById.get(id) ?? 0) + 1);
          recipeById.set(id, mp.recipe);
        }
      }

      const regulars: Recipe[] = [];
      for (const [id, recipe] of recipeById) {
        if ((countById.get(id) ?? 0) >= 2) {
          regulars.push(recipe);
        }
      }

      // Fisher-Yates shuffle
      for (let i = regulars.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [regulars[i], regulars[j]] = [regulars[j], regulars[i]];
      }

      return { results: regulars.slice(0, 10), count: regulars.length };
    },
  });
}

function UpSoonShelf({ onAddToMealPlan }: { onAddToMealPlan: (r: Recipe) => void }) {
  const { data, isLoading, isError } = useUpSoonData();

  if (isLoading) return null;
  if (!isError && (!data || data.entries.length === 0)) return null;

  const recipes = data?.entries.map((e) => e.recipe) ?? [];

  return (
    <RecipeShelf
      title={
        <>
          <BookmarkFill className="me-2 text-warning" />
          Up Soon
        </>
      }
      searchLink={data ? `/books/${data.bookId}` : '/books'}
      recipes={recipes}
      loading={isLoading}
      error={isError}
      onAddToMealPlan={onAddToMealPlan}
    />
  );
}

function RecentlyViewedShelf({ onAddToMealPlan }: { onAddToMealPlan: (r: Recipe) => void }) {
  const { data, isLoading, isError } = useDashboardShelf(['recently-viewed'], () =>
    apiGet<PaginatedResponse<Recipe>>('/recipe/', {
      sort_order: '-lastviewed',
      viewedon_gte: '2000-01-01',
      page_size: 10,
    }),
  );

  if (isLoading) return null;
  if (!isError && (!data || data.results.length === 0)) return null;

  return (
    <RecipeShelf
      title="🕐 Recently Viewed"
      recipes={data?.results ?? []}
      loading={isLoading}
      error={isError}
      onAddToMealPlan={onAddToMealPlan}
    />
  );
}

export function Dashboard() {
  const [modalRecipe, setModalRecipe] = useState<Recipe | null>(null);
  const [cookLogEntry, setCookLogEntry] = useState<MealPlan | null>(null);

  const today = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);
  const activeSeasons = getActiveSeasons(today);
  const todayStr = formatDate(today);

  const currentWeekStart = useMemo(() => getMealPlanWeekStartSaturday(today), [today]);
  const nextWeekStart = useMemo(() => addDays(currentWeekStart, 7), [currentWeekStart]);
  const currentWeekMealPlan = useMealPlan(currentWeekStart, addDays(currentWeekStart, 6));
  const nextWeekMealPlan = useMealPlan(nextWeekStart, addDays(nextWeekStart, 6));

  // Derived cook log modal props — computed outside JSX to avoid inline IIFEs.
  const cookLogMealType =
    cookLogEntry && typeof cookLogEntry.meal_type === 'object'
      ? (cookLogEntry.meal_type as MealType)
      : undefined;
  const cookLogRecipeId = cookLogEntry
    ? typeof cookLogEntry.recipe === 'object'
      ? cookLogEntry.recipe.id
      : (cookLogEntry.recipe as number)
    : 0;
  const cookLogDate = cookLogEntry?.from_date.split('T')[0] ?? '';

  const upcomingMealPlanEntries = useMemo(() => {
    const currentWeekEntries = currentWeekMealPlan.data?.results ?? [];
    const nextWeekEntries = nextWeekMealPlan.data?.results ?? [];
    return [...currentWeekEntries, ...nextWeekEntries];
  }, [currentWeekMealPlan.data?.results, nextWeekMealPlan.data?.results]);

  // Fetch cook log for today only — upcoming shelf only shows ticks on today's meals.
  const { data: cookLogData } = useCookLog(todayStr, todayStr);
  const cookedToday: number[] = cookLogData?.[todayStr] ?? [];

  const days = Array.from({ length: 8 }, (_, i) => addDays(today, i));

  const mealsByDay: Record<string, MealPlan[]> = {};
  for (const day of days) {
    mealsByDay[formatDate(day)] = [];
  }
  const sortedEntries = upcomingMealPlanEntries.slice().sort(compareMealPlanEntries);
  for (const mp of sortedEntries) {
    const key = mp.from_date.split('T')[0];
    if (key in mealsByDay && typeof mp.recipe === 'object') {
      mealsByDay[key].push(mp);
    }
  }

  const recentlyAdded = useDashboardShelf(['recipes', 'recent'], () =>
    apiGet<PaginatedResponse<Recipe>>('/recipe/', {
      ...buildRecentlyAddedRecipeParams(),
      page_size: 10,
    }),
  );

  const regulars = useRegularsShelf();

  // On cold start (no cached data), show a full-page spinner until at least one
  // shelf query has settled so shelves don't flash in an empty state then vanish.
  const isInitialDashboardLoad =
    currentWeekMealPlan.isLoading &&
    nextWeekMealPlan.isLoading &&
    regulars.isLoading &&
    recentlyAdded.isLoading;

  if (isInitialDashboardLoad) {
    return <LoadingMascot />;
  }

  return (
    <div className="pt-2">
      <UpcomingMealsShelf
        days={days}
        mealsByDay={mealsByDay}
        loading={currentWeekMealPlan.isLoading || nextWeekMealPlan.isLoading}
        error={currentWeekMealPlan.isError && nextWeekMealPlan.isError}
        onAddToMealPlan={setModalRecipe}
        cookedToday={cookedToday}
        onLogCook={setCookLogEntry}
      />

      <UpSoonShelf onAddToMealPlan={setModalRecipe} />

      <RecipeShelf
        title="🔁 Regulars"
        searchLink="/meal-plan"
        recipes={regulars.data?.results ?? []}
        loading={regulars.isLoading}
        error={regulars.isError}
        onAddToMealPlan={setModalRecipe}
      />

      <RecentlyViewedShelf onAddToMealPlan={setModalRecipe} />

      <RecipeShelf
        title="🆕 Recently Added"
        searchLink="/search?new=true&sort_order=-created_at"
        recipes={recentlyAdded.data?.results ?? []}
        loading={recentlyAdded.isLoading}
        error={recentlyAdded.isError}
        onAddToMealPlan={setModalRecipe}
      />

      {SEASON_CONFIGS.map((config) => (
        <SeasonalShelf
          key={config.tag}
          config={config}
          enabled={activeSeasons.has(config.tag)}
          onAddToMealPlan={setModalRecipe}
        />
      ))}

      {TAG_SHELF_CONFIGS.map((config) => (
        <TagShelf key={config.tag} config={config} onAddToMealPlan={setModalRecipe} />
      ))}

      <MealPlanAddModal recipe={modalRecipe} onHide={() => setModalRecipe(null)} />
      {cookLogEntry && (
        <CookLogModal
          show
          onHide={() => setCookLogEntry(null)}
          recipeId={cookLogRecipeId}
          mealPlanDate={cookLogDate}
          mealType={cookLogMealType}
        />
      )}
    </div>
  );
}
