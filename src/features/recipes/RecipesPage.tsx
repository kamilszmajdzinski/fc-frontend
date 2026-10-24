import { useMemo, useState, type ReactNode } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { ApiRequestError, errorMessage } from '../../api/client';
import { useProducts } from '../../api/products';
import { useCreateRecipe, useDeleteRecipe, useRecipe, useRecipes, useReplaceRecipe } from '../../api/recipes';
import { EmptyState, LoadError, Loading } from '../../components/EmptyState';
import { FoodCostBadge } from '../../components/FoodCostBadge';
import { BackLink, DetailPage, ListItem, ListPanel, ListRow, MasterDetail, PageHeader } from '../../components/MasterDetail';
import { useToast } from '../../components/Toast';
import { formatMoney, portionsLabel } from '../../lib/format';
import { matchesSearch } from '../../lib/search';
import { useIdParam } from '../../lib/useIdParam';
import { RecipeDetail } from './RecipeDetail';
import { RecipeForm } from './RecipeForm';
import { useRecipeUndo } from './useRecipeUndo';
import styles from './RecipesPage.module.css';

export function RecipesPage() {
  const recipes = useRecipes();
  const [query, setQuery] = useState('');
  const { pathname } = useLocation();

  const filtered = useMemo(() => (recipes.data ?? []).filter((r) => matchesSearch(query, r.name)), [recipes.data, query]);

  let list: ReactNode;
  if (recipes.isPending) list = <Loading />;
  else if (recipes.isError) list = <LoadError compact error={recipes.error} onRetry={() => recipes.refetch()} />;
  else if (filtered.length === 0) {
    list = query ? (
      <EmptyState compact icon="book" title="Brak wyników" sub="Sprawdź pisownię" />
    ) : (
      <EmptyState compact icon="book" title="Brak przepisów" sub="Stwórz swój pierwszy przepis" />
    );
  } else {
    list = filtered.map((recipe) => (
      <ListItem key={recipe.id} to={`/recipes/${recipe.id}`}>
        <ListRow
          serif
          title={recipe.name}
          sub={portionsLabel(recipe.portions)}
          aside={formatMoney(recipe.foodCost)}
          asideSub={`${formatMoney(recipe.costPerPortion)} / porcja`}
          // Recipes with a selling price show how profitable they are; "!" marks the ones above target.
          footer={
            recipe.sellPrice !== null && (
              <div className={styles.badgeRow}>
                <FoodCostBadge foodCost={recipe.foodCost} sellPrice={recipe.sellPrice} />
                <span className={styles.price}>cena {formatMoney(recipe.sellPrice)}</span>
              </div>
            )
          }
        />
      </ListItem>
    ));
  }

  return (
    <MasterDetail
      detailOpen={pathname.replace(/\/+$/, '') !== '/recipes'}
      list={
        <ListPanel title="Przepisy" action={{ label: 'Nowy', to: '/recipes/new' }} search={{ value: query, onChange: setQuery }}>
          {list}
        </ListPanel>
      }
    >
      <Outlet />
    </MasterDetail>
  );
}

export function RecipesIndex() {
  return <EmptyState icon="book" title="Receptury" sub="Wybierz przepis z listy lub stwórz nowy" />;
}

function RecipeNotFound() {
  return <EmptyState icon="info" title="Nie znaleziono przepisu" sub="Mógł zostać usunięty. Wybierz inny z listy." />;
}

function isNotFound(error: unknown): boolean {
  return error instanceof ApiRequestError && error.code === 'NOT_FOUND';
}

export function RecipeDetailPage() {
  const id = useIdParam('recipeId');
  const recipe = useRecipe(id);
  const navigate = useNavigate();
  const toast = useToast();
  const remove = useDeleteRecipe();
  const { undo } = useRecipeUndo();

  if (id === undefined || isNotFound(recipe.error)) return <RecipeNotFound />;
  if (recipe.isPending) return <Loading />;
  if (recipe.isError) return <LoadError error={recipe.error} onRetry={() => recipe.refetch()} />;

  const data = recipe.data;
  return (
    <RecipeDetail
      // Its dialogs belong to this recipe: following a link to another one starts fresh.
      key={data.id}
      recipe={data}
      deleting={remove.isPending}
      onDelete={(onInUse) =>
        remove.mutate(data.id, {
          onSuccess: () => {
            // Deletion is soft: "Cofnij" restores the recipe and opens it again.
            toast(`Usunięto przepis „${data.name}”.`, 'success', {
              duration: 10000,
              action: { label: 'Cofnij', onClick: () => undo(data.id, data.name, { openAfter: true }) },
            });
            navigate('/recipes');
          },
          onError: (error) => {
            if (error instanceof ApiRequestError && error.code === 'RECIPE_IN_USE') onInUse(error.recipes);
            else toast(errorMessage(error), 'error');
          },
        })
      }
    />
  );
}

export function RecipeCreatePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const products = useProducts();
  const recipes = useRecipes();
  const create = useCreateRecipe();

  return (
    <DetailPage>
      <BackLink to="/recipes">Przepisy</BackLink>
      <PageHeader eyebrow="Nowy przepis" title="Dodaj przepis" />
      {products.isPending || recipes.isPending ? (
        <Loading />
      ) : products.isError ? (
        <LoadError error={products.error} onRetry={() => products.refetch()} />
      ) : recipes.isError ? (
        <LoadError error={recipes.error} onRetry={() => recipes.refetch()} />
      ) : (
        <RecipeForm
          products={products.data}
          recipes={recipes.data}
          busy={create.isPending}
          error={create.error}
          onCancel={() => navigate('/recipes')}
          onSubmit={(input) =>
            create.mutate(input, {
              onSuccess: (recipe) => {
                toast(`Dodano przepis „${recipe.name}”.`);
                navigate(`/recipes/${recipe.id}`);
              },
            })
          }
        />
      )}
    </DetailPage>
  );
}

export function RecipeEditPage() {
  const id = useIdParam('recipeId');
  const recipe = useRecipe(id);
  const products = useProducts();
  const recipes = useRecipes();
  const navigate = useNavigate();
  const toast = useToast();
  const replace = useReplaceRecipe();

  if (id === undefined || isNotFound(recipe.error)) return <RecipeNotFound />;
  if (recipe.isPending || products.isPending || recipes.isPending) return <Loading />;
  if (recipe.isError) return <LoadError error={recipe.error} onRetry={() => recipe.refetch()} />;
  if (products.isError) return <LoadError error={products.error} onRetry={() => products.refetch()} />;
  if (recipes.isError) return <LoadError error={recipes.error} onRetry={() => recipes.refetch()} />;

  return (
    <DetailPage>
      <BackLink to={`/recipes/${id}`}>{recipe.data.name}</BackLink>
      <PageHeader eyebrow="Edytuj przepis" title={recipe.data.name} />
      <RecipeForm
        // Fresh form for each recipe; later refetches of the same recipe don't wipe the user's edits.
        key={id}
        recipe={recipe.data}
        products={products.data}
        recipes={recipes.data}
        busy={replace.isPending}
        error={replace.error}
        onCancel={() => navigate(`/recipes/${id}`)}
        onSubmit={(input) =>
          replace.mutate(
            { id, input },
            {
              onSuccess: (saved) => {
                toast(`Zapisano przepis „${saved.name}”.`);
                navigate(`/recipes/${saved.id}`);
              },
            },
          )
        }
      />
    </DetailPage>
  );
}
