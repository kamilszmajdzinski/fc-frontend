import { useMutation, useQueries, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { sortByName } from '../lib/search';
import { changeKeys } from './changes';
import { request } from './client';
import type {
  ListResponse,
  Recipe,
  RecipeCostChange,
  RecipeInput,
  RecipePatch,
  RecipeSummary,
  RestoreRecipeResult,
} from './types';

// Everything under ['recipes'], so a product change can refresh recipes and their history in one go.
export const recipeKeys = {
  all: ['recipes'] as const,
  list: ['recipes', 'list'] as const,
  detail: (id: number) => ['recipes', 'detail', id] as const,
  costHistories: ['recipes', 'cost-history'] as const,
  costHistory: (id: number) => ['recipes', 'cost-history', id] as const,
};

// History stays in the API's order: newest first.
const selectCostChanges = (data: ListResponse<RecipeCostChange>) => data.items;

export function useRecipeCostHistory(id: number) {
  return useQuery({
    queryKey: recipeKeys.costHistory(id),
    queryFn: () => request<ListResponse<RecipeCostChange>>('GET', `/recipes/${id}/cost-history`),
    select: selectCostChanges,
  });
}

const selectRecipes = (data: ListResponse<RecipeSummary>) => sortByName(data.items);

export function useRecipes() {
  return useQuery({
    queryKey: recipeKeys.list,
    queryFn: () => request<ListResponse<RecipeSummary>>('GET', '/recipes'),
    select: selectRecipes,
  });
}

export function useRecipe(id: number | undefined) {
  return useQuery({
    queryKey: recipeKeys.detail(id ?? 0),
    queryFn: () => request<Recipe>('GET', `/recipes/${id}`),
    enabled: id !== undefined,
  });
}

/** Full details of several recipes, e.g. the ones that use a product. Shares the cache with useRecipe. */
export function useRecipesById(ids: number[]) {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: recipeKeys.detail(id),
      queryFn: () => request<Recipe>('GET', `/recipes/${id}`),
    })),
    combine: (results) => ({
      data: results.flatMap((result) => (result.data ? [result.data] : [])),
      isPending: results.some((result) => result.isPending),
      isError: results.some((result) => result.isError),
    }),
  });
}

function useOnRecipeSaved() {
  const queryClient = useQueryClient();
  return (recipe: Recipe) => {
    queryClient.setQueryData(recipeKeys.detail(recipe.id), recipe);
    queryClient.invalidateQueries({ queryKey: recipeKeys.list });
    queryClient.invalidateQueries({ queryKey: recipeKeys.costHistory(recipe.id) });
    queryClient.invalidateQueries({ queryKey: ['product-usage'] });
    queryClient.invalidateQueries({ queryKey: changeKeys.all });
  };
}

export function useCreateRecipe() {
  const onSaved = useOnRecipeSaved();
  return useMutation({
    mutationFn: (input: RecipeInput) => request<Recipe>('POST', '/recipes', input),
    onSuccess: onSaved,
  });
}

// PUT replaces the whole recipe, which is what the editor form holds.
export function useReplaceRecipe() {
  const onSaved = useOnRecipeSaved();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: RecipeInput }) => request<Recipe>('PUT', `/recipes/${id}`, input),
    onSuccess: onSaved,
  });
}

/** Changes only some fields, e.g. the selling price from the calculator. */
export function usePatchRecipe() {
  const onSaved = useOnRecipeSaved();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: RecipePatch }) => request<Recipe>('PATCH', `/recipes/${id}`, patch),
    onSuccess: onSaved,
  });
}

/**
 * Brings back a deleted recipe (same id, ingredients, steps, cost history) and refreshes everything
 * that shows it. A plain function, not only a hook: the "Cofnij" button in a toast outlives the
 * page that deleted the recipe.
 */
export async function restoreRecipe(queryClient: QueryClient, id: number): Promise<RestoreRecipeResult> {
  const result = await request<RestoreRecipeResult>('POST', `/recipes/${id}/restore`);
  queryClient.setQueryData(recipeKeys.detail(id), result.recipe);
  queryClient.invalidateQueries({ queryKey: recipeKeys.list });
  queryClient.invalidateQueries({ queryKey: recipeKeys.costHistory(id) });
  queryClient.invalidateQueries({ queryKey: ['product-usage'] });
  queryClient.invalidateQueries({ queryKey: changeKeys.all });
  return result;
}

export function useRestoreRecipe() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: (id: number) => restoreRecipe(queryClient, id) });
}

export function useDeleteRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => request<void>('DELETE', `/recipes/${id}`),
    onSuccess: (_, id) => {
      // Not removed: the detail page is still mounted and would refetch the deleted recipe.
      queryClient.invalidateQueries({ queryKey: recipeKeys.detail(id), refetchType: 'none' });
      queryClient.invalidateQueries({ queryKey: recipeKeys.costHistory(id), refetchType: 'none' });
      queryClient.invalidateQueries({ queryKey: recipeKeys.list });
      queryClient.invalidateQueries({ queryKey: ['product-usage'] });
      queryClient.invalidateQueries({ queryKey: changeKeys.all });
    },
  });
}
