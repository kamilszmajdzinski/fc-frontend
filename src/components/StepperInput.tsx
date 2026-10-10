import type { InputHTMLAttributes } from 'react';
import { parseDecimal, stepCount } from '../lib/format';
import { cx, NumberInput } from './ui';
import styles from './StepperInput.module.css';

interface StepperInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  /** Accessible names of the buttons, e.g. "Mniej porcji" / "Więcej porcji". */
  decreaseLabel: string;
  increaseLabel: string;
  compact?: boolean;
  invalid?: boolean;
}

/**
 * − [ 2 ] + for counts (portions, pieces): steps of 1, never below 1. Any value can still be typed,
 * and the arrow keys step too.
 */
export function StepperInput({
  value,
  onChange,
  decreaseLabel,
  increaseLabel,
  compact,
  className,
  onKeyDown,
  ...inputProps
}: StepperInputProps) {
  return (
    <div className={cx(styles.stepper, compact && styles.compact)}>
      <button
        type="button"
        className={styles.button}
        aria-label={decreaseLabel}
        disabled={!(parseDecimal(value) > 1)}
        onClick={() => onChange(stepCount(value, -1))}
      >
        −
      </button>
      <NumberInput
        {...inputProps}
        compact={compact}
        value={value}
        className={cx(styles.input, className)}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            onChange(stepCount(value, event.key === 'ArrowUp' ? 1 : -1));
          }
          onKeyDown?.(event);
        }}
      />
      <button type="button" className={styles.button} aria-label={increaseLabel} onClick={() => onChange(stepCount(value, 1))}>
        +
      </button>
    </div>
  );
}
