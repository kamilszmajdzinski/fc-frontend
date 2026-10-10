// Locale and currency for everything the user sees. The API has no currency, the app decides.
const LOCALE = 'pl-PL';
const CURRENCY = 'PLN';

const money = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: CURRENCY });
const quantity = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 3 });
const percent = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const wholePercent = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });
const time = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' });

export function formatMoney(value: number): string {
  return money.format(value || 0);
}

/** Prices of 1 g or 1 ml are tiny, so they get more decimals. */
export function formatUnitPrice(value: number): string {
  const digits = value > 0 && value < 0.01 ? 4 : value > 0 && value < 0.1 ? 3 : 2;
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: CURRENCY,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value || 0);
}

export function formatQuantity(value: number): string {
  return quantity.format(value || 0);
}

export function formatPercent(value: number): string {
  return `${percent.format(value)}%`;
}

/**
 * A rounded percentage for shares and changes: "15%". Below 1% it keeps one decimal ("0,4%"),
 * and below 0,1% it says so ("<0,1%"), so a small value never reads as 0%.
 */
export function formatShortPercent(value: number): string {
  const size = Math.abs(value);
  if (size === 0) return '0%';
  if (size < 0.05) return `<${percent.format(0.1)}%`;
  return size < 0.95 ? `${percent.format(size)}%` : `${wholePercent.format(size)}%`;
}

/** "+7%" / "−3%" for a change. */
export function formatSignedPercent(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${formatShortPercent(value)}`;
}

/** "8 października 2026" in the user's time zone. */
export function formatDay(iso: string): string {
  return date.format(new Date(iso));
}

/** "11:09" in the user's time zone. */
export function formatTime(iso: string): string {
  return time.format(new Date(iso));
}

/** "8 października 2026, 11:09" in the user's time zone. */
export function formatDateTime(iso: string): string {
  const value = new Date(iso);
  return `${date.format(value)}, ${time.format(value)}`;
}

/** Parses what the user typed. Accepts both "3,49" and "3.49". Empty or invalid input gives NaN. */
export function parseDecimal(text: string): number {
  const normalized = text.trim().replace(/\s/g, '').replace(',', '.');
  if (normalized === '' || !/^[-+]?(\d+\.?\d*|\.\d+)$/.test(normalized)) return Number.NaN;
  return Number(normalized);
}

/** A number for an input field: "3,49", no grouping, no trailing zeros. */
export function toInputValue(value: number, maxDigits = 2): string {
  if (!Number.isFinite(value)) return '';
  return String(Number(value.toFixed(maxDigits))).replace('.', ',');
}

/**
 * One step of a − / + control for counts (portions, pieces): by one, never below 1.
 * An empty field starts at 1.
 */
export function stepCount(text: string, delta: 1 | -1): string {
  const value = parseDecimal(text);
  if (!(value > 0)) return delta > 0 ? '1' : text;
  return toInputValue(Math.max(1, value + delta), 3);
}

/** "tarta cytrynowa" -> "Tarta cytrynowa". Only the first character changes; Polish letters work too (ł -> Ł). */
export function capitalizeFirst(text: string): string {
  return text.charAt(0).toLocaleUpperCase(LOCALE) + text.slice(1);
}

/** Polish plural forms: 1 porcja, 2 porcje, 5 porcji, 22 porcje. */
export function plural(count: number, one: string, few: string, many: string): string {
  if (count === 1) return one;
  const lastDigit = count % 10;
  const lastTwo = count % 100;
  if (Number.isInteger(count) && lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)) return few;
  return many;
}

export function portionsLabel(count: number): string {
  return `${count} ${plural(count, 'porcja', 'porcje', 'porcji')}`;
}

export function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
