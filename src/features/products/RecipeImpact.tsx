import { Banner, cx } from '../../components/ui';
import { profitability, TARGET_FOOD_COST } from '../../lib/foodcost';
import { formatMoney, formatShortPercent, formatSignedPercent, plural, roundTo } from '../../lib/format';
import { recipesGenitive } from './labels';
import { newlyUnprofitable, type PriceImpact, type ProjectedCostChange } from './productFormModel';
import styles from './RecipeImpact.module.css';

function formatDelta(delta: number): string {
  return `${delta > 0 ? '+' : '−'}${formatMoney(Math.abs(delta))}`;
}

/**
 * For each recipe:
 *   Ganache                10,50 zł → 11,30 zł
 *                          +0,80 zł (+8%)
 */
export function RecipeCostChangeList({ changes }: { changes: ProjectedCostChange[] }) {
  return (
    <ul className={styles.list}>
      {changes.map((change) => {
        // Both costs are whole cents; rounding drops float noise like 0.0799999.
        const delta = roundTo(change.foodCost - change.previousFoodCost, 2);
        return (
          <li key={change.id} className={styles.row}>
            <span className={styles.name}>{change.name}</span>
            <span className={styles.figures}>
              <span className={styles.costs}>
                {formatMoney(change.previousFoodCost)} → <strong>{formatMoney(change.foodCost)}</strong>
              </span>
              <span className={cx(styles.delta, delta > 0 ? styles.up : styles.down)}>
                {formatDelta(delta)}
                {change.previousFoodCost > 0 && ` (${formatSignedPercent((delta / change.previousFoodCost) * 100)})`}
              </span>
              <FoodCostShift change={change} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** "FC 28% → 34% · powyżej celu 30%" for recipes that have a selling price. */
function FoodCostShift({ change }: { change: ProjectedCostChange }) {
  const before = profitability(change.previousFoodCost, change.sellPrice);
  const after = profitability(change.foodCost, change.sellPrice);
  if (!before || !after) return null;
  const crosses = !before.needsAttention && after.needsAttention;
  return (
    <span className={cx(styles.foodCost, after.needsAttention && styles.foodCostWarn)}>
      FC {formatShortPercent(before.percent)} → {formatShortPercent(after.percent)}
      {after.loss ? ' · strata' : crosses ? ` · powyżej celu ${TARGET_FOOD_COST}%` : ''}
    </span>
  );
}

interface PriceImpactPanelProps {
  impact: PriceImpact;
  /** Recipe details are still loading, so the impact is not known yet. */
  checking: boolean;
}

/** Shown in the ingredient editor as soon as a price change would change recipe costs. */
export function PriceImpactPanel({ impact, checking }: PriceImpactPanelProps) {
  if (checking) {
    return <div className={styles.panel}>Sprawdzanie przepisów, w których używasz tego składnika…</div>;
  }
  if (impact.conflicts.length > 0) {
    return (
      <Banner>
        Nie można zmienić jednostki na inny rodzaj (np. z wagi na sztuki), bo{' '}
        {impact.conflicts.length === 1 ? 'przepis' : 'przepisy'} {impact.conflicts.map((r) => `„${r.name}”`).join(', ')}{' '}
        {impact.conflicts.length === 1 ? 'odmierza' : 'odmierzają'} ten składnik w dotychczasowych jednostkach. Najpierw
        zmień {impact.conflicts.length === 1 ? 'ten przepis' : 'te przepisy'}.
      </Banner>
    );
  }
  if (impact.changes.length === 0) return null;
  return (
    <section className={styles.panel} aria-live="polite">
      <div className={styles.title}>Wpływ na przepisy</div>
      <p className={styles.lead}>Po zapisaniu zmieni się koszt {recipesGenitive(impact.changes.length)}:</p>
      <UnprofitableWarning changes={impact.changes} />
      <RecipeCostChangeList changes={impact.changes} />
    </section>
  );
}

/** One line above the list when the change pushes priced recipes above the target. */
export function UnprofitableWarning({ changes }: { changes: ProjectedCostChange[] }) {
  const count = newlyUnprofitable(changes).length;
  if (count === 0) return null;
  return (
    <p className={styles.warning}>
      {count === 1 ? '1 przepis' : `${count} ${plural(count, 'przepis', 'przepisy', 'przepisów')}`} przekroczy cel foodcost{' '}
      {TARGET_FOOD_COST}% — po zapisaniu sprawdź ich ceny sprzedaży.
    </p>
  );
}
