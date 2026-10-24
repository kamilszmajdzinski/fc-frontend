import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { supabase } from '../../lib/supabase';

export type AuthState = { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; session: Session };

const AuthContext = createContext<AuthState>({ status: 'loading' });

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    // Fires right away with the stored session (INITIAL_SESSION), then on every login, logout and token refresh.
    const { data } = supabase().auth.onAuthStateChange((_event, session) => {
      setState(session ? { status: 'signedIn', session } : { status: 'signedOut' });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // After a logout or a switch to another account, nothing cached for the previous user may show.
  const userId = state.status === 'signedIn' ? state.session.user.id : state.status === 'signedOut' ? null : undefined;
  const previousUserId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (userId === undefined) return;
    if (previousUserId.current !== undefined && previousUserId.current !== userId) queryClient.clear();
    previousUserId.current = userId;
  }, [userId, queryClient]);

  return <AuthContext value={state}>{children}</AuthContext>;
}

export async function signInWithGoogle(returnTo: string) {
  const { error } = await supabase().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: new URL(returnTo, window.location.origin).href },
  });
  if (error) throw error;
}

export async function signOut() {
  await supabase().auth.signOut();
}
