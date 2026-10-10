import type { Product, ProductInput, ProductPatch, Recipe, RecipeRef, Unit } from '../../api/types';
import { profitability } from '../../lib/foodcost';
import { capitalizeFirst, parseDecimal, roundTo, toInputValue } from '../../lib/format';
import { areCompatible, ingredientCost, packageSizeInPricingUnits, pricingUnitFor, unitLabel } from '../../lib/units';

/**
 * The product form shows two prices: per package and per kg/l/piece. The user types one,
 * the other is derived, and only the typed one is sent (the API derives the other the same way).
 */
export type PriceSource = 'package' | 'unit';

export interface ProductFormValues {
  name: string;
  manufacturer: string;
  description: string;
  packageSize: string;
  packageUnit: Unit;
  pricePerPackage: string;
  pricePerUnit: string;
  priceSource: PriceSource;
}

export type ProductFormErrors = Partial<Record<'name' | 'manufacturer' | 'description' | 'packageSize' | 'price', string>>;

export function initialProductForm(product?: Product): ProductFormValues {
  if (!product) {
    return {
      name: '',
      manufacturer: '',
      description: '',
      packageSize: '',
      packageUnit: 'g',
      pricePerPackage: '',
      pricePerUnit: '',
      priceSource: 'package',
    };
  }
  return {
    name: product.name,
    manufacturer: product.manufacturer ?? '',
    description: product.description ?? '',
    packageSize: toInputValue(product.packageSize, 6),
    packageUnit: product.packageUnit,
    pricePerPackage: toInputValue(product.pricePerPackage, 2),
    pricePerUnit: toInputValue(product.pricePerUnit, 2),
    priceSource: 'package',
  };
}

/** Both prices, derived from whichever one the user typed. Null until the form has enough to calculate. */
export function derivePrices(values: ProductFormValues): { pricePerPackage: number; pricePerUnit: number } | null {
  const size = parseDecimal(values.packageSize);
  if (!(size > 0)) return null;
  const sizeInPricingUnits = packageSizeInPricingUnits(size, values.packageUnit);

  if (values.priceSource === 'package') {
    const price = parseDecimal(values.pricePerPackage);
    return price >= 0 ? { pricePerPackage: price, pricePerUnit: price / sizeInPricingUnits } : null;
  }
  const price = parseDecimal(values.pricePerUnit);
  return price >= 0 ? { pricePerPackage: price * sizeInPricingUnits, pricePerUnit: price } : null;
}

/** "kg", "l" or "szt": what the per-unit price refers to. */
export function pricingUnitLabel(unit: Unit): string {
  return unitLabel(pricingUnitFor(unit));
}

export function validateProductForm(values: ProductFormValues): ProductFormErrors {
  const errors: ProductFormErrors = {};
  const name = values.name.trim();
  if (!name) errors.name = 'Podaj nazwę składnika.';
  else if (name.length > 200) errors.name = 'Nazwa może mieć najwyżej 200 znaków.';

  if (values.manufacturer.trim().length > 200) errors.manufacturer = 'Nazwa producenta może mieć najwyżej 200 znaków.';
  if (values.description.trim().length > 5000) errors.description = 'Opis może mieć najwyżej 5000 znaków.';

  if (!(parseDecimal(values.packageSize) > 0)) errors.packageSize = 'Podaj ilość w opakowaniu, większą od zera.';

  const typedPrice = parseDecimal(values.priceSource === 'package' ? values.pricePerPackage : values.pricePerUnit);
  if (!(typedPrice >= 0)) {
    errors.price = `Podaj cenę opakowania albo cenę za ${pricingUnitLabel(values.packageUnit)}.`;
  }
  return errors;
}

function textOrNull(text: string): string | null {
  return text.trim() || null;
}

function typedPrice(values: ProductFormValues): Pick<ProductInput, 'pricePerPackage' | 'pricePerUnit'> {
  return values.priceSource === 'package'
    ? { pricePerPackage: parseDecimal(values.pricePerPackage) }
    : { pricePerUnit: parseDecimal(values.pricePerUnit) };
}

/** Body for POST /products. Call only when validateProductForm returned no errors. */
export function toProductInput(values: ProductFormValues): ProductInput {
  return {
    name: capitalizeFirst(values.name.trim()),
    manufacturer: textOrNull(capitalizeFirst(values.manufacturer)),
    description: textOrNull(values.description),
    packageSize: parseDecimal(values.packageSize),
    packageUnit: values.packageUnit,
    ...typedPrice(values),
  };
}

/** Body for PATCH /products/:id with only what changed. Call only when the form is valid. */
export function toProductPatch(values: ProductFormValues, product: Product): ProductPatch {
  const input = toProductInput(values);
  const patch: ProductPatch = {};

  if (input.name !== product.name) patch.name = input.name;
  if (input.manufacturer !== product.manufacturer) patch.manufacturer = input.manufacturer;
  if (input.description !== product.description) patch.description = input.description;

  const packageChanged = input.packageSize !== product.packageSize || input.packageUnit !== product.packageUnit;
  if (input.packageSize !== product.packageSize) patch.packageSize = input.packageSize;
  if (input.packageUnit !== product.packageUnit) patch.packageUnit = input.packageUnit;

  if (input.pricePerPackage !== undefined) {
    // On its own, a new package size keeps the package price, which is what this field shows.
    if (input.pricePerPackage !== product.pricePerPackage) patch.pricePerPackage = input.pricePerPackage;
  } else if (input.pricePerUnit !== undefined) {
    // The user typed the per-unit price, so keep it even when the package changes.
    if (input.pricePerUnit !== product.pricePerUnit || packageChanged) patch.pricePerUnit = input.pricePerUnit;
  }
  return patch;
}

/** Whether the form differs from the saved product. A saved product is always valid, so an invalid form has changed. */
export function hasProductChanges(values: ProductFormValues, product: Product): boolean {
  if (Object.keys(validateProductForm(values)).length > 0) return true;
  return Object.keys(toProductPatch(values, product)).length > 0;
}

/** A recipe's food cost as it will be after the save (worked out in the browser). */
export interface ProjectedCostChange {
  id: number;
  name: string;
  portions: number;
  previousFoodCost: number;
  foodCost: number;
  /** The recipe's selling price, if set, to show whether it stays profitable. */
  sellPrice: number | null;
}

export interface PriceImpact {
  /** Recipes whose food cost will change, with the expected new cost. */
  changes: ProjectedCostChange[];
  /** Recipes that measure the product in a unit the new package unit can't convert to. The API would refuse the save. */
  conflicts: RecipeRef[];
}

const PRICE_FIELDS: (keyof ProductPatch)[] = ['pricePerPackage', 'pricePerUnit', 'packageSize', 'packageUnit'];

/** Whether saving would change the price, package size or unit, which makes the API recalculate recipes. */
export function hasPriceChange(values: ProductFormValues, product: Product): boolean {
  if (Object.keys(validateProductForm(values)).length > 0) return false;
  const patch = toProductPatch(values, product);
  return PRICE_FIELDS.some((field) => field in patch);
}

/**
 * What saving the form would do to the recipes that use the product, worked out before saving.
 * The API recalculates the same way; its numbers are shown after the save.
 */
export function priceImpact(values: ProductFormValues, product: Product, recipes: Recipe[]): PriceImpact {
  const none: PriceImpact = { changes: [], conflicts: [] };
  if (!hasPriceChange(values, product)) return none;

  const prices = derivePrices(values);
  if (!prices) return none;
  const next = {
    packageSize: parseDecimal(values.packageSize),
    packageUnit: values.packageUnit,
    pricePerPackage: prices.pricePerPackage,
  };

  const impact: PriceImpact = { changes: [], conflicts: [] };
  for (const recipe of recipes) {
    const lines = recipe.ingredients.filter((line) => line.productId === product.id);
    if (lines.length === 0) continue;
    if (lines.some((line) => !areCompatible(line.unit, next.packageUnit))) {
      impact.conflicts.push({ id: recipe.id, name: recipe.name });
      continue;
    }
    // unitPrice has 6 decimals, so quantity × unitPrice is closer to the stored cost than the rounded `cost`.
    const delta = lines.reduce(
      (sum, line) => sum + ingredientCost(next, line.quantity, line.unit) - line.quantity * line.unitPrice,
      0,
    );
    // Rounded to the cent like the API's foodCost, so "old → new" and the difference add up on screen.
    const foodCost = roundTo(recipe.foodCost + delta, 2);
    // Converting 200 g to 0,2 kg changes nothing worth a cent.
    if (foodCost !== recipe.foodCost) {
      impact.changes.push({
        id: recipe.id,
        name: recipe.name,
        portions: recipe.portions,
        previousFoodCost: recipe.foodCost,
        foodCost,
        sellPrice: recipe.sellPrice,
      });
    }
  }
  return impact;
}

/** Recipes with a selling price that meet the food cost target now but won't after the save. */
export function newlyUnprofitable(changes: ProjectedCostChange[]): ProjectedCostChange[] {
  return changes.filter(
    (change) =>
      !profitability(change.previousFoodCost, change.sellPrice)?.needsAttention &&
      !!profitability(change.foodCost, change.sellPrice)?.needsAttention,
  );
}
