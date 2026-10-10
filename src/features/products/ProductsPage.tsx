import { useMemo, useState, type ReactNode } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import { ApiRequestError, errorMessage } from '../../api/client';
import { useCreateProduct, useDeleteProduct, useProducts, useProductUsage, useUpdateProduct } from '../../api/products';
import { useRecipesById } from '../../api/recipes';
import type { Product, ProductUpdateResult, RecipeRef } from '../../api/types';
import { EmptyState, LoadError, Loading } from '../../components/EmptyState';
import { Icon } from '../../components/Icon';
import { BackLink, DetailPage, ListItem, ListPanel, ListRow, MasterDetail, PageHeader } from '../../components/MasterDetail';
import { ConfirmModal, NoticeModal } from '../../components/Modal';
import { RecipeLinks } from '../../components/RecipeLinks';
import { useToast } from '../../components/Toast';
import { Button, Card, Stat } from '../../components/ui';
import {
  formatDateTime,
  formatMoney,
  formatQuantity,
  formatShortPercent,
  formatUnitPrice,
  plural,
} from '../../lib/format';
import { matchesSearch } from '../../lib/search';
import { useIdParam } from '../../lib/useIdParam';
import { convert, defaultRecipeUnit, inventoryValue, unitLabel } from '../../lib/units';
import { packageLabel, recipesGenitive, unitPriceLabel } from './labels';
import { HistoryCard } from '../history/HistoryCard';
import { ProductPriceTimeline } from './ProductPriceHistory';
import { ProductForm } from './ProductForm';
import { toProductInput, toProductPatch, type ProductFormValues, type ProjectedCostChange } from './productFormModel';
import { RecipeCostChangeList, UnprofitableWarning } from './RecipeImpact';
import styles from './ProductsPage.module.css';

export function ProductsPage() {
  const products = useProducts();
  const [query, setQuery] = useState('');
  const { pathname } = useLocation();

  const filtered = useMemo(
    () => (products.data ?? []).filter((p) => matchesSearch(query, p.name, p.manufacturer)),
    [products.data, query],
  );

  let list: ReactNode;
  if (products.isPending) list = <Loading />;
  else if (products.isError) list = <LoadError compact error={products.error} onRetry={() => products.refetch()} />;
  else if (filtered.length === 0) {
    list = query ? (
      <EmptyState compact icon="bag" title="Brak wyników" sub="Sprawdź pisownię" />
    ) : (
      <EmptyState compact icon="bag" title="Pusta biblioteka" sub="Dodaj pierwszy składnik klikając „Dodaj”" />
    );
  } else {
    list = filtered.map((product) => (
      <ListItem key={product.id} to={`/products/${product.id}`}>
        {(active) => (
          <ListRow
            title={product.name}
            sub={[product.manufacturer, packageLabel(product), formatMoney(product.pricePerPackage)]
              .filter(Boolean)
              .join(' · ')}
            asideSub={<span className={active ? styles.activePrice : styles.price}>{unitPriceLabel(product)}</span>}
          />
        )}
      </ListItem>
    ));
  }

  return (
    <MasterDetail
      detailOpen={pathname.replace(/\/+$/, '') !== '/products'}
      list={
        <ListPanel title="Składniki" action={{ label: 'Dodaj', to: '/products/new' }} search={{ value: query, onChange: setQuery }}>
          {list}
        </ListPanel>
      }
    >
      <Outlet />
    </MasterDetail>
  );
}

export function ProductsIndex() {
  return (
    <EmptyState icon="bag" title="Biblioteka składników" sub="Wybierz składnik z listy, aby zobaczyć szczegóły, lub dodaj nowy" />
  );
}

export function ProductCreatePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const create = useCreateProduct();

  return (
    <DetailPage>
      <BackLink to="/products">Składniki</BackLink>
      <PageHeader eyebrow="Nowy składnik" title="Dodaj składnik" />
      <ProductForm
        busy={create.isPending}
        serverError={create.error ? errorMessage(create.error) : undefined}
        onCancel={() => navigate('/products')}
        onSubmit={(values) =>
          create.mutate(toProductInput(values), {
            onSuccess: (product) => {
              toast(`Dodano składnik „${product.name}”.`);
              navigate(`/products/${product.id}`);
            },
          })
        }
      />
    </DetailPage>
  );
}

/** Finds the product named in the URL in the (already loaded) product list. */
function WithRouteProduct({ children }: { children: (product: Product) => ReactNode }) {
  const id = useIdParam('productId');
  const products = useProducts();
  const product = products.data?.find((p) => p.id === id);

  if (products.isPending) return <Loading />;
  if (products.isError) return <LoadError error={products.error} onRetry={() => products.refetch()} />;
  if (!product) {
    return <EmptyState icon="info" title="Nie znaleziono składnika" sub="Mógł zostać usunięty. Wybierz inny z listy." />;
  }
  return children(product);
}

export function ProductDetailPage() {
  return <WithRouteProduct>{(product) => <ProductDetail key={product.id} product={product} />}</WithRouteProduct>;
}

export function ProductEditPage() {
  return <WithRouteProduct>{(product) => <ProductEdit key={product.id} product={product} />}</WithRouteProduct>;
}

/** The recipes that use a product, with their full details (quantities, units, costs). */
function useProductRecipes(productId: number) {
  const usage = useProductUsage(productId);
  const details = useRecipesById(usage.data?.map((recipe) => recipe.id) ?? []);
  return {
    refs: usage.data,
    recipes: details.data,
    loading: usage.isPending || details.isPending,
  };
}

// ---------- Read-only view ----------

function ProductDetail({ product }: { product: Product }) {
  const navigate = useNavigate();
  const toast = useToast();
  const usedIn = useProductRecipes(product.id);
  const remove = useDeleteProduct();
  const [dialog, setDialog] = useState<'confirm' | { inUse: RecipeRef[] } | null>(null);

  const recipeUnit = defaultRecipeUnit(product.packageUnit);
  const costPerRecipeUnit = product.pricePerPackage / convert(product.packageSize, product.packageUnit, recipeUnit);

  function requestDelete() {
    const refs = usedIn.refs ?? [];
    setDialog(refs.length > 0 ? { inUse: refs } : 'confirm');
  }

  function confirmDelete() {
    remove.mutate(product.id, {
      onSuccess: () => {
        toast(`Usunięto składnik „${product.name}”.`);
        navigate('/products');
      },
      onError: (error) => {
        if (error instanceof ApiRequestError && error.code === 'PRODUCT_IN_USE') setDialog({ inUse: error.recipes });
        else {
          setDialog(null);
          toast(errorMessage(error), 'error');
        }
      },
    });
  }

  return (
    <DetailPage>
      <BackLink to="/products">Składniki</BackLink>
      <PageHeader
        large
        eyebrow="Składnik"
        title={product.name}
        sub={[product.manufacturer, `zaktualizowano ${formatDateTime(product.updatedAt)}`].filter(Boolean).join(' · ')}
        actions={
          <>
            <Button variant="ghost" small onClick={() => navigate(`/products/${product.id}/edit`)}>
              <Icon name="edit" size={14} />
              Edytuj
            </Button>
            <Button variant="danger" small onClick={requestDelete} aria-label="Usuń składnik" title="Usuń składnik">
              <Icon name="trash" size={14} />
            </Button>
          </>
        }
      >
        {product.description && <p className={styles.description}>{product.description}</p>}
      </PageHeader>

      <div className={styles.stats}>
        <Stat label="Cena opakowania" value={formatMoney(product.pricePerPackage)} sub={`opakowanie ${packageLabel(product)}`} />
        <Stat
          label={`Cena za ${unitLabel(product.pricingUnit)}`}
          value={formatMoney(product.pricePerUnit)}
          sub={`${formatUnitPrice(costPerRecipeUnit)} za 1 ${unitLabel(recipeUnit)}`}
        />
        <Stat
          label="Stan magazynowy"
          value={`${formatQuantity(product.inventoryQuantity)} ${unitLabel(product.packageUnit)}`}
          sub={<Link to={`/inventory/${product.id}`}>wartość {formatMoney(inventoryValue(product))} →</Link>}
        />
      </div>

      <Card title="Używany w przepisach" className={styles.section}>
        {usedIn.loading ? (
          <div className={styles.muted}>Wczytywanie…</div>
        ) : usedIn.recipes.length === 0 ? (
          <div className={styles.muted}>Nie jest jeszcze używany w żadnym przepisie.</div>
        ) : (
          <ul className={styles.usage}>
            {usedIn.recipes.map((recipe) => {
              const lines = recipe.ingredients.filter((line) => line.productId === product.id);
              const cost = lines.reduce((sum, line) => sum + line.cost, 0);
              return (
                <li key={recipe.id} className={styles.usageRow}>
                  <Link to={`/recipes/${recipe.id}`} className={styles.usageName}>
                    {recipe.name}
                  </Link>
                  <span className={styles.usageAmount}>
                    {lines.map((line) => `${formatQuantity(line.quantity)} ${unitLabel(line.unit)}`).join(' + ')}
                  </span>
                  <span className={styles.usageCost}>
                    {formatMoney(cost)}
                    <span className={styles.usageOf}>
                      {' '}
                      z {formatMoney(recipe.foodCost)}
                      {recipe.foodCost > 0 && ` (${formatShortPercent((cost / recipe.foodCost) * 100)})`}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <HistoryCard
        type="product"
        id={product.id}
        numbers={{ label: 'Ceny', content: <ProductPriceTimeline productId={product.id} /> }}
        className={styles.section}
      />

      {dialog === 'confirm' && (
        <ConfirmModal
          message={`Czy na pewno chcesz usunąć składnik „${product.name}”?`}
          busy={remove.isPending}
          onConfirm={confirmDelete}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog && dialog !== 'confirm' && (
        <NoticeModal
          title="Nie można usunąć"
          message={
            <>
              „{product.name}” jest używany w {dialog.inUse.length}{' '}
              {plural(dialog.inUse.length, 'przepisie', 'przepisach', 'przepisach')}: <RecipeLinks recipes={dialog.inUse} />.
              Najpierw usuń go z tych przepisów.
            </>
          }
          onClose={() => setDialog(null)}
        />
      )}
    </DetailPage>
  );
}

// ---------- Edit mode ----------

function ProductEdit({ product }: { product: Product }) {
  const navigate = useNavigate();
  const toast = useToast();
  const usedIn = useProductRecipes(product.id);
  const update = useUpdateProduct();
  // Set when the save changes recipe costs and waits for the user to confirm.
  const [pending, setPending] = useState<{ values: ProductFormValues; changes: ProjectedCostChange[] } | null>(null);

  const detailUrl = `/products/${product.id}`;

  function save(values: ProductFormValues) {
    update.mutate(
      { id: product.id, patch: toProductPatch(values, product) },
      {
        onSuccess: (result) => {
          toast(savedMessage(result));
          navigate(detailUrl);
        },
        // The error is shown above the form buttons.
        onError: () => setPending(null),
      },
    );
  }

  return (
    <DetailPage>
      <BackLink to={detailUrl}>{product.name}</BackLink>
      <PageHeader eyebrow="Edytuj składnik" title={product.name} />

      <ProductForm
        product={product}
        usedIn={{ recipes: usedIn.recipes, loading: usedIn.loading }}
        busy={update.isPending}
        serverError={update.error ? <UpdateError error={update.error} /> : undefined}
        onCancel={() => navigate(detailUrl)}
        onSubmit={(values, impact) => {
          if (impact.changes.length > 0) setPending({ values, changes: impact.changes });
          else save(values);
        }}
      />

      {pending && (
        <ConfirmModal
          size="medium"
          title="Zmiana wpłynie na przepisy"
          message={
            <>
              <p className={styles.confirmLead}>
                Zapisanie zmian przeliczy koszt {recipesGenitive(pending.changes.length)}:
              </p>
              <UnprofitableWarning changes={pending.changes} />
              <RecipeCostChangeList changes={pending.changes} />
            </>
          }
          confirmLabel="Zapisz i przelicz"
          confirmVariant="primary"
          busy={update.isPending}
          busyLabel="Zapisywanie…"
          onConfirm={() => save(pending.values)}
          onCancel={() => setPending(null)}
        />
      )}
    </DetailPage>
  );
}

function UpdateError({ error }: { error: Error }) {
  if (error instanceof ApiRequestError && error.code === 'UNIT_CONFLICT') {
    return (
      <>
        Nie można zmienić jednostki na inny rodzaj (np. z wagi na sztuki), bo te przepisy odmierzają ten składnik w
        dotychczasowych jednostkach: <RecipeLinks recipes={error.recipes} />. Najpierw zmień te przepisy.
      </>
    );
  }
  return <>{errorMessage(error)}</>;
}

function savedMessage(result: ProductUpdateResult): ReactNode {
  const recalculated = result.recalculatedRecipes;
  if (recalculated.length === 0) return `Zapisano zmiany w „${result.product.name}”.`;
  const changes = recalculated
    .map((recipe) => `${recipe.name} ${formatMoney(recipe.previousFoodCost)} → ${formatMoney(recipe.foodCost)}`)
    .join(', ');
  return `Zapisano zmiany. Przeliczono ${recalculated.length} ${plural(recalculated.length, 'przepis', 'przepisy', 'przepisów')}: ${changes}.`;
}
