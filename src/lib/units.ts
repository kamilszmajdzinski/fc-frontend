import type { IngredientUnit, PricingUnit, Product, RecipeSummary, Unit, YieldUnit } from '../api/types';
import { formatQuantity, plural } from './format';

type UnitKind = 'weight' | 'volume' | 'count';

// Same maths as the backend (src/lib/units.js), so previews match saved values.
const UNITS: Record<Unit, { kind: UnitKind; factor: number }> = {
  mg: { kind: 'weight', factor: 0.001 },
  g: { kind: 'weight', factor: 1 },
  kg: { kind: 'weight', factor: 1000 },
  ml: { kind: 'volume', factor: 1 },
  l: { kind: 'volume', factor: 1000 },
  piece: { kind: 'count', factor: 1 },
};

const PRICING_UNITS: Record<UnitKind, PricingUnit> = { weight: 'kg', volume: 'l', count: 'piece' };

// The unit a recipe line starts with: chefs weigh in grams even when flour is bought by the kilo.
const RECIPE_UNITS: Record<UnitKind, Unit> = { weight: 'g', volume: 'ml', count: 'piece' };

// Order used in the package unit picker.
export const PACKAGE_UNITS: Unit[] = ['g', 'kg', 'mg', 'ml', 'l', 'piece'];

// Order used in the recipe yield picker.
export const YIELD_UNITS: YieldUnit[] = ['g', 'kg', 'mg', 'ml', 'l'];

export function unitLabel(unit: IngredientUnit): string {
  if (unit === 'piece') return 'szt';
  if (unit === 'portion') return 'porcja';
  return unit;
}

/** "200 g", "1 szt", "2 porcje": a quantity with its unit, with portions in the right Polish form. */
export function formatAmount(quantity: number, unit: IngredientUnit): string {
  const label = unit === 'portion' ? plural(quantity, 'porcja', 'porcje', 'porcji') : unitLabel(unit);
  return `${formatQuantity(quantity)} ${label}`;
}

export function compatibleUnits(unit: Unit): Unit[] {
  return PACKAGE_UNITS.filter((u) => UNITS[u].kind === UNITS[unit].kind);
}

/** Same kind (weight, volume, count). A portion only matches a portion. */
export function areCompatible(a: IngredientUnit, b: IngredientUnit): boolean {
  if (a === 'portion' || b === 'portion') return a === b;
  return UNITS[a].kind === UNITS[b].kind;
}

export function convert(quantity: number, from: Unit, to: Unit): number {
  return (quantity * UNITS[from].factor) / UNITS[to].factor;
}

export function pricingUnitFor(unit: Unit): PricingUnit {
  return PRICING_UNITS[UNITS[unit].kind];
}

export function defaultRecipeUnit(packageUnit: Unit): Unit {
  return RECIPE_UNITS[UNITS[packageUnit].kind];
}

/** How many pricing units (kg, l or pieces) one package holds. */
export function packageSizeInPricingUnits(packageSize: number, packageUnit: Unit): number {
  return convert(packageSize, packageUnit, pricingUnitFor(packageUnit));
}

type PricedProduct = Pick<Product, 'packageSize' | 'packageUnit' | 'pricePerPackage'>;

/** Live cost of an ingredient line, before the server calculates the saved value. */
export function ingredientCost(product: PricedProduct, quantity: number, unit: Unit): number {
  const unitPrice = product.pricePerPackage / convert(product.packageSize, product.packageUnit, unit);
  return quantity * unitPrice;
}

type SubRecipe = Pick<RecipeSummary, 'foodCost' | 'portions' | 'yieldQuantity' | 'yieldUnit'>;

/** Units a sub-recipe can be used in: portions, plus weight or volume units when it has a yield. */
export function subRecipeUnits(recipe: SubRecipe): IngredientUnit[] {
  return ['portion', ...(recipe.yieldUnit ? compatibleUnits(recipe.yieldUnit) : [])];
}

/** Live cost of a sub-recipe line, same maths as the backend. */
export function subRecipeCost(recipe: SubRecipe, quantity: number, unit: IngredientUnit): number {
  if (unit === 'portion') return recipe.portions > 0 ? (quantity * recipe.foodCost) / recipe.portions : 0;
  if (!recipe.yieldQuantity || !recipe.yieldUnit || !areCompatible(recipe.yieldUnit, unit)) return 0;
  return quantity * (recipe.foodCost / convert(recipe.yieldQuantity, recipe.yieldUnit, unit));
}

/** Value of the stock on hand. inventoryQuantity is in packageUnit. */
export function inventoryValue(product: PricedProduct & Pick<Product, 'inventoryQuantity'>): number {
  return product.packageSize > 0 ? (product.inventoryQuantity / product.packageSize) * product.pricePerPackage : 0;
}
