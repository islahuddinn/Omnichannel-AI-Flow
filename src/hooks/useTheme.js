// src/hooks/useTheme.js
'use client';

import { useThemeStore } from '@/store/useThemeStore';

export function useTheme() {
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const accentColor = useThemeStore((state) => state.accentColor);
  const setAccentColor = useThemeStore((state) => state.setAccentColor);

  return {
    theme,
    toggleTheme,
    setTheme,
    accentColor,
    setAccentColor
  };
}