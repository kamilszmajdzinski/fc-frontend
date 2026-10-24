import type {
  IngredientInput,
  IngredientUnit,
  Product,
  Recipe,
  RecipeInput,
  RecipeSummary,
  ValidationIssue,
  YieldUnit,
} from '../../api/types';
import { capitalizeFirst, parseDecimal, toInputValue } from '../../lib/format';
import {
  areCompatible,
  defaultRecipeUnit,
  ingredientCost,
  subRecipeCost,
  subRecipeUnits,
  unitLabel,
} from '../../lib/units';

// Ingredient ids from the API change on every save, so editor rows get their own keys.
let lastKey = 0;
export function newRowKey(): string {
  lastKey += 1;
  return `row-${lastKey}`;
}

/** A line of the recipe: a product, or another recipe (a sub-recipe). Empty until something is picked. */
export interface IngredientRow {
  key: string;
  kind: 'product' | 'recipe';
  productId: number | null;
  recipeId: number | null;
  quantity: string;
  unit: IngredientUnit;
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
  /** What the whole recipe makes, e.g. 550 g. Both empty means "not set". */
  yieldQuantity: string;
  yieldUnit: YieldUnit | '';
  ingredients: IngredientRow[];
  steps: StepRow[];
}

export interface RecipeFormErrors {
  name?: string;
  description?: string;
  portions?: string;
  sellPrice?: string;
  yield?: string;
  ingredients?: string;
  steps?: string;
  /** Which parts of an ingredient row are wrong, by row key. */
  rows: Record<string, { product?: boolean; quantity?: boolean; unit?: boolean }>;
}

/** What the editor knows about the things a row can point at. */
export interface Catalog {
  products: Map<number, Product>;
  recipes: Map<number, RecipeSummary>;
}

const MAX_INGREDIENTS = 200;
const MAX_STEPS = 100;

export function initialRecipeForm(recipe?: Recipe): RecipeFormValues {
  if (!recipe) {
    return {
      name: '',
      description: '',
      portions: '1',
      sellPrice: '',
      yieldQuantity: '',
      yieldUnit: '',
      ingredients: [],
      steps: [],
    };
  }
  return {
    name: recipe.name,
    description: recipe.description ?? '',
    portions: String(recipe.portions),
    sellPrice: recipe.sellPrice === null ? '' : toInputValue(recipe.sellPrice),
    yieldQuantity: recipe.yieldQuantity === null ? '' : toInputValue(recipe.yieldQuantity, 6),
    yieldUnit: recipe.yieldUnit ?? '',
    ingredients: recipe.ingredients.map((line) => ({
      key: newRowKey(),
      kind: line.type,
      productId: line.productId,
      recipeId: line.recipeId,
      quantity: toInputValue(line.quantity, 6),
      unit: line.unit,
    })),
    steps: recipe.steps.map((text) => ({ key: newRowKey(), text })),
  };
}

export function emptyIngredientRow(product?: Product): IngredientRow {
  return {
    key: newRowKey(),
    kind: 'product',
    productId: product?.id ?? null,
    recipeId: null,
    quantity: '',
    unit: product ? defaultRecipeUnit(product.packageUnit) : 'g',
  };
}

/** "p:12" or "r:5": what the row points at, or null while nothing is picked. */
export function rowRef(row: Pick<IngredientRow, 'kind' | 'productId' | 'recipeId'>): string | null {
  if (row.kind === 'recipe') return row.recipeId === null ? null : `r:${row.recipeId}`;
  return row.productId === null ? null : `p:${row.productId}`;
}

/** Picking another product keeps the unit when it still fits, e.g. g stays g from flour to sugar. */
export function withProduct(row: IngredientRow, product: Product): IngredientRow {
  const unit = areCompatible(row.unit, product.packageUnit) ? row.unit : defaultRecipeUnit(product.packageUnit);
  return { ...row, kind: 'product', productId: product.id, recipeId: null, unit };
}

/**
 * A sub-recipe starts as 1 portion. When it replaces another pick whose unit still fits (200 g of
 * one cream -> another cream with a yield), the amount and unit are kept.
 */
export function withRecipe(row: IngredientRow, recipe: RecipeSummary): IngredientRow {
  const keep = rowRef(row) !== null && subRecipeUnits(recipe).includes(row.unit);
  return {
    ...row,
    kind: 'recipe',
    productId: null,
    recipeId: recipe.id,
    unit: keep ? row.unit : 'portion',
    quantity: keep ? row.quantity : '1',
  };
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

/** The typed yield, or null when both fields are empty. Call only when valid. */
function parseYield(values: RecipeFormValues): { yieldQuantity: number; yieldUnit: YieldUnit } | null {
  if (values.yieldQuantity.trim() === '' || values.yieldUnit === '') return null;
  return { yieldQuantity: parseDecimal(values.yieldQuantity), yieldUnit: values.yieldUnit };
}

export function validateRecipeForm(values: RecipeFormValues, catalog?: Catalog): RecipeFormErrors {
  const errors: RecipeFormErrors = { rows: {} };

  const name = values.name.trim();
  if (!name) errors.name = 'Podaj nazwę przepisu.';
  else if (name.length > 200) errors.name = 'Nazwa może mieć najwyżej 200 znaków.';

  if (values.description.trim().length > 5000) errors.description = 'Opis może mieć najwyżej 5000 znaków.';
  if (Number.isNaN(parsePortions(values.portions))) errors.portions = 'Podaj liczbę porcji: liczbę całkowitą, co najmniej 1.';
  if (Number.isNaN(parseSellPrice(values.sellPrice))) errors.sellPrice = 'Podaj cenę, np. 45 lub 45,50 — albo zostaw puste.';

  const hasYieldQuantity = values.yieldQuantity.trim() !== '';
  if (hasYieldQuantity !== (values.yieldUnit !== '')) {
    errors.yield = 'Podaj ilość i jednostkę wydajności — albo zostaw oba pola puste.';
  } else if (hasYieldQuantity && !(parseDecimal(values.yieldQuantity) > 0)) {
    errors.yield = 'Wydajność musi być większa od zera, np. 550.';
  }

  for (const row of values.ingredients) {
    const recipe = row.kind === 'recipe' && row.recipeId !== null ? catalog?.recipes.get(row.recipeId) : undefined;
    const rowErrors = {
      product: rowRef(row) === null,
      quantity: !(parseDecimal(row.quantity) > 0),
      // E.g. grams of a sub-recipe that no longer has a yield.
      unit: recipe !== undefined && !subRecipeUnits(recipe).includes(row.unit),
    };
    if (rowErrors.product || rowErrors.quantity || rowErrors.unit) errors.rows[row.key] = rowErrors;
  }
  const rowErrors = Object.values(errors.rows);
  // A recipe without ingredients has no cost to calculate.
  if (values.ingredients.length === 0) errors.ingredients = 'Dodaj co najmniej jeden składnik.';
  else if (rowErrors.some((row) => row.product || row.quantity)) {
    errors.ingredients = 'Wybierz składnik i podaj ilość większą od zera w zaznaczonych wierszach.';
  } else if (rowErrors.length > 0) {
    errors.ingredients = 'Wybierz jednostkę, w której można użyć tego przepisu.';
  } else if (values.ingredients.length > MAX_INGREDIENTS) {
    errors.ingredients = `Przepis może mieć najwyżej ${MAX_INGREDIENTS} składników.`;
  }

  const steps = values.steps.filter((step) => step.text.trim());
  if (steps.length > MAX_STEPS) errors.steps = `Przepis może mieć najwyżej ${MAX_STEPS} kroków.`;
  else if (steps.some((step) => step.text.trim().length > 5000)) errors.steps = 'Krok może mieć najwyżej 5000 znaków.';

  return errors;
}

export function hasErrors(errors: RecipeFormErrors): boolean {
  return Object.keys(errors).some((key) => key !== 'rows') || Object.keys(errors.rows).length > 0;
}

function toIngredientInput(row: IngredientRow): IngredientInput {
  const quantity = parseDecimal(row.quantity);
  if (row.kind === 'recipe') return { recipeId: row.recipeId as number, quantity, unit: row.unit };
  // Product rows never hold 'portion': their unit picker offers only product units.
  return { productId: row.productId as number, quantity, unit: row.unit as Exclude<IngredientUnit, 'portion'> };
}

/**
 * Body for POST and PUT /recipes. Call only when the form is valid. Empty steps are dropped and the
 * name is saved with a capital first letter ("tarta" -> "Tarta"). The yield is always sent, so a PUT
 * with empty yield fields removes it.
 */
export function toRecipeInput(values: RecipeFormValues): RecipeInput {
  const recipeYield = parseYield(values);
  return {
    name: capitalizeFirst(values.name.trim()),
    description: values.description.trim() || null,
    portions: parsePortions(values.portions),
    sellPrice: parseSellPrice(values.sellPrice),
    yieldQuantity: recipeYield?.yieldQuantity ?? null,
    yieldUnit: recipeYield?.yieldUnit ?? null,
    ingredients: values.ingredients.map(toIngredientInput),
    steps: values.steps.map((step) => step.text.trim()).filter(Boolean),
  };
}

/** Cost of one editor row, or null while it is incomplete. */
export function rowCost(row: IngredientRow, catalog: Catalog): number | null {
  const quantity = parseDecimal(row.quantity);
  if (!(quantity > 0)) return null;
  if (row.kind === 'recipe') {
    const recipe = row.recipeId === null ? undefined : catalog.recipes.get(row.recipeId);
    if (!recipe || !subRecipeUnits(recipe).includes(row.unit)) return null;
    return subRecipeCost(recipe, quantity, row.unit);
  }
  const product = row.productId === null ? undefined : catalog.products.get(row.productId);
  if (!product || row.unit === 'portion' || !areCompatible(row.unit, product.packageUnit)) return null;
  return ingredientCost(product, quantity, row.unit);
}

export function previewFoodCost(values: RecipeFormValues, catalog: Catalog): number {
  return values.ingredients.reduce((sum, row) => sum + (rowCost(row, catalog) ?? 0), 0);
}

// The API's messages for ingredient lines, in Polish. Anything else is shown as sent.
const ISSUE_MESSAGES: [RegExp, (match: RegExpExecArray) => string][] = [
  [/cannot use itself/, () => 'Przepis nie może być składnikiem samego siebie.'],
  [/^"(.+)" already uses this recipe/, (m) => `„${m[1]}” już zawiera ten przepis, więc nie może być jego składnikiem.`],
  [/^"(.+)" has no yield/, (m) => `„${m[1]}” nie ma wydajności — można go użyć tylko w porcjach.`],
  [
    /^"(.+)" (?:yields .+|is measured in .+), so the unit must be one of: (.+)$/,
    (m) => `Dla „${m[1]}” wybierz jedną z jednostek: ${m[2].split(', ').map((u) => unitLabel(u as IngredientUnit)).join(', ')}.`,
  ],
  [/^Recipe \d+ does not exist/, () => 'Ten przepis już nie istnieje — wybierz inny.'],
  [/^Product \d+ does not exist/, () => 'Ten składnik już nie istnieje — wybierz inny.'],
];

export function translateIssue(message: string): string {
  for (const [pattern, translate] of ISSUE_MESSAGES) {
    const match = pattern.exec(message);
    if (match) return translate(match);
  }
  return message;
}

/** Server validation messages that belong to an ingredient row (`body.ingredients[2].unit`), by row key. */
export function serverRowMessages(issues: ValidationIssue[], values: RecipeFormValues): Record<string, string> {
  const messages: Record<string, string> = {};
  for (const issue of issues) {
    const match = /^body\.ingredients\[(\d+)\]/.exec(issue.path);
    const row = match ? values.ingredients[Number(match[1])] : undefined;
    if (row && !messages[row.key]) messages[row.key] = translateIssue(issue.message);
  }
  return messages;
}
