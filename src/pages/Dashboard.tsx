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
        className="d-flex gap-3 pb-2"
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

function useDashboardShelf(queryKey: string[], queryFn: () => Promise<PaginatedResponse<Recipe>>) {
  return useQuery({ queryKey, queryFn });
}

export function Dashboard() {
  const [modalRecipe, setModalRecipe] = useState<Recipe | null>(null);

  const today = new Date();
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

  const upcomingRecipes: Recipe[] = (mealPlanQuery.data?.results ?? [])
    .map((mp) => (typeof mp.recipe === 'object' ? mp.recipe : null))
    .filter((r): r is Recipe => r !== null);

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

      <RecipeShelf
        title="🗓️ Upcoming Meals"
        searchLink="/meal-plan"
        recipes={upcomingRecipes}
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

      <MealPlanAddModal recipe={modalRecipe} onHide={() => setModalRecipe(null)} />
    </div>
  );
}
