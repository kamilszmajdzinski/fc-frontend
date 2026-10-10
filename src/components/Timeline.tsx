import { useState, type ReactNode } from 'react';
import { formatDateTime, formatSignedPercent } from '../lib/format';
import { cx, PillButton } from './ui';
import styles from './Timeline.module.css';

export interface TimelineEntry {
  key: string | number;
  title: ReactNode;
  /** ISO timestamp. */
  date: string;
  /** Shown instead of the full date and time, e.g. only the time under a day heading. */
  dateLabel?: string;
  /** Dot colour: accent for changes, grey for "created", red for "deleted". */
  tone?: 'accent' | 'muted' | 'danger';
  content: ReactNode;
}

interface TimelineProps {
  /** Newest first. */
  entries: TimelineEntry[];
  /** How many entries show before "Pokaż starsze". */
  initialCount?: number;
}

export function Timeline({ entries, initialCount = 5 }: TimelineProps) {
  const [expanded, setExpanded] = useState(false);
  const hidden = entries.length - initialCount;
  const visible = expanded ? entries : entries.slice(0, initialCount);

  return (
    <>
      <ol className={styles.timeline}>
        {visible.map((entry) => (
          <li key={entry.key} className={styles.entry}>
            <span
              className={cx(styles.dot, entry.tone === 'muted' && styles.dotMuted, entry.tone === 'danger' && styles.dotDanger)}
              aria-hidden="true"
            />
            <div className={styles.head}>
              <span className={styles.title}>{entry.title}</span>
              <time className={styles.date} dateTime={entry.date}>
                {entry.dateLabel ?? formatDateTime(entry.date)}
              </time>
            </div>
            <div className={styles.content}>{entry.content}</div>
          </li>
        ))}
      </ol>
      {hidden > 0 && (
        <PillButton className={styles.more} onClick={() => setExpanded((value) => !value)}>
          {expanded ? 'Pokaż mniej' : `Pokaż starsze (${hidden})`}
        </PillButton>
      )}
    </>
  );
}

/** "+18%" in red for a rise, "−5%" in green for a drop. Nothing for no change. */
export function ChangeBadge({ from, to }: { from: number | null | undefined; to: number }) {
  if (!from || from === to) return null;
  const percent = ((to - from) / from) * 100;
  // The space keeps "16,25 zł +18%" apart when copied or read aloud.
  return (
    <>
      {' '}
      <span className={cx(styles.badge, percent > 0 ? styles.up : styles.down)}>{formatSignedPercent(percent)}</span>
    </>
  );
}
