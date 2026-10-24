import { Link } from 'react-router';
import { useRecipeCostHistory } from '../../api/recipes';
import type { RecipeCostChange } from '../../api/types';
import { ChangeBadge, Timeline, type TimelineEntry } from '../../components/Timeline';
import { PillButton } from '../../components/ui';
import { formatMoney, portionsLabel } from '../../lib/format';
import { unitPriceLabel } from '../products/labels';
import styles from './RecipeCostHistory.module.css';

const TITLES: Record<RecipeCostChange['reason'], string> = {
  created: 'Utworzono przepis',
  recipe_updated: 'Edycja przepisu',
  recipe_restored: 'Przywrócono przepis',
  product_price_changed: 'Zmiana ceny składnika',
  sub_recipe_changed: 'Zmiana przepisu składowego',
};

/** "przez Krem chantilly" / "Zmienił się przepis Krem chantilly": the sub-recipe the change came through. */
function SubRecipeNote({ subRecipe, through }: { subRecipe: NonNullable<RecipeCostChange['subRecipe']>; through: boolean }) {
  const link = <Link to={`/recipes/${subRecipe.id}`}>{subRecipe.name}</Link>;
  return <div className={styles.cause}>{through ? <>przez przepis {link}</> : <>Zmienił się przepis {link}</>}</div>;
}

/** How the recipe's food cost changed over time, and why, newest first ("Koszty" tab of the history card). */
export function RecipeCostTimeline({ recipeId }: { recipeId: number }) {
  const history = useRecipeCostHistory(recipeId);

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

/** "Masło 82%: 8,00 zł → 10,00 zł za opakowanie (40,00 zł/kg → 50,00 zł/kg)" */
function Cause({ cause }: { cause: NonNullable<RecipeCostChange['cause']> }) {
  const name =
    cause.productId !== null ? <Link to={`/products/${cause.productId}`}>{cause.productName}</Link> : cause.productName;
  const previousUnitPrice =
    cause.previousPricePerUnit === null
      ? null
      : unitPriceLabel({ pricePerUnit: cause.previousPricePerUnit, pricingUnit: cause.pricingUnit });

  // Same package price, different package size: only the per-kg price says what changed.
  if (cause.previousPricePerPackage === cause.pricePerPackage && previousUnitPrice) {
    return (
      <div className={styles.cause}>
        {name}: zmiana opakowania, {previousUnitPrice} → {unitPriceLabel(cause)}
      </div>
    );
  }
  return (
    <div className={styles.cause}>
      {name}: {cause.previousPricePerPackage !== null && `${formatMoney(cause.previousPricePerPackage)} → `}
      {formatMoney(cause.pricePerPackage)} za opakowanie
      {previousUnitPrice && (
        <span className={styles.muted}>
          {' '}
          ({previousUnitPrice} → {unitPriceLabel(cause)})
        </span>
      )}
    </div>
  );
}

function toEntry(change: RecipeCostChange): TimelineEntry {
  const previous = change.previous;
  const cause = change.cause;

  return {
    key: change.id,
    title: TITLES[change.reason],
    date: change.changedAt,
    tone: change.reason === 'created' ? 'muted' : 'accent',
    content: (
      <>
        {cause && <Cause cause={cause} />}
        {change.subRecipe && <SubRecipeNote subRecipe={change.subRecipe} through={cause !== null} />}
        <div>
          {previous && previous.foodCost !== change.foodCost && `${formatMoney(previous.foodCost)} → `}
          <strong>{formatMoney(change.foodCost)}</strong>
          <ChangeBadge from={previous?.foodCost} to={change.foodCost} />
        </div>
        <div className={styles.muted}>
          {previous && previous.costPerPortion !== change.costPerPortion && `${formatMoney(previous.costPerPortion)} → `}
          {formatMoney(change.costPerPortion)} / porcja ·{' '}
          {previous && previous.portions !== change.portions
            ? `${previous.portions} → ${portionsLabel(change.portions)}`
            : portionsLabel(change.portions)}
        </div>
      </>
    ),
  };
}
