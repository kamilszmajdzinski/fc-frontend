import { useState } from 'react';
import { Link } from 'react-router';
import { ApiRequestError } from '../../api/client';
import { useChangeFeed, useEntityChanges } from '../../api/changes';
import type { EntityType } from '../../api/types';
import { EmptyState, LoadError, Loading } from '../../components/EmptyState';
import { Icon } from '../../components/Icon';
import { Segmented } from '../../components/Segmented';
import { Button, Card } from '../../components/ui';
import { collapseTriggered, groupByDay, undoableDeletions } from '../../lib/changeLog';
import { formatDateTime } from '../../lib/format';
import { useIdParam } from '../../lib/useIdParam';
import { ChangeLogTimeline, UndoDeleteButton } from './ChangeLog';
import { EntityChangeLog } from './HistoryCard';
import { useEntities } from './useEntities';
import styles from './History.module.css';

type Filter = EntityType | 'all';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Wszystko' },
  { id: 'product', label: 'Składniki' },
  { id: 'recipe', label: 'Przepisy' },
];

/** Recent changes across all ingredients and recipes, grouped by day. Also the way to find deleted items. */
export function ActivityPage() {
  const [filter, setFilter] = useState<Filter>('all');
  const feed = useChangeFeed(filter);

  const entries = feed.data?.pages.flatMap((page) => page.items) ?? [];
  // A price change already lists the recipes it recalculated; don't show those twice.
  const days = groupByDay(collapseTriggered(entries));
  // Worked out across all loaded days, so only a recipe's latest deletion offers "Cofnij".
  const undoable = undoableDeletions(entries);

  let body;
  if (feed.isPending) body = <Loading />;
  else if (feed.isError) body = <LoadError error={feed.error} onRetry={() => feed.refetch()} />;
  else if (days.length === 0) body = <EmptyState icon="info" title="Brak zmian" sub="Tu pojawi się każda zmiana składników i przepisów." />;
  else {
    body = (
      <>
        {days.map((day) => (
          <section key={day.key} className={styles.day}>
            <h2 className={styles.dayLabel}>{day.label}</h2>
            <Card className={styles.dayCard}>
              <ChangeLogTimeline feed entries={day.entries} initialCount={Number.POSITIVE_INFINITY} undoable={undoable} />
            </Card>
          </section>
        ))}
        {feed.hasNextPage && (
          <div className={styles.more}>
            <Button variant="ghost" small disabled={feed.isFetchingNextPage} onClick={() => feed.fetchNextPage()}>
              {feed.isFetchingNextPage ? 'Wczytywanie…' : 'Pokaż starsze zmiany'}
            </Button>
          </div>
        )}
      </>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <header className={styles.header}>
          <div>
            <div className={styles.eyebrow}>Historia zmian</div>
            <h1 className={styles.title}>Aktywność</h1>
          </div>
          <Segmented aria-label="Pokaż zmiany" options={FILTERS} value={filter} onChange={setFilter} />
        </header>
        {body}
      </div>
    </div>
  );
}

const TYPE_NAMES: Record<EntityType, { eyebrow: string; open: string }> = {
  product: { eyebrow: 'Historia składnika', open: 'Przejdź do składnika' },
  recipe: { eyebrow: 'Historia przepisu', open: 'Przejdź do przepisu' },
};

/** One item's full change log. Works for deleted items, which have no page of their own. */
export function EntityHistoryPage({ type }: { type: EntityType }) {
  const id = useIdParam('entityId');
  const changes = useEntityChanges(type, id);
  const { link } = useEntities();

  let content;
  if (id === undefined || (changes.error instanceof ApiRequestError && changes.error.code === 'NOT_FOUND')) {
    content = <EmptyState icon="info" title="Nie znaleziono" sub="Nie ma historii dla tego adresu." />;
  } else if (changes.isPending) content = <Loading />;
  else if (changes.isError) content = <LoadError error={changes.error} onRetry={() => changes.refetch()} />;
  else {
    const latest = changes.data[0];
    const target = link(type, id);
    content = (
      <>
        <header className={styles.header}>
          <div>
            <div className={styles.eyebrow}>{TYPE_NAMES[type].eyebrow}</div>
            <h1 className={styles.title}>
              {latest?.entityName ?? `#${id}`}
              {target.deleted && <span className={styles.deleted}>usunięty</span>}
            </h1>
            <div className={styles.sub}>
              {target.deleted ? (
                latest?.action === 'deleted' ? `Usunięty ${formatDateTime(latest.changedAt)}` : 'Już nie istnieje.'
              ) : (
                <Link to={target.to}>{TYPE_NAMES[type].open} →</Link>
              )}
            </div>
          </div>
          {type === 'recipe' && <UndoDeleteButton id={id} name={latest?.entityName ?? `#${id}`} label="Przywróć przepis" />}
        </header>
        <Card title="Wszystkie zmiany" className={styles.dayCard}>
          <EntityChangeLog type={type} id={id} initialCount={20} />
        </Card>
      </>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        {/* Always visible: this page has no list beside it. */}
        <Link to="/activity" className={styles.back}>
          <Icon name="back" size={14} />
          Aktywność
        </Link>
        {content}
      </div>
    </div>
  );
}
