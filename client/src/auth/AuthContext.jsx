import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setUnauthorizedHandler } from '../api.js';

const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, user: null });
  const [loginOpen, setLoginOpen] = useState(false);
  const refresh = useCallback(async () => { const result = await api.me(); setState({ loading: false, user: result.authenticated ? result.user : null }); return result; }, []);
  useEffect(() => { setUnauthorizedHandler(() => setState({ loading: false, user: null })); refresh().catch(() => setState({ loading: false, user: null })); return () => setUnauthorizedHandler(null); }, [refresh]);
  const login = useCallback(async (username, password) => { const result = await api.login(username, password); setState({ loading: false, user: result.user }); setLoginOpen(false); return result.user; }, []);
  const register = useCallback(async (body) => { const result = await api.register(body); setState({ loading: false, user: result.user }); setLoginOpen(false); return result.user; }, []);
  const logout = useCallback(async () => { await api.logout().catch(() => {}); setState({ loading: false, user: null }); if (location.pathname.startsWith('/admin')||location.pathname.startsWith('/ai')) location.href = '/'; }, []);
  const changePassword = useCallback(async (currentPassword, newPassword) => { const result = await api.changePassword(currentPassword, newPassword); setState({ loading: false, user: result.user }); return result.user; }, []);
  const updateProfile = useCallback(async (body) => { const result=await api.updateProfile(body);setState({loading:false,user:result.user});return result.user;},[]);
  const uploadAvatar = useCallback(async (dataUrl) => { const result=await api.uploadAvatar(dataUrl);setState({loading:false,user:result.user});return result.user;},[]);
  const value = useMemo(() => ({ ...state, authenticated: Boolean(state.user), isAdmin: state.user?.role === 'admin', loginOpen, setLoginOpen, login, register, logout, changePassword, updateProfile,uploadAvatar,refresh }), [state, loginOpen, login, register, logout, changePassword,updateProfile,uploadAvatar, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() { const context = useContext(AuthContext); if (!context) throw new Error('useAuth requires AuthProvider'); return context; }
