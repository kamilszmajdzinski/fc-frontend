// Splits a recipe's food cost into coloured shares for the "Rozkład kosztów" bar.

/** Number of chart colours in the theme (--c-series-1 … --c-series-8). */
export const SERIES_SLOTS = 8;

export type SeriesSlot = number | 'other';

export interface CostShare {
  /** Index of the first ingredient line in this share; "other" for the folded tail. */
  key: string;
  label: string;
  cost: number;
  /** Percent of the total, 0–100. */
  share: number;
  slot: SeriesSlot;
}

export interface CostShares {
  /** Colour of each ingredient line, in recipe order (for the swatches in the table). */
  lineSlots: SeriesSlot[];
  /** The bar's segments, in recipe order, with the folded tail last. Zero-cost lines are left out. */
  segments: CostShare[];
}

/**
 * Up to 8 ingredients each get their own colour, in recipe order. With more, the 7 most expensive
 * keep a colour (still in recipe order) and the rest fold into "Pozostałe": a 9th colour would be
 * impossible to tell apart.
 */
export function costShares(
  lines: { name: string; cost: number }[],
  /** The recipe's food cost. Defaults to the sum of the lines (rounded line costs can differ by a cent). */
  total = lines.reduce((sum, line) => sum + line.cost, 0),
): CostShares {
  const share = (cost: number) => (total > 0 ? (cost / total) * 100 : 0);

  let colored: Set<number>;
  if (lines.length <= SERIES_SLOTS) {
    colored = new Set(lines.map((_, index) => index));
  } else {
    const byCost = lines.map((line, index) => ({ index, cost: line.cost })).sort((a, b) => b.cost - a.cost || a.index - b.index);
    colored = new Set(byCost.slice(0, SERIES_SLOTS - 1).map((entry) => entry.index));
  }

  let nextSlot = 1;
  const lineSlots: SeriesSlot[] = lines.map((_, index) => (colored.has(index) ? nextSlot++ : 'other'));

  const segments: CostShare[] = [];
  lines.forEach((line, index) => {
    const slot = lineSlots[index];
    if (slot !== 'other' && line.cost > 0) {
      segments.push({ key: String(index), label: line.name, cost: line.cost, share: share(line.cost), slot });
    }
  });
  const folded = lines.filter((_, index) => lineSlots[index] === 'other');
  const foldedCost = folded.reduce((sum, line) => sum + line.cost, 0);
  if (foldedCost > 0) {
    segments.push({ key: 'other', label: `Pozostałe (${folded.length})`, cost: foldedCost, share: share(foldedCost), slot: 'other' });
  }
  return { lineSlots, segments };
}

export function seriesColor(slot: SeriesSlot): string {
  return slot === 'other' ? 'var(--c-series-other)' : `var(--c-series-${slot})`;
}
