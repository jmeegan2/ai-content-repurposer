import { createContext, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

const AuthContext = createContext<Session | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) =>
      setSession(s),
    );
    return () => listener.subscription.unsubscribe();
  }, []);

  if (loading) return null;
  return (
    <AuthContext.Provider value={session}>{children}</AuthContext.Provider>
  );
}

export function useSession() {
  return useContext(AuthContext);
}
