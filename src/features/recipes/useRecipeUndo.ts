import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { ApiRequestError, errorMessage } from '../../api/client';
import { restoreRecipe } from '../../api/recipes';
import type { DroppedIngredient } from '../../api/types';
import { useToast } from '../../components/Toast';
import { formatQuantity } from '../../lib/format';
import { unitLabel } from '../../lib/units';

const DROP_REASONS: Record<DroppedIngredient['reason'], string> = {
  product_deleted: 'składnik usunięty',
  unit_incompatible: 'zmieniona jednostka',
};

/** "250 g Masło 82% (składnik usunięty)" */
export function describeDropped(line: DroppedIngredient): string {
  return `${formatQuantity(line.quantity)} ${unitLabel(line.unit)} ${line.productName} (${DROP_REASONS[line.reason]})`;
}

/**
 * Undo for a deleted recipe: restores it (same id), says so, and lists ingredients that couldn't
 * come back. Works after the page that deleted the recipe is gone (e.g. from a toast).
 */
export function useRecipeUndo() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [restoringId, setRestoringId] = useState<number | null>(null);

  const undo = useCallback(
    async (id: number, name: string, { openAfter = false } = {}) => {
      setRestoringId(id);
      try {
        const { recipe, droppedIngredients } = await restoreRecipe(queryClient, id);
        if (droppedIngredients.length === 0) {
          toast(`Przywrócono przepis „${recipe.name}”.`);
        } else {
          toast(
            `Przywrócono przepis „${recipe.name}”, ale bez: ${droppedIngredients.map(describeDropped).join(', ')}.`,
            'success',
            { duration: 12000 },
          );
        }
        if (openAfter) {
          // The router module is loaded lazily: it imports the pages that use this hook.
          const { router } = await import('../../router');
          router.navigate(`/recipes/${id}`);
        }
      } catch (error) {
        const message =
          error instanceof ApiRequestError && error.code === 'RECIPE_NOT_DELETED'
            ? `Przepis „${name}” nie jest usunięty.`
            : error instanceof ApiRequestError && error.code === 'NOT_FOUND'
              ? `Przepisu „${name}” nie da się przywrócić.`
              : errorMessage(error);
        toast(message, 'error');
      } finally {
        setRestoringId(null);
      }
    },
    [queryClient, toast],
  );

  return { undo, restoringId };
}
