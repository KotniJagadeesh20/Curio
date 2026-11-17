import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, setUnauthorizedHandler, tokenStore } from "@/lib/api";
import { isPublicQueryKey } from "@/lib/queryKeys";
import type { AuthResponse, User } from "@/lib/types";

interface AuthState {
  user: User | null;
  /** true until we know whether a stored token is still valid */
  loading: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<User>;
  signup: (name: string, email: string, password: string) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => tokenStore.get() !== null);
  const queryClient = useQueryClient();

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    // Drop everything that belongs to the signed-in user. Public reads (the same for everyone, fetched without a token)
    // are kept: clearing them while they are in flight left Discover stuck on "Loading" when a stale stored token was
    // rejected at startup (Step 14a, requirement D).
    queryClient.removeQueries({ predicate: (q) => !isPublicQueryKey(q.queryKey) });
  }, [queryClient]);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  // Restore the session from a stored token.
  useEffect(() => {
    if (!tokenStore.get()) return;
    api.get<User>("/auth/me")
      .then(setUser)
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  const accept = useCallback((res: AuthResponse) => {
    tokenStore.set(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const value = useMemo<AuthState>(() => ({
    user,
    loading,
    isAdmin: user?.role === "ADMIN",
    login: async (email, password) => accept(await api.post<AuthResponse>("/auth/login", { email, password })),
    signup: async (name, email, password) =>
      accept(await api.post<AuthResponse>("/auth/signup", { name, email, password })),
    logout,
  }), [user, loading, accept, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
