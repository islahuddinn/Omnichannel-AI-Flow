'use client';

import { useEffect, useRef } from 'react';
import { useThemeStore } from '@/store/useThemeStore';
import { applyAccentPreset, DEFAULT_PRESET } from '@/constants/colorPresets';

export default function ThemeProvider({ children }) {
  const theme = useThemeStore((state) => state.theme);
  const accentColor = useThemeStore((state) => state.accentColor);
  const mediaQueryRef = useRef(null);
  const handlerRef = useRef(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && theme === 'system') {
      if (mediaQueryRef.current && handlerRef.current) {
        try {
          mediaQueryRef.current.removeEventListener('change', handlerRef.current);
        } catch (e) {}
      }

      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQueryRef.current = mediaQuery;
      const currentAccent = accentColor || DEFAULT_PRESET;

      const handleSystemThemeChange = () => {
        requestAnimationFrame(() => {
          try {
            const root = document.documentElement;
            if (!root) return;

            const prefersDark = mediaQuery.matches;
            if (prefersDark) {
              if (!root.classList.contains('dark')) root.classList.add('dark');
            } else {
              if (root.classList.contains('dark')) root.classList.remove('dark');
            }
            // Re-apply accent for new system theme
            applyAccentPreset(currentAccent, prefersDark);
          } catch (error) {
            console.warn('System theme change error:', error);
          }
        });
      };

      handlerRef.current = handleSystemThemeChange;
      handleSystemThemeChange();
      mediaQuery.addEventListener('change', handleSystemThemeChange);

      return () => {
        if (mediaQueryRef.current && handlerRef.current) {
          try {
            mediaQueryRef.current.removeEventListener('change', handlerRef.current);
          } catch (e) {}
        }
        mediaQueryRef.current = null;
        handlerRef.current = null;
      };
    } else {
      if (mediaQueryRef.current && handlerRef.current) {
        try {
          mediaQueryRef.current.removeEventListener('change', handlerRef.current);
        } catch (e) {}
        mediaQueryRef.current = null;
        handlerRef.current = null;
      }
    }
  }, [theme, accentColor]);

  return <>{children}</>;
}

