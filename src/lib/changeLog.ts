// Turns change log entries (GET /…/changes) into Polish, human-readable text.
import type { ChangeEntry, ChangeLogEntry, FieldChange, IngredientSnapshot, Unit } from '../api/types';
import { formatDay, formatMoney, formatQuantity, plural, portionsLabel } from './format';
import { pricingUnitFor, unitLabel } from './units';

const FIELD_LABELS: Record<FieldChange['field'], string> = {
  name: 'Nazwa',
  description: 'Opis',
  manufacturer: 'Producent',
  packageSize: 'Opakowanie',
  packageUnit: 'Jednostka',
  pricePerPackage: 'Cena opakowania',
  pricePerUnit: 'Cena za jednostkę',
  inventoryQuantity: 'Stan magazynowy',
  portions: 'Porcje',
  sellPrice: 'Cena sprzedaży',
  ingredients: 'Składniki',
  steps: 'Sposób przygotowania',
  foodCost: 'Koszt składników',
};

const PRICE_FIELDS = new Set<FieldChange['field']>(['pricePerPackage', 'pricePerUnit', 'packageSize', 'packageUnit']);
const MAX_TEXT = 80;

export function fieldLabel(field: FieldChange['field'], unit?: Unit): string {
  if (field === 'pricePerUnit' && unit) return `Cena za ${unitLabel(pricingUnitFor(unit))}`;
  return FIELD_LABELS[field];
}

function truncate(text: string): string {
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1).trimEnd()}…` : text;
}

/** One side of a change ("from" or "to") as text. `unit` is the product's package unit, when known. */
export function formatFieldValue(field: FieldChange['field'], value: unknown, unit?: Unit): string {
  if (value === null || value === undefined || value === '') return '—';
  switch (field) {
    case 'name':
    case 'description':
    case 'manufacturer':
      return truncate(String(value));
    case 'packageSize':
    case 'inventoryQuantity':
      return `${formatQuantity(Number(value))}${unit ? ` ${unitLabel(unit)}` : ''}`;
    case 'packageUnit':
      return unitLabel(value as Unit);
    case 'pricePerPackage':
    case 'sellPrice':
    case 'foodCost':
      return formatMoney(Number(value));
    case 'pricePerUnit':
      return `${formatMoney(Number(value))}${unit ? `/${unitLabel(pricingUnitFor(unit))}` : ''}`;
    case 'portions':
      return String(value);
    case 'steps': {
      const count = (value as string[]).length;
      return `${count} ${plural(count, 'krok', 'kroki', 'kroków')}`;
    }
    case 'ingredients': {
      const count = (value as IngredientSnapshot[]).length;
      return `${count} ${plural(count, 'składnik', 'składniki', 'składników')}`;
    }
  }
}

function changeOf(entry: ChangeEntry, field: FieldChange['field']): FieldChange | undefined {
  return entry.changes.find((change) => change.field === field);
}

/** A field's value after the change (for 'deleted', the last value before it). */
function valueOf(entry: ChangeEntry, field: FieldChange['field']): unknown {
  const change = changeOf(entry, field);
  if (!change) return undefined;
  return entry.action === 'deleted' ? change.from : change.to;
}

/** The product's package unit from the entry itself, or the fallback (e.g. the product's current unit). */
export function entryUnit(entry: ChangeEntry, fallback?: Unit): Unit | undefined {
  if (entry.entityType !== 'product') return undefined;
  const unit = valueOf(entry, 'packageUnit');
  return (unit as Unit | undefined) ?? fallback;
}

export function isPriceChange(entry: ChangeEntry): boolean {
  return entry.entityType === 'product' && entry.changes.some((change) => PRICE_FIELDS.has(change.field));
}

/** "Zmiana ceny", "Edycja przepisu", "Usunięto składnik"… */
export function entryTitle(entry: ChangeLogEntry | ChangeEntry): string {
  const product = entry.entityType === 'product';
  if (entry.action === 'created') return product ? 'Dodano składnik' : 'Utworzono przepis';
  if (entry.action === 'deleted') return product ? 'Usunięto składnik' : 'Usunięto przepis';
  if (entry.action === 'restored') return 'Przywrócono przepis';
  if ('triggeredBy' in entry && entry.triggeredBy) return 'Zmiana ceny składnika';
  if (!product) return 'Edycja przepisu';
  if (isPriceChange(entry)) return 'Zmiana ceny';
  if (entry.changes.length === 1 && entry.changes[0].field === 'inventoryQuantity') return 'Zmiana stanu magazynowego';
  return 'Edycja składnika';
}

/**
 * One line for a created or deleted item:
 * "8,00 zł za 200 g (40,00 zł/kg)" or "10 porcji · 4 składniki · 13,75 zł".
 */
export function entrySummary(entry: ChangeEntry): string {
  if (entry.entityType === 'product') {
    const unit = entryUnit(entry);
    const price = valueOf(entry, 'pricePerPackage');
    const size = valueOf(entry, 'packageSize');
    const perUnit = valueOf(entry, 'pricePerUnit');
    const parts = [
      price !== undefined && size !== undefined
        ? `${formatMoney(Number(price))} za ${formatFieldValue('packageSize', size, unit)}`
        : null,
      perUnit !== undefined ? `(${formatFieldValue('pricePerUnit', perUnit, unit)})` : null,
    ];
    return parts.filter(Boolean).join(' ');
  }
  const portions = valueOf(entry, 'portions');
  const ingredients = valueOf(entry, 'ingredients') as IngredientSnapshot[] | undefined;
  const cost = valueOf(entry, 'foodCost');
  return [
    portions !== undefined ? portionsLabel(Number(portions)) : null,
    ingredients ? formatFieldValue('ingredients', ingredients) : null,
    cost !== undefined ? formatMoney(Number(cost)) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export interface IngredientDiff {
  added: IngredientSnapshot[];
  removed: IngredientSnapshot[];
  changed: { from: IngredientSnapshot; to: IngredientSnapshot }[];
}

/**
 * Added, removed and changed lines, matched by product (from the API docs). If a product appears
 * twice in one recipe, only one of its lines is compared; a change of order alone shows nothing.
 */
export function diffIngredients(from: IngredientSnapshot[] | null, to: IngredientSnapshot[] | null): IngredientDiff {
  const before = new Map((from ?? []).map((line) => [line.productId, line]));
  const after = new Map((to ?? []).map((line) => [line.productId, line]));
  return {
    added: [...after.values()].filter((line) => !before.has(line.productId)),
    removed: [...before.values()].filter((line) => !after.has(line.productId)),
    changed: [...after.values()]
      .filter((line) => {
        const old = before.get(line.productId);
        return old !== undefined && (old.quantity !== line.quantity || old.unit !== line.unit);
      })
      .map((line) => ({ from: before.get(line.productId)!, to: line })),
  };
}

export function formatAmount(line: Pick<IngredientSnapshot, 'quantity' | 'unit'>): string {
  return `${formatQuantity(line.quantity)} ${unitLabel(line.unit)}`;
}

/** "4 → 5 kroków", or "zmieniona treść" when only the wording changed. */
export function describeSteps(from: string[] | null, to: string[] | null): string {
  const before = from?.length ?? 0;
  const after = to?.length ?? 0;
  if (before === after) return 'zmieniona treść';
  return `${before} → ${after} ${plural(after, 'krok', 'kroki', 'kroków')}`;
}

/**
 * Hides entries caused by another entry in the same list (e.g. recipe food costs after a price change):
 * the cause already lists them, so the feed shows each cascade once.
 */
export function collapseTriggered(entries: ChangeLogEntry[]): ChangeLogEntry[] {
  const ids = new Set(entries.map((entry) => entry.id));
  return entries.filter((entry) => !(entry.triggeredBy && ids.has(entry.triggeredBy.id)));
}

/**
 * Ids of deletion entries that can be undone: for each recipe, its newest entry in the (newest-first)
 * list, if that entry is the deletion. Older deletions of a recipe that was restored and deleted again
 * don't get their own undo.
 */
export function undoableDeletions(entries: ChangeEntry[]): Set<number> {
  const seen = new Set<number>();
  const undoable = new Set<number>();
  for (const entry of entries) {
    if (entry.entityType !== 'recipe' || seen.has(entry.entityId)) continue;
    seen.add(entry.entityId);
    if (entry.action === 'deleted') undoable.add(entry.id);
  }
  return undoable;
}

function localDayKey(iso: string): string {
  const day = new Date(iso);
  return `${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`;
}

/** "Dziś", "Wczoraj", or "8 października 2026". */
export function dayLabel(iso: string, now = new Date()): string {
  const key = localDayKey(iso);
  if (key === localDayKey(now.toISOString())) return 'Dziś';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (key === localDayKey(yesterday.toISOString())) return 'Wczoraj';
  return formatDay(iso);
}

/** Splits a newest-first list into days, keeping the order. */
export function groupByDay<T extends { changedAt: string }>(entries: T[], now = new Date()) {
  const groups: { key: string; label: string; entries: T[] }[] = [];
  for (const entry of entries) {
    const key = localDayKey(entry.changedAt);
    const last = groups.at(-1);
    if (last && last.key === key) last.entries.push(entry);
    else groups.push({ key, label: dayLabel(entry.changedAt, now), entries: [entry] });
  }
  return groups;
}
