"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiGet, apiSend, getToken, setToken } from "@/lib/api";
import type { User } from "@/types";

interface AuthState {
  ready: boolean;
  user: User | null;
  permissions: string[];
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  can: (permission: string) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);

  const loadSession = useCallback(async () => {
    const [me, perms] = await Promise.all([
      apiGet<User>("/auth/me"),
      apiGet<{ permissions: string[] }>("/admin/me/permissions"),
    ]);
    setUser(me);
    setPermissions(perms.permissions);
  }, []);

  useEffect(() => {
    if (!getToken()) {
      setReady(true);
      return;
    }
    loadSession()
      .catch(() => {
        setToken(null);
        setUser(null);
      })
      .finally(() => setReady(true));
  }, [loadSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      const response = await apiSend<{ access_token: string; user: User }>("POST", "/auth/login", { email, password });
      setToken(response.access_token);
      await loadSession();
    },
    [loadSession],
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setPermissions([]);
    window.location.href = "/login";
  }, []);

  const can = useCallback(
    (permission: string) => permissions.includes("*") || permissions.includes(permission),
    [permissions],
  );

  const value = useMemo(
    () => ({ ready, user, permissions, login, logout, can }),
    [ready, user, permissions, login, logout, can],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
