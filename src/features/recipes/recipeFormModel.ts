import type { Product, Recipe, RecipeInput, Unit } from '../../api/types';
import { capitalizeFirst, parseDecimal, toInputValue } from '../../lib/format';
import { areCompatible, defaultRecipeUnit, ingredientCost } from '../../lib/units';

// Ingredient ids from the API change on every save, so editor rows get their own keys.
let lastKey = 0;
export function newRowKey(): string {
  lastKey += 1;
  return `row-${lastKey}`;
}

export interface IngredientRow {
  key: string;
  productId: number | null;
  quantity: string;
  unit: Unit;
}

export interface StepRow {
  key: string;
  text: string;
}

export interface RecipeFormValues {
  name: string;
  description: string;
  portions: string;
  /** Selling price of the whole recipe; empty means "not set". */
  sellPrice: string;
  ingredients: IngredientRow[];
  steps: StepRow[];
}

export interface RecipeFormErrors {
  name?: string;
  description?: string;
  portions?: string;
  sellPrice?: string;
  ingredients?: string;
  steps?: string;
  /** Which parts of an ingredient row are missing, by row key. */
  rows: Record<string, { product?: boolean; quantity?: boolean }>;
}

const MAX_INGREDIENTS = 200;
const MAX_STEPS = 100;

export function initialRecipeForm(recipe?: Recipe): RecipeFormValues {
  if (!recipe) return { name: '', description: '', portions: '1', sellPrice: '', ingredients: [], steps: [] };
  return {
    name: recipe.name,
    description: recipe.description ?? '',
    portions: String(recipe.portions),
    sellPrice: recipe.sellPrice === null ? '' : toInputValue(recipe.sellPrice),
    ingredients: recipe.ingredients.map((line) => ({
      key: newRowKey(),
      productId: line.productId,
      quantity: toInputValue(line.quantity, 6),
      unit: line.unit,
    })),
    steps: recipe.steps.map((text) => ({ key: newRowKey(), text })),
  };
}

export function emptyIngredientRow(product?: Product): IngredientRow {
  return {
    key: newRowKey(),
    productId: product?.id ?? null,
    quantity: '',
    unit: product ? defaultRecipeUnit(product.packageUnit) : 'g',
  };
}

/** Picking another product keeps the unit when it still fits, e.g. g stays g from flour to sugar. */
export function withProduct(row: IngredientRow, product: Product): IngredientRow {
  const unit = areCompatible(row.unit, product.packageUnit) ? row.unit : defaultRecipeUnit(product.packageUnit);
  return { ...row, productId: product.id, unit };
}

export function parsePortions(text: string): number {
  const value = parseDecimal(text);
  return Number.isInteger(value) && value >= 1 ? value : Number.NaN;
}

/** The typed selling price: null when left empty, NaN when it isn't a valid amount. */
export function parseSellPrice(text: string): number | null {
  if (text.trim() === '') return null;
  const value = parseDecimal(text);
  return value >= 0 ? value : Number.NaN;
}

export function validateRecipeForm(values: RecipeFormValues): RecipeFormErrors {
  const errors: RecipeFormErrors = { rows: {} };

  const name = values.name.trim();
  if (!name) errors.name = 'Podaj nazwę przepisu.';
  else if (name.length > 200) errors.name = 'Nazwa może mieć najwyżej 200 znaków.';

  if (values.description.trim().length > 5000) errors.description = 'Opis może mieć najwyżej 5000 znaków.';
  if (Number.isNaN(parsePortions(values.portions))) errors.portions = 'Podaj liczbę porcji: liczbę całkowitą, co najmniej 1.';
  if (Number.isNaN(parseSellPrice(values.sellPrice))) errors.sellPrice = 'Podaj cenę, np. 45 lub 45,50 — albo zostaw puste.';

  for (const row of values.ingredients) {
    const rowErrors = { product: row.productId === null, quantity: !(parseDecimal(row.quantity) > 0) };
    if (rowErrors.product || rowErrors.quantity) errors.rows[row.key] = rowErrors;
  }
  // A recipe without ingredients has no cost to calculate.
  if (values.ingredients.length === 0) errors.ingredients = 'Dodaj co najmniej jeden składnik.';
  else if (Object.keys(errors.rows).length > 0) errors.ingredients = 'Wybierz składnik i podaj ilość większą od zera w zaznaczonych wierszach.';
  else if (values.ingredients.length > MAX_INGREDIENTS) errors.ingredients = `Przepis może mieć najwyżej ${MAX_INGREDIENTS} składników.`;

  const steps = values.steps.filter((step) => step.text.trim());
  if (steps.length > MAX_STEPS) errors.steps = `Przepis może mieć najwyżej ${MAX_STEPS} kroków.`;
  else if (steps.some((step) => step.text.trim().length > 5000)) errors.steps = 'Krok może mieć najwyżej 5000 znaków.';

  return errors;
}

export function hasErrors(errors: RecipeFormErrors): boolean {
  return Object.keys(errors).some((key) => key !== 'rows') || Object.keys(errors.rows).length > 0;
}

/**
 * Body for POST and PUT /recipes. Call only when the form is valid. Empty steps are dropped and the
 * name is saved with a capital first letter ("tarta" -> "Tarta").
 */
export function toRecipeInput(values: RecipeFormValues): RecipeInput {
  return {
    name: capitalizeFirst(values.name.trim()),
    description: values.description.trim() || null,
    portions: parsePortions(values.portions),
    sellPrice: parseSellPrice(values.sellPrice),
    ingredients: values.ingredients.map((row) => ({
      productId: row.productId as number,
      quantity: parseDecimal(row.quantity),
      unit: row.unit,
    })),
    steps: values.steps.map((step) => step.text.trim()).filter(Boolean),
  };
}

/** Cost of one editor row, or null while it is incomplete. */
export function rowCost(row: IngredientRow, productsById: Map<number, Product>): number | null {
  const product = row.productId === null ? undefined : productsById.get(row.productId);
  const quantity = parseDecimal(row.quantity);
  if (!product || !(quantity > 0) || !areCompatible(row.unit, product.packageUnit)) return null;
  return ingredientCost(product, quantity, row.unit);
}

export function previewFoodCost(values: RecipeFormValues, productsById: Map<number, Product>): number {
  return values.ingredients.reduce((sum, row) => sum + (rowCost(row, productsById) ?? 0), 0);
}
