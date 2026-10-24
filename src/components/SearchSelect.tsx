import { Fragment, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { matchesSearch, normalizeForSearch } from '../lib/search';
import { Icon } from './Icon';
import { cx } from './ui';
import styles from './SearchSelect.module.css';

export interface SearchOption<V extends string | number = number> {
  value: V;
  label: string;
  /** Second line under the label, e.g. manufacturer and price. */
  meta?: string;
  /** Extra text the search matches, e.g. the manufacturer. */
  keywords?: string | null;
  /** Small tag after the label, e.g. "już w przepisie". */
  badge?: string;
  /** Heading shown above the first option of each group. Options of a group must be next to each other. */
  group?: string;
}

interface SearchSelectProps<V extends string | number> {
  options: SearchOption<V>[];
  value: V | null;
  onChange: (value: V) => void;
  'aria-label': string;
  placeholder?: string;
  invalid?: boolean;
  autoFocus?: boolean;
  /** Adds a last row like "+ Dodaj nowy składnik „…”" for the typed text. */
  onCreate?: (query: string) => void;
  createLabel?: (query: string) => string;
  /** Group whose names count for "already exists" (no create row for an exact match). Default: all. */
  createGroup?: string;
}

/**
 * A select you can type into: the list narrows as you type (ignoring case and Polish accents).
 * Arrow keys move, Enter picks, Escape closes. While open, the current choice shows as the placeholder.
 */
export function SearchSelect<V extends string | number>({
  options,
  value,
  onChange,
  'aria-label': ariaLabel,
  placeholder = 'Wybierz…',
  invalid,
  autoFocus,
  onCreate,
  createLabel = (query) => `+ Dodaj „${query}”`,
  createGroup,
}: SearchSelectProps<V>) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const selected = options.find((option) => option.value === value);
  const filtered = options.filter((option) => matchesSearch(query, option.label, option.keywords));
  const trimmed = query.trim();
  // Offer to create only what doesn't exist yet, so "Masło 82%" isn't added twice.
  const exactMatch = options.some(
    (option) =>
      (createGroup === undefined || option.group === createGroup) &&
      normalizeForSearch(option.label) === normalizeForSearch(trimmed),
  );
  const showCreate = !!onCreate && trimmed !== '' && !exactMatch;
  const count = filtered.length + (showCreate ? 1 : 0);

  // Keep the highlighted row visible while moving with the arrow keys.
  useEffect(() => {
    if (open) listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  function openList() {
    setOpen(true);
    setQuery('');
    const index = options.findIndex((option) => option.value === value);
    setActive(Math.max(0, index));
  }

  function close() {
    setOpen(false);
    setQuery('');
  }

  function choose(index: number) {
    if (index < filtered.length) onChange(filtered[index].value);
    else if (showCreate) onCreate?.(trimmed);
    close();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) return openList();
      if (count > 0) setActive((current) => (current + (event.key === 'ArrowDown' ? 1 : -1) + count) % count);
    } else if (event.key === 'Enter') {
      // Never submit the surrounding form from here.
      event.preventDefault();
      if (open && count > 0) choose(Math.min(active, count - 1));
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  }

  return (
    <div className={styles.wrap}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && count > 0 ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        autoFocus={autoFocus}
        className={cx(styles.input, invalid && styles.invalid)}
        value={open ? query : (selected?.label ?? '')}
        placeholder={open && selected ? selected.label : placeholder}
        onFocus={openList}
        onBlur={close}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      <span
        className={styles.chevron}
        aria-hidden="true"
        onMouseDown={(event) => {
          // Clicking the arrow works like clicking the field.
          event.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <Icon name="down" size={13} />
      </span>

      {open && (
        <ul ref={listRef} id={listId} role="listbox" aria-label={ariaLabel} className={styles.list}>
          {filtered.map((option, index) => (
            <Fragment key={option.value}>
              {option.group && option.group !== filtered[index - 1]?.group && (
                <li role="presentation" className={styles.group}>
                  {option.group}
                </li>
              )}
              <li
                id={`${listId}-${index}`}
                data-index={index}
                role="option"
                aria-selected={option.value === value}
                className={cx(
                  styles.option,
                  index === active && styles.active,
                  option.value === value && styles.selected,
                )}
                // mousedown, not click: the input must not lose focus (and close the list) first.
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(index);
                }}
                onMouseEnter={() => setActive(index)}
              >
                <span className={styles.labelRow}>
                  <span className={styles.label}>{option.label}</span>
                  {option.badge && <span className={styles.badge}>{option.badge}</span>}
                </span>
                {option.meta && <span className={styles.meta}>{option.meta}</span>}
              </li>
            </Fragment>
          ))}
          {filtered.length === 0 && <li className={styles.empty}>Brak wyników</li>}
          {showCreate && (
            <li
              id={`${listId}-${filtered.length}`}
              data-index={filtered.length}
              role="option"
              aria-selected={false}
              className={cx(styles.option, styles.create, active === filtered.length && styles.active)}
              onMouseDown={(event) => {
                event.preventDefault();
                choose(filtered.length);
              }}
              onMouseEnter={() => setActive(filtered.length)}
            >
              {createLabel(trimmed)}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
