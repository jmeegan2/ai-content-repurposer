import { createContext, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

type AuthState = { session: Session | null; event: string | null };

const AuthContext = createContext<AuthState>({ session: null, event: null });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [event, setEvent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((e, s) => {
      setEvent(e);
      setSession(s);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (loading) return null;
  return (
    <AuthContext.Provider value={{ session, event }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useSession() {
  return useContext(AuthContext).session;
}

export function useAuthEvent() {
  return useContext(AuthContext).event;
}
