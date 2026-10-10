import { useMemo, useState, type ReactNode } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { errorMessage } from '../../api/client';
import { useProducts, useUpdateProduct } from '../../api/products';
import type { Product, Unit } from '../../api/types';
import { EmptyState, LoadError, Loading } from '../../components/EmptyState';
import { BackLink, DetailPage, ListItem, ListPanel, ListRow, MasterDetail, PageHeader } from '../../components/MasterDetail';
import { useToast } from '../../components/Toast';
import { Button, Card, cx, Field, NumberInput, Stat } from '../../components/ui';
import { formatMoney, formatQuantity, parseDecimal, roundTo } from '../../lib/format';
import { matchesSearch } from '../../lib/search';
import { useIdParam } from '../../lib/useIdParam';
import { inventoryValue, unitLabel } from '../../lib/units';
import { packageLabel, unitPriceLabel } from '../products/labels';
import styles from './InventoryPage.module.css';

// The API has no minimum stock level yet, so the design's "low" status and threshold are left out.
type StockFilter = 'all' | 'out';

const isOut = (product: Product) => product.inventoryQuantity <= 0;

function stockLabel(product: Product): string {
  return `${formatQuantity(product.inventoryQuantity)} ${unitLabel(product.packageUnit)}`;
}

export function InventoryPage() {
  const products = useProducts();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StockFilter>('all');
  const { pathname } = useLocation();

  const all = products.data ?? [];
  const totalValue = all.reduce((sum, product) => sum + inventoryValue(product), 0);
  const outCount = all.filter(isOut).length;

  // Out of stock first, then by name (the list is already sorted by name).
  const filtered = useMemo(
    () =>
      (products.data ?? [])
        .filter((p) => (filter === 'all' || isOut(p)) && matchesSearch(query, p.name, p.manufacturer))
        .toSorted((a, b) => Number(isOut(b)) - Number(isOut(a))),
    [products.data, filter, query],
  );

  let items: ReactNode;
  if (products.isPending) items = <Loading />;
  else if (products.isError) items = <LoadError compact error={products.error} onRetry={() => products.refetch()} />;
  else if (all.length === 0) {
    items = (
      <EmptyState compact icon="box" title="Pusty magazyn" sub={<>Najpierw <Link to="/products/new">dodaj składniki</Link>.</>} />
    );
  } else if (filtered.length === 0) {
    items = <EmptyState compact icon="box" title="Brak wyników" sub={query ? 'Sprawdź pisownię' : 'Wszystko jest na stanie'} />;
  } else {
    items = filtered.map((product) => (
      <ListItem key={product.id} to={`/inventory/${product.id}`}>
        <ListRow
          dot={isOut(product) ? 'red' : 'green'}
          title={product.name}
          sub={`wartość ${formatMoney(inventoryValue(product))}`}
          aside={<span className={isOut(product) ? styles.outText : undefined}>{stockLabel(product)}</span>}
        />
      </ListItem>
    ));
  }

  return (
    <MasterDetail
      detailOpen={pathname.replace(/\/+$/, '') !== '/inventory'}
      list={
        <ListPanel title="Magazyn" search={{ value: query, onChange: setQuery }}>
          <div className={styles.filters} role="group" aria-label="Filtr">
            {(
              [
                { id: 'all', label: 'Wszystkie' },
                { id: 'out', label: 'Brak' },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                className={cx(styles.filter, filter === option.id && styles.filterActive)}
                aria-pressed={filter === option.id}
                onClick={() => setFilter(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className={styles.summary}>
            <div className={cx(styles.summaryBox, styles.summaryWide)}>
              <div className={styles.summaryLabel}>Wartość</div>
              <div className={styles.summaryValue}>{formatMoney(totalValue)}</div>
            </div>
            <button
              type="button"
              className={cx(styles.summaryBox, outCount > 0 && styles.summaryAlert)}
              onClick={() => setFilter((current) => (current === 'out' ? 'all' : 'out'))}
              aria-label={`Brak na stanie: ${outCount}. Pokaż tylko te składniki.`}
            >
              <div className={styles.summaryLabel}>Brak</div>
              <div className={styles.summaryValue}>{outCount}</div>
            </button>
          </div>
          {items}
        </ListPanel>
      }
    >
      <Outlet />
    </MasterDetail>
  );
}

export function InventoryIndex() {
  return (
    <EmptyState
      icon="box"
      title="Stany magazynowe"
      sub="Wybierz składnik z listy, aby zobaczyć szczegóły i skorygować stan"
    />
  );
}

export function InventoryDetailPage() {
  const id = useIdParam('productId');
  const products = useProducts();
  const product = products.data?.find((p) => p.id === id);

  if (products.isPending) return <Loading />;
  if (products.isError) return <LoadError error={products.error} onRetry={() => products.refetch()} />;
  if (!product) {
    return <EmptyState icon="info" title="Nie znaleziono składnika" sub="Mógł zostać usunięty. Wybierz inny z listy." />;
  }
  return <InventoryDetail key={product.id} product={product} />;
}

// Quick adjustment buttons that make sense for the unit.
const QUICK_STEPS: Record<Unit, number[]> = {
  mg: [-100, -50, 50, 100, 500],
  g: [-100, -50, 50, 100, 500],
  ml: [-100, -50, 50, 100, 500],
  kg: [-1, -0.5, 0.5, 1, 5],
  l: [-1, -0.5, 0.5, 1, 5],
  piece: [-5, -1, 1, 5, 10],
};

type AdjustMode = 'add' | 'set';

function InventoryDetail({ product }: { product: Product }) {
  const toast = useToast();
  const update = useUpdateProduct();
  const [mode, setMode] = useState<AdjustMode>('add');
  const [amountText, setAmountText] = useState('');

  const unit = unitLabel(product.packageUnit);
  const out = isOut(product);
  const value = inventoryValue(product);
  const packages = product.packageSize > 0 ? product.inventoryQuantity / product.packageSize : 0;

  const amount = parseDecimal(amountText);
  const pending =
    Number.isNaN(amount) || (mode === 'set' && amount < 0)
      ? null
      : Math.max(0, roundTo(mode === 'add' ? product.inventoryQuantity + amount : amount, 6));

  function save(quantity: number, onSaved?: () => void) {
    update.mutate(
      { id: product.id, patch: { inventoryQuantity: Math.max(0, roundTo(quantity, 6)) } },
      { onSuccess: onSaved, onError: (error) => toast(errorMessage(error), 'error') },
    );
  }

  return (
    <DetailPage>
      <BackLink to="/inventory">Magazyn</BackLink>
      <PageHeader
        eyebrow="Stan magazynowy"
        title={product.name}
        sub={`${packageLabel(product)} · ${formatMoney(product.pricePerPackage)}`}
      />

      <div className={styles.stats}>
        <Stat compact label="Aktualny stan" value={stockLabel(product)} tone={out ? 'red' : 'green'} />
        <Stat compact label="Wartość" value={formatMoney(value)} />
        <Stat
          compact
          label="Opakowania"
          value={`${formatQuantity(roundTo(packages, 2))} opak.`}
          sub={`po ${packageLabel(product)}`}
        />
      </div>

      <div className={styles.columns}>
        <Card title="Korekta stanu" className={styles.panel}>
          <div className={styles.segmented} role="group" aria-label="Rodzaj korekty">
            {(
              [
                { id: 'add', label: 'Dodaj / Odejmij' },
                { id: 'set', label: 'Ustaw stan' },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                className={cx(styles.segment, mode === option.id && styles.segmentActive)}
                aria-pressed={mode === option.id}
                onClick={() => setMode(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (pending !== null) save(pending, () => setAmountText(''));
            }}
          >
            <Field
              label={mode === 'add' ? `Ilość (+/−), ${unit}` : `Nowy stan, ${unit}`}
              htmlFor={`adjust-${product.id}`}
            >
              <div className={styles.adjustRow}>
                <NumberInput
                  id={`adjust-${product.id}`}
                  placeholder={mode === 'add' ? '+500 lub -100' : '2000'}
                  value={amountText}
                  onChange={(e) => setAmountText(e.target.value)}
                />
                <Button type="submit" small dimmed={pending === null} disabled={update.isPending || pending === null}>
                  Zapisz
                </Button>
              </div>
            </Field>
          </form>

          {pending !== null && (
            <div className={styles.after}>
              Po zmianie:{' '}
              <strong>
                {formatQuantity(pending)} {unit}
              </strong>{' '}
              · {formatMoney(inventoryValue({ ...product, inventoryQuantity: pending }))}
            </div>
          )}

          <div className={styles.quick}>
            {QUICK_STEPS[product.packageUnit].map((step) => (
              <button
                key={step}
                type="button"
                className={styles.quickButton}
                disabled={update.isPending}
                onClick={() => save(product.inventoryQuantity + step)}
              >
                {step > 0 ? '+' : '−'}
                {formatQuantity(Math.abs(step))}
              </button>
            ))}
          </div>
          <Button
            variant="accent"
            small
            className={styles.addPackage}
            disabled={update.isPending}
            onClick={() => save(product.inventoryQuantity + product.packageSize)}
          >
            + 1 opakowanie ({packageLabel(product)})
          </Button>
        </Card>

        <Card title="Składnik" className={styles.panel}>
          <div className={styles.priceBox}>
            <div className={styles.priceLabel}>Cena składnika</div>
            <div className={styles.priceValue}>{formatMoney(product.pricePerPackage)}</div>
            <div className={styles.priceSub}>
              {packageLabel(product)} · {unitPriceLabel(product)}
            </div>
          </div>
          <p className={styles.note}>
            Stan nie zmniejsza się jeszcze automatycznie po przygotowaniu przepisu — koryguj go tutaj.
          </p>
          <Link to={`/products/${product.id}/edit`} className={styles.editLink}>
            Edytuj składnik →
          </Link>
        </Card>
      </div>
    </DetailPage>
  );
}
