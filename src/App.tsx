import 'bootstrap/dist/css/bootstrap.min.css';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { AllRecipes } from './pages/AllRecipes';
import { Search } from './pages/Search';
import { MealPlanPage } from './pages/MealPlanPage';
import { ShoppingList } from './pages/ShoppingList';
import { Settings } from './pages/Settings';
import { RecipeDetail } from './pages/RecipeDetail';
import { IngredientDetail } from './pages/IngredientDetail';

function getHomepage(): string {
  const pref = localStorage.getItem('homepage_pref') || 'dashboard';
  if (pref === 'all-recipes') return '/all-recipes';
  if (pref === 'meal-plan') return '/meal-plan';
  return '/dashboard';
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('tandoor_token');
  if (!token) return <Navigate to="/settings" replace />;
  return <>{children}</>;
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
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
        path: 'ingredient/:id',
        element: <AuthGuard><IngredientDetail /></AuthGuard>,
      },
    ],
  },
]);

const App = () => {
  return <RouterProvider router={router} />;
};

export default App;
