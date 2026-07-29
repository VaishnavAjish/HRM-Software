import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Moon, Sun, LogOut, ChevronDown } from 'lucide-react';
import { useThemeStore } from '../store/themeStore';
import { useAuthStore } from '../store/authStore';
import { api } from '../lib/api';

export default function Topbar() {
  const { theme, toggleTheme } = useThemeStore();
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  async function handleLogout() {
    try {
      await api.post('/auth/logout');
    } finally {
      clear();
      navigate('/login', { replace: true });
    }
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-card px-6">
      <h1 className="text-lg font-semibold text-foreground">Admin Panel</h1>

      <div className="flex items-center gap-3">
        <button
          onClick={toggleTheme}
          className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        <div className="relative">
          <button onClick={() => setMenuOpen((v) => !v)} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-sm font-medium text-primary">
              {user?.fullName?.[0]?.toUpperCase() ?? 'A'}
            </div>
            <div className="hidden text-left sm:block">
              <div className="text-sm font-medium text-foreground">{user?.fullName ?? 'Admin'}</div>
              <div className="text-xs text-muted-foreground">{user?.roles?.[0] ?? ''}</div>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 z-20 mt-2 w-48 rounded-md border bg-card py-1 shadow-lg">
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-muted"
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
