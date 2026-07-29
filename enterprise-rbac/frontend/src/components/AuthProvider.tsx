import { useEffect, type ReactNode } from 'react';
import axios from 'axios';
import { useAuthStore } from '../store/authStore';
import { api } from '../lib/api';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api/v1';

export default function AuthProvider({ children }: { children: ReactNode }) {
  const setSession = useAuthStore((s) => s.setSession);
  const setHydrated = useAuthStore((s) => s.setHydrated);
  const isHydrated = useAuthStore((s) => s.isHydrated);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const refreshRes = await axios.post(`${API_URL}/auth/refresh`, {}, { withCredentials: true });
        const accessToken = refreshRes.data.accessToken as string;
        const meRes = await api.get('/auth/me', { headers: { Authorization: `Bearer ${accessToken}` } });
        if (!cancelled) setSession(meRes.data, accessToken);
      } catch {
        // No valid session; user needs to log in.
      } finally {
        if (!cancelled) setHydrated(true);
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [setSession, setHydrated]);

  if (!isHydrated) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}
