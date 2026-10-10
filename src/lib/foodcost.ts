// Food cost = ingredient cost as a share of the selling price. Pastry shops aim for 30% or less.
export const TARGET_FOOD_COST = 30;
const ACCEPTABLE_FOOD_COST = 40;

export type FoodCostLevel = 'good' | 'acceptable' | 'high';

export const FOOD_COST_LEVELS: Record<FoodCostLevel, { label: string; tip: string }> = {
  good: { label: 'Dobry', tip: 'Rentowna cena' },
  acceptable: { label: 'Akceptowalny', tip: 'Rozważ podwyżkę' },
  high: { label: 'Za wysoki', tip: 'Zbyt niska cena' },
};

export function foodCostPercent(cost: number, sellingPrice: number): number | null {
  return sellingPrice > 0 ? (cost / sellingPrice) * 100 : null;
}

export function foodCostLevel(percent: number): FoodCostLevel {
  if (percent <= TARGET_FOOD_COST) return 'good';
  if (percent <= ACCEPTABLE_FOOD_COST) return 'acceptable';
  return 'high';
}

/** Selling price that gives the target food cost, rounded up to the cent. */
export function suggestedPrice(cost: number): number {
  return Math.ceil((cost / (TARGET_FOOD_COST / 100)) * 100 - 1e-9) / 100;
}

export interface Profitability {
  percent: number;
  level: FoodCostLevel;
  profit: number;
  /** The price is at or below the cost: every sale loses money. */
  loss: boolean;
  /** Above the 30% target: the price should go up. */
  needsAttention: boolean;
}

/** How a recipe's selling price compares with its food cost. Null when there is no price. */
export function profitability(foodCost: number, sellPrice: number | null | undefined): Profitability | null {
  if (sellPrice === null || sellPrice === undefined) return null;
  const percent = foodCostPercent(foodCost, sellPrice);
  if (percent === null) return null;
  const level = foodCostLevel(percent);
  const profit = sellPrice - foodCost;
  return { percent, level, profit, loss: profit <= 0, needsAttention: level !== 'good' };
}
