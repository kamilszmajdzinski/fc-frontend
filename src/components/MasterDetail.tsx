import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import { Icon } from './Icon';
import { cx } from './ui';
import styles from './MasterDetail.module.css';

interface MasterDetailProps {
  list: ReactNode;
  /** On narrow screens only one side is shown: the detail when it is open, the list otherwise. */
  detailOpen: boolean;
  children: ReactNode;
}

export function MasterDetail({ list, detailOpen, children }: MasterDetailProps) {
  return (
    <div className={styles.layout} data-detail-open={detailOpen}>
      {list}
      <main className={styles.detail}>{children}</main>
    </div>
  );
}

interface ListPanelProps {
  title: string;
  action?: { label: string; to: string };
  search?: { value: string; onChange: (value: string) => void };
  children: ReactNode;
}

export function ListPanel({ title, action, search, children }: ListPanelProps) {
  return (
    <aside className={styles.list} aria-label={title}>
      <div className={styles.listHeader}>
        <div className={styles.listTitleRow}>
          <h1 className={styles.listTitle}>{title}</h1>
          {action && (
            <Link to={action.to} className={styles.listAction}>
              <Icon name="plus" size={12} />
              {action.label}
            </Link>
          )}
        </div>
        {search && (
          <input
            type="search"
            className={styles.search}
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            placeholder="Szukaj…"
            aria-label={`Szukaj: ${title.toLowerCase()}`}
          />
        )}
      </div>
      <div className={styles.listBody}>{children}</div>
    </aside>
  );
}

export function ListItem({ to, children }: { to: string; children: ReactNode | ((isActive: boolean) => ReactNode) }) {
  return (
    <NavLink to={to} className={({ isActive }) => cx(styles.item, isActive && styles.itemActive)}>
      {({ isActive }) => (typeof children === 'function' ? children(isActive) : children)}
    </NavLink>
  );
}

interface ListRowProps {
  title: ReactNode;
  sub?: ReactNode;
  aside?: ReactNode;
  asideSub?: ReactNode;
  /** Recipe names use the serif font, like in the design. */
  serif?: boolean;
  /** Small coloured dot before the title (stock status). */
  dot?: 'green' | 'red';
  highlightAside?: boolean;
  footer?: ReactNode;
}

export function ListRow({ title, sub, aside, asideSub, serif, dot, highlightAside, footer }: ListRowProps) {
  return (
    <>
      <div className={styles.row}>
        <div className={styles.rowMain}>
          <div className={styles.rowTitleLine}>
            {dot && <span className={cx(styles.dot, dot === 'red' ? styles.dotRed : styles.dotGreen)} />}
            <span className={cx(styles.rowTitle, serif && styles.rowTitleSerif)}>{title}</span>
          </div>
          {sub && <div className={styles.rowSub}>{sub}</div>}
        </div>
        {(aside || asideSub) && (
          <div className={styles.rowAside}>
            {aside && <div className={cx(styles.rowAsideMain, highlightAside && styles.rowAsideHighlight)}>{aside}</div>}
            {asideSub && <div className={styles.rowAsideSub}>{asideSub}</div>}
          </div>
        )}
      </div>
      {footer}
    </>
  );
}

interface PageHeaderProps {
  eyebrow: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  large?: boolean;
  children?: ReactNode;
}

export function PageHeader({ eyebrow, title, sub, actions, large, children }: PageHeaderProps) {
  return (
    <header className={styles.pageHeader}>
      <div className={styles.pageHeaderMain}>
        <div className={styles.eyebrow}>{eyebrow}</div>
        <h2 className={cx(styles.pageTitle, large && styles.pageTitleLarge)}>{title}</h2>
        {sub && <div className={styles.pageSub}>{sub}</div>}
        {children}
      </div>
      {actions && <div className={styles.pageActions}>{actions}</div>}
    </header>
  );
}

/** Scrollable detail page with the design's padding. */
export function DetailPage({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className={styles.page}>
      <div className={cx(styles.pageInner, wide && styles.pageWide)}>{children}</div>
    </div>
  );
}

/** "Back to the list" link, shown only on narrow screens where the list is hidden. */
export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className={styles.back}>
      <Icon name="back" size={14} />
      {children}
    </Link>
  );
}
