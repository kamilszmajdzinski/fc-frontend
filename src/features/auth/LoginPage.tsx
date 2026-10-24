import { useState } from 'react';
import { Navigate, useLocation } from 'react-router';
import { BrandMark } from '../../components/AppHeader';
import { Loading } from '../../components/EmptyState';
import { Banner, Button } from '../../components/ui';
import { signInWithGoogle, useAuth } from './AuthProvider';
import type { LoginLocationState } from './RequireAuth';
import styles from './LoginPage.module.css';

export function LoginPage() {
  const auth = useAuth();
  const location = useLocation();
  const returnTo = (location.state as LoginLocationState | null)?.from ?? '/recipes';
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  if (auth.status === 'loading') return <Loading />;
  if (auth.status === 'signedIn') return <Navigate to={returnTo} replace />;

  async function handleLogin() {
    setPending(true);
    setFailed(false);
    try {
      // Leaves the page for Google; we only get here again if it could not start.
      await signInWithGoogle(returnTo);
    } catch (error) {
      console.error(error);
      setFailed(true);
      setPending(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <BrandMark />
        <p className={styles.text}>Zaloguj się, aby zobaczyć swoje przepisy i składniki. Twoje dane widzisz tylko Ty.</p>
        {failed && <Banner>Nie udało się rozpocząć logowania. Spróbuj ponownie.</Banner>}
        <Button onClick={handleLogin} disabled={pending} className={styles.button}>
          {pending ? 'Przekierowanie…' : 'Zaloguj się przez Google'}
        </Button>
      </div>
    </main>
  );
}
