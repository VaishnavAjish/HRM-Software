import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { useUIStore, ThemeMode, SidebarState, ModalState, Toast, DrawerState } from '../store/uiStore';

interface UIContextValue {
  theme: ThemeMode;
  resolvedTheme: 'light' | 'dark';
  sidebar: SidebarState;
  isSidebarMobileOpen: boolean;
  modals: Record<string, ModalState>;
  toasts: Toast[];
  drawers: Record<string, DrawerState>;
  isLoading: boolean;
  loadingText: string;
  isOnline: boolean;
  lastSync: number;

  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  setSidebar: (state: SidebarState) => void;
  toggleSidebar: () => void;
  setSidebarMobileOpen: (open: boolean) => void;
  openModal: (type: string, data?: Record<string, unknown>, size?: ModalState['size']) => void;
  closeModal: (type?: string) => void;
  closeAllModals: () => void;
  addToast: (toast: Omit<Toast, 'id'>) => string;
  removeToast: (id: string) => void;
  clearToasts: () => void;
  openDrawer: (type: string, data?: Record<string, unknown>, position?: DrawerState['position'], size?: DrawerState['size']) => void;
  closeDrawer: (type?: string) => void;
  closeAllDrawers: () => void;
  setLoading: (loading: boolean, text?: string) => void;
  setOnline: (online: boolean) => void;
  setLastSync: (timestamp: number) => void;
}

const UIContext = createContext<UIContextValue | undefined>(undefined);

export function UIProvider({ children }: { children: React.ReactNode }) {
  const store = useUIStore();

  const setOnline = store.setOnline;
  const theme = store.theme;
  const setResolvedTheme = store.setResolvedTheme;

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    setOnline(navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setOnline]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      if (theme === 'system') {
        const resolved = e.matches ? 'dark' : 'light';
        setResolvedTheme(resolved);
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme, setResolvedTheme]);

  const value = useMemo<UIContextValue>(() => ({
    theme: store.theme,
    resolvedTheme: store.resolvedTheme,
    sidebar: store.sidebar,
    isSidebarMobileOpen: store.isSidebarMobileOpen,
    modals: store.modals,
    toasts: store.toasts,
    drawers: store.drawers,
    isLoading: store.isLoading,
    loadingText: store.loadingText,
    isOnline: store.isOnline,
    lastSync: store.lastSync,

    setTheme: store.setTheme,
    toggleTheme: store.toggleTheme,
    setSidebar: store.setSidebar,
    toggleSidebar: store.toggleSidebar,
    setSidebarMobileOpen: store.setSidebarMobileOpen,
    openModal: store.openModal,
    closeModal: store.closeModal,
    closeAllModals: store.closeAllModals,
    addToast: store.addToast,
    removeToast: store.removeToast,
    clearToasts: store.clearToasts,
    openDrawer: store.openDrawer,
    closeDrawer: store.closeDrawer,
    closeAllDrawers: store.closeAllDrawers,
    setLoading: store.setLoading,
    setOnline: store.setOnline,
    setLastSync: store.setLastSync,
  }), [store]);

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI() {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return context;
}

export default UIContext;