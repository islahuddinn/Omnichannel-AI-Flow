// src/components/webchat/WebChatThemeProvider.jsx
/**
 * Theme Provider for WebChat Module
 * Provides dark/light mode support using next-themes
 */

'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';

const WebChatThemeContext = createContext();

export function useWebChatTheme() {
  const context = useContext(WebChatThemeContext);
  if (!context) {
    throw new Error('useWebChatTheme must be used within WebChatThemeProvider');
  }
  return context;
}

export default function WebChatThemeProvider({ children }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      storageKey="webchat-theme"
      disableTransitionOnChange={false}
      // ✅ Optimize theme switching
      forcedTheme={undefined}
    >
      {children}
    </NextThemesProvider>
  );
}

