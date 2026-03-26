// src/store/useThemeStore.js
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { applyAccentPreset, clearAccentPreset, cacheAccentPreset, DEFAULT_PRESET } from '@/constants/colorPresets';

// Helper function to get system theme preference
const getSystemTheme = () => {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

// Helper function to apply theme to document
const applyTheme = (theme) => {
  if (typeof document === 'undefined') return;

  requestAnimationFrame(() => {
    try {
      const root = document.documentElement;
      if (!root) return;

      const actualTheme = theme === 'system' ? getSystemTheme() : theme;

      if (actualTheme === 'dark') {
        if (!root.classList.contains('dark')) {
          root.classList.add('dark');
        }
      } else {
        if (root.classList.contains('dark')) {
          root.classList.remove('dark');
        }
      }
    } catch (error) {
      console.warn('Theme application error:', error);
    }
  });
};

// Helper to resolve and apply accent for current theme
const applyAccentForTheme = (theme, accentColor) => {
  if (!accentColor || accentColor === DEFAULT_PRESET) {
    // Default preset — still apply it so colors are consistent
    applyAccentPreset(DEFAULT_PRESET, (theme === 'system' ? getSystemTheme() : theme) === 'dark');
  } else {
    applyAccentPreset(accentColor, (theme === 'system' ? getSystemTheme() : theme) === 'dark');
  }
};

export const useThemeStore = create(
  persist(
    (set, get) => ({
      theme: 'light',
      accentColor: DEFAULT_PRESET,

      toggleTheme: () =>
        set((state) => {
          const currentTheme = state.theme === 'system' ? getSystemTheme() : state.theme;
          const newTheme = currentTheme === 'light' ? 'dark' : 'light';
          applyTheme(newTheme);
          applyAccentForTheme(newTheme, state.accentColor);
          return { theme: newTheme };
        }),

      setTheme: (theme) => {
        const { accentColor } = get();
        applyTheme(theme);
        applyAccentForTheme(theme, accentColor);
        set({ theme });
      },

      setAccentColor: (presetId) => {
        const { theme } = get();
        applyAccentForTheme(theme, presetId);
        cacheAccentPreset(presetId);
        set({ accentColor: presetId });
      },

      getActualTheme: () => {
        const theme = get().theme;
        return theme === 'system' ? getSystemTheme() : theme;
      }
    }),
    {
      name: 'theme-storage',
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyTheme(state.theme);
          // Apply accent color on rehydration
          applyAccentForTheme(state.theme, state.accentColor || DEFAULT_PRESET);
          if (state.accentColor) {
            cacheAccentPreset(state.accentColor);
          }

          if (state.theme === 'system' && typeof window !== 'undefined') {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            const handleChange = () => {
              applyTheme('system');
              applyAccentForTheme('system', state.accentColor || DEFAULT_PRESET);
            };
            mediaQuery.addEventListener('change', handleChange);
          }
        }
      }
    }
  )
);