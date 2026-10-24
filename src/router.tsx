import { Link, Navigate, Outlet, createBrowserRouter, useRouteError } from 'react-router';
import { AppHeader } from './components/AppHeader';
import { EmptyState } from './components/EmptyState';
import { CalculatorPage } from './features/calculator/CalculatorPage';
import { LoginPage } from './features/auth/LoginPage';
import { RequireAuth } from './features/auth/RequireAuth';
import { ActivityPage, EntityHistoryPage } from './features/history/ActivityPage';
import { InventoryDetailPage, InventoryIndex, InventoryPage } from './features/inventory/InventoryPage';
import {
  ProductCreatePage,
  ProductDetailPage,
  ProductEditPage,
  ProductsIndex,
  ProductsPage,
} from './features/products/ProductsPage';
import {
  RecipeCreatePage,
  RecipeDetailPage,
  RecipeEditPage,
  RecipesIndex,
  RecipesPage,
} from './features/recipes/RecipesPage';
import styles from './App.module.css';

function AppLayout() {
  return (
    <div className={styles.app}>
      <AppHeader />
      <div className={styles.content}>
        <Outlet />
      </div>
    </div>
  );
}

function NotFoundPage() {
  return (
    <EmptyState icon="info" title="Nie ma takiej strony" sub="Sprawdź adres albo wróć do przepisów.">
      <Link to="/recipes">Przejdź do przepisów →</Link>
    </EmptyState>
  );
}

function RouteError() {
  const error = useRouteError();
  console.error(error);
  return (
    <div className={styles.app}>
      <AppHeader />
      <div className={styles.content}>
        <EmptyState icon="info" title="Coś poszło nie tak" sub="Odśwież stronę. Jeśli błąd się powtarza, daj nam znać.">
          <Link to="/recipes" reloadDocument>
            Wróć do przepisów →
          </Link>
        </EmptyState>
      </div>
    </div>
  );
}

export const router = createBrowserRouter([
  { path: 'login', element: <LoginPage />, errorElement: <RouteError /> },
  {
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Navigate to="/recipes" replace /> },
      {
        path: 'recipes',
        element: <RecipesPage />,
        children: [
          { index: true, element: <RecipesIndex /> },
          { path: 'new', element: <RecipeCreatePage /> },
          { path: ':recipeId', element: <RecipeDetailPage /> },
          { path: ':recipeId/edit', element: <RecipeEditPage /> },
        ],
      },
      {
        path: 'products',
        element: <ProductsPage />,
        children: [
          { index: true, element: <ProductsIndex /> },
          { path: 'new', element: <ProductCreatePage /> },
          { path: ':productId', element: <ProductDetailPage /> },
          { path: ':productId/edit', element: <ProductEditPage /> },
        ],
      },
      {
        path: 'inventory',
        element: <InventoryPage />,
        children: [
          { index: true, element: <InventoryIndex /> },
          { path: ':productId', element: <InventoryDetailPage /> },
        ],
      },
      { path: 'calculator', element: <CalculatorPage /> },
      { path: 'calculator/:recipeId', element: <CalculatorPage /> },
      { path: 'activity', element: <ActivityPage /> },
      // Change log of one item; also works after it was deleted.
      { path: 'activity/product/:entityId', element: <EntityHistoryPage key="product" type="product" /> },
      { path: 'activity/recipe/:entityId', element: <EntityHistoryPage key="recipe" type="recipe" /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
