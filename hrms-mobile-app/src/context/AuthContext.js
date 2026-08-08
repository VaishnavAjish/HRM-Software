import React, { createContext, useContext, useState, useEffect } from 'react';
import { MOCK_USER_EMPLOYEE, MOCK_USER_AGENT } from '../services/mockData';
import { api } from '../services/api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(MOCK_USER_EMPLOYEE);
  const [role, setRole] = useState('employee'); // 'employee' or 'agent'
  const [token, setToken] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(true);
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
      if (profile) {
        setUser(profile);
      }
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setIsAuthenticated(false);
  };

  const switchRole = (newRole) => {
    setRole(newRole);
    if (newRole === 'agent') {
      setUser(MOCK_USER_AGENT);
    } else {
      setUser(MOCK_USER_EMPLOYEE);
    }
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
