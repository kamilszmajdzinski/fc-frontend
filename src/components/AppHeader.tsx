import { NavLink } from 'react-router';
import { signOut, useAuth } from '../features/auth/AuthProvider';
import { cx } from './ui';
import styles from './AppHeader.module.css';

// Invoices ("Faktury") from the design wait for backend support.
const NAV_ITEMS = [
  { to: '/recipes', label: 'Przepisy' },
  { to: '/products', label: 'Składniki' },
  { to: '/inventory', label: 'Magazyn' },
  { to: '/calculator', label: 'Kalkulator' },
  { to: '/activity', label: 'Aktywność' },
];

export function BrandMark({ sub = 'Kalkulacja kosztów' }: { sub?: string }) {
  return (
    <div className={styles.brand}>
      <div className={styles.brandName}>FoodCost</div>
      <div className={styles.brandSub}>{sub}</div>
    </div>
  );
}

function Account() {
  const auth = useAuth();
  if (auth.status !== 'signedIn') return null;
  const email = auth.session.user.email;
  return (
    <div className={styles.account}>
      <span className={styles.email} title={email}>
        {email}
      </span>
      <button type="button" className={styles.navItem} onClick={() => void signOut()}>
        Wyloguj
      </button>
    </div>
  );
}

export function AppHeader() {
  return (
    <header className={styles.header}>
      <NavLink to="/" className={styles.brandLink} aria-label="FoodCost — strona główna">
        <BrandMark />
      </NavLink>
      <div className={styles.spacer} />
      <nav className={styles.nav} aria-label="Główna nawigacja">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => cx(styles.navItem, isActive && styles.active)}>
            {item.label}
            <span className={styles.dot} aria-hidden="true" />
          </NavLink>
        ))}
      </nav>
      <Account />
    </header>
  );
}
