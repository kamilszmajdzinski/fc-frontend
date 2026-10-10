import { describe, expect, it } from 'vitest';
import type { Product, Recipe } from '../api/types';
import {
  derivePrices,
  hasPriceChange,
  hasProductChanges,
  initialProductForm,
  newlyUnprofitable,
  priceImpact,
  toProductInput,
  toProductPatch,
  validateProductForm,
  type ProductFormValues,
} from './products/productFormModel';
import {
  emptyIngredientRow,
  hasErrors,
  initialRecipeForm,
  previewFoodCost,
  toRecipeInput,
  validateRecipeForm,
  withProduct,
} from './recipes/recipeFormModel';

const butter: Product = {
  id: 1,
  name: 'Butter 82%',
  description: 'Unsalted butter',
  manufacturer: 'Dairy Co.',
  packageSize: 200,
  packageUnit: 'g',
  pricePerPackage: 8,
  pricePerUnit: 40,
  pricingUnit: 'kg',
  inventoryQuantity: 1000,
  createdAt: '2026-10-08T09:09:27.000Z',
  updatedAt: '2026-10-08T09:09:27.000Z',
};

const cream: Product = { ...butter, id: 2, name: 'Cream 36%', packageSize: 500, packageUnit: 'ml', pricePerPackage: 9, pricePerUnit: 18, pricingUnit: 'l' };

function edit(product: Product, change: Partial<ProductFormValues>): ProductFormValues {
  return { ...initialProductForm(product), ...change };
}

describe('product form', () => {
  it('derives the price the user did not type', () => {
    const form = { ...initialProductForm(), packageSize: '200', pricePerPackage: '8' };
    expect(derivePrices(form)).toEqual({ pricePerPackage: 8, pricePerUnit: 40 });

    const perKg = { ...form, priceSource: 'unit' as const, pricePerUnit: '40' };
    expect(derivePrices(perKg)?.pricePerPackage).toBeCloseTo(8);
  });

  it('reports missing fields in Polish', () => {
    const errors = validateProductForm(initialProductForm());
    expect(Object.keys(errors).sort()).toEqual(['name', 'packageSize', 'price']);
    expect(errors.price).toContain('za kg');
  });

  it('sends only the price that was typed when creating', () => {
    const input = toProductInput({
      ...initialProductForm(),
      name: '  Flour ',
      packageSize: '1',
      packageUnit: 'kg',
      priceSource: 'unit',
      pricePerUnit: '3,5',
      pricePerPackage: '99',
    });
    expect(input).toEqual({
      name: 'Flour',
      manufacturer: null,
      description: null,
      packageSize: 1,
      packageUnit: 'kg',
      pricePerUnit: 3.5,
    });
  });

  it('patches nothing when nothing changed', () => {
    expect(toProductPatch(initialProductForm(butter), butter)).toEqual({});
  });

  it('patches only changed fields', () => {
    expect(toProductPatch(edit(butter, { name: 'Butter', manufacturer: '' }), butter)).toEqual({
      name: 'Butter',
      manufacturer: null,
    });
    expect(toProductPatch(edit(butter, { pricePerPackage: '10' }), butter)).toEqual({ pricePerPackage: 10 });
  });

  it('keeps the package price when only the package size changes', () => {
    expect(toProductPatch(edit(butter, { packageSize: '250' }), butter)).toEqual({ packageSize: 250 });
  });

  it('keeps a typed per-unit price when the package changes', () => {
    const values = edit(butter, { packageSize: '250', priceSource: 'unit', pricePerUnit: '40' });
    expect(toProductPatch(values, butter)).toEqual({ packageSize: 250, pricePerUnit: 40 });
  });
});

describe('product changes and their effect on recipes', () => {
  // Tart base: 250 g butter (8 / 200 g -> 0.04 per g = 10) plus 5 of something else.
  const tart: Recipe = {
    id: 7,
    name: 'Tart base',
    description: null,
    portions: 10,
    foodCost: 15,
    costPerPortion: 1.5,
    sellPrice: null,
    ingredients: [
      { id: 1, productId: 1, productName: 'Butter 82%', quantity: 250, unit: 'g', unitPrice: 0.04, cost: 10 },
      { id: 2, productId: 99, productName: 'Flour', quantity: 1, unit: 'kg', unitPrice: 5, cost: 5 },
    ],
    steps: [],
    createdAt: butter.createdAt,
    updatedAt: butter.updatedAt,
  };
  const pieces: Recipe = {
    ...tart,
    id: 8,
    name: 'Butter curls',
    ingredients: [{ id: 3, productId: 1, productName: 'Butter 82%', quantity: 0.1, unit: 'kg', unitPrice: 40, cost: 4 }],
    foodCost: 4,
  };

  it('has nothing to save for an untouched form', () => {
    expect(hasProductChanges(initialProductForm(butter), butter)).toBe(false);
    expect(hasProductChanges(edit(butter, { name: 'Masło' }), butter)).toBe(true);
    // Retyping the same price is not a change.
    expect(hasProductChanges(edit(butter, { pricePerPackage: '8,00' }), butter)).toBe(false);
    // An invalid form differs from the saved product, so saving shows the errors.
    expect(hasProductChanges(edit(butter, { name: '' }), butter)).toBe(true);
  });

  it('only counts price, package size and unit as price changes', () => {
    expect(hasPriceChange(edit(butter, { name: 'Masło', description: '' }), butter)).toBe(false);
    expect(hasPriceChange(edit(butter, { pricePerPackage: '10' }), butter)).toBe(true);
    expect(hasPriceChange(edit(butter, { packageSize: '250' }), butter)).toBe(true);
  });

  it('previews new food costs before saving', () => {
    const impact = priceImpact(edit(butter, { pricePerPackage: '10' }), butter, [tart, pieces]);
    expect(impact.conflicts).toEqual([]);
    expect(impact.changes.map((c) => [c.name, c.previousFoodCost, Number(c.foodCost.toFixed(2))])).toEqual([
      ['Tart base', 15, 17.5], // butter line 10 -> 12.5
      ['Butter curls', 4, 5], // 0.1 kg at 50/kg
    ]);
  });

  it('rounds previewed costs to the cent so old → new and the difference add up', () => {
    // 50 g of sugar, 4.5 -> 6 per kg: +0.075 on 18.23.
    const sugar: Product = { ...butter, id: 3, packageSize: 1, packageUnit: 'kg', pricePerPackage: 4.5, pricePerUnit: 4.5 };
    const chantilly: Recipe = {
      ...tart,
      foodCost: 18.23,
      ingredients: [{ id: 9, productId: 3, productName: 'Sugar', quantity: 50, unit: 'g', unitPrice: 0.0045, cost: 0.23 }],
    };
    const [change] = priceImpact(edit(sugar, { pricePerPackage: '6' }), sugar, [chantilly]).changes;
    expect(change.foodCost).toBe(Math.round(change.foodCost * 100) / 100);
    expect([18.3, 18.31]).toContain(change.foodCost);
  });

  it('ignores changes that leave the cost the same', () => {
    // 200 g -> 0,2 kg at the same price is the same butter.
    const sameButter = edit(butter, { packageSize: '0,2', packageUnit: 'kg' });
    expect(hasPriceChange(sameButter, butter)).toBe(true);
    expect(priceImpact(sameButter, butter, [tart, pieces]).changes).toEqual([]);
    expect(priceImpact(edit(butter, { name: 'Masło' }), butter, [tart]).changes).toEqual([]);
  });

  it('reports recipes that block a change of unit kind', () => {
    const impact = priceImpact(edit(butter, { packageUnit: 'piece', packageSize: '1' }), butter, [tart, pieces]);
    expect(impact.conflicts).toEqual([
      { id: 7, name: 'Tart base' },
      { id: 8, name: 'Butter curls' },
    ]);
    expect(impact.changes).toEqual([]);
  });
});

describe('recipe form', () => {
  const products = new Map([butter, cream].map((p) => [p.id, p]));

  it('starts a new recipe with one portion, no price and no rows', () => {
    expect(initialRecipeForm()).toEqual({ name: '', description: '', portions: '1', sellPrice: '', ingredients: [], steps: [] });
  });

  it('flags incomplete ingredient rows', () => {
    const row = emptyIngredientRow();
    const errors = validateRecipeForm({ ...initialRecipeForm(), name: 'Tart', ingredients: [row] });
    expect(errors.rows[row.key]).toEqual({ product: true, quantity: true });
    expect(hasErrors(errors)).toBe(true);
  });

  it('saves the name with a capital first letter', () => {
    const values = {
      ...initialRecipeForm(),
      name: '  łatwa tarta cytrynowa ',
      ingredients: [{ ...emptyIngredientRow(butter), quantity: '100' }],
    };
    expect(toRecipeInput(values).name).toBe('Łatwa tarta cytrynowa');
  });

  it('needs at least one ingredient', () => {
    const errors = validateRecipeForm({ ...initialRecipeForm(), name: 'Tart' });
    expect(errors.ingredients).toBe('Dodaj co najmniej jeden składnik.');
    expect(hasErrors(errors)).toBe(true);
    const withButter = { ...initialRecipeForm(), name: 'Tart', ingredients: [{ ...emptyIngredientRow(butter), quantity: '100' }] };
    expect(hasErrors(validateRecipeForm(withButter))).toBe(false);
  });

  it('rejects fractional portions', () => {
    expect(validateRecipeForm({ ...initialRecipeForm(), name: 'Tart', portions: '2,5' }).portions).toBeDefined();
  });

  it('keeps a compatible unit and resets an incompatible one when the product changes', () => {
    const row = { ...emptyIngredientRow(butter), unit: 'kg' as const };
    expect(withProduct(row, { ...butter, id: 3 }).unit).toBe('kg');
    expect(withProduct(row, cream).unit).toBe('ml');
  });

  it('previews the food cost from product prices', () => {
    const values = {
      ...initialRecipeForm(),
      name: 'Ganache',
      ingredients: [
        { ...emptyIngredientRow(butter), quantity: '100' }, // 100 g of 8/200 g -> 4
        { ...emptyIngredientRow(cream), quantity: '0,25', unit: 'l' as const }, // 250 ml of 9/500 ml -> 4.5
        emptyIngredientRow(), // incomplete, ignored
      ],
    };
    expect(previewFoodCost(values, products)).toBeCloseTo(8.5);
  });

  it('builds the API body and drops empty steps', () => {
    const recipe: Recipe = {
      id: 3,
      name: 'Chantilly',
      description: null,
      portions: 8,
      foodCost: 9,
      costPerPortion: 1.13,
      sellPrice: 30,
      ingredients: [{ id: 50, productId: 2, productName: 'Cream 36%', quantity: 0.5, unit: 'l', unitPrice: 18, cost: 9 }],
      steps: ['Whip.'],
      createdAt: butter.createdAt,
      updatedAt: butter.updatedAt,
    };
    const values = initialRecipeForm(recipe);
    expect(values.sellPrice).toBe('30');
    values.steps.push({ key: 'x', text: '   ' });
    expect(hasErrors(validateRecipeForm(values))).toBe(false);
    expect(toRecipeInput(values)).toEqual({
      name: 'Chantilly',
      description: null,
      portions: 8,
      sellPrice: 30,
      ingredients: [{ productId: 2, quantity: 0.5, unit: 'l' }],
      steps: ['Whip.'],
    });
  });

  it('treats an empty selling price as "not set" and rejects nonsense', () => {
    const base = { ...initialRecipeForm(), name: 'Tart', ingredients: [{ ...emptyIngredientRow(butter), quantity: '100' }] };
    expect(toRecipeInput({ ...base, sellPrice: '' }).sellPrice).toBeNull();
    expect(toRecipeInput({ ...base, sellPrice: '45,50' }).sellPrice).toBe(45.5);
    expect(validateRecipeForm({ ...base, sellPrice: 'abc' }).sellPrice).toBeDefined();
    expect(validateRecipeForm({ ...base, sellPrice: '-5' }).sellPrice).toBeDefined();
  });
});

describe('profitability after an ingredient price change', () => {
  const change = (previousFoodCost: number, foodCost: number, sellPrice: number | null) => ({
    id: 1,
    name: 'Tart',
    portions: 10,
    previousFoodCost,
    foodCost,
    sellPrice,
  });

  it('flags recipes that cross the 30% target', () => {
    // 13,75 of 50 = 27.5% -> 16,25 of 50 = 32.5%
    expect(newlyUnprofitable([change(13.75, 16.25, 50)])).toHaveLength(1);
    // already above target before: not "newly"
    expect(newlyUnprofitable([change(18, 20, 50)])).toHaveLength(0);
    // stays within target, or has no price
    expect(newlyUnprofitable([change(10, 12, 50), change(13.75, 16.25, null)])).toHaveLength(0);
  });
});
