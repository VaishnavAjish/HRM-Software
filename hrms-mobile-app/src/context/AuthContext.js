import React, { createContext, useContext, useState } from 'react';
import { api } from '../services/api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState('employee'); // 'employee' | 'agent'
  const [token, setToken] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState(null);

  const login = async (email, password, selectedRole = 'employee') => {
    setAuthError(null);
    const res = await api.login(email, password, selectedRole);
    if (res.success && res.user) {
      setUser(res.user);
      setToken(res.token);
      const userRole = (res.user.role || selectedRole || 'employee').toLowerCase();
      setRole(userRole === 'agent' ? 'agent' : 'employee');
      setIsAuthenticated(true);
      return { success: true, user: res.user, role: userRole };
    } else {
      setAuthError(res.message || 'Authentication failed');
      return { success: false, message: res.message || 'Authentication failed' };
    }
  };

  const refreshProfile = async () => {
    if (token) {
      const profile = await api.getProfile();
      if (profile && (profile.id || profile.emp_code || profile.name)) {
        setUser(profile);
      }
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setIsAuthenticated(false);
    setAuthError(null);
  };

  const switchRole = (newRole) => {
    setRole(newRole);
  };

  return (
    <AuthContext.Provider value={{ user, role, token, isAuthenticated, authError, login, logout, switchRole, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
