import { describe, expect, it } from 'vitest';
import { describeDropped } from './useRecipeUndo';

describe('restoring a recipe', () => {
  it('explains why an ingredient could not come back', () => {
    expect(describeDropped({ productId: 1, productName: 'Masło 82%', quantity: 250, unit: 'g', reason: 'product_deleted' })).toBe(
      '250 g Masło 82% (składnik usunięty)',
    );
    expect(describeDropped({ productId: 2, productName: 'Jajka L', quantity: 2, unit: 'piece', reason: 'unit_incompatible' })).toBe(
      '2 szt Jajka L (zmieniona jednostka)',
    );
    expect(describeDropped({ recipeId: 5, recipeName: 'Krem chantilly', quantity: 2, unit: 'portion', reason: 'recipe_deleted' })).toBe(
      '2 porcje Krem chantilly (przepis usunięty)',
    );
  });
});
