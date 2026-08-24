import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, bootstrapCsrf, clearCsrfToken } from '../api/client';
import type { AuthResponse, LoginCredentials, User } from '../types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  pendingTotp: boolean;
  login: (credentials: LoginCredentials) => Promise<AuthResponse>;
  verifyLoginTotp: (token: string) => Promise<AuthResponse>;
  cancelTotp: () => void;
  redeemInvitation: (token: string, details: Record<string, unknown>) => Promise<AuthResponse>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<User | null>;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // Set only between a correct password and a verified authenticator code.
  const [pendingTotp, setPendingTotp] = useState(false);

  const refreshUser = useCallback(async () => {
    try {
      const data = await api<{ user: User }>('/auth/me');
      setUser(data.user);
      setPendingTotp(false);
      return data.user;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // A CSRF token must exist before the first mutation, so fetch it alongside the session.
    bootstrapCsrf().finally(refreshUser);
  }, [refreshUser]);

  const login = useCallback(async (credentials: LoginCredentials): Promise<AuthResponse> => {
    const data = await api<AuthResponse>('/auth/login', { method: 'POST', body: credentials });
    if (data.requiresTotp) {
      setPendingTotp(true);
      setUser(null);
      return data;
    }
    await bootstrapCsrf();
    setPendingTotp(false);
    setUser(data.user);
    return data;
  }, []);

  const verifyLoginTotp = useCallback(async (token: string): Promise<AuthResponse> => {
    const data = await api<AuthResponse>('/auth/totp/verify-login', { method: 'POST', body: { token } });
    await bootstrapCsrf();
    setPendingTotp(false);
    setUser(data.user);
    return data;
  }, []);

  const cancelTotp = useCallback(() => {
    setPendingTotp(false);
    setUser(null);
  }, []);

  const redeemInvitation = useCallback(async (token: string, details: Record<string, unknown>): Promise<AuthResponse> => {
    const data = await api<AuthResponse>(`/invitations/${encodeURIComponent(token)}/redeem`, { method: 'POST', body: details });
    await bootstrapCsrf();
    setUser(data.user);
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
      setPendingTotp(false);
      clearCsrfToken();
      await bootstrapCsrf();
    }
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    pendingTotp,
    login,
    verifyLoginTotp,
    cancelTotp,
    redeemInvitation,
    logout,
    refreshUser,
    setUser,
  }), [user, loading, pendingTotp, login, verifyLoginTotp, cancelTotp, redeemInvitation, logout, refreshUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
