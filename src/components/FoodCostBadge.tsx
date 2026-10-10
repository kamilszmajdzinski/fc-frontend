import { FOOD_COST_LEVELS, profitability } from '../lib/foodcost';
import { formatShortPercent } from '../lib/format';
import { cx } from './ui';
import styles from './FoodCostBadge.module.css';

interface FoodCostBadgeProps {
  foodCost: number;
  sellPrice: number | null | undefined;
  /** Adds the level's word, e.g. "FC 34% · Akceptowalny". */
  withLabel?: boolean;
  className?: string;
}

/**
 * "FC 28%" in green, orange or red. The colour always comes with the number (and the word when
 * `withLabel`), so it never relies on colour alone. Renders nothing without a selling price.
 */
export function FoodCostBadge({ foodCost, sellPrice, withLabel, className }: FoodCostBadgeProps) {
  const result = profitability(foodCost, sellPrice);
  if (!result) return null;
  const word = result.loss ? 'Strata' : FOOD_COST_LEVELS[result.level].label;
  return (
    <span
      className={cx(styles.badge, styles[result.level], className)}
      title={`Foodcost ${formatShortPercent(result.percent)} — ${word}`}
    >
      {result.needsAttention && <span aria-hidden="true">! </span>}
      FC {formatShortPercent(result.percent)}
      {withLabel && ` · ${word}`}
    </span>
  );
}
