import type { ReactNode } from 'react';
import { FoodCostMeter } from '../../components/FoodCostMeter';
import { cx } from '../../components/ui';
import { profitability, suggestedPrice, TARGET_FOOD_COST } from '../../lib/foodcost';
import { formatMoney, formatPercent } from '../../lib/format';
import styles from './PriceAlert.module.css';

interface PriceAlertProps {
  foodCost: number;
  sellPrice: number | null;
  portions: number;
  /** Buttons and links, e.g. "Ustaw 62,50 zł" and "Otwórz w kalkulatorze". */
  actions: ReactNode;
  className?: string;
}

/**
 * "Cena sprzedaży jest za niska": shown when the selling price no longer meets the 30% food cost
 * target, e.g. after an ingredient got more expensive. Renders nothing when the price is fine or unset.
 */
export function PriceAlert({ foodCost, sellPrice, portions, actions, className }: PriceAlertProps) {
  const result = profitability(foodCost, sellPrice);
  if (!result?.needsAttention || sellPrice === null) return null;
  const suggested = suggestedPrice(foodCost);

  return (
    <div className={cx(styles.alert, result.level === 'high' && styles.high, className)} role="alert">
      <div className={styles.main}>
        <div className={styles.title}>
          {result.loss ? 'Cena sprzedaży nie pokrywa kosztu składników' : 'Cena sprzedaży jest za niska'}
        </div>
        <div className={styles.text}>
          Foodcost {formatPercent(result.percent)} przy celu ≤ {TARGET_FOOD_COST}%. Sugerowana cena:{' '}
          <strong>{formatMoney(suggested)}</strong> ({formatMoney(suggested / portions)} / porcja).
        </div>
        <FoodCostMeter foodCost={foodCost} sellPrice={sellPrice} />
      </div>
      <div className={styles.actions}>{actions}</div>
    </div>
  );
}
