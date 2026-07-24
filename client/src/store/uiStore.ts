import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark' | 'system';
export type SidebarState = 'open' | 'closed' | 'collapsed';

export interface ModalState {
  isOpen: boolean;
  type: string | null;
  data?: Record<string, unknown>;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export interface DrawerState {
  isOpen: boolean;
  type: string | null;
  data?: Record<string, unknown>;
  position?: 'left' | 'right' | 'top' | 'bottom';
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

export interface LoadingState {
  isLoading: boolean;
  text?: string;
}

interface UIState {
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
  isCommandPaletteOpen: boolean;
}

interface UIActions {
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  setResolvedTheme: (theme: 'light' | 'dark') => void;

  setSidebar: (state: SidebarState) => void;
  toggleSidebar: () => void;
  setSidebarMobileOpen: (open: boolean) => void;

  openModal: (type: string, data?: Record<string, unknown>, size?: ModalState['size']) => void;
  closeModal: (type?: string) => void;
  closeAllModals: () => void;
  updateModalData: (type: string, data: Record<string, unknown>) => void;

  addToast: (toast: Omit<Toast, 'id'>) => string;
  removeToast: (id: string) => void;
  clearToasts: () => void;

  openDrawer: (type: string, data?: Record<string, unknown>, position?: DrawerState['position'], size?: DrawerState['size']) => void;
  closeDrawer: (type?: string) => void;
  closeAllDrawers: () => void;
  updateDrawerData: (type: string, data: Record<string, unknown>) => void;

  setLoading: (loading: boolean, text?: string) => void;
  setOnline: (online: boolean) => void;
  setLastSync: (timestamp: number) => void;

  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleCommandPalette: () => void;
}

const THEME_STORAGE_KEY = 'hrflow_theme';
const SIDEBAR_STORAGE_KEY = 'hrflow_sidebar';

const getInitialTheme = (): ThemeMode => {
  if (typeof window === 'undefined') return 'system';
  const stored = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
  if (stored) return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const getResolvedTheme = (theme: ThemeMode): 'light' | 'dark' => {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
};

const applyTheme = (theme: ThemeMode) => {
  const root = document.documentElement;
  const resolved = getResolvedTheme(theme);
  root.classList.toggle('dark', resolved === 'dark');
  localStorage.setItem(THEME_STORAGE_KEY, theme);
};

const initialState: UIState = {
  theme: getInitialTheme(),
  resolvedTheme: 'light',
  sidebar: 'open',
  isSidebarMobileOpen: false,
  modals: {},
  toasts: [],
  drawers: {},
  isLoading: false,
  loadingText: '',
  isOnline: true,
  lastSync: 0,
  isCommandPaletteOpen: false,
};

export const useUIStore = create<UIState & UIActions>()(
  persist(
    (set, get) => ({
      ...initialState,
      resolvedTheme: getResolvedTheme(initialState.theme),

      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme, resolvedTheme: getResolvedTheme(theme) });
      },

      toggleTheme: () => {
        const themes: ThemeMode[] = ['light', 'dark', 'system'];
        const currentIndex = themes.indexOf(get().theme);
        const nextTheme = themes[(currentIndex + 1) % themes.length];
        get().setTheme(nextTheme);
      },

      setResolvedTheme: (resolvedTheme) => set({ resolvedTheme }),

      setSidebar: (state) => {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, state);
        set({ sidebar: state });
      },

      toggleSidebar: () => {
        const { sidebar, isSidebarMobileOpen } = get();
        if (isSidebarMobileOpen) {
          set({ isSidebarMobileOpen: false });
        } else {
          const states: SidebarState[] = ['open', 'collapsed', 'closed'];
          const currentIndex = states.indexOf(sidebar);
          const nextState = states[(currentIndex + 1) % states.length];
          get().setSidebar(nextState);
        }
      },

      setSidebarMobileOpen: (open) => set({ isSidebarMobileOpen: open }),

      openModal: (type, data, size) =>
        set((state) => ({
          modals: {
            ...state.modals,
            [type]: { isOpen: true, type, data, size: size || 'md' },
          },
        })),

      closeModal: (type) =>
        set((state) => {
          if (type) {
            const { [type]: _, ...rest } = state.modals;
            return { modals: rest };
          }
          return { modals: {} };
        }),

      closeAllModals: () => set({ modals: {} }),

      updateModalData: (type, data) =>
        set((state) => ({
          modals: {
            ...state.modals,
            [type]: { ...state.modals[type], data: { ...state.modals[type]?.data, ...data } },
          },
        })),

      addToast: (toast) => {
        const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const newToast = { ...toast, id };
        set((state) => ({ toasts: [...state.toasts, newToast] }));

        if (toast.duration !== 0) {
          setTimeout(() => {
            get().removeToast(id);
          }, toast.duration || 5000);
        }

        return id;
      },

      removeToast: (id) =>
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

      clearToasts: () => set({ toasts: [] }),

      openDrawer: (type, data, position = 'right', size = 'md') =>
        set((state) => ({
          drawers: {
            ...state.drawers,
            [type]: { isOpen: true, type, data, position, size },
          },
        })),

      closeDrawer: (type) =>
        set((state) => {
          if (type) {
            const { [type]: _, ...rest } = state.drawers;
            return { drawers: rest };
          }
          return { drawers: {} };
        }),

      closeAllDrawers: () => set({ drawers: {} }),

      updateDrawerData: (type, data) =>
        set((state) => ({
          drawers: {
            ...state.drawers,
            [type]: { ...state.drawers[type], data: { ...state.drawers[type]?.data, ...data } },
          },
        })),

      setLoading: (loading, text = '') => set({ isLoading: loading, loadingText: text }),

      setOnline: (online) => set({ isOnline: online }),

      setLastSync: (timestamp) => set({ lastSync: timestamp }),

      openCommandPalette: () => set({ isCommandPaletteOpen: true }),
      closeCommandPalette: () => set({ isCommandPaletteOpen: false }),
      toggleCommandPalette: () => set((state) => ({ isCommandPaletteOpen: !state.isCommandPaletteOpen })),
    }),
    {
      name: 'hrflow_ui',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        theme: state.theme,
        sidebar: state.sidebar,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyTheme(state.theme);
          state.resolvedTheme = getResolvedTheme(state.theme);
        }
      },
    }
  )
);

export default useUIStore;