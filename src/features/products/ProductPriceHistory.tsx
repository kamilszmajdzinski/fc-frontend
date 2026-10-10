import { Link } from 'react-router';
import { useProductPriceHistory } from '../../api/products';
import type { ProductPriceChange } from '../../api/types';
import { ChangeBadge, Timeline, type TimelineEntry } from '../../components/Timeline';
import { PillButton } from '../../components/ui';
import { formatMoney } from '../../lib/format';
import { packageLabel, unitPriceLabel } from './labels';
import styles from './ProductPriceHistory.module.css';

/** Every price, package size and unit change of a product, newest first ("Ceny" tab of the history card). */
export function ProductPriceTimeline({ productId }: { productId: number }) {
  const history = useProductPriceHistory(productId);

  if (history.isPending) return <div className={styles.muted}>Wczytywanie…</div>;
  if (history.isError) {
    return (
      <div className={styles.muted}>
        Nie udało się wczytać historii. <PillButton onClick={() => history.refetch()}>Spróbuj ponownie</PillButton>
      </div>
    );
  }
  if (history.data.length === 0) return <div className={styles.muted}>Brak zapisanych zmian.</div>;
  return <Timeline entries={history.data.map(toEntry)} />;
}

function toEntry(change: ProductPriceChange): TimelineEntry {
  const previous = change.previous;
  if (!previous) {
    return {
      key: change.id,
      title: 'Dodano składnik',
      date: change.changedAt,
      tone: 'muted',
      content: (
        <>
          <div>
            <strong>{formatMoney(change.pricePerPackage)}</strong> za {packageLabel(change)}
          </div>
          <div className={styles.muted}>{unitPriceLabel(change)}</div>
        </>
      ),
    };
  }

  const packageChanged = previous.packageSize !== change.packageSize || previous.packageUnit !== change.packageUnit;
  const priceChanged = previous.pricePerPackage !== change.pricePerPackage;
  const title = packageChanged && priceChanged ? 'Zmiana ceny i opakowania' : packageChanged ? 'Zmiana opakowania' : 'Zmiana ceny';

  return {
    key: change.id,
    title,
    date: change.changedAt,
    content: (
      <>
        <div>
          {packageChanged ? (
            <>
              {formatMoney(previous.pricePerPackage)} za {packageLabel(previous)} →{' '}
              <strong>
                {formatMoney(change.pricePerPackage)} za {packageLabel(change)}
              </strong>
            </>
          ) : (
            <>
              {formatMoney(previous.pricePerPackage)} → <strong>{formatMoney(change.pricePerPackage)}</strong> za{' '}
              {packageLabel(change)}
            </>
          )}
          {/* The per-unit price stays comparable when the package size changes. */}
          <ChangeBadge from={previous.pricePerUnit} to={change.pricePerUnit} />
        </div>
        <div className={styles.muted}>
          {unitPriceLabel(previous)} → {unitPriceLabel(change)}
        </div>
        {change.affectedRecipes.length > 0 && (
          <div className={styles.affected}>
            <div className={styles.affectedLabel}>Przeliczone przepisy</div>
            <ul className={styles.recipes}>
              {change.affectedRecipes.map((recipe) => (
                <li key={recipe.id} className={styles.recipe}>
                  <Link to={`/recipes/${recipe.id}`} className={styles.recipeName}>
                    {recipe.name}
                  </Link>
                  <span className={styles.recipeCost}>
                    {recipe.previousFoodCost !== null && `${formatMoney(recipe.previousFoodCost)} → `}
                    <strong>{formatMoney(recipe.foodCost)}</strong>
                    <ChangeBadge from={recipe.previousFoodCost} to={recipe.foodCost} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </>
    ),
  };
}
