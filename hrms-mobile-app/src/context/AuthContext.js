import React, { createContext, useContext, useState } from 'react';
import { MOCK_USER_EMPLOYEE, MOCK_USER_AGENT } from '../services/mockData';
import { api } from '../services/api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(MOCK_USER_EMPLOYEE);
  const [role, setRole] = useState('employee'); // 'employee' or 'agent'
  const [isAuthenticated, setIsAuthenticated] = useState(true);

  const login = async (email, password, selectedRole) => {
    const res = await api.login(email, password, selectedRole);
    if (res.success) {
      setUser(res.user);
      setRole(selectedRole || res.user.role || 'employee');
      setIsAuthenticated(true);
    }
    return res;
  };

  const logout = () => {
    setUser(null);
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
    <AuthContext.Provider value={{ user, role, isAuthenticated, login, logout, switchRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
