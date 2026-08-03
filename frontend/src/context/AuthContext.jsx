import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, bootstrapCsrf, clearCsrfToken } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Set only between a correct password and a verified authenticator code.
  const [pendingTotp, setPendingTotp] = useState(false);

  const refreshUser = useCallback(async () => {
    try {
      const data = await api('/auth/me');
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

  const login = useCallback(async (credentials) => {
    const data = await api('/auth/login', { method: 'POST', body: credentials });
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

  const verifyLoginTotp = useCallback(async (token) => {
    const data = await api('/auth/totp/verify-login', { method: 'POST', body: { token } });
    await bootstrapCsrf();
    setPendingTotp(false);
    setUser(data.user);
    return data;
  }, []);

  const cancelTotp = useCallback(() => {
    setPendingTotp(false);
    setUser(null);
  }, []);

  const redeemInvitation = useCallback(async (token, details) => {
    const data = await api(`/invitations/${encodeURIComponent(token)}/redeem`, { method: 'POST', body: details });
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

  const value = useMemo(() => ({
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
