import { useState, type ReactNode } from 'react';
import { useEntityChanges } from '../../api/changes';
import type { EntityType } from '../../api/types';
import { Segmented } from '../../components/Segmented';
import { Card, PillButton } from '../../components/ui';
import { ChangeLogTimeline } from './ChangeLog';
import styles from './History.module.css';

/** Every change to one product or recipe (the change log), newest first. */
export function EntityChangeLog({ type, id, initialCount }: { type: EntityType; id: number; initialCount?: number }) {
  const changes = useEntityChanges(type, id);
  if (changes.isPending) return <div className={styles.muted}>Wczytywanie…</div>;
  if (changes.isError) {
    return (
      <div className={styles.muted}>
        Nie udało się wczytać historii. <PillButton onClick={() => changes.refetch()}>Spróbuj ponownie</PillButton>
      </div>
    );
  }
  if (changes.data.length === 0) {
    // The log starts when the backend began recording it, so older items can have no entries.
    return <div className={styles.muted}>Brak zapisanych zmian.</div>;
  }
  return <ChangeLogTimeline entries={changes.data} initialCount={initialCount} />;
}

interface HistoryCardProps {
  type: EntityType;
  id: number;
  /** The second tab: the price (ingredient) or cost (recipe) timeline. */
  numbers: { label: string; content: ReactNode };
  className?: string;
}

/** "Historia" with two tabs: every change, or just how the price/cost moved. */
export function HistoryCard({ type, id, numbers, className }: HistoryCardProps) {
  const [tab, setTab] = useState<'all' | 'numbers'>('all');
  return (
    <Card
      title="Historia"
      className={className}
      actions={
        <Segmented
          small
          aria-label="Rodzaj historii"
          value={tab}
          onChange={setTab}
          options={[
            { id: 'all', label: 'Wszystkie zmiany' },
            { id: 'numbers', label: numbers.label },
          ]}
        />
      }
    >
      {tab === 'all' ? <EntityChangeLog type={type} id={id} /> : numbers.content}
    </Card>
  );
}
