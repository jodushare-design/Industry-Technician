import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getMyContext } from '@itm/api';
import { reportError } from '@itm/core';
import type { MyContext } from '@itm/types';
import { supabase } from './supabase';

interface SessionState {
  loading: boolean;
  session: Session | null;
  context: MyContext | null;
  refresh: () => Promise<void>;
}

const Ctx = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [context, setContext] = useState<MyContext | null>(null);

  const loadContext = useCallback(async (s: Session | null) => {
    if (!supabase || !s) {
      setContext(null);
      return;
    }
    try {
      setContext(await getMyContext(supabase));
    } catch (e) {
      reportError(e, { where: 'mobile.session.loadContext' });
      setContext(null);
    }
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadContext(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      void loadContext(s);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadContext]);

  const refresh = useCallback(() => loadContext(session), [loadContext, session]);

  return <Ctx.Provider value={{ loading, session, context, refresh }}>{children}</Ctx.Provider>;
}

export function useSession(): SessionState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession must be used inside SessionProvider');
  return v;
}
