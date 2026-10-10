import { useCallback, useMemo } from 'react';
import { useProducts } from '../../api/products';
import { useRecipes } from '../../api/recipes';
import type { EntityType, Unit } from '../../api/types';

const DETAIL_PATHS: Record<EntityType, string> = { product: '/products', recipe: '/recipes' };

/** Where a change log entry should link, based on the (cached) product and recipe lists. */
export function useEntities() {
  const products = useProducts();
  const recipes = useRecipes();

  const units = useMemo(() => new Map(products.data?.map((p) => [p.id, p.packageUnit])), [products.data]);
  const recipeIds = useMemo(() => new Set(recipes.data?.map((r) => r.id)), [recipes.data]);

  /** An item that no longer exists links to its change log, which still works after deletion. */
  const link = useCallback(
    (type: EntityType, id: number) => {
      const loaded = type === 'product' ? products.data !== undefined : recipes.data !== undefined;
      const exists = type === 'product' ? units.has(id) : recipeIds.has(id);
      const deleted = loaded && !exists;
      return { to: deleted ? `/activity/${type}/${id}` : `${DETAIL_PATHS[type]}/${id}`, deleted };
    },
    [products.data, recipes.data, units, recipeIds],
  );

  /** The product's current package unit, to show "200 g" for entries that don't include it. */
  const unitOf = useCallback((id: number): Unit | undefined => units.get(id), [units]);

  return { link, unitOf };
}
