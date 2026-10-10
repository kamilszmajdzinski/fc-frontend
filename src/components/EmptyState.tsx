import type { ReactNode } from 'react';
import { errorMessage } from '../api/client';
import { Icon, type IconName } from './Icon';
import { Button } from './ui';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  icon: IconName;
  title: string;
  sub?: ReactNode;
  children?: ReactNode;
  compact?: boolean;
}

export function EmptyState({ icon, title, sub, children, compact }: EmptyStateProps) {
  return (
    <div className={compact ? `${styles.empty} ${styles.compact}` : styles.empty}>
      <div className={styles.icon}>
        <Icon name={icon} size={26} />
      </div>
      <div className={styles.title}>{title}</div>
      {sub && <div className={styles.sub}>{sub}</div>}
      {children}
    </div>
  );
}

export function Loading({ label = 'Wczytywanie…' }: { label?: string }) {
  return (
    <div className={styles.loading} role="status">
      {label}
    </div>
  );
}

export function LoadError({ error, onRetry, compact }: { error: unknown; onRetry: () => void; compact?: boolean }) {
  return (
    <EmptyState icon="info" title="Nie udało się wczytać danych" sub={errorMessage(error)} compact={compact}>
      <Button variant="ghost" small onClick={onRetry}>
        Spróbuj ponownie
      </Button>
    </EmptyState>
  );
}
