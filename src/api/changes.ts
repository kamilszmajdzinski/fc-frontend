import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { request } from './client';
import type { ChangeFeed, ChangeLogEntry, EntityType, ListResponse } from './types';

// Everything under ['changes'], so any save can refresh the whole change log in one go.
export const changeKeys = {
  all: ['changes'] as const,
  entity: (type: EntityType, id: number) => ['changes', type, id] as const,
  feed: (type: EntityType | 'all') => ['changes', 'feed', type] as const,
};

const PATHS: Record<EntityType, string> = { product: 'products', recipe: 'recipes' };
const FEED_PAGE_SIZE = 40;

// Newest first, as the API sends it.
const selectItems = (data: ListResponse<ChangeLogEntry>) => data.items;

/** One product's or recipe's change log. Works for deleted items too. */
export function useEntityChanges(type: EntityType, id: number | undefined) {
  return useQuery({
    queryKey: changeKeys.entity(type, id ?? 0),
    queryFn: () => request<ListResponse<ChangeLogEntry>>('GET', `/${PATHS[type]}/${id}/changes`),
    select: selectItems,
    enabled: id !== undefined,
  });
}

/** Recent changes across everything, a page at a time. */
export function useChangeFeed(type: EntityType | 'all') {
  return useInfiniteQuery({
    queryKey: changeKeys.feed(type),
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(FEED_PAGE_SIZE) });
      if (type !== 'all') params.set('entityType', type);
      if (pageParam !== undefined) params.set('before', String(pageParam));
      return request<ChangeFeed>('GET', `/changes?${params}`);
    },
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });
}
