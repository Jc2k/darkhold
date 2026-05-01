import { useState } from 'react';
import { Spinner } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';
import type { Recipe, MealPlan, PaginatedResponse } from '../api/tandoor-types';
import { RecipeCard } from '../components/RecipeCard';
import { MealPlanAddModal } from '../components/MealPlanAddModal';

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function addDays(date: Date, numDays: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + numDays);
  return result;
}

function shortDay(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

interface ShelfProps {
  title: string;
  searchLink: string;
  recipes: Recipe[];
  loading: boolean;
  error: boolean;
  onAddToMealPlan: (r: Recipe) => void;
}

function RecipeShelf({ title, searchLink, recipes, loading, error, onAddToMealPlan }: ShelfProps) {
  return (
    <section className="mb-4">
      <div className="d-flex align-items-center justify-content-between mb-2">
        <h5 className="mb-0">{title}</h5>
        <Link to={searchLink} className="small text-muted">
          See all →
        </Link>
      </div>
      {loading && <Spinner size="sm" />}
      {error && <span className="text-danger small">Failed to load</span>}
      {!loading && !error && recipes.length === 0 && (
        <span className="text-muted small">No recipes found</span>
      )}
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
  mealsByDay: Record<string, Recipe[]>;
  loading: boolean;
  error: boolean;
  onAddToMealPlan: (r: Recipe) => void;
}

function UpcomingMealsShelf({ days, mealsByDay, loading, error, onAddToMealPlan }: UpcomingMealsShelfProps) {
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
          {days.map((day) => {
            const key = formatDate(day);
            const recipes = mealsByDay[key] ?? [];
            return (
              <div key={key} style={{ minWidth: 200, maxWidth: 200, scrollSnapAlign: 'start', flexShrink: 0 }}>
                <div className="text-muted small fw-semibold mb-1 text-center">{shortDay(day)}</div>
                {recipes.length > 0 ? (
                  recipes.map((r) => (
                    <RecipeCard key={r.id} recipe={r} onAddToMealPlan={onAddToMealPlan} />
                  ))
                ) : (
                  <div
                    className="d-flex align-items-center justify-content-center text-muted border rounded"
                    style={{ height: 120, fontSize: '0.8rem', borderStyle: 'dashed' as const }}
                  >
                    No meal planned
                  </div>
                )}
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

interface SeasonConfig {
  tag: string;
  title: string;
  emoji: string;
}

const SEASON_CONFIGS: SeasonConfig[] = [
  { tag: 'spring',    title: 'Spring',    emoji: '🌸' },
  { tag: 'summer',    title: 'Summer',    emoji: '☀️' },
  { tag: 'autumn',    title: 'Autumn',    emoji: '🍂' },
  { tag: 'winter',    title: 'Winter',    emoji: '❄️' },
  { tag: 'christmas', title: 'Christmas', emoji: '🎄' },
];

/**
 * Returns the set of season tags that are currently active for the given date.
 * Each meteorological season has ~2-week overlaps with the adjacent seasons.
 * Christmas is active throughout December.
 */
function getActiveSeasons(date: Date): Set<string> {
  const month = date.getMonth() + 1; // 1-12
  const day = date.getDate();
  const active = new Set<string>();

  // Spring: Feb 15 – Jun 14
  if ((month === 2 && day >= 15) || (month >= 3 && month <= 5) || (month === 6 && day <= 14)) {
    active.add('spring');
  }
  // Summer: May 15 – Sep 14
  if ((month === 5 && day >= 15) || (month >= 6 && month <= 8) || (month === 9 && day <= 14)) {
    active.add('summer');
  }
  // Autumn: Aug 15 – Dec 14
  if ((month === 8 && day >= 15) || (month >= 9 && month <= 11) || (month === 12 && day <= 14)) {
    active.add('autumn');
  }
  // Winter: Nov 15 – Mar 14
  if ((month === 11 && day >= 15) || month === 12 || month === 1 || month === 2 || (month === 3 && day <= 14)) {
    active.add('winter');
  }
  // Christmas: all of December
  if (month === 12) {
    active.add('christmas');
  }

  return active;
}

function useSeasonalShelf(tag: string, enabled: boolean) {
  return useQuery({
    queryKey: ['recipes', 'seasonal', tag],
    queryFn: () => apiGet<PaginatedResponse<Recipe>>('/recipe/', { keywords_name: tag, page_size: 10 }),
    enabled,
  });
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
  return (
    <RecipeShelf
      title={`${config.emoji} ${config.title} Recipes`}
      searchLink={`/search?keywords_name=${config.tag}`}
      recipes={query.data?.results ?? []}
      loading={query.isLoading}
      error={query.isError}
      onAddToMealPlan={onAddToMealPlan}
    />
  );
}

export function Dashboard() {
  const [modalRecipe, setModalRecipe] = useState<Recipe | null>(null);

  const today = new Date();
  const activeSeasons = getActiveSeasons(today);
  const weekAhead = new Date();
  weekAhead.setDate(weekAhead.getDate() + 7);

  const mealPlanQuery = useQuery({
    queryKey: ['meal-plan', formatDate(today), formatDate(weekAhead)],
    queryFn: () =>
      apiGet<PaginatedResponse<MealPlan>>('/meal-plan/', {
        from_date: formatDate(today),
        to_date: formatDate(weekAhead),
      }),
  });

  const days = Array.from({ length: 8 }, (_, i) => addDays(today, i));

  const mealsByDay: Record<string, Recipe[]> = {};
  for (const day of days) {
    mealsByDay[formatDate(day)] = [];
  }
  const sortedEntries = (mealPlanQuery.data?.results ?? [])
    .slice()
    .sort((a, b) => a.from_date.localeCompare(b.from_date));
  for (const mp of sortedEntries) {
    const key = mp.from_date.split('T')[0];
    if (key in mealsByDay && typeof mp.recipe === 'object') {
      mealsByDay[key].push(mp.recipe);
    }
  }

  const favourites = useDashboardShelf(
    ['recipes', 'favourite'],
    () => apiGet<PaginatedResponse<Recipe>>('/recipe/', { keywords_name: 'favourite', page_size: 10 }),
  );

  const quickEasy = useDashboardShelf(
    ['recipes', 'quick-easy'],
    () => apiGet<PaginatedResponse<Recipe>>('/recipe/', { cooking_time__lte: 30, page_size: 10 }),
  );

  const recentlyAdded = useDashboardShelf(
    ['recipes', 'recent'],
    () => apiGet<PaginatedResponse<Recipe>>('/recipe/', { new: true, page_size: 10 }),
  );

  return (
    <div>
      <h2 className="mb-4">Dashboard</h2>

      <UpcomingMealsShelf
        days={days}
        mealsByDay={mealsByDay}
        loading={mealPlanQuery.isLoading}
        error={mealPlanQuery.isError}
        onAddToMealPlan={setModalRecipe}
      />

      <RecipeShelf
        title="⭐ Favourites"
        searchLink="/search?keywords_name=favourite"
        recipes={favourites.data?.results ?? []}
        loading={favourites.isLoading}
        error={favourites.isError}
        onAddToMealPlan={setModalRecipe}
      />

      <RecipeShelf
        title="⚡ Quick & Easy"
        searchLink="/search?cooking_time__lte=30"
        recipes={quickEasy.data?.results ?? []}
        loading={quickEasy.isLoading}
        error={quickEasy.isError}
        onAddToMealPlan={setModalRecipe}
      />

      <RecipeShelf
        title="🆕 Recently Added"
        searchLink="/search"
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

      <MealPlanAddModal recipe={modalRecipe} onHide={() => setModalRecipe(null)} />
    </div>
  );
}
