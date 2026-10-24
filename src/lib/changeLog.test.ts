import { describe, expect, it } from 'vitest';
import type { ChangeLogEntry, IngredientSnapshot } from '../api/types';
import {
  collapseTriggered,
  dayLabel,
  describeSteps,
  diffIngredients,
  entrySummary,
  entryTitle,
  entryUnit,
  fieldLabel,
  formatAmount,
  formatFieldValue,
  groupByDay,
  snapshotName,
  undoableDeletions,
} from './changeLog';

const plain = (text: string) => text.replace(/\s/g, ' ');

function entry(partial: Partial<ChangeLogEntry>): ChangeLogEntry {
  return {
    id: 1,
    changedAt: '2026-10-09T08:12:40.000Z',
    entityType: 'product',
    entityId: 1,
    entityName: 'Masło 82%',
    action: 'updated',
    changes: [],
    triggeredBy: null,
    triggered: [],
    ...partial,
  };
}

const butterCreated = entry({
  action: 'created',
  changes: [
    { field: 'name', from: null, to: 'Masło 82%' },
    { field: 'packageSize', from: null, to: 200 },
    { field: 'packageUnit', from: null, to: 'g' },
    { field: 'pricePerPackage', from: null, to: 8 },
    { field: 'pricePerUnit', from: null, to: 40 },
  ],
});

describe('change log text', () => {
  it('formats field values with units and money', () => {
    expect(plain(formatFieldValue('pricePerUnit', 40, 'g'))).toBe('40,00 zł/kg');
    expect(plain(formatFieldValue('packageSize', 200, 'g'))).toBe('200 g');
    expect(formatFieldValue('packageUnit', 'piece')).toBe('szt');
    expect(formatFieldValue('description', null)).toBe('—');
    expect(formatFieldValue('steps', ['a', 'b'])).toBe('2 kroki');
    expect(formatFieldValue('name', 'x'.repeat(100))).toHaveLength(80);
    expect(fieldLabel('pricePerUnit', 'ml')).toBe('Cena za l');
  });

  it('names each kind of entry', () => {
    expect(entryTitle(butterCreated)).toBe('Dodano składnik');
    expect(entryTitle(entry({ changes: [{ field: 'pricePerPackage', from: 8, to: 10 }] }))).toBe('Zmiana ceny');
    expect(entryTitle(entry({ changes: [{ field: 'inventoryQuantity', from: 0, to: 500 }] }))).toBe('Zmiana stanu magazynowego');
    expect(entryTitle(entry({ changes: [{ field: 'name', from: 'A', to: 'B' }] }))).toBe('Edycja składnika');
    expect(entryTitle(entry({ entityType: 'recipe', action: 'deleted' }))).toBe('Usunięto przepis');
    expect(entryTitle(entry({ entityType: 'recipe', action: 'restored' }))).toBe('Przywrócono przepis');
    expect(entryTitle(entry({ entityType: 'recipe', triggeredBy: { ...butterCreated, id: 9 } }))).toBe('Zmiana ceny składnika');
  });

  it('summarises created and deleted items in one line', () => {
    expect(plain(entrySummary(butterCreated))).toBe('8,00 zł za 200 g (40,00 zł/kg)');
    const recipeDeleted = entry({
      entityType: 'recipe',
      action: 'deleted',
      changes: [
        { field: 'portions', from: 8, to: null },
        { field: 'ingredients', from: [{}, {}, {}], to: null },
        { field: 'foodCost', from: 18.23, to: null },
      ],
    });
    expect(plain(entrySummary(recipeDeleted))).toBe('8 porcji · 3 składniki · 18,23 zł');
  });

  it('takes the unit from the entry, or falls back to the current one', () => {
    expect(entryUnit(butterCreated)).toBe('g');
    expect(entryUnit(entry({ changes: [{ field: 'pricePerPackage', from: 8, to: 10 }] }), 'kg')).toBe('kg');
    expect(entryUnit(entry({ entityType: 'recipe' }), 'kg')).toBeUndefined();
  });

  it('diffs ingredient lists by product', () => {
    const line = (productId: number, quantity: number): IngredientSnapshot => ({ productId, productName: `P${productId}`, quantity, unit: 'g' });
    const diff = diffIngredients([line(1, 200), line(2, 300)], [line(1, 250), line(3, 50)]);
    expect(diff.added.map(snapshotName)).toEqual(['P3']);
    expect(diff.removed.map(snapshotName)).toEqual(['P2']);
    expect(diff.changed.map((c) => [c.from.quantity, c.to.quantity])).toEqual([[200, 250]]);
  });

  it('tells a sub-recipe apart from a product with the same id', () => {
    const butter: IngredientSnapshot = { productId: 5, productName: 'Masło', quantity: 50, unit: 'g' };
    const cream = (quantity: number, unit: 'portion' | 'g'): IngredientSnapshot => ({ recipeId: 5, recipeName: 'Krem', quantity, unit });
    const diff = diffIngredients([butter, cream(2, 'portion')], [butter, cream(300, 'g')]);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed.map((c) => [snapshotName(c.to), formatAmount(c.from), formatAmount(c.to)])).toEqual([['Krem', '2 porcje', '300 g']]);
    expect(formatAmount(cream(5, 'portion'))).toBe('5 porcji');
  });

  it('labels yield changes', () => {
    expect(fieldLabel('yieldQuantity')).toBe('Wydajność');
    expect(formatFieldValue('yieldQuantity', 550)).toBe('550');
    expect(formatFieldValue('yieldUnit', 'kg')).toBe('kg');
  });

  it('describes step changes', () => {
    expect(describeSteps(['a'], ['a', 'b', 'c', 'd', 'e'])).toBe('1 → 5 kroków');
    expect(describeSteps(['a'], ['b'])).toBe('zmieniona treść');
  });
});

describe('activity feed', () => {
  it('shows a cascade once, under its cause', () => {
    const cause = entry({ id: 9 });
    const effect = entry({ id: 10, entityType: 'recipe', triggeredBy: cause });
    const orphan = entry({ id: 11, entityType: 'recipe', triggeredBy: entry({ id: 3 }) });
    expect(collapseTriggered([orphan, effect, cause]).map((e) => e.id)).toEqual([11, 9]);
  });

  it('offers undo only on the latest deletion of each recipe', () => {
    const recipe = (id: number, entityId: number, action: ChangeLogEntry['action']) =>
      entry({ id, entityId, entityType: 'recipe', action });
    // Newest first: recipe 1 deleted, restored, deleted again; recipe 2 deleted then restored.
    const list = [recipe(6, 1, 'deleted'), recipe(5, 2, 'restored'), recipe(4, 1, 'restored'), recipe(3, 1, 'deleted'), recipe(2, 2, 'deleted')];
    expect([...undoableDeletions(list)]).toEqual([6]);
  });

  it('groups by local day with friendly labels', () => {
    const now = new Date(2026, 9, 9, 15, 0);
    const at = (day: number, hour: number) => new Date(2026, 9, day, hour).toISOString();
    const groups = groupByDay([{ changedAt: at(9, 14) }, { changedAt: at(9, 8) }, { changedAt: at(8, 20) }, { changedAt: at(1, 9) }], now);
    expect(groups.map((g) => [g.label, g.entries.length])).toEqual([
      ['Dziś', 2],
      ['Wczoraj', 1],
      ['1 października 2026', 1],
    ]);
    expect(dayLabel(at(9, 1), now)).toBe('Dziś');
  });
});
