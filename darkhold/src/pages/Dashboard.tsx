import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Spinner, Button } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BookmarkFill, Check2Circle } from 'react-bootstrap-icons';
import { apiGet } from '../api/client';
import type { Recipe, Keyword, MealPlan, MealType, PaginatedResponse } from '../api/tandoor-types';
import { RecipeCard } from '../components/RecipeCard';
import { MealPlanAddModal } from '../components/MealPlanAddModal';
import { CookLogModal } from '../components/CookLogModal';

import { useUpSoonData } from '../hooks/useUpSoon';
import { useCookLog } from '../hooks/useCookLog';
import { smallCircleButtonStyle } from '../utils/buttonStyles';

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function addDays(date: Date, numDays: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + numDays);
  return result;
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
  if (!loading && !error && recipes.length === 0) return null;
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
      {loading && <Spinner size="sm" />}
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
  left: 8,
};

function UpcomingMealsShelf({ days, mealsByDay, loading, error, onAddToMealPlan, cookedToday, onLogCook }: UpcomingMealsShelfProps) {
  // Flatten days into individual card items so all cards sit in one horizontal row.
  // The date label is shown only above the first card of each day group.
  const DATE_LABEL_HEIGHT = '1.4rem';
  const todayStr = formatDate(new Date());
  const items = days.flatMap((day): Array<{ day: Date; entry: MealPlan | null; isFirstOfDay: boolean }> => {
    const key = formatDate(day);
    const entries = mealsByDay[key] ?? [];
    if (entries.length === 0) {
      return [{ day, entry: null, isFirstOfDay: true }];
    }
    return entries.map((entry, index) => ({ day, entry, isFirstOfDay: index === 0 }));
  });

  return (
    <section className="mb-4">
      <div className="d-flex align-items-center justify-content-between mb-2">
        <h5 className="mb-0">🗓️ Upcoming Meals</h5>
        <Link to="/meal-plan" className="small text-muted">
          See all →
        </Link>
      </div>
      {loading && <Spinner size="sm" />}
      {error && <span className="text-danger small">Failed to load</span>}
      {!loading && !error && (
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
                      />
                      {isEligible && !isCooked && (
                        <Button
                          variant="outline-secondary"
                          size="sm"
                          style={cookLogButtonStyle}
                          onClick={(e) => { e.stopPropagation(); onLogCook(entry); }}
                          aria-label="Log as cooked"
                        >
                          <Check2Circle size={14} />
                        </Button>
                      )}
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
      )}
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
      const data = await apiGet<PaginatedResponse<Keyword>>('/keyword/', { query: tag, page_size: 100 });
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

interface TagShelfConfig {
  tag: string;
  title: string;
  emoji: string;
}

const TAG_SHELF_CONFIGS: TagShelfConfig[] = [
  { tag: 'Adam',     title: 'Adam',     emoji: '👨‍🍳' },
  { tag: 'soy-free', title: 'Soy Free', emoji: '🌱' },
  { tag: 'pasta',    title: 'Pasta',    emoji: '🍝' },
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

  if (!isLoading && !isError && (!data || data.entries.length === 0)) return null;

  const recipes = data?.entries.map((e) => e.recipe) ?? [];

  return (
    <RecipeShelf
      title={<><BookmarkFill className="me-2 text-warning" />Up Soon</>}
      searchLink="/books"
      recipes={recipes}
      loading={isLoading}
      error={isError}
      onAddToMealPlan={onAddToMealPlan}
    />
  );
}

function RecentlyViewedShelf({ onAddToMealPlan }: { onAddToMealPlan: (r: Recipe) => void }) {
  const { data, isLoading, isError } = useDashboardShelf(
    ['recently-viewed'],
    () => apiGet<PaginatedResponse<Recipe>>('/recipe/', {
      sort_order: '-lastviewed',
      viewedon_gte: '2000-01-01',
      page_size: 10,
    }),
  );

  if (!isLoading && !isError && (!data || data.results.length === 0)) return null;

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

  const today = new Date();
  const todayStr = formatDate(today);

  const weekAhead = new Date();
  weekAhead.setDate(weekAhead.getDate() + 7);

  // Derived cook log modal props — computed outside JSX to avoid inline IIFEs.
  const cookLogMealType =
    cookLogEntry && typeof cookLogEntry.meal_type === 'object'
      ? (cookLogEntry.meal_type as MealType)
      : undefined;
  const cookLogRecipeId =
    cookLogEntry
      ? typeof cookLogEntry.recipe === 'object'
        ? cookLogEntry.recipe.id
        : (cookLogEntry.recipe as number)
      : 0;
  const cookLogDate = cookLogEntry?.from_date.split('T')[0] ?? '';

  const mealPlanQuery = useQuery({
    queryKey: ['meal-plan', formatDate(today), formatDate(weekAhead)],
    queryFn: () =>
      apiGet<PaginatedResponse<MealPlan>>('/meal-plan/', {
        from_date: formatDate(today),
        to_date: formatDate(weekAhead),
      }),
  });

  // Fetch cook log for today only — upcoming shelf only shows ticks on today's meals.
  const { data: cookLogData } = useCookLog(todayStr, todayStr);
  const cookedToday: number[] = cookLogData?.[todayStr] ?? [];

  const days = Array.from({ length: 8 }, (_, i) => addDays(today, i));

  const mealsByDay: Record<string, MealPlan[]> = {};
  for (const day of days) {
    mealsByDay[formatDate(day)] = [];
  }
  const sortedEntries = (mealPlanQuery.data?.results ?? [])
    .slice()
    .sort((a, b) => a.from_date.localeCompare(b.from_date));
  for (const mp of sortedEntries) {
    const key = mp.from_date.split('T')[0];
    if (key in mealsByDay && typeof mp.recipe === 'object') {
      mealsByDay[key].push(mp);
    }
  }

  const recentlyAdded = useDashboardShelf(
    ['recipes', 'recent'],
    () => apiGet<PaginatedResponse<Recipe>>('/recipe/', { new: true, sort_order: '-id', page_size: 10 }),
  );

  const regulars = useRegularsShelf();

  return (
    <div className="pt-2">
      <UpcomingMealsShelf
        days={days}
        mealsByDay={mealsByDay}
        loading={mealPlanQuery.isLoading}
        error={mealPlanQuery.isError}
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
        searchLink="/search?new=true&sort_order=-id"
        recipes={recentlyAdded.data?.results ?? []}
        loading={recentlyAdded.isLoading}
        error={recentlyAdded.isError}
        onAddToMealPlan={setModalRecipe}
      />

      {TAG_SHELF_CONFIGS.map((config) => (
        <TagShelf
          key={config.tag}
          config={config}
          onAddToMealPlan={setModalRecipe}
        />
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
