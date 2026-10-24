import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { Loading } from '../../components/EmptyState';
import { useAuth } from './AuthProvider';

export interface LoginLocationState {
  from?: string;
}

// Shows the page only to a logged-in user; anyone else goes to /login and comes back afterwards.
export function RequireAuth({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const location = useLocation();

  if (auth.status === 'loading') return <Loading />;
  if (auth.status === 'signedOut') {
    const state: LoginLocationState = { from: location.pathname + location.search };
    return <Navigate to="/login" replace state={state} />;
  }
  return children;
}
