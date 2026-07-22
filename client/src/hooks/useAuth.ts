import { useAuth as useAuthContext } from '@/contexts/AuthContext';
import { User, UserRole } from '@/types/models';

export const useAuth = () => {
  const auth = useAuthContext();

  const hasRole = (roles: UserRole | UserRole[]): boolean => {
    return auth.hasRole(roles);
  };

  const isAdmin = (): boolean => hasRole('admin');
  const isHR = (): boolean => hasRole(['admin', 'hr']);
  const isManager = (): boolean => hasRole(['admin', 'hr', 'manager']);
  const isEmployee = (): boolean => hasRole('employee');

  const getUser = (): User | null => auth.user;

  const getToken = (): string | null => auth.accessToken;

  return {
    ...auth,
    hasRole,
    isAdmin,
    isHR,
    isManager,
    isEmployee,
    getUser,
    getToken,
  };
};

export default useAuth;