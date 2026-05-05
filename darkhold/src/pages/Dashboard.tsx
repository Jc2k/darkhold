import { useMemo, useState } from 'react';
import { Spinner } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Book } from 'react-bootstrap-icons';
import { apiGet } from '../api/client';
import type { Recipe, Keyword, MealPlan, RecipeBook, RecipeBookEntry, PaginatedResponse } from '../api/tandoor-types';
import { RecipeCard } from '../components/RecipeCard';
import { BookCard } from '../components/BookCard';
import { MealPlanAddModal } from '../components/MealPlanAddModal';
import { getFilterId } from '../utils/bookUtils';

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
  title: string;
  searchLink: string;
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
        <Link to={searchLink} className="small text-muted">
          See all →
        </Link>
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
  // Step 1: look up the keyword by exact name so we can filter by ID rather
  // than using keywords_name (which does an icontains/substring match and
  // returns recipes tagged with unrelated keywords like "spring onion").
  const keywordQuery = useQuery({
    queryKey: ['keywords', 'by-name', tag],
    queryFn: async () => {
      // page_size of 100 is intentionally large: seasonal tag names are short
      // and distinct, so there will never be 100 keywords matching one query.
      const data = await apiGet<PaginatedResponse<Keyword>>('/keyword/', { query: tag, page_size: 100 });
      return data.results.find((k) => k.name.toLowerCase() === tag.toLowerCase()) ?? null;
    },
    enabled,
  });

  const keywordId = keywordQuery.data?.id;

  // Step 2: fetch recipes filtered by the exact keyword ID.
  const recipeQuery = useQuery({
    queryKey: ['recipes', 'seasonal', tag],
    // queryFn is only called when keywordId is defined (see `enabled` below).
    queryFn: () => apiGet<PaginatedResponse<Recipe>>('/recipe/', { keywords: keywordId as number, page_size: 10 }),
    enabled: enabled && keywordId !== undefined,
  });

  return {
    data: recipeQuery.data,
    isLoading: keywordQuery.isLoading || recipeQuery.isLoading,
    isError: keywordQuery.isError || recipeQuery.isError,
    keywordId,
  };
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

async function fetchAllBooks(): Promise<RecipeBook[]> {
  const all: RecipeBook[] = [];
  let page = 1;
  let hasNext = true;
  while (hasNext) {
    const data = await apiGet<PaginatedResponse<RecipeBook>>('/recipe-book/', { page_size: 100, page });
    all.push(...data.results);
    hasNext = !!data.next;
    page++;
  }
  return all;
}

async function fetchAllBookEntries(): Promise<RecipeBookEntry[]> {
  const all: RecipeBookEntry[] = [];
  let page = 1;
  let hasNext = true;
  while (hasNext) {
    const data = await apiGet<PaginatedResponse<RecipeBookEntry>>('/recipe-book-entry/', { page_size: 100, page });
    all.push(...data.results);
    hasNext = !!data.next;
    page++;
  }
  return all;
}

function BooksShelf() {
  const { data: books, isLoading: booksLoading, isError: booksError } = useQuery({
    queryKey: ['books'],
    queryFn: fetchAllBooks,
  });

  const { data: entries, isLoading: entriesLoading } = useQuery({
    queryKey: ['book-entries'],
    queryFn: fetchAllBookEntries,
  });

  const coverImages = useMemo(() => {
    if (!entries) return new Map<number, string>();
    const map = new Map<number, string>();
    for (const entry of entries) {
      const bookId = typeof entry.book === 'object' ? entry.book.id : entry.book;
      if (!map.has(bookId) && entry.recipe?.image) {
        map.set(bookId, entry.recipe.image);
      }
    }
    return map;
  }, [entries]);

  const booksWithFilter = useMemo(() => books?.filter((b) => b.filter != null) ?? [], [books]);

  const { data: filterCovers } = useQuery({
    queryKey: ['book-filter-covers', booksWithFilter.map((b) => b.id)],
    queryFn: async () => {
      const map = new Map<number, string>();
      await Promise.all(
        booksWithFilter.map(async (book) => {
          const filterId = getFilterId(book.filter);
          if (filterId === null) return;
          const data = await apiGet<PaginatedResponse<Recipe>>('/recipe/', { keywords: filterId, page_size: 1 });
          const image = data.results[0]?.image;
          if (image) map.set(book.id, image);
        })
      );
      return map;
    },
    enabled: booksWithFilter.length > 0,
  });

  const isBooksShelfLoading = booksLoading || entriesLoading;

  if (!isBooksShelfLoading && !booksError && (!books || books.length === 0)) return null;

  return (
    <section className="mb-4">
      <div className="d-flex align-items-center justify-content-between mb-2">
        <h5 className="mb-0"><Book className="me-2" />Books</h5>
        <Link to="/books" className="small text-muted">
          See all →
        </Link>
      </div>
      {isBooksShelfLoading && <Spinner size="sm" />}
      {booksError && <span className="text-danger small">Failed to load</span>}
      <div
        className="d-flex gap-3 pb-2 hide-scrollbar"
        style={{ overflowX: 'auto', scrollSnapType: 'x mandatory' }}
      >
        {books?.map((book) => {
          const cover = coverImages.get(book.id) ?? filterCovers?.get(book.id) ?? null;
          return (
            <div key={book.id} style={{ minWidth: 200, maxWidth: 200, scrollSnapAlign: 'start' }}>
              <BookCard book={book} coverImage={cover} />
            </div>
          );
        })}
      </div>
    </section>
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

  const topRated = useDashboardShelf(
    ['recipes', 'top-rated'],
    () => apiGet<PaginatedResponse<Recipe>>('/recipe/', { rating: 4, page_size: 10 }),
  );

  const quickEasy = useDashboardShelf(
    ['recipes', 'quick-easy'],
    () => apiGet<PaginatedResponse<Recipe>>('/recipe/', { cooking_time__lte: 30, sort_order: '?', page_size: 10 }),
  );

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
      />

      <RecipeShelf
        title="⭐ Top Rated"
        searchLink="/search?rating=4"
        recipes={topRated.data?.results ?? []}
        loading={topRated.isLoading}
        error={topRated.isError}
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
        searchLink="/search?new=true&sort_order=-id"
        recipes={recentlyAdded.data?.results ?? []}
        loading={recentlyAdded.isLoading}
        error={recentlyAdded.isError}
        onAddToMealPlan={setModalRecipe}
      />

      <RecipeShelf
        title="🔁 Regulars"
        searchLink="/meal-plan"
        recipes={regulars.data?.results ?? []}
        loading={regulars.isLoading}
        error={regulars.isError}
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

      <BooksShelf />

      <MealPlanAddModal recipe={modalRecipe} onHide={() => setModalRecipe(null)} />
    </div>
  );
}
