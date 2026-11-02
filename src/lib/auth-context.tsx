import type { User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { supabase } from "@/integrations/supabase/client";

interface AuthState {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthState>({ user: null, loading: true });

/** Single app-wide session subscriber; components read it with useAuth(). */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });
  const queryClient = useQueryClient();

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setState({ user: session?.user ?? null, loading: false });
      if (event === "SIGNED_OUT") queryClient.removeQueries({ queryKey: ["real-stops"] });
    });
    supabase.auth
      .getUser()
      .then(({ data }) => setState({ user: data.user ?? null, loading: false }));
    return () => sub.subscription.unsubscribe();
  }, [queryClient]);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

/**
 * Only same-site paths are allowed after sign-in. Rejects protocol-relative tricks
 * ("//x", "/\\x" — browsers read a backslash as a slash) and control characters.
 */
export function safeRedirect(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 512) return undefined;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return undefined;
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return undefined;
  return value;
}
