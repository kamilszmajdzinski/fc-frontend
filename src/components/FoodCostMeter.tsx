import { FOOD_COST_LEVELS, profitability, TARGET_FOOD_COST } from '../lib/foodcost';
import { formatPercent } from '../lib/format';
import { cx } from './ui';
import styles from './FoodCostMeter.module.css';

const ACCEPTABLE = 40;

/**
 * Small horizontal meter: how much of the selling price the ingredients take, against the 30% target
 * and the 40% limit. The number and the level's word are always shown as text next to the colour.
 */
export function FoodCostMeter({ foodCost, sellPrice }: { foodCost: number; sellPrice: number }) {
  const result = profitability(foodCost, sellPrice);
  if (!result) return null;
  const width = Math.min(result.percent, 100);
  return (
    <div className={cx(styles.meter, styles[result.level])}>
      <div className={styles.head}>
        <span className={styles.value}>Foodcost {formatPercent(result.percent)}</span>
        <span className={styles.level}>{result.loss ? 'Strata' : FOOD_COST_LEVELS[result.level].label}</span>
      </div>
      <div
        className={styles.track}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(result.percent)}
        aria-label={`Foodcost ${formatPercent(result.percent)}, cel ${TARGET_FOOD_COST}%`}
      >
        <div className={styles.fill} style={{ width: `${width}%` }} />
        <span className={styles.mark} style={{ left: `${TARGET_FOOD_COST}%` }} />
        <span className={styles.mark} style={{ left: `${ACCEPTABLE}%` }} />
      </div>
      <div className={styles.scale} aria-hidden="true">
        <span style={{ left: `${TARGET_FOOD_COST}%` }}>cel {TARGET_FOOD_COST}%</span>
        <span style={{ left: `${ACCEPTABLE}%` }}>{ACCEPTABLE}%</span>
      </div>
    </div>
  );
}
