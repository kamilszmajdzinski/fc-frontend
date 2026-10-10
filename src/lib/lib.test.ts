import { describe, expect, it } from 'vitest';
import { costShares } from './costShare';
import { foodCostLevel, foodCostPercent, profitability, suggestedPrice } from './foodcost';
import {
  capitalizeFirst,
  formatDateTime,
  formatMoney,
  formatShortPercent,
  formatSignedPercent,
  formatUnitPrice,
  parseDecimal,
  plural,
  stepCount,
  toInputValue,
} from './format';
import { matchesSearch, sortByName } from './search';
import { compatibleUnits, convert, defaultRecipeUnit, ingredientCost, inventoryValue, pricingUnitFor } from './units';

// Intl output uses non-breaking spaces; compare with plain ones.
const plain = (text: string) => text.replace(/\s/g, ' ');

describe('units', () => {
  it('offers only units of the same kind', () => {
    expect(compatibleUnits('g')).toEqual(['g', 'kg', 'mg']);
    expect(compatibleUnits('l')).toEqual(['ml', 'l']);
    expect(compatibleUnits('piece')).toEqual(['piece']);
  });

  it('converts within a kind', () => {
    expect(convert(0.5, 'l', 'ml')).toBe(500);
    expect(convert(250, 'g', 'kg')).toBe(0.25);
  });

  it('matches the API example for ingredient cost', () => {
    // Dark chocolate: 1 kg for 60, 200 g used -> 12 (see docs/API.md).
    const chocolate = { packageSize: 1, packageUnit: 'kg' as const, pricePerPackage: 60 };
    expect(ingredientCost(chocolate, 200, 'g')).toBeCloseTo(12);
    // Cream: 500 ml for 9, 0.5 l used -> 9.
    expect(ingredientCost({ packageSize: 500, packageUnit: 'ml', pricePerPackage: 9 }, 0.5, 'l')).toBeCloseTo(9);
  });

  it('picks the pricing and recipe units per kind', () => {
    expect(pricingUnitFor('g')).toBe('kg');
    expect(pricingUnitFor('ml')).toBe('l');
    expect(defaultRecipeUnit('kg')).toBe('g');
    expect(defaultRecipeUnit('piece')).toBe('piece');
  });

  it('values stock in package units', () => {
    expect(inventoryValue({ packageSize: 200, packageUnit: 'g', pricePerPackage: 8, inventoryQuantity: 1000 })).toBe(40);
  });
});

describe('format', () => {
  it('formats money in złoty', () => {
    expect(plain(formatMoney(3.49))).toBe('3,49 zł');
    expect(plain(formatMoney(12345.6))).toBe('12 345,60 zł');
  });

  it('gives tiny unit prices more decimals', () => {
    expect(plain(formatUnitPrice(0.00349))).toBe('0,0035 zł');
    expect(plain(formatUnitPrice(0.045))).toBe('0,045 zł');
    expect(plain(formatUnitPrice(3.5))).toBe('3,50 zł');
  });

  it('parses comma and dot decimals', () => {
    expect(parseDecimal('3,49')).toBe(3.49);
    expect(parseDecimal(' 1000 ')).toBe(1000);
    expect(parseDecimal('-100')).toBe(-100);
    expect(parseDecimal('+50')).toBe(50);
    expect(parseDecimal('')).toBeNaN();
    expect(parseDecimal('abc')).toBeNaN();
    expect(parseDecimal('1,2,3')).toBeNaN();
  });

  it('writes numbers back for inputs', () => {
    expect(toInputValue(3.5)).toBe('3,5');
    expect(toInputValue(17.454545)).toBe('17,45');
    expect(toInputValue(1000)).toBe('1000');
  });

  it('shows the date with the time', () => {
    // Built from local time, so the test passes in any time zone.
    expect(plain(formatDateTime(new Date(2026, 9, 8, 9, 5).toISOString()))).toBe('8 października 2026, 09:05');
  });

  it('rounds shares and changes to whole percent, but never shows a small value as 0%', () => {
    expect(formatShortPercent((1.6 / 10.5) * 100)).toBe('15%');
    expect(formatShortPercent(0.4)).toBe('0,4%');
    expect(formatShortPercent(0.01)).toBe('<0,1%');
    expect(formatShortPercent(0)).toBe('0%');
    expect(formatSignedPercent((0.8 / 10.5) * 100)).toBe('+8%');
    expect(formatSignedPercent(-12.4)).toBe('−12%');
  });

  it('steps counts (portions, pieces) by one, never below 1', () => {
    expect(stepCount('2', 1)).toBe('3');
    expect(stepCount('2', -1)).toBe('1');
    expect(stepCount('1', -1)).toBe('1');
    expect(stepCount('1,5', 1)).toBe('2,5');
    expect(stepCount('', 1)).toBe('1');
    expect(stepCount('', -1)).toBe('');
  });

  it('capitalises only the first letter', () => {
    expect(capitalizeFirst('tarta cytrynowa')).toBe('Tarta cytrynowa');
    expect(capitalizeFirst('ślimaki cynamonowe')).toBe('Ślimaki cynamonowe');
    expect(capitalizeFirst('Tort')).toBe('Tort');
    expect(capitalizeFirst('2 tarty')).toBe('2 tarty');
    expect(capitalizeFirst('')).toBe('');
  });

  it('uses Polish plural forms', () => {
    const portions = (n: number) => plural(n, 'porcja', 'porcje', 'porcji');
    expect([1, 2, 4, 5, 12, 14, 22, 25, 112].map(portions)).toEqual([
      'porcja',
      'porcje',
      'porcje',
      'porcji',
      'porcji',
      'porcji',
      'porcje',
      'porcji',
      'porcji',
    ]);
  });
});

describe('cost shares', () => {
  it('gives each ingredient its own colour, in recipe order', () => {
    const { lineSlots, segments } = costShares(
      [
        { name: 'Cukier', cost: 2.4 },
        { name: 'Jaja', cost: 2.4 },
        { name: 'Masło', cost: 6.5 },
      ],
      11.3,
    );
    expect(lineSlots).toEqual([1, 2, 3]);
    expect(segments.map((s) => [s.label, s.slot, Number(s.share.toFixed(1))])).toEqual([
      ['Cukier', 1, 21.2],
      ['Jaja', 2, 21.2],
      ['Masło', 3, 57.5],
    ]);
  });

  it('folds the cheapest into "Pozostałe" past 8 ingredients, keeping recipe order', () => {
    // 10 lines: the two cheapest (index 2 and 5) fold.
    const costs = [5, 4, 0.1, 3, 2, 0.2, 6, 7, 8, 9];
    const { lineSlots, segments } = costShares(costs.map((cost, i) => ({ name: `P${i}`, cost })));
    expect(lineSlots).toEqual([1, 2, 'other', 3, 'other', 'other', 4, 5, 6, 7]);
    expect(segments).toHaveLength(8);
    expect(segments.at(-1)).toMatchObject({ key: 'other', label: 'Pozostałe (3)', slot: 'other' });
    expect(segments.at(-1)!.cost).toBeCloseTo(2.3);
  });

  it('leaves zero-cost lines out of the bar but keeps their colour', () => {
    const { lineSlots, segments } = costShares([
      { name: 'Woda', cost: 0 },
      { name: 'Mąka', cost: 3 },
    ]);
    expect(lineSlots).toEqual([1, 2]);
    expect(segments.map((s) => s.label)).toEqual(['Mąka']);
  });
});

describe('food cost', () => {
  it('is cost as a share of the selling price', () => {
    expect(foodCostPercent(30, 100)).toBe(30);
    expect(foodCostPercent(30, 0)).toBeNull();
  });

  it('rates the percentage', () => {
    expect(foodCostLevel(30)).toBe('good');
    expect(foodCostLevel(35)).toBe('acceptable');
    expect(foodCostLevel(40.1)).toBe('high');
  });

  it('suggests the price for a 30% food cost, rounded up to the cent', () => {
    expect(suggestedPrice(30)).toBe(100);
    expect(suggestedPrice(13.75)).toBe(45.84); // 45.8333…
  });

  it('rates a recipe with a selling price', () => {
    expect(profitability(10, null)).toBeNull();
    expect(profitability(13.75, 50)).toMatchObject({ level: 'good', needsAttention: false, loss: false });
    expect(profitability(16.25, 45)).toMatchObject({ level: 'acceptable', needsAttention: true });
    expect(profitability(50, 45)).toMatchObject({ level: 'high', loss: true });
    expect(profitability(13.75, 50)!.profit).toBeCloseTo(36.25);
  });
});

describe('search', () => {
  it('ignores case and Polish accents', () => {
    expect(matchesSearch('maka', 'Mąka pszenna')).toBe(true);
    expect(matchesSearch('SLODKA', 'Śmietanka słodka')).toBe(true);
    expect(matchesSearch('dairy', 'Butter', 'Dairy Co.')).toBe(true);
    expect(matchesSearch('cukier', 'Mąka', null)).toBe(false);
    expect(matchesSearch('  ', 'anything')).toBe(true);
  });

  it('sorts names the Polish way', () => {
    const names = sortByName([{ name: 'Żelatyna' }, { name: 'Śmietanka' }, { name: 'masło' }, { name: 'Sernik' }]);
    expect(names.map((n) => n.name)).toEqual(['masło', 'Sernik', 'Śmietanka', 'Żelatyna']);
  });
});
