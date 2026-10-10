import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sortByName } from '../lib/search';
import { request } from './client';
import { changeKeys } from './changes';
import { recipeKeys } from './recipes';
import type {
  ListResponse,
  Product,
  ProductInput,
  ProductPatch,
  ProductPriceChange,
  ProductUpdateResult,
  RecipeRef,
} from './types';

export const productKeys = {
  list: ['products'] as const,
  usage: (id: number) => ['product-usage', id] as const,
  priceHistory: (id: number) => ['product-price-history', id] as const,
};

// Stable references, so TanStack Query only re-sorts when the data changes.
const selectProducts = (data: ListResponse<Product>) => sortByName(data.items);
const selectRecipeRefs = (data: ListResponse<RecipeRef>) => sortByName(data.items);
// History stays in the API's order: newest first.
const selectPriceChanges = (data: ListResponse<ProductPriceChange>) => data.items;

export function useProducts() {
  return useQuery({
    queryKey: productKeys.list,
    queryFn: () => request<ListResponse<Product>>('GET', '/products'),
    select: selectProducts,
  });
}

// Recipes that use the product. Shown in the product screen and checked before deleting.
export function useProductUsage(id: number | undefined) {
  return useQuery({
    queryKey: productKeys.usage(id ?? 0),
    queryFn: () => request<ListResponse<RecipeRef>>('GET', `/products/${id}/recipes`),
    select: selectRecipeRefs,
    enabled: id !== undefined,
  });
}

export function useProductPriceHistory(id: number) {
  return useQuery({
    queryKey: productKeys.priceHistory(id),
    queryFn: () => request<ListResponse<ProductPriceChange>>('GET', `/products/${id}/price-history`),
    select: selectPriceChanges,
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ProductInput) => request<Product>('POST', '/products', input),
    onSuccess: (product) => {
      // Add it straight away: the recipe editor selects the new product before the list is refetched.
      queryClient.setQueryData<ListResponse<Product>>(productKeys.list, (data) => data && { items: [...data.items, product] });
      queryClient.invalidateQueries({ queryKey: productKeys.list });
      queryClient.invalidateQueries({ queryKey: changeKeys.all });
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: ProductPatch }) =>
      request<ProductUpdateResult>('PATCH', `/products/${id}`, patch),
    onSuccess: (result) => {
      queryClient.setQueryData<ListResponse<Product>>(productKeys.list, (data) =>
        data && { items: data.items.map((p) => (p.id === result.product.id ? result.product : p)) },
      );
      queryClient.invalidateQueries({ queryKey: productKeys.list });
      queryClient.invalidateQueries({ queryKey: productKeys.priceHistory(result.product.id) });
      // Recipes show the product's name and cost, and a price change adds to their cost history.
      queryClient.invalidateQueries({ queryKey: recipeKeys.all });
      // Every save (stock changes too) is in the change log.
      queryClient.invalidateQueries({ queryKey: changeKeys.all });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => request<void>('DELETE', `/products/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productKeys.list });
      // Recipe history keeps the product's name but no longer links to it.
      queryClient.invalidateQueries({ queryKey: recipeKeys.costHistories });
      queryClient.invalidateQueries({ queryKey: changeKeys.all });
    },
  });
}
