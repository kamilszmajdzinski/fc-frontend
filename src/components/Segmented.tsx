import { cx } from './ui';
import styles from './Segmented.module.css';

interface SegmentedProps<T extends string> {
  options: { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  'aria-label': string;
  small?: boolean;
}

/** A row of mutually exclusive buttons, e.g. tabs or a filter. */
export function Segmented<T extends string>({ options, value, onChange, 'aria-label': ariaLabel, small }: SegmentedProps<T>) {
  return (
    <div className={cx(styles.group, small && styles.small)} role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={cx(styles.option, option.id === value && styles.active)}
          aria-pressed={option.id === value}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
