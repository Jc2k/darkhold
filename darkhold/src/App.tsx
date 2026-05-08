import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';
import { createBrowserRouter, RouterProvider, Navigate, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Dashboard } from './pages/Dashboard';
import { AllRecipes } from './pages/AllRecipes';
import { Search } from './pages/Search';
import { MealPlanPage } from './pages/MealPlanPage';
import { ShoppingList } from './pages/ShoppingList';
import { Settings } from './pages/Settings';
import { RecipeDetail } from './pages/RecipeDetail';
import { MealPlanEntryDetail } from './pages/MealPlanEntryDetail';
import { IngredientDetail } from './pages/IngredientDetail';
import { Books } from './pages/Books';
import { BookDetail } from './pages/BookDetail';
import { GasMarks } from './pages/GasMarks';
import { UnitConverter } from './pages/UnitConverter';
import { RiceCooking } from './pages/RiceCooking';
import { LoadingMascot } from './components/LoadingMascot';
import { useAppConfig } from './hooks/useAppConfig';
import { formatDate, getMealPlanWeekStartSaturday } from './utils/dateUtils';

function getCurrentMealPlanWeekPath(now: Date = new Date()): string {
  return `/meal-plan/${formatDate(getMealPlanWeekStartSaturday(now))}`;
}

function getHomepage(): string {
  const pref = localStorage.getItem('homepage_pref') || 'dashboard';
  if (pref === 'all-recipes') return '/all-recipes';
  if (pref === 'meal-plan') return getCurrentMealPlanWeekPath();
  return '/dashboard';
}

function MealPlanCurrentWeekRedirect() {
  return <Navigate to={getCurrentMealPlanWeekPath()} replace />;
}

/** Guards a route behind authentication.
 *
 * Access is allowed when either:
 *  - the user has a personal API token stored in localStorage, or
 *  - the server has a default token configured (nginx injects it for every
 *    request that carries no personal token).
 *
 * While app-config is still loading we show a spinner to avoid a premature
 * redirect to /settings on first load.
 *
 * When redirecting to /settings the original location is passed via
 * router state so Settings can redirect back after the token is saved. */
function AuthGuard({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('tandoor_token');
  const { has_default_token, isConfigLoading } = useAppConfig();
  const location = useLocation();

  if (token) return <>{children}</>;
  if (isConfigLoading) return <LoadingMascot />;
  if (has_default_token) return <>{children}</>;
  return <Navigate to="/settings" state={{ from: location }} replace />;
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    errorElement: <ErrorBoundary />,
    children: [
      { index: true, element: <Navigate to={getHomepage()} replace /> },
      {
        path: 'dashboard',
        element: <AuthGuard><Dashboard /></AuthGuard>,
      },
      {
        path: 'all-recipes',
        element: <AuthGuard><AllRecipes /></AuthGuard>,
      },
      {
        path: 'search',
        element: <AuthGuard><Search /></AuthGuard>,
      },
      {
        path: 'meal-plan',
        element: <AuthGuard><MealPlanCurrentWeekRedirect /></AuthGuard>,
      },
      {
        path: 'meal-plan/:weekStart',
        element: <AuthGuard><MealPlanPage /></AuthGuard>,
      },
      {
        path: 'shopping',
        element: <AuthGuard><ShoppingList /></AuthGuard>,
      },
      {
        path: 'settings',
        element: <Settings />,
      },
      {
        path: 'recipe/:id',
        element: <AuthGuard><RecipeDetail /></AuthGuard>,
      },
      {
        path: 'meal-plan-entry/:entryId',
        element: <AuthGuard><MealPlanEntryDetail /></AuthGuard>,
      },
      {
        path: 'ingredient/:id',
        element: <AuthGuard><IngredientDetail /></AuthGuard>,
      },
      {
        path: 'books',
        element: <AuthGuard><Books /></AuthGuard>,
      },
      {
        path: 'books/:id',
        element: <AuthGuard><BookDetail /></AuthGuard>,
      },
      {
        path: 'utilities/gas-marks',
        element: <GasMarks />,
      },
      {
        path: 'utilities/unit-converter',
        element: <UnitConverter />,
      },
      {
        path: 'utilities/rice-cooking',
        element: <RiceCooking />,
      },
    ],
  },
]);

const App = () => {
  return <RouterProvider router={router} />;
};

export default App;
