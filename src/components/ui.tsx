import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { Icon } from './Icon';
import styles from './ui.module.css';

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

// ---------- Buttons ----------

type ButtonVariant = 'primary' | 'ghost' | 'danger' | 'accent';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  small?: boolean;
  /** Looks inactive (form not complete yet) but stays clickable, so a click can show what is missing. */
  dimmed?: boolean;
}

export function Button({ variant = 'primary', small, dimmed, className, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(styles.button, styles[variant], small && styles.small, dimmed && styles.dimmed, className)}
      {...props}
    />
  );
}

export function PillButton({ className, type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={cx(styles.pill, className)} {...props} />;
}

export function RemoveButton({ label, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" className={styles.iconButton} aria-label={label} title={label} {...props}>
      ×
    </button>
  );
}

// ---------- Form controls ----------

interface ControlProps {
  compact?: boolean;
  invalid?: boolean;
}

export function Input({ compact, invalid, className, ...props }: InputHTMLAttributes<HTMLInputElement> & ControlProps) {
  return (
    <input
      className={cx(styles.input, compact && styles.compact, invalid && styles.invalid, className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}

/** Text input for numbers. Accepts a comma as the decimal separator, unlike type="number". */
export function NumberInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & ControlProps) {
  return <Input type="text" inputMode="decimal" autoComplete="off" {...props} />;
}

export function Select({
  compact,
  invalid,
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & ControlProps) {
  return (
    <div className={styles.selectWrap}>
      <select
        className={cx(styles.select, compact && styles.compact, invalid && styles.invalid, className)}
        aria-invalid={invalid || undefined}
        {...props}
      >
        {children}
      </select>
      <Icon name="down" size={13} className={styles.chevron} />
    </div>
  );
}

export function TextArea({ invalid, className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & ControlProps) {
  return (
    <textarea
      className={cx(styles.textarea, invalid && styles.invalid, className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}

export function Label({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className={styles.label}>
      {children}
    </label>
  );
}

interface FieldProps {
  label: ReactNode;
  htmlFor: string;
  error?: string;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, error, hint, className, children }: FieldProps) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <div className={styles.fieldError}>{error}</div> : hint && <div className={styles.hint}>{hint}</div>}
    </div>
  );
}

// ---------- Cards and text ----------

interface CardProps {
  title?: ReactNode;
  actions?: ReactNode;
  accent?: boolean;
  className?: string;
  children: ReactNode;
}

export function Card({ title, actions, accent, className, children }: CardProps) {
  return (
    <section className={cx(styles.card, accent && styles.cardAccent, className)}>
      {(title || actions) && (
        <div className={styles.cardTitle}>
          <h3 className={styles.cardHeading}>{title}</h3>
          {actions && <div className={styles.cardActions}>{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx(styles.eyebrow, className)}>{children}</div>;
}

export function Banner({ tone = 'error', children }: { tone?: 'error' | 'warning'; children: ReactNode }) {
  return (
    <div className={cx(styles.banner, tone === 'error' ? styles.bannerError : styles.bannerWarning)} role="alert">
      {children}
    </div>
  );
}

export type StatTone = 'surface' | 'green' | 'red' | 'orange';

const TONES: Record<StatTone, string | undefined> = {
  surface: undefined,
  green: styles.toneGreen,
  red: styles.toneRed,
  orange: styles.toneOrange,
};

interface StatProps {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: StatTone;
  /** Smaller variant used in the stock screen. */
  compact?: boolean;
  className?: string;
}

export function Stat({ label, value, sub, tone = 'surface', compact, className }: StatProps) {
  return (
    <div className={cx(styles.stat, TONES[tone], compact && styles.statCompact, className)}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>
      {sub && <div className={styles.statSub}>{sub}</div>}
    </div>
  );
}
