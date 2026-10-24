// Types copied from the backend's docs/API.md. Keep them in sync with the API.

export type Unit = 'mg' | 'g' | 'kg' | 'ml' | 'l' | 'piece'; // product units
export type IngredientUnit = Unit | 'portion'; // 'portion' only for sub-recipes
export type YieldUnit = 'mg' | 'g' | 'kg' | 'ml' | 'l'; // a recipe's yield
export type PricingUnit = 'kg' | 'l' | 'piece';

export interface ListResponse<T> {
  items: T[];
}

// ---------- Products ----------

export interface Product {
  id: number;
  name: string;
  description: string | null;
  manufacturer: string | null;
  packageSize: number;
  packageUnit: Unit;
  pricePerPackage: number;
  pricePerUnit: number; // price per pricingUnit
  pricingUnit: PricingUnit;
  inventoryQuantity: number; // in packageUnit
  createdAt: string;
  updatedAt: string;
}

// Send pricePerPackage OR pricePerUnit (at least one).
export interface ProductInput {
  name: string;
  description?: string | null;
  manufacturer?: string | null;
  packageSize: number;
  packageUnit: Unit;
  pricePerPackage?: number;
  pricePerUnit?: number;
  inventoryQuantity?: number;
}

export type ProductPatch = Partial<ProductInput>;

export interface RecipeRef {
  id: number;
  name: string;
}

export interface RecalculatedRecipe {
  id: number;
  name: string;
  previousFoodCost: number;
  foodCost: number;
}

export interface ProductUpdateResult {
  product: Product;
  recalculatedRecipes: RecalculatedRecipe[];
}

// ---------- Recipes ----------

export interface RecipeSummary {
  id: number;
  name: string;
  description: string | null;
  portions: number;
  foodCost: number;
  costPerPortion: number;
  sellPrice: number | null; // selling price of the whole recipe, if set
  yieldQuantity: number | null;
  yieldUnit: YieldUnit | null;
  ingredientCount: number;
  updatedAt: string;
}

// A line is a product or another recipe (a sub-recipe).
export interface RecipeIngredient {
  id: number; // changes on every save - don't use as a stable key
  type: 'product' | 'recipe';
  productId: number | null; // set when type is 'product'
  productName: string | null;
  recipeId: number | null; // set when type is 'recipe'
  recipeName: string | null;
  name: string; // productName or recipeName
  quantity: number;
  unit: IngredientUnit;
  unitPrice: number; // price of 1 `unit`, e.g. per g, or per portion of a sub-recipe
  cost: number;
}

export interface Recipe {
  id: number;
  name: string;
  description: string | null;
  portions: number;
  foodCost: number; // sum of ingredient costs
  costPerPortion: number;
  sellPrice: number | null; // selling price of the whole recipe (same scope as foodCost), if set
  yieldQuantity: number | null; // what the whole recipe makes, e.g. 550 ...
  yieldUnit: YieldUnit | null; // ... g. Needed to use it in other recipes by weight or volume.
  ingredients: RecipeIngredient[];
  steps: string[];
  createdAt: string;
  updatedAt: string;
}

export type IngredientInput =
  | { productId: number; quantity: number; unit: Unit }
  | { product: ProductInput; quantity: number; unit: Unit }
  | { recipeId: number; quantity: number; unit: IngredientUnit };

export interface RecipeInput {
  name: string;
  description?: string | null;
  portions: number;
  sellPrice?: number | null; // default null
  yieldQuantity?: number | null; // default null; set together with yieldUnit
  yieldUnit?: YieldUnit | null;
  ingredients?: IngredientInput[];
  steps?: string[];
}

// PATCH /recipes/:id - every field optional; a list you send replaces the stored list.
export type RecipePatch = Partial<RecipeInput>;

// POST /recipes/:id/restore - recipes are soft-deleted and can be brought back with the same id.
// A product or sub-recipe line. The name is the one from when the recipe was deleted (or now, for unit_incompatible).
export type DroppedIngredient = IngredientSnapshot & {
  reason: 'product_deleted' | 'recipe_deleted' | 'unit_incompatible';
};

export interface RestoreRecipeResult {
  recipe: Recipe;
  droppedIngredients: DroppedIngredient[]; // usually empty
}

// ---------- History ----------
// Recorded by the API when products and recipes are saved. Lists are newest first: rely on that
// order, because two quick changes can share a `changedAt` (one-second precision).

export interface PriceSnapshot {
  packageSize: number;
  packageUnit: Unit;
  pricePerPackage: number;
  pricePerUnit: number;
  pricingUnit: PricingUnit;
}

// GET /products/:id/price-history - values after the change, plus `previous`.
export interface ProductPriceChange extends PriceSnapshot {
  id: number;
  changedAt: string;
  reason: 'created' | 'updated';
  previous: PriceSnapshot | null; // null when reason is 'created'
  affectedRecipes: {
    id: number;
    name: string;
    previousFoodCost: number | null;
    foodCost: number;
  }[];
}

export interface CostSnapshot {
  portions: number;
  foodCost: number;
  costPerPortion: number;
}

// GET /recipes/:id/cost-history - values after the change, plus `previous`.
export interface RecipeCostChange extends CostSnapshot {
  id: number;
  changedAt: string;
  reason: 'created' | 'recipe_updated' | 'recipe_restored' | 'product_price_changed' | 'sub_recipe_changed';
  previous: CostSnapshot | null; // null for the first entry
  subRecipe: { id: number; name: string } | null; // the sub-recipe that passed the change on, if any
  cause: {
    priceChangeId: number; // the matching entry in the product's price history
    productId: number | null; // null if the product has been deleted since
    productName: string;
    previousPricePerPackage: number | null;
    pricePerPackage: number;
    previousPricePerUnit: number | null;
    pricePerUnit: number;
    pricingUnit: PricingUnit;
  } | null; // set when reason is 'product_price_changed'
}

// ---------- Change log ----------
// Every create, update and delete of a product or recipe, newest first. Deleted items keep their log.

export type ProductField =
  | 'name'
  | 'description'
  | 'manufacturer'
  | 'packageSize'
  | 'packageUnit'
  | 'pricePerPackage'
  | 'pricePerUnit'
  | 'inventoryQuantity';
export type RecipeField =
  | 'name'
  | 'description'
  | 'portions'
  | 'sellPrice'
  | 'yieldQuantity'
  | 'yieldUnit'
  | 'ingredients'
  | 'steps'
  | 'foodCost';

// One line of a recipe's ingredient list as it was at the time of the change.
export type IngredientSnapshot =
  | { productId: number; productName: string; quantity: number; unit: Unit }
  | { recipeId: number; recipeName: string; quantity: number; unit: IngredientUnit };

export interface FieldChange {
  field: ProductField | RecipeField;
  from: unknown; // null for 'created'. Type depends on the field.
  to: unknown; // null for 'deleted'
}

export type EntityType = 'product' | 'recipe';

export interface ChangeEntry {
  id: number;
  changedAt: string;
  entityType: EntityType;
  entityId: number;
  entityName: string; // name right after the change (the last name, for 'deleted')
  action: 'created' | 'updated' | 'deleted' | 'restored'; // 'restored': recipes only
  changes: FieldChange[];
}

// GET /products/:id/changes, GET /recipes/:id/changes, GET /changes
export interface ChangeLogEntry extends ChangeEntry {
  triggeredBy: ChangeEntry | null; // the change that caused this one, e.g. a product price change
  triggered: ChangeEntry[]; // changes this one caused, e.g. recipe food cost changes
}

// GET /changes
export interface ChangeFeed {
  items: ChangeLogEntry[];
  nextBefore: number | null; // pass as ?before= for the next page; null when there is no more
}

// ---------- Errors ----------

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'PRODUCT_IN_USE'
  | 'UNIT_CONFLICT'
  | 'RECIPE_NOT_DELETED'
  | 'RECIPE_IN_USE'
  | 'INTERNAL_ERROR';

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ApiError {
  error: {
    code: ErrorCode;
    message: string;
    details?: { issues: ValidationIssue[] } | { recipes: RecipeRef[] };
  };
}
