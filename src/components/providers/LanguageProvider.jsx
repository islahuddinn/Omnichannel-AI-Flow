'use client';

import { useEffect } from 'react';

/**
 * Language Provider Component
 * Sets language to English (only supported language for now)
 */
export default function LanguageProvider({ children }) {
  useEffect(() => {
    // ✅ Set language to English (only supported language)
    if (typeof window !== 'undefined' && document.documentElement) {
      document.documentElement.lang = 'en';
    }
  }, []);

  return <>{children}</>;
}

