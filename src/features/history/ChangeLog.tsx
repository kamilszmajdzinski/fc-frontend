import { Link } from 'react-router';
import type { ChangeEntry, ChangeLogEntry, EntityType, FieldChange, IngredientSnapshot } from '../../api/types';
import { ChangeBadge, Timeline, type TimelineEntry } from '../../components/Timeline';
import { PillButton } from '../../components/ui';
import {
  describeSteps,
  diffIngredients,
  entrySummary,
  entryTitle,
  entryUnit,
  fieldLabel,
  formatAmount,
  formatFieldValue,
  undoableDeletions,
} from '../../lib/changeLog';
import { formatMoney, formatTime } from '../../lib/format';
import { useRecipeUndo } from '../recipes/useRecipeUndo';
import { useEntities } from './useEntities';
import styles from './ChangeLog.module.css';

const TYPE_LABELS: Record<EntityType, string> = { product: 'Składnik', recipe: 'Przepis' };

interface ChangeLogTimelineProps {
  entries: ChangeLogEntry[];
  /** In the activity feed: show which item changed, and only the time (the day is the heading). */
  feed?: boolean;
  initialCount?: number;
  /** Deletion entries that get "Cofnij". Defaults to the latest deletion per recipe in `entries`. */
  undoable?: Set<number>;
}

export function ChangeLogTimeline({ entries, feed, initialCount, undoable }: ChangeLogTimelineProps) {
  const canUndo = undoable ?? undoableDeletions(entries);
  const timeline: TimelineEntry[] = entries.map((entry) => ({
    key: entry.id,
    date: entry.changedAt,
    dateLabel: feed ? formatTime(entry.changedAt) : undefined,
    tone: entry.action === 'created' ? 'muted' : entry.action === 'deleted' ? 'danger' : 'accent',
    title: feed ? (
      <span className={styles.feedTitle}>
        <span className={styles.typeChip}>{TYPE_LABELS[entry.entityType]}</span>
        <EntityName type={entry.entityType} id={entry.entityId} name={entry.entityName} />
        <span className={styles.action}>· {entryTitle(entry)}</span>
      </span>
    ) : (
      entryTitle(entry)
    ),
    content: <ChangeDetails entry={entry} undoable={canUndo.has(entry.id)} />,
  }));
  return <Timeline entries={timeline} initialCount={initialCount} />;
}

/** The item's name, linking to it, or to its history with a "deleted" tag once it's gone. */
export function EntityName({ type, id, name }: { type: EntityType; id: number; name: string }) {
  const { link } = useEntities();
  const target = link(type, id);
  return (
    <span className={styles.entity}>
      <Link to={target.to} className={styles.entityLink}>
        {name}
      </Link>
      {target.deleted && <span className={styles.deletedTag}>usunięty</span>}
    </span>
  );
}

/** What changed in one entry, plus what caused it or what it caused. */
export function ChangeDetails({ entry, undoable }: { entry: ChangeLogEntry | ChangeEntry; undoable?: boolean }) {
  const { unitOf } = useEntities();
  const unit = entryUnit(entry, unitOf(entry.entityId));
  const triggeredBy = 'triggeredBy' in entry ? entry.triggeredBy : null;
  const triggered = 'triggered' in entry ? entry.triggered : [];

  return (
    <>
      {triggeredBy && (
        <div className={styles.cause}>
          Przyczyna: <EntityName type={triggeredBy.entityType} id={triggeredBy.entityId} name={triggeredBy.entityName} />{' '}
          — {describeCause(triggeredBy, unitOf(triggeredBy.entityId))}
        </div>
      )}

      {entry.action === 'restored' && entry.changes.length === 0 ? (
        <div className={styles.summary}>Bez zmian od usunięcia.</div>
      ) : entry.action === 'updated' || entry.action === 'restored' ? (
        // For 'restored': what differs from when it was deleted, e.g. dropped ingredients, a new cost.
        <ul className={styles.fields}>
          {entry.changes.map((change) => (
            <FieldChangeRow key={change.field} change={change} unit={unit} />
          ))}
        </ul>
      ) : (
        <div className={styles.summary}>{entrySummary(entry)}</div>
      )}

      {undoable && (
        <UndoDeleteButton id={entry.entityId} name={entry.entityName} />
      )}

      {triggered.length > 0 && (
        <div className={styles.triggered}>
          <div className={styles.triggeredLabel}>Przeliczone przepisy</div>
          <ul className={styles.triggeredList}>
            {triggered.map((recipe) => {
              const cost = recipe.changes.find((change) => change.field === 'foodCost');
              return (
                <li key={recipe.id} className={styles.triggeredRow}>
                  <EntityName type={recipe.entityType} id={recipe.entityId} name={recipe.entityName} />
                  {cost && (
                    <span className={styles.values}>
                      {formatMoney(Number(cost.from))} → <strong>{formatMoney(Number(cost.to))}</strong>
                      <ChangeBadge from={Number(cost.from)} to={Number(cost.to)} />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}

/**
 * "Cofnij" on a recipe deletion: restores it. Shown only while the recipe is still deleted, so it
 * disappears once the recipe is back.
 */
export function UndoDeleteButton({ id, name, label = 'Cofnij' }: { id: number; name: string; label?: string }) {
  const { link } = useEntities();
  const { undo, restoringId } = useRecipeUndo();
  if (!link('recipe', id).deleted) return null;
  return (
    <div>
      <PillButton onClick={() => undo(id, name)} disabled={restoringId === id}>
        {restoringId === id ? 'Przywracanie…' : `↺ ${label}`}
      </PillButton>
    </div>
  );
}

/** "cena opakowania 8,00 zł → 10,00 zł" for the product change that caused a recipe's new cost. */
function describeCause(cause: ChangeEntry, unit: ReturnType<typeof entryUnit>): string {
  const packagePrice = cause.changes.find((change) => change.field === 'pricePerPackage');
  if (packagePrice) {
    return `cena opakowania ${formatMoney(Number(packagePrice.from))} → ${formatMoney(Number(packagePrice.to))}`;
  }
  const perUnit = cause.changes.find((change) => change.field === 'pricePerUnit');
  if (perUnit) {
    return `${fieldLabel('pricePerUnit', unit).toLowerCase()} ${formatFieldValue('pricePerUnit', perUnit.from, unit)} → ${formatFieldValue('pricePerUnit', perUnit.to, unit)}`;
  }
  return 'zmiana opakowania';
}

const BADGE_FIELDS = new Set<FieldChange['field']>(['pricePerUnit', 'foodCost']);

function FieldChangeRow({ change, unit }: { change: FieldChange; unit: ReturnType<typeof entryUnit> }) {
  const label = fieldLabel(change.field, unit);

  if (change.field === 'ingredients') {
    const diff = diffIngredients(change.from as IngredientSnapshot[] | null, change.to as IngredientSnapshot[] | null);
    const nothing = diff.added.length + diff.removed.length + diff.changed.length === 0;
    return (
      <li className={styles.field}>
        <span className={styles.label}>{label}:</span>
        {nothing ? (
          ' zmieniona kolejność'
        ) : (
          <ul className={styles.diff}>
            {diff.added.map((line) => (
              <li key={`+${line.productId}`} className={styles.added}>
                <span className={styles.sign}>+</span> {formatAmount(line)} {line.productName}
              </li>
            ))}
            {diff.removed.map((line) => (
              <li key={`-${line.productId}`} className={styles.removed}>
                <span className={styles.sign}>−</span> {formatAmount(line)} {line.productName}
              </li>
            ))}
            {diff.changed.map(({ from, to }) => (
              <li key={`~${to.productId}`}>
                <span className={styles.sign}>~</span> {to.productName}: {formatAmount(from)} → {formatAmount(to)}
              </li>
            ))}
          </ul>
        )}
      </li>
    );
  }

  const value =
    change.field === 'steps' ? (
      describeSteps(change.from as string[] | null, change.to as string[] | null)
    ) : (
      <>
        {formatFieldValue(change.field, change.from, unit)} → <strong>{formatFieldValue(change.field, change.to, unit)}</strong>
        {BADGE_FIELDS.has(change.field) && <ChangeBadge from={Number(change.from)} to={Number(change.to)} />}
      </>
    );

  return (
    <li className={styles.field}>
      <span className={styles.label}>{label}:</span> <span className={styles.values}>{value}</span>
    </li>
  );
}
