const collator = new Intl.Collator('pl', { sensitivity: 'base', numeric: true });

/**
 * The API sorts by name with the database's byte order, which puts "Śmietanka" after "Z".
 * Lists are re-sorted with Polish rules.
 */
export function sortByName<T extends { name: string }>(items: T[]): T[] {
  return items.toSorted((a, b) => collator.compare(a.name, b.name));
}

// Case- and accent-insensitive, so "maka" finds "Mąka" and "slodka" finds "Słodka".
export function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/ł/g, 'l');
}

export function matchesSearch(query: string, ...fields: (string | null | undefined)[]): boolean {
  const needle = normalizeForSearch(query.trim());
  if (!needle) return true;
  return fields.some((field) => field && normalizeForSearch(field).includes(needle));
}
